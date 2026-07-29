# 宝塔 MongoDB 连不上？两个 mongod 版本冲突事故全复盘

> **一句话梗概：** 宝塔的 MongoDB 突然宕机，手动启动时报 `exit code 14`，折腾半天发现系统里藏着两个不同版本的 mongod 二进制——宝塔 v3.6 的数据文件被手误用系统 v6.0 去启动，版本不兼容直接 abort。本文还原完整排查链路、误解与弯路、以及治本方案。

---
> 日期：2026-07-25


## 一、现象

早上到公司，收到告警：服务器上宝塔面板的 MongoDB 起不来了，业务全部连不上数据库。

---

## 二、排查过程（按时间线）

### 1️⃣ 检查配置文件

路径：`/www/server/mongodb/config.conf`

配置看起来一切正常：
- 端口：`2708`
- bindIp：`0.0.0.0`
- 认证：开启
- 数据目录：`/data/mongodb/data`
- 日志路径：`/data/mongodb/log/config.log`

### 2️⃣ 首次启动 —— 神秘退出码 14

```bash
/usr/bin/mongod -f /www/server/mongodb/config.conf
# ERROR: child process failed, exited with 14
```

退出码 14，但**终端没有打印任何具体错误信息**。排查在此陷入第一个迷雾。

### 3️⃣ 错误方向：怀疑 lock 文件

按常见经验，先清理可能残留的锁文件：

```bash
rm -f /data/mongodb/data/mongod.lock
```

再次启动，**依然退出码 14**。说明根因不是锁文件——方向错了。

### 4️⃣ 想前台启动看报错，反而更绕

尝试 `--no-fork` 前台运行，结果新版 mongod 已移除该选项。于是改配置去掉 `fork: true`，但启动后"看起来没报错就退出了"——

> **误区：** 日志配置为写文件模式，错误信息全部输出到了日志文件而非终端。改配置去 fork 的方式不仅没解决"看不到错误"的问题，还引入了配置文件被改动的风险。

### 5️⃣ 🔑 关键一步：看日志文件

```bash
tail /data/mongodb/log/config.log
```

终于看到致命错误：

```
This version of MongoDB is too recent to start up on the existing data files.
Try MongoDB 4.2 or earlier.
```

> 翻译：**当前 mongod 版本太新，读不了现有数据文件。数据是用老版本写的。**

### 6️⃣ 核心疑问

"没人更新过 MongoDB，怎么会版本不兼容？"

### 7️⃣ 💡 破局点：到底用的是哪个 mongod？

分别检查两个 mongod 的版本：

| 路径 | 版本 | 来源 |
|------|------|------|
| `/www/server/mongodb/bin/mongod --version` | **v3.6.2** | 宝塔自带，数据由它写入 |
| `/usr/bin/mongod --version` | **v6.0.12** | 系统其他来源（yum/手动安装） |

**真相大白：** 今天手动启动时一直用的是 `/usr/bin/mongod`（v6.0），但数据是宝塔 v3.6.2 写入的。大版本跨越（3.6 → 6.0），MongoDB 的向前兼容保护机制直接 abort，抛出退出码 14。

**不是有人升级了 MongoDB，是排查时用错了二进制。**

---

## 三、根因总结

```
系统存在两个 mongod 二进制
  → 排障时误用 /usr/bin/mongod (v6.0) 启动
    → 6.0 读取 3.6 的数据文件，版本不兼容
      → MongoDB 自我保护，abort 退出，exit code 14
```

### 误解与弯路回顾

| 步骤 | 操作 | 为什么无效 | 本该怎么做 |
|------|------|-----------|-----------|
| 1 | 只查配置文件 | 配置无问题，排障方向偏离 | — |
| 2 | `exit code 14` 屏幕无详情 | 错误写到了日志文件，而非 stderr | **第一时间 tail 日志文件** |
| 3 | 删 `mongod.lock` | 根因不是非正常关闭，删除无效 | 区分"打不开"和"启动后崩溃" |
| 4 | 改配置去 fork | 日志仍写文件，终端还是看不到报错 | **查看日志文件，检查 mongod 路径** |
| 5 | 查两个 mongod 版本 | — | ✅ **真正的破局点** |

---

## 四、解决方案

用与数据匹配的宝塔二进制启动：

```bash
/www/server/mongodb/bin/mongod -f /www/server/mongodb/config.conf
```

验证监听状态：

```bash
ss -tnlp | grep 2708
```

