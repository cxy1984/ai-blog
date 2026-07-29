# MySQL 主从复制 1032 错误：一次从 125 天积压到完美修复的全过程

> 标签：MySQL, 主从复制, 1032, HA_ERR_KEY_NOT_FOUND, Percona Toolkit

---
> 日期：2026-04-10


## 一、前言

MySQL 主从复制是保证高可用的基石，但也是最容易出问题的环节之一。**Error 1032（HA_ERR_KEY_NOT_FOUND）**——"从库找不到要更新的行"——是 ROW 格式复制下最常见的错误之一。

本文记录了一次真实的故障排查与修复过程：从发现复制中断，到分析根因，再到最终修复，以及后续的预防措施。希望能给遇到类似问题的同行一些参考。

---

## 二、故障现象

某天收到告警，从库复制中断。`SHOW SLAVE STATUS` 输出如下：

```
Slave_IO_Running: Yes
Slave_SQL_Running: No
Last_Error: Could not execute Update_rows event on table db_9buqi.local_goods_sku;
            Can't find record in 'local_goods_sku', Error_code: 1032;
            handler error HA_ERR_KEY_NOT_FOUND;
            the event's master log mysql-bin.000258, end_log_pos 2232952
```

**含义**：主库 binlog 中有一条 UPDATE 语句，要更新 `local_goods_sku` 表中的某行记录，但从库上找不到这行数据，SQL 线程中断。

---

## 三、问题根因分析

### 3.1 为什么会出现 1032？

ROW 格式下，UPDATE 事件会记录完整的旧行数据（WHERE 条件）和新行数据（SET 部分）。从库执行时，拿着 WHERE 条件去表中定位，如果找不到匹配的行，就报 1032。

### 3.2 排查可能的原因

| 可能原因 | 排查结论 |
|:---------|:---------|
| 从库有人手动删除了数据 | ❌ 排除（从库无人操作，但未开启 `super_read_only`） |
| 表没有主键导致定位失败 | ❌ 排除（`local_goods_sku` 有主键 `id`） |
| 之前跳过错误留下的后遗症 | ✅ **符合**（之前可能已经有过 1032/1062 被跳过，累积了不一致） |
| binlog 被 PURGE 导致历史 INSERT 丢失 | ❌ 排除（`expire_logs_days=0`，binlog 永不过期） |
| 从库搭建时备份不完整 | ✅ **最可能的原因**（备份时的数据快照落后于主库，部分行从未同步） |

### 3.3 更深层的问题

连续多次 1032 出现在同一张表 `local_goods_sku` 上，说明**缺失的数据不止一行**。单纯跳过错误（`sql_slave_skip_counter = 1`）只能让复制暂时恢复，遇到下一行又会卡住。

---

## 四、修复过程

### 4.1 第一阶段：临时跳过，恢复复制

```sql
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;
```

**结果**：复制短暂恢复，但很快又遇到下一个 1032，中断。

**教训**：跳过只是治标，不能治本。缺失的数据行还在，后续对该行的任何操作都会再次触发 1032。

### 4.2 第二阶段：安装 Percona Toolkit

Percona Toolkit 是 MySQL 运维的瑞士军刀，包含 `pt-table-checksum`（一致性校验）和 `pt-table-sync`（差异修复）等工具。

```bash
# 安装 Percona 仓库
yum install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm
percona-release enable tools release

# 安装 toolkit
yum install -y percona-toolkit

# 验证
pt-table-checksum --version
```

> ⚠️ **踩坑记录**：安装过程中遇到了镜像源 404、下载慢、SSH 断开等问题。最终通过 `nohup` 后台下载完成安装。

### 4.3 第三阶段：尝试全量校验（遇到新问题）

```bash
pt-table-checksum --host=主库IP --user=xxx --ask-pass --recursion-method=hosts
```

**卡住了**，原因是：

1. **从库配置了 `replicate_do_db` 白名单**，只同步指定的数据库
2. pt-table-checksum 默认在主库创建 `percona.checksums` 结果表
3. 但 `percona` 库不在 `replicate_do_db` 白名单中
4. 结果表无法同步到从库，工具一直等待

解决方案：将结果表建在白名单内的库中，使用 DSN 模式手动指定从库连接。

