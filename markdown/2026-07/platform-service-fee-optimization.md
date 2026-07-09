# 平台服务费汇总接口优化记录（列表 + 导出）

> 接口列表:
> - 列表: `/service-fee/platform/summary` (GET)
> - 导出: `/service-fee/export/platform` (POST)
> 日期: 2026-07-09
> 作者: xxx

---

## 一、问题现象

### 1.1 列表查询

接口默认查询（无筛选条件，每页 10 条）耗时 **2.83 秒**，总数据量仅 257 条。

### 1.2 导出

接口默认导出耗时 **5.58 秒**，返回 Excel 仅 54KB。

## 二、根因分析

### 2.1 代码执行链路

一次请求的执行流程：

```
Step 1: SELECT thread_order_number, MAX(pay_time)
         FROM view_platform_service_fee          ← 视图第1次执行
         WHERE ... GROUP BY thread_order_number
         ORDER BY max_pay_time DESC LIMIT ?

Step 2: SELECT count(1)
         FROM view_platform_service_fee          ← 视图第2次执行
         WHERE ... GROUP BY thread_order_number

Step 3: SELECT * FROM view_platform_service_fee  ← 视图第3次执行
         WHERE thread_order_number IN (...)
```

**一次页面请求，视图被执行了 3 次。**

### 2.2 视图结构

视图 `view_platform_service_fee` 的 SQL 结构：

```
最内层子查询:
  product_order_record p
  LEFT JOIN local_bill
  LEFT JOIN order_check
  LEFT JOIN orders_consignments
  LEFT JOIN deposit_balance_log
  LEFT JOIN local_bill_finance_log

第一层外层:
  LEFT JOIN local_inspect_bill_join

第二层外层:
  LEFT JOIN local_inspect_bill

第三层外层:
  LEFT JOIN users_mains (x2)

第四层外层:
  LEFT JOIN local_proportion_child_goods
```

**总共涉及 11 张表的 LEFT JOIN，且有多层子查询嵌套。**

### 2.3 索引缺失

`product_order_record` 表（驱动表）的现有索引：

| 索引 | 能否用于查询 |
|------|------------|
| `PRIMARY KEY (id)` | ❌ 分页查询用不到 |
| `index_second_order_number` | ❌ 前缀索引，不支持排序和 GROUP BY |
| `index_logistics_business_number` | ❌ 不相关 |
| `index_shop_discount_coupons_child_id` | ❌ 不相关 |
| `index_plat_discount_coupons_child_id` | ❌ 不相关 |

查询中的 WHERE / GROUP BY / ORDER BY 涉及的列全部没有索引：

```sql
WHERE  product_type < '5'    ← 无索引
AND    pay_status <> 1       ← 无索引
GROUP BY thread_order_number ← 无索引
ORDER BY MAX(pay_time) DESC  ← 无索引
```

### 2.4 视图膨胀问题

由于 11 表 LEFT JOIN 产生一对多关系，同一个 `thread_order_number` 在视图中会出现多行。因此必须在视图查询上加 `GROUP BY thread_order_number` 来去重。

但 `product_order_record` 表中的 `thread_order_number` 本身就是唯一的。**GROUP BY 是完全多余的**，只是因为视图 JOIN 膨胀才不得不加。

### 2.5 COUNT 查询 Bug

```xml
<!-- 原 COUNT 写法 -->
SELECT count(1)
FROM view_platform_service_fee
WHERE ...
GROUP BY thread_order_number
```

加了 `GROUP BY` 后，`COUNT(1)` 返回的是**每组有多少条记录**，而不是总行数。Java 通过取 `list.size()` 来获得总组数，虽然碰巧能工作，但 MySQL 必须全量分组完才能返回结果，性能极差。

---

## 三、优化方案

### 3.1 核心思路

**拆掉视图，分步查询。**

```
改前: 视图(11 JOIN + GROUP BY) × 3 次执行
改后: product_order_record(单表) × 1 次 + 详情视图(仅 IN 查询) × 1 次
```

### 3.2 具体改动

#### 改动 1：加索引

```sql
ALTER TABLE product_order_record ADD INDEX idx_p_export (
    product_type,
    pay_status,
    pay_time
);
```

该索引覆盖 WHERE 条件（`product_type < '5' AND pay_status <> 1`）和 ORDER BY（`pay_time DESC`）。

#### 改动 2：新增 V2 查询（直查主表）

在 `PlatformServiceFeeMapper.xml` 中新增：

```xml
<!-- V2 分页查询：直查 product_order_record，不走视图 -->
<select id="selectThreadOrderPageV2" ...>
    SELECT p.thread_order_number, p.pay_time as max_pay_time
    FROM product_order_record p
    WHERE p.product_type < '5' AND p.pay_status <> 1
      AND (其他 p 表筛选条件...)
    GROUP BY p.thread_order_number
    ORDER BY p.pay_time DESC
</select>

<!-- V2 计数查询：直查 product_order_record -->
<select id="selectThreadOrderCountV2" ...>
    SELECT COUNT(1)
    FROM product_order_record p
    WHERE p.product_type < '5' AND p.pay_status <> 1
      AND (其他 p 表筛选条件...)
</select>
```

