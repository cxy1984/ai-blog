# 30 万条对账报表导出：从 OOM 崩溃到 2 分钟稳定完成
> 日期：2026-10-08


## 问题背景

财务每月需要从对账系统导出 6 类报表——平台服务费、商家服务费、平台优惠券、商家优惠券、物流收款、分润汇总。单月数据量 15-30 万条。

原来的导出接口是全量查询 → 全量转换 → 一次性写 Excel：

```java
List<Entity> list = mapper.selectList(wrapper);      // 全量加载
List<ExportVO> voList = new ArrayList<>();
for (Entity e : list) { voList.add(convert(e)); }     // 全量转换
EasyExcel.write(os, ExportVO.class).sheet("报表").doWrite(voList); // 一次性写入
```

3 万条触发 OutOfMemoryError，服务重启；即使不 OOM，同步等待 2 分钟被 Nginx 60s 超时截断，用户只能看到 504。

## 整体方案

```
用户点导出 → 秒返 taskId → 后台异步生成 → Redis 记录进度 → 前端轮询 → 拿到 URL 下载

Controller 只负责提交任务（200ms 内完成），真正导出在独立线程池中执行：
  ① MyBatis Cursor 流式逐条查询（不一次性加载）
  ② 每 2000 条写一次 EasyExcel（写完即释放）
  ③ 上传 OSS + 返回预签名 URL（30 分钟有效）
  ④ Redis 每批更新进度（前端 3 秒轮询一次）
```

下面逐个技术点展开。

## 一、异步提交 + 线程池隔离

### 为什么异步

同步模式下，用户点击导出 → Controller 线程阻塞 2 分钟等 Excel 生成完 → 才返回 response。一旦超过 Nginx 超时阈值（典型 60s），连接被 kill，用户看到 504，生成了也白生成了。

异步模式下，Controller 只做"接收请求 + 提交任务"，200ms 内返回 taskId。真正的导出交给后台线程，用户不需要干等。

### 线程池为什么必须独立

如果导出任务和业务请求共用 Tomcat 线程池——3 个人同时导出，3 个 Tomcat 线程各占一个数据库连接，一占就是 2 分钟。高峰期这 3 个线程被导出吃掉，正常下单请求可能拿不到连接直接报错。

**导出线程池独立配置**：

```java
@Bean("exportExecutor")
public ThreadPoolTaskExecutor exportExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);       // 最多同时 2 个导出任务
    executor.setMaxPoolSize(4);        // 队列满时最多再加 2 个临时线程
    executor.setQueueCapacity(10);     // 最多排队 10 个
    executor.setRejectedExecutionHandler(
        new ThreadPoolExecutor.CallerRunsPolicy()
    );
    return executor;
}
```

**参数为什么这样定？**

核心决策因子是数据库连接池的容量。每个导出持有 1 个长连接（Cursor 流式查询），假设业务连接池最大 20：

| core | 最坏情况 | 是否安全 |
|------|---------|---------|
| 2 | 导出吃掉 2 个连接，业务剩 18 个 | ✅ |
| 10 | 导出吃掉 10 个连接，业务只剩 10 个 | ❌ 高峰期业务可能拿不到连接 |

`queue=10`：缓冲 10 个突发请求，第 11 个触发拒绝策略，返回"导出排队已满，请稍后重试"。

核心原则：**宁可拒绝导出，不能让下单因为连接池被占满而挂掉。**

### Controller 实现

```java
@PostMapping("/export/submit")
public R<String> submit(@RequestBody ExportDTO dto) {
    String taskId = IdUtil.fastSimpleUUID();
    exportService.submitAsync(dto, taskId);   // 异步执行，不等结果
    return R.ok(taskId);                       // 秒返
}
```

## 二、Redis 进度追踪 + 前端轮询

异步之后，用户怎么知道生成完了没有？Redis 做"黑板"——后端线程写进度，前端定时来读。

### Redis 数据结构

```
Key:   export:task:{taskId}
Value: { "status": "RUNNING", "total": 300000, "processed": 120000, "percent": 40, "url": null }
TTL:   30 分钟（过期自动清理）
```

### 后端每批更新