```bash
pt-table-checksum --host=主库IP --user=xxx --ask-pass \
  --recursion-method=dsn=D=percona,t=dsns \
  --replicate=db_9buqi_coupon.checksums
```

但此时 `Slave_SQL_Running=No`，工具仍无法正常工作。

### 4.4 第四阶段：直接修复单张表

跳过复杂的全量校验流程，直接用 `pt-table-sync` 修复问题表：

```bash
pt-table-sync --ask-pass \
  h=主库IP,u=xxx h=127.0.0.1,u=xxx \
  --databases=db_9buqi --tables=local_goods_sku \
  --execute --no-check-slave
```

这条命令直接对比主从 `local_goods_sku` 表，找出从库缺失的行并 INSERT 进去。

**修复成功，复制恢复！**

### 4.5 第五阶段：处理 relay log 积压

修复了当前错误，但由于从库 SQL 线程中断了很久（**125 天**），relay log 里积压了大量事件，其中包含重复的 DDL（错误码 1060/1061）、重复的 INSERT（1062）、以及找不到行的 UPDATE/DELETE（1032）。

使用 `pt-slave-restart` 自动跳过这些已知错误：

```bash
pt-slave-restart --user=xxx --ask-pass \
  --error-numbers=1032,1054,1060,1061,1062,1146
```

**追赶速度**：从 `Seconds_Behind_Master = 10,827,922 秒`（约 125 天），以约每分钟追上 11,784 秒数据的速度，最终耗时约 2 天追完所有积压。

### 4.6 第六阶段：全量校验与修复

复制追上后，进行全量校验：

```bash
pt-table-checksum --host=主库IP --user=xxx --ask-pass \
  --recursion-method=dsn=D=percona,t=dsns \
  --replicate=db_9buqi_coupon.checksums
```

发现 **227 张表**存在主从数据差异。使用 `pt-table-sync` 修复：

```bash
pt-table-sync --sync-to-master h=127.0.0.1,u=xxx --ask-pass \
  --replicate=db_9buqi_coupon.checksums --execute
```

**遇到新问题**：部分表没有主键或唯一索引，pt-table-sync 拒绝执行。最终采用 **mysqldump 增量导出+导入** 的方式修复剩余的差异表。

### 4.7 最终结果

| 指标 | 修复前 | 修复后 |
|:----|:------|:------|
| Slave_IO_Running | Yes | Yes ✅ |
| Slave_SQL_Running | **No** | **Yes** ✅ |
| Last_Error | 1032 / HA_ERR_KEY_NOT_FOUND | 空 ✅ |
| Seconds_Behind_Master | 10,827,922 秒（125 天） | **0** ✅ |
| 数据一致性 | 227 张表有差异 | **全部修复** ✅ |

---

## 五、关键技术点总结

### 5.1 关于 1032 错误

**核心原因**：从库缺失了主库存在的行。

**根治方法**：把缺失的数据补上（`pt-table-sync` 或 `mysqldump`），而不是跳过错误。

### 5.2 关于 Percona Toolkit

| 工具 | 用途 | 注意事项 |
|:----|:-----|:---------|
| `pt-table-checksum` | 找出主从差异 | 复制正常运行才能用 `--recursion-method=hosts`；否则用 `dsn` 模式 |
| `pt-table-sync` | 修复差异 | 没有主键的表需单独处理 |
| `pt-slave-restart` | 自动跳过已知错误 | 配合 `--error-numbers` 快速追赶积压 |

### 5.3 关于 `replicate_do_db`

白名单机制会影响工具的运行。校验结果表的数据库必须在白名单中，否则工具会卡死。

解决方案：
- 用 `--replicate=白名单内库名.checksums` 指定结果表位置
- 或者使用 DSN 模式直接写入从库

### 5.4 关于 relay log 积压

- IO 线程停止时，如果 relay log 持续堆积，恢复后需要很长时间追赶
- `pt-slave-restart` 可以自动跳过重复的错误，加快追赶速度
- 追赶速度取决于：错误数量、表大小、是否开启二进制日志等

---

## 六、重要的发现

### 6.1 Seconds_Behind_Master 的解读

```
第一次查看：10,827,922 秒 ≈ 125 天
     ↓
     ↓ 经过约 48 小时追赶
     ↓
最终结果： 0 秒（完全追上）
```