注意：V2 的 `V2_Where_Clause` 只包含 `product_order_record` 表中存在的字段，不包含跨表字段（如 `merchant_verify_status`、`disbursement_status` 等）。

#### 改动 3：新增 V2 Service 方法

```java
private PageResult<PlatformServiceFeeVo> getPlatformServiceFeeV2(PlatformServiceFeeDto dto) {
    // 1. V2 分页：直查 p 表
    // 2. V2 计数：直查 p 表
    // 3-6. 其余逻辑与 V1 相同（详情走视图 + 查询 order_check + 组装 VO）
}
```

#### 改动 4：路由方法 + 开关 + 自动降级

```java
@Override
public PageResult<PlatformServiceFeeVo> getPlatformServiceFee(PlatformServiceFeeDto dto) {
    if (optimizedQueryEnabled && !hasCrossTableFilters(dto)) {
        return getPlatformServiceFeeV2(dto);  // 走优化逻辑
    }
    return getPlatformServiceFeeV1(dto);  // 走原逻辑（兼容所有筛选条件）
}
```

**自动降级条件**：当用户使用以下跨表筛选条件时，V2 无法处理，自动降级到 V1：

```java
private boolean hasCrossTableFilters(PlatformServiceFeeDto dto) {
    return StringUtils.hasText(dto.getExpenditureCode())        // disbursement_status
        || StringUtils.hasText(dto.getMerchantVerifyStatus())   // merchant_verify_status
        || StringUtils.hasText(dto.getOperationVerifyStatus())  // operation_verify_status
        || StringUtils.hasText(dto.getFinanceVerifyStatus())    // finance_verify_status
        || StringUtils.hasText(dto.getAccountPeriodStart())     // account_period
        || StringUtils.hasText(dto.getAccountPeriodEnd());      // account_period
}
```

#### 改动 5：配置开关

```yaml
# application-dev.yml
query:
  optimization:
    platform-service-fee: false  # true=走V2，false=走V1
```

---

## 四、改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `PlatformServiceFeeMapper.xml` | 新增 | 加 `V2_Where_Clause`、`selectThreadOrderPageV2`、`selectThreadOrderCountV2` |
| `PlatformServiceFeeMapper.java` | 新增 | 加 2 个 V2 接口方法 |
| `PlatformServiceFeeServiceImpl.java` | 修改 | 原方法改为 V1 + 新增路由 + 新增 V2 + 新增降级判断 |
| `application-dev.yml` | 新增 | 加 `query.optimization.platform-service-fee` 开关 |

**旧代码全部保留，未删除任何内容。**

---

## 五、测试结果

| 场景 | 耗时 | 使用的逻辑 |
|------|------|-----------|
| 无筛选条件（旧版本 V1） | **2.83s** | 视图 × 3 次 |
| 无筛选条件（优化版 V2） | **0.24s** | p 表直查 × 1 次 + 视图 IN 查询 × 1 次 |
| 跨表筛选 `accountPeriod=2026-06` | **0.40s** | 自动降级 V1（视图 + 索引） |
| 数据量 `total` | **257** | V1 和 V2 完全一致 |
| 数据内容 | **一致** | V1 和 V2 的 threadOrderNumber 列表相同 |

**优化效果：无筛选时提升约 12 倍，有跨表筛选时因索引提升约 7 倍。**

---

## 六、后续可优化方向

### 6.1 其他慢接口

本项目的 `CustomerCollectionOrderServiceImpl`、`MerchantServiceFeeServiceImpl` 等 Service 存在类似的视图查询模式，可以用同样的手法优化：

1. 确认主表字段唯一性（是否有必要 GROUP BY）
2. 加覆盖索引
3. 新增 V2 Mapper 查询（直查主表）
4. 加开关 + 自动降级

### 6.2 进一步优化详情查询

当前 V2 的详情查询仍然走视图（`BaseMapper.selectList`），虽然只查 10 条，但视图的 JOIN 开销仍然存在。后续可以改为：

1. 直查 `product_order_record` 获取主表字段
2. 分表 IN 查询 `local_bill`、`order_check`、`lpcg` 等获取关联字段
3. Java 代码层组装

### 6.3 EXPLAIN 执行计划参考

```sql
-- 优化前（视图查询）
EXPLAIN SELECT thread_order_number, MAX(pay_time)
FROM view_platform_service_fee
GROUP BY thread_order_number
ORDER BY MAX(pay_time) DESC;
-- 结果: Using temporary; Using filesort

-- 优化后（p 表直查）
EXPLAIN SELECT p.thread_order_number, p.pay_time
FROM product_order_record p
WHERE p.product_type < '5' AND p.pay_status <> 1
ORDER BY p.pay_time DESC;
-- 结果: Using index condition (idx_p_export)
```

