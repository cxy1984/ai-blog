# MySQL 主从复制 1032 错误排查与修复全流程总结

> 日期：2026-07-08
> 环境：MySQL 5.7 | CentOS 7 | 主库 {{DB_HOST_IP}} → 从库 localhost

---

## 一、问题现象

从库复制中断，`SHOW SLAVE STATUS` 显示：

| 字段 | 值 |
|------|-----|
| Slave_IO_Running | Yes |
| Slave_SQL_Running | **No** |
| Last_Error | `Could not execute Update_rows event on table db_9buqi.local_goods_sku; Can't find record in 'local_goods_sku', Error_code: 1032; handler error HA_ERR_KEY_NOT_FOUND; the event's master log mysql-bin.000258, end_log_pos 2232952` |

### 错误含义

主库 binlog 中有一条 `UPDATE` 语句要更新 `local_goods_sku` 表中的某行记录，但从库上**找不到这行数据**，导致 SQL 线程中断。

---

## 二、可能的原因

| 原因 | 说明 | 本次是否匹配 |
|------|------|:----------:|
| 从库有人手动删除了数据 | 从库未开启 `super_read_only`，可能被误操作 | ❌（排除） |
| 从库搭建时备份不完整 | 备份落后于主库，部分行从未同步过来 | ✅ **最可能** |
| 表没有主键 | ROW 格式下用全部列匹配，易导致 1032 | ❌（`local_goods_sku` 有主键） |
| 之前跳过错误留下的后遗症 | 跳过事件导致部分行永久缺失 | ✅ 跳过后后续操作继续报错，符合 |
| binlog 被 PURGE | 历史 INSERT 已被清理，从库无法补回 | ❌（`expire_logs_days=0`，binlog 未清理） |

---

## 三、排查与修复过程

### 阶段 1：快速恢复复制（跳过错误）

```sql
-- 查看从库状态
SHOW SLAVE STATUS\G

-- 跳过当前错误事件（临时恢复）
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;
```

**结果：** 复制短暂恢复，但遇到下一条缺失行又报 1032。说明缺失不止一行。

---

### 阶段 2：安装 Percona Toolkit（全量校验工具）

```bash
# 安装 Percona 官方仓库
yum install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm
percona-release enable tools release
yum install -y percona-toolkit

# 验证安装
pt-table-checksum --version
```

> ⚠️ 期间遇到镜像源 404、下载慢、SSH 断开等问题，最终安装成功。

**安装的工具：**

| 工具 | 作用 |
|------|------|
| `pt-table-checksum` | 对比主从数据一致性，找出差异 |
| `pt-table-sync` | 修复主从数据差异 |

---

### 阶段 3：尝试全量校验（未成功）

```bash
# 尝试 1：默认方式（卡在等同步）
pt-table-checksum --host=主库IP --user=xxx --ask-pass --recursion-method=hosts

# 问题：复制中断 + replicate_do_db 白名单不含 percona 库
```

**`replicate_do_db` 当前配置：**

```
db_9buqi, db_9buqi_authority, db_xinfudaojia_com_central, db_9buqi_coupon,
db_xiuerxin_com_dev, db_9buqi_notary, db_xinfu_express, db_9buqi_bank,
db_9buqi_com_central
```

**卡住原因：** pt-table-checksum 在主库创建 `percona.checksums` 结果表，然后等待它通过复制同步到从库。但 `percona` 不在 `replicate_do_db` 白名单中，永远同步不过去。

**尝试的 DSN 方案（未跑通）：**

```bash
# 使用 DSN 指定从库
pt-table-checksum --host=主库IP --user=xxx --ask-pass \
  --recursion-method=dsn=D=percona,t=dsns \
  --replicate=db_9buqi_coupon.checksums
```

同样因复制中断，主库创建的表无法同步到从库而卡住。

---

### 阶段 4：最终修复——直接同步差异数据

跳过复杂的校验流程，直接用 `pt-table-sync` 修复 `local_goods_sku` 表：

```bash
# 显式指定主库和从库，对比并修复差异
pt-table-sync --ask-pass \
  h={{DB_HOST_IP}},u='central.xinfudaojia.com' \
  h=127.0.0.1,u='central.xinfudaojia.com' \
  --databases=db_9buqi \
  --tables=local_goods_sku \
  --execute \
  --no-check-slave
```

**执行后：**

```sql
START SLAVE;
SHOW SLAVE STATUS\G
```

| 字段 | 修复后 |
|------|--------|
| Slave_IO_Running | ✅ Yes |
| Slave_SQL_Running | ✅ Yes |
| Last_Error | ✅ 空 |
| Seconds_Behind_Master | ✅ 0（已追上） |

---

## 四、后续操作清单

按优先级排序：

### 【高优先级】近期完成

- [x] 1. 确认复制正常运行 — **已完成**
- [ ] 2. **全量校验所有库**（复制已恢复，用 `--recursion-method=hosts` 不会再卡）
      ```bash
      # 从从库执行
      pt-table-checksum --host={{DB_HOST_IP}} --user='central.xinfudaojia.com' --ask-pass \
        --recursion-method=hosts \
        --no-check-binlog-format \
        --no-check-replication-filters
      ```