```java
// 每写完 2000 条，更新一次 Redis 进度
if (batch.size() >= 2000) {
    writer.write(batch, sheet);
    batch.clear();
    redis.set("export:task:" + taskId, toJson(RUNNING, total, processed), 30, MINUTES);
}

// 全部完成
String url = ossClient.uploadAndSign(ossKey, tempFile);
redis.set("export:task:" + taskId, toJson(DONE, url), 30, MINUTES);

// 异常失败
redis.set("export:task:" + taskId, toJson(FAILED, errorMsg), 30, MINUTES);
```

### 前端 3 秒轮询

```javascript
const timer = setInterval(async () => {
    const { data } = await fetch(`/export/status/${taskId}`).then(r => r.json());
    if (data.status === 'DONE') {
        clearInterval(timer);
        window.open(data.url);
    } else if (data.status === 'FAILED') {
        clearInterval(timer);
        alert('导出失败：' + data.error);
    }
    // RUNNING → 更新进度条，3 秒后再查
}, 3000);
```

**为什么轮询而不是 WebSocket？** 导出是低频操作（每人每月几次），3 秒间隔开销忽略不计。WebSocket 额外引入长连接维护、心跳保活、断线重连，收益与复杂度不匹配。况且 Redis 自带 TTL 过期，30 分钟后任务状态自动清理，零维护。

## 三、MyBatis Cursor 流式查询

### 为什么不是 selectList

`selectList` 一次性把 30 万条全部加载到 JVM 堆内存——30 万 × 2KB ≈ 600 MB。加上后续的 ExportVO 转换和 EasyExcel 内部缓冲，轻松突破 1 GB，OOM 是必然结果。

### Cursor 的工作原理

```java
// Mapper 返回 Cursor 而非 List
@Select("SELECT * FROM view_platform_service_fee WHERE ... ORDER BY pay_time")
@Options(resultSetType = ResultSetType.FORWARD_ONLY, fetchSize = Integer.MIN_VALUE)
Cursor<Entity> selectByCursor(@Param("dto") ExportDTO dto);
```

两个注解的含义：

| 注解 | 作用 |
|------|------|
| `resultSetType = FORWARD_ONLY` | 结果集只进不退，不允许 `previous()` 跳回，MySQL 可以更高效地流式输出 |
| `fetchSize = Integer.MIN_VALUE` | MySQL JDBC 驱动约定：逐行拉取。每次 `next()` 时从网络流中解析一行，不缓存全量 |

对比三种方式的内存行为：

| 方式 | 内存中同时存在的行数 |
|------|-------------------|
| `selectList` | 全部 30 万行 |
| `fetchSize = 1000` | 1000 行（一批） |
| `fetchSize = MIN_VALUE` | 1 行（逐行） |

### Cursor 使用要点

**必须加 @Transactional(readOnly = true)**：

```java
@Transactional(readOnly = true)
public void doExport() {
    try (Cursor<Entity> cursor = mapper.selectByCursor(dto)) {
        for (Entity e : cursor) {
            // 逐条消费
        }
    }
}
```

原因：MyBatis 默认每次查询后关闭 SqlSession（归还连接）。Cursor 是懒加载迭代器，`next()` 时才真正去读数据——如果 SqlSession 已关闭，连接已还池，`next()` 就直接报 `Cursor is closed`。`@Transactional` 强制连接在方法执行期间保持打开，`readOnly = true` 告诉 MySQL 不做写操作，省去不必要的行锁和 undo log。

**必须用 try-with-resources**：确保 Cursor 正常关闭，连接释放回池。

**不能跨线程使用**：Cursor 绑定了创建它的数据库连接，传递给另一个线程消费会导致连接状态混乱。

## 四、EasyExcel 分批写入

EasyExcel 支持 `ExcelWriter` 的流式写入模式——创建一次 writer，多次调用 `write()`，最后关闭时统一 flush：