追赶速度并非恒定，前期大量 DDL 错误被跳过时较慢，后期正常数据执行时变快。

### 6.2 表结构差异的连锁反应

主库执行了 ALTER TABLE 加字段，但从库没有同步执行。导致：
1. relay log 中的 DDL 在从库报 **1060（Duplicate column）**
2. relay log 中的 DML 在从库报 **1054（Unknown column）**
3. 复制彻底卡死

**教训**：DDL 变更必须主从同步执行，或者使用 Gh-ost / pt-online-schema-change 等工具统一管理。

### 6.3 没有主键的表

没有主键的表在 ROW 格式复制下风险极高：
- UPDATE 时无法精确定位行
- DELETE 时可能误删多行
- pt-table-sync 无法自动修复

**建议**：所有业务表都必须有主键。

---

## 七、预防措施清单

### 7.1 必须做的

- [x] **开启从库只读**：`super_read_only = 1`
- [x] **所有表加主键**：尤其是业务表
- [x] **DDL 变更统一管理**：主从同步执行
- [x] **定期一致性检查**：建议每周/每月一次 pt-table-checksum

### 7.2 建议做的

- [x] **监控复制状态**：Slave_IO_Running、Slave_SQL_Running、Seconds_Behind_Master
- [x] **提前安装 Percona Toolkit**：不要等出问题了再装
- [x] **配置 binlog 保留策略**：根据磁盘空间设置合理的过期时间
- [x] **备份时记录准确的 binlog 位置**：使用 `--master-data=2 --single-transaction`

### 7.3 定期检查 SQL

```sql
-- 检查复制状态
SHOW SLAVE STATUS\G

-- 检查没有主键的表
SELECT TABLE_SCHEMA, TABLE_NAME
FROM information_schema.TABLES T
WHERE TABLE_TYPE = 'BASE TABLE'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS TC
    WHERE TC.TABLE_SCHEMA = T.TABLE_SCHEMA
      AND TC.TABLE_NAME = T.TABLE_NAME
      AND TC.CONSTRAINT_TYPE = 'PRIMARY'
  );

-- 检查从库是否只读
SHOW VARIABLES LIKE 'super_read_only';
```

---

## 八、常用命令速查

```bash
# 查看从库状态
mysql -e "SHOW SLAVE STATUS\G"

# 跳过当前错误
mysql -e "STOP SLAVE; SET GLOBAL sql_slave_skip_counter = 1; START SLAVE;"

# 安装 Percona Toolkit
yum install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm
percona-release enable tools release
yum install -y percona-toolkit

# 全量校验（复制正常时）
pt-table-checksum --host=主库IP --user=用户名 --ask-pass --recursion-method=hosts

# 全量校验（复制中断时，DSN 模式）
pt-table-checksum --host=主库IP --user=用户名 --ask-pass \
  --recursion-method=dsn=D=percona,t=dsns \
  --replicate=白名单库.checksums

# 修复单表差异
pt-table-sync --ask-pass h=主库IP,u=用户名 h=从库IP,u=用户名 \
  --databases=库名 --tables=表名 --execute

# 根据校验结果修复所有差异
pt-table-sync --sync-to-master h=127.0.0.1,u=用户名 --ask-pass \
  --replicate=库名.checksums --execute

# 自动跳过已知错误，追赶积压
pt-slave-restart --user=用户名 --ask-pass \
  --error-numbers=1032,1054,1060,1061,1062,1146

# mysqldump 增量修复（替换已存在的行）
mysqldump -h 主库IP -u 用户名 -p --no-create-info --single-transaction --replace \
  库名 表名 | mysql -h 从库IP -u 用户名 -p 库名

# 开启从库只读
mysql -e "SET GLOBAL super_read_only = 1; SET GLOBAL read_only = 1;"
```

---

## 九、写在最后

MySQL 主从复制的问题，90% 都是**数据一致性**的问题。而数据一致性问题的根源，往往是**人为操作不当**——DDL 只改了主库、从库被写入、备份不完整、没有主键……

**工具是辅助，规范才是根本。**

一个健康的主从架构，需要：

1. **从库只读**（`super_read_only = 1`）
2. **所有表有主键**
3. **DDL 变更流程化**
4. **定期一致性校验**

做到这四点，1032 基本不会再来找你。