**服务恢复，数据完好无损，无需迁移、无需降级、无需丢数据。** 整个过程 0 数据损失。

---

## 五、技术深度：为什么大版本不兼容？

MongoDB 的数据文件格式（WireTiger 存储引擎）在不同大版本间**并非向前兼容**。MongoDB 的设计哲学是：

1. 新版本可以读**同级或上一级**版本的数据（例如 6.0 可读 5.0 的数据）
2. 跨大版本（如 3.6 → 6.0）则直接拒绝启动
3. 升级必须**逐级进行**：3.6 → 4.0 → 4.2 → 4.4 → 5.0 → 6.0，每级启动后执行 `setFeatureCompatibilityVersion`

保护机制的数据：

```bash
# 升级到新版本后，必须显式设置特性兼容版本
db.adminCommand({ setFeatureCompatibilityVersion: "新版本" })
# 例如从 4.0 升到 4.2 后：
db.adminCommand({ setFeatureCompatibilityVersion: "4.2" })
```

> **核心教训：** MongoDB 的启动保护机制（版本不兼容直接 abort）是为了防止数据损坏，不是 bug，是 **feature**。

---

## 六、后续建议与规范

### 6.1 固定启动入口

只用宝塔的启动方式，杜绝混用：

```bash
# ✅ 正确
/etc/init.d/mongodb start
/www/server/mongodb/bin/mongod -f /www/server/mongodb/config.conf

# ❌ 避免
/usr/bin/mongod -f /www/server/mongodb/config.conf
```

### 6.2 清理冗余二进制

移除或重命名多余的 mongod，从根源上消除混淆：

```bash
mv /usr/bin/mongod /usr/bin/mongod.6.0.bak
# 先确认没有其他服务依赖 /usr/bin/mongod
```

### 6.3 查清 MongoDB 宕机的真正原因

```bash
# 检查系统重启记录
uptime; last reboot | head

# 检查磁盘
df -h

# 检查 OOM killer 记录
dmesg | grep -i "killed process"

# 检查 MongoDB 自身日志中的异常信号
tail -100 /data/mongodb/log/config.log | grep -E "F|E|signal|shutting"
```

常见原因：
- **机器重启后未自启**（最频繁）
- **OOM killer 杀掉了 mongod 进程**
- **磁盘满导致无法写入日志**（触发了本故障的"兄弟"场景）

### 6.4 设置开机自启

```bash
chkconfig --add mongodb
chkconfig mongodb on
```

或直接在宝塔面板中勾选开机自启。

### 6.5 版本升级路线图

MongoDB 3.6 已于 2021 年 EOL（停止维护），建议按规范阶梯升级：

```
3.6  →  4.0  →  4.2  →  4.4  →  5.0  →  6.0  →  7.0
 ↑       ↑       ↑       ↑       ↑       ↑
 每步: 启动 → setFeatureCompatibilityVersion → 重启 → 下一步
```

> ⚠️ 不要跳版本，否则会再次触发与本事故相同的版本不兼容 abort。

---

## 七、事故启示

### 7.1 排查第一原则：先确认"用的是哪个"

当服务器上存在多个同类型工具的不同版本时，第一件事就是确认**当前真正在调用的二进制是哪个**。`which`、`type`、`--version` 应该成为肌肉记忆。

### 7.2 日志文件 > 终端输出

把日志写入文件是生产环境的常见配置。当终端没有报错信息时，**第一时间看日志文件**，而不是费劲去改配置让终端显示。

### 7.3 三位一体验证

对于数据库类服务，出现异常时应同时检查：

```
服务进程状态（ps / systemctl）
  → 使用的二进制路径（which / ls -l /proc/PID/exe）
    → 对应的数据文件版本（与二进制是否匹配）
```

这三者缺一不可。本次事故正是**遗漏了第二步**——用了错误的二进制路径。

---

## 八、总结

```
MongoDB 宕机
  → exit code 14，终端无详细信息
    → 删 lock 无效（方向错误）
      → 改配置去 fork 仍看不到错误（又绕一圈）
        → tail 日志文件找到版本不兼容报错 ✅
          → 发现两个 mongod 二进制（3.6 vs 6.0）
            → 用宝塔自带的 v3.6 启动
              → 服务恢复，零数据损失
```

**故障本身不可怕，可怕的是排查时引入新的变量。** 本次事故中，MongoDB 原本只是宕机待重启，但排障时误用高版本 mongod 让问题看起来更复杂了。

**排查的每一步，都应该问自己：** *"我现在操作的是正确的东西吗？"*