- [ ] 3. 根据校验结果，修复其他有差异的表
      ```bash
      pt-table-sync --replicate=percona.checksums --execute \
        --host=127.0.0.1 --user='central.xinfudaojia.com' --ask-pass
      ```
- [ ] 4. **观察 `Seconds_Behind_Master` 是否稳定归零**
      ```sql
      SHOW SLAVE STATUS\G
      -- 重点关注：Seconds_Behind_Master
      ```

### 【中优先级】本周内完成

- [ ] 5. **开启从库只读模式**，防止误写入
      ```ini
      # 修改从库 my.cnf，在 [mysqld] 段添加
      super_read_only = 1
      read_only = 1
      ```
      ```bash
      # 动态设置（重启后失效）
      SET GLOBAL super_read_only = 1;
      SET GLOBAL read_only = 1;
      ```
- [ ] 6. **检查所有业务表是否有主键**
      ```sql
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM information_schema.TABLES T
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.TABLE_CONSTRAINTS TC
          WHERE TC.TABLE_SCHEMA = T.TABLE_SCHEMA
            AND TC.TABLE_NAME = T.TABLE_NAME
            AND TC.CONSTRAINT_TYPE = 'PRIMARY'
        );
      ```
      没有主键的表建议加上，否则 ROW 格式复制下容易出现 1032。

### 【低优先级】长期维护

- [ ] 7. **定期做主从一致性检查**（建议每周/每月）
      ```bash
      pt-table-checksum --host=主库IP --user=xxx --ask-pass \
        --recursion-method=hosts
      ```
- [ ] 8. **监控复制状态**，配置告警
      ```sql
      -- 监控脚本检查项
      Slave_IO_Running = Yes
      Slave_SQL_Running = Yes
      Seconds_Behind_Master < 60
      Last_Error = 空
      ```
- [ ] 9. **规范 DDL 变更流程**，主从同步执行
      避免在主库加字段后忘记在从库执行同样的 ALTER TABLE
- [ ] 10. **考虑 binlog 保留策略**（当前 `expire_logs_days=0` 永不过期）
      根据磁盘空间设置合理保留时间：
      ```ini
      expire_logs_days = 14
      # 或 MySQL 8.0：
      binlog_expire_logs_seconds = 1209600  # 14天
      ```

---

## 五、关键经验总结

### 5.1 关于 1032 错误

**核心原因只有一个：** 从库缺失了主库存在的行。

**不能只靠跳过（`sql_slave_skip_counter`）**，因为：
- 跳过一次只跳过一条事件，后续遇到同一行的操作还会报错
- 多次跳过会让不一致越积越多

**根治方法：** 把缺失的数据补上（`pt-table-sync` 或 `mysqldump` 覆盖）。

### 5.2 关于 Percona Toolkit

| 工具 | 用途 | 注意点 |
|------|------|--------|
| `pt-table-checksum` | 找出主从差异 | 复制必须正常运行（`Slave_SQL_Running=Yes`），否则卡在等同步 |
| `pt-table-sync` | 修复差异 | 复制中断时需用 `--no-check-slave`、`--wait 0` 或显式指定双 DSN |

### 5.3 关于 `replicate_do_db`

白名单机制会影响工具的运行。如果校验结果表（`percona.checksums`）的数据库不在白名单中，工具会卡死。解决方案：

- 用 `--replicate=库名.checksums` 指定一个在白名单中的库
- 或者把 `percona` 加入 `replicate_do_db`

### 5.4 最佳实践

1. **从库必须开启 `super_read_only=1`**，防止误写入
2. **所有业务表必须有主键**，避免 ROW 格式下的 1032
3. **DDL 变更要主从同步执行**，不能只改主库
4. **定期做 `pt-table-checksum`**，早发现早修复
5. **Percona Toolkit 提前装好**，不要等出问题了再装

---

## 六、常用命令速查

```bash
# 查看从库状态
mysql -e "SHOW SLAVE STATUS\G"

# 跳过当前错误
mysql -e "STOP SLAVE; SET GLOBAL sql_slave_skip_counter = 1; START SLAVE;"

# 全量校验（复制正常时）
pt-table-checksum --host=主库IP --user=用户名 --ask-pass --recursion-method=hosts

# 修复单表差异
pt-table-sync --ask-pass h=主库IP,u=用户名 h=从库IP,u=用户名 --databases=库名 --tables=表名 --execute

# 根据校验结果修复所有差异
pt-table-sync --replicate=percona.checksums --execute --host=从库IP --user=用户名 --ask-pass

# 从主库导出单表覆盖从库
mysqldump -h 主库IP -u 用户名 -p --no-create-info --single-transaction 库名 表名 | mysql -h 从库IP -u 用户名 -p 库名

# 全库覆盖重建从库
mysqldump -u root -p --all-databases --single-transaction --master-data=2 > fullbackup.sql
mysql -u root -p < fullbackup.sql
```