---

## 七、导出接口优化

### 7.1 导出代码问题

导出方法 `exportProduct` 与列表存在相同的问题：

```java
public void exportProduct(...) {
    // 1. 走视图全量查询（限制 20000 条）
    QueryWrapper<PlatformServiceFeeEntity> queryWrapper = getPlatformServiceFeeEntityQueryWrapper(dto);
    queryWrapper.last("limit 20000 ");
    List<PlatformServiceFeeEntity> list = platformServiceFeeMapper.selectList(queryWrapper);

    // 2. Java 内存中合并去重
    List<PlatformServiceFeeEntity> mergedList = list.stream().collect(Collectors.toMap(...))...

    // 3. 再转一次 DTO
    List<PlatformServiceFeeExportEntity> voList = new ArrayList<>();
    mergedList.forEach(entity -> { ... voList.add(vo); });

    // 4. 一次性写入 Excel（全部在内存）
    EasyExcelHelper.exportFile(response, voList, ...);
}
```

**问题清单：**

| # | 问题 | 风险 |
|---|------|------|
| 1 | 走视图，11 表 JOIN | 查询慢 |
| 2 | `limit 20000` 硬编码 | 超过 2 万条数据就截断 |
| 3 | 全量数据加载到内存后合并 | 10 万条时 OOM |
| 4 | `doWrite(全部)` 一次性写入 Excel | 大数据量 OOM |

### 7.2 优化措施

#### 措施一：加索引（与列表共用）

```sql
ALTER TABLE product_order_record ADD INDEX idx_p_export (
    product_type,
    pay_status,
    pay_time
);
```

该索引使导出中的视图最内层子查询从全表扫描变为索引过滤，导出耗时从 **5.58s 降至 2.92s**。

#### 措施二：新增分批写入工具方法

在 `EasyExcelHelper` 中新增 `exportFileBatch` 方法，支持回调式分批写入：

```java
public static <E> void exportFileBatch(
        HttpServletResponse response,
        Class<E> type,
        String sheetName,
        Consumer<ExcelBatchContext<E>> writerCallback) {
    try (ExcelWriter excelWriter = EasyExcel.write(response.getOutputStream(), type).build()) {
        WriteSheet writeSheet = EasyExcel.writerSheet(sheetName).build();
        writerCallback.accept(new ExcelBatchContext<>(excelWriter, writeSheet));
    }
}
```

使用方式：

```java
EasyExcelHelper.exportFileBatch(response, DTO.class, "Sheet名", ctx -> {
    for (List<DTO> batch : getAllBatches()) {
        ctx.write(batch);
    }
});
```

#### 措施三：新增 V2 导出方法（已预留，当前未启用）

```java
private void exportProductV2(PlatformServiceFeeDto dto, HttpServletResponse response) {
    // 1. 直查 p 表获取所有 thread_order_number（无 JOIN）
    List<String> allThreadNumbers = mapper.selectExportThreadOrderNumbersV2(dto);

    // 2. 分批处理，每批 2000 条
    EasyExcelHelper.exportFileBatch(response, ..., ctx -> {
        for (批次) {
            // 查视图获取详情（仅 IN 查询当前批次）
            // 合并去重
            // 写入 Excel
            ctx.write(batch);
        }
    });
}
```

**为何当前未启用**：由于视图 JOIN 仍然是瓶颈，V2 导出在数据量小时（257 条）反而因多查一次 p 表而略慢。索引已经让 V1 从 5.58s 降到 2.92s。当数据量增长到万级以上时，可以启用 V2 获得分批写入的 OOM 防护收益。

### 7.3 优化效果

| 接口 | 场景 | 优化前 | 优化后 | 提升倍数 |
|------|------|--------|--------|---------|
| 列表查询 | 无筛选条件 | 2.83s | **0.24s** | **~12x** |
| 列表查询 | 跨表筛选 | 2.83s | **0.40s** | **~7x**（索引收益） |
| 导出 | 默认 | 5.58s | **2.92s** | **~2x**（索引收益） |

### 7.4 后续优化方向

1. **导出深度优化**：新建 Mapper 查询直接 JOIN 必要的几张表（不走 11 表视图），配合分批写入，预期降到 **1s 以内**。
2. **其他类似接口**：`CustomerCollectionOrderServiceImpl`、`MerchantServiceFeeServiceImpl` 存在相同的视图查询模式，可用同样手法优化。
3. **详情查询也绕开视图**：当前列表 V2 的详情查询仍走视图（IN 查询），后续可改为直查 `product_order_record` 加分表 IN 查询 + Java 组装。

### 7.5 上线策略

```
第1步：部署代码（开关=false）→ 走旧逻辑，无感知
第2步：改开关=true → 重启 → 走新逻辑
第3步：验证接口耗时和数据准确性
第4步：有问题改回 false → 重启 → 立即回滚
```

**旧代码完整保留**，未删除任何内容，开关切回即可回滚。