```java
try (Cursor<Entity> cursor = mapper.selectByCursor(dto);
     ExcelWriter writer = EasyExcel.write(tempFile, ExportVO.class).build()) {

    WriteSheet sheet = EasyExcel.writerSheet("平台服务费").build();
    List<ExportVO> batch = new ArrayList<>(2000);

    for (Entity entity : cursor) {
        batch.add(convert(entity));
        if (batch.size() >= 2000) {
            writer.write(batch, sheet);   // 写一批
            batch.clear();                 // 释放引用，GC 回收
        }
    }
    if (!batch.isEmpty()) {
        writer.write(batch, sheet);       // 写最后不足 2000 条的一批
    }
    // try-with-resources 自动调用 writer.close()，刷盘
}
```

**2000 条一批怎么定？**

- 太小（如 100 条）：EasyExcel 内部 flush 和 IO 开销增大
- 太大（如 20000 条）：每批 List 内存变大，写入失败损失也大
- 2000 条 × 单 ExportVO 约 1 KB ≈ 2 MB 一批，内存友好，flush 频率合理

**为什么是 EasyExcel？**

EasyExcel 本质是 Apache POI `SXSSFWorkbook` 的封装，但它做了几件关键优化：注解驱动避免手写 Cell 操作、共享字符串表复用、更激进的 flush 策略。在国内 Java 生态中已是事实标准（阿里出品，GitHub 30k+ star），百万行以内是最佳选择。

## 五、OSS 落盘 + 预签名 URL

导出的最终交付物是一个能下载的 Excel 文件。为什么不直接写 `HttpServletResponse.getOutputStream()`？

**因为异步模型下，Response 已经不可用了。** Controller 秒返 taskId 后 HTTP 连接关闭，OutputStream 没了，文件必须落地到其他地方。

OSS 方案的优势：

```
原来：生成在内存 → 写 Response → 用户下载
      → 写一半浏览器关闭 → 文件丢失，前功尽弃

现在：生成 → 写本地临时文件 → 上传 OSS → 返回预签名 URL
      → 下载中断？OSS 上的文件还在，再下一次
      → 误关弹窗？URL 30 分钟内可重复下载
      → 转发给同事？发 URL 就行
```

预签名 URL 的本质：给 OSS 私有 Bucket 的文件开一张"30 分钟内有效"的临时通行证，前端拿到后直接 `<a href>` 下载，不经过后端，流量走 OSS 带宽。

```java
// 上传
String ossKey = "export/" + DateUtil.today() + "/" + taskId + "_" + fileName;
ossClient.upload(ossKey, tempFile);

// 生成 30 分钟有效的下载链接
String signedUrl = ossClient.generatePresignedUrl(ossKey, 30, TimeUnit.MINUTES);
// → "https://bucket.oss-cn-hangzhou.aliyuncs.com/export/...?Expires=...&Signature=..."
```

## 六、效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 3 万条 | OOM → 服务重启 | 8 秒 |
| 15 万条 | 不可用 | ~50 秒 |
| 30 万条 | 不可用 | 2 分 30 秒 |
| 内存占用（任意量级） | 线性增长至 500MB+ | 控制在百兆以内，不随数据量增长 |
| 高峰期对业务影响 | 导出拖垮机器 | 线程池隔离，零影响 |
| 用户体验 | 白屏等待 → 504 | 提交 → 进度条 → 下载 |

## 七、常见问题

**Q：为什么线程池而不用 MQ？**

导出是低频操作（财务每月几次），2 分钟的线程生命周期完全够用。MQ 引入中间件增加运维成本，导出失败用户重试一次即可——它不是支付，丢了可以重来。真到日导出请求 100+ 次再切 MQ，当前 `exportExecutor.execute()` 换成 `rocketMQTemplate.send()` 即可，切换成本极低。

**Q：30 万条 2 分钟能更快吗？**

瓶颈在数据库网络 IO（Cursor 逐条拉取受限于 MySQL 传输速度），不在 Java 侧。可以按月分片多线程并行查询写入不同 Sheet，但会引入连接池竞争。当前量级没有优化必要。

**Q：服务重启任务丢了怎么办？**

导出是幂等操作——用户重新点一次即可。Redis 中 taskId 过期（30 分钟 TTL）则前端轮询返回"任务不存在"，提示重新提交。关键设计原则：导出不是支付，不需要 100% 可靠性。
