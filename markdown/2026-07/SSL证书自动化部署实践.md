# 告别手动 SSL 证书管理：一次配置，永久自动续签

> 背景：公司十几个域名，每三个月手动更新一次 SSL 证书，下载、上传、解压、覆盖、重载，繁琐且容易遗忘。这次终于下决心彻底自动化了。

---
> 日期：2026-08-12


## 一、原来的流程有多痛苦

```
腾讯云申请免费证书（3个月）
  → 下载验证文件
  → 上传到服务器指定目录
  → 等腾讯云验证通过
  → 下载证书 zip 包
  → 解压
  → 找到 nginx 证书目录
  → 覆盖 .pem 和 .key 文件
  → nginx -s reload
  → 检查是否生效
```

这只是一张证书的流程。如果十几个域名分散在多台服务器上，每次续签就是一场噩梦。

---

## 二、选型：为什么用 acme.sh

调研了几个方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 继续腾讯云手动 | 熟悉 | 累、易漏 |
| Caddy 替换 nginx | 证书全自动 | 迁移成本高，历史包袱重 |
| certbot 官方客户端 | 官方支持 | 依赖 Python，配置繁琐 |
| **acme.sh** | 纯 shell，零依赖，一条命令搞定 | 国内 GitHub 访问慢（可解决） |

最终选了 acme.sh，原因就一个：**不改 nginx 配置、不改证书路径，只替换文件内容**。

---

## 三、技术原理

### 3.1 acme.sh 做了什么

```
① 向 Let's Encrypt（或 ZeroSSL）发起证书申请
② CA 返回一个验证令牌
③ acme.sh 把验证文件放到你网站的 webroot 目录下
④ CA 访问 http://你的域名/.well-known/acme-challenge/xxx 验证
⑤ 验证通过 → 签发 90 天证书
⑥ acme.sh 把证书拷贝到 nginx 的证书路径
⑦ nginx -s reload
```

整个过程 30 秒，全自动。

### 3.2 webroot 验证 vs DNS 验证

| 验证方式 | 适用场景 | 前提条件 |
|----------|---------|---------|
| webroot | 单域名 | 服务器有公网 80 端口，webroot 可写 |
| DNS API | 通配符 + 单域名 | 域名 DNS 托管在支持 API 的服务商 |

> 我们的域名 DNS 托管在商中在线，没有公开 API，所以本次只能用 webroot 模式签发单域名证书。通配符证书需要 DNS API，下一步计划把 DNS 迁移到腾讯云 DNSPod。

### 3.3 自动续签机制

acme.sh 安装时自动添加 crontab：

```
0 0 * * * ~/.acme.sh/acme.sh --cron --home ~/.acme.sh
```

每天零点检查一次：

```
证书剩余 > 60 天 → 跳过
证书剩余 ≤ 60 天 → 重新签发 → 覆盖文件 → nginx -s reload
```

证书等效有效期始终维持在 30~90 天之间，永远不会过期。

---

## 四、实战部署

### 4.1 解决国内 GitHub 访问问题

acme.sh 官方仓库在 GitHub，国内服务器直接安装会超时。用 Gitee 镜像：

```bash
cd /root
git clone https://gitee.com/neilpang/acme.sh.git
cd acme.sh
./acme.sh --install -m ssl@你的域名.cn
```

### 4.2 注册账号

```bash
~/.acme.sh/acme.sh --register-account -m ssl@你的域名.cn
```

Let's Encrypt 注册只需一个邮箱，不需要密码，甚至邮箱不存在也能签发证书。邮箱仅用于过期提醒。

### 4.3 签发证书

需要先确认 webroot 路径——就是 nginx 配置中 `root` 指令指向的目录：

```bash
~/.acme.sh/acme.sh --issue \
    -d 你的域名.cn \
    -w /你的/webroot/路径
```

如果有多个子域名在同一台服务器上，可以签发一张 SAN 证书：

```bash
~/.acme.sh/acme.sh --issue \
    -d www.你的域名.cn \
    -d api.你的域名.cn \
    -d admin.你的域名.cn \
    -w /你的/webroot/路径
```

### 4.4 部署到 nginx + 设置自动续签

```bash
~/.acme.sh/acme.sh --install-cert -d 你的域名.cn \
    --key-file       /你的/nginx/证书路径/xxx.key \
    --fullchain-file /你的/nginx/证书路径/xxx_bundle.pem \
    --reloadcmd      "nginx -s reload"
```

路径就是 nginx 配置中 `ssl_certificate` 和 `ssl_certificate_key` 的值。**文件内容会替换，但路径和 nginx 配置完全不动。**

---

## 五、完整命令模板（新服务器通用）

```bash
# 第一步：安装（带检测，避免重复安装）
if [ ! -f ~/.acme.sh/acme.sh ]; then
    cd /root
    git clone https://gitee.com/neilpang/acme.sh.git
    cd acme.sh && ./acme.sh --install -m ssl@你的域名.cn
    ~/.acme.sh/acme.sh --register-account -m ssl@你的域名.cn
fi

# 第二步：签发
~/.acme.sh/acme.sh --issue \
    -d 你要签的域名 \
    -w /nginx配置中的root路径

# 第三步：部署
~/.acme.sh/acme.sh --install-cert -d 你要签的域名 \
    --key-file       /证书的key文件路径 \
    --fullchain-file /证书的pem文件路径 \
    --reloadcmd      "nginx -s reload"
```

---

## 六、踩坑记录

### 6.1 DNS 不在腾讯云

最初想用腾讯云 DNS API 签发通配符证书，结果发现域名的 DNS 托管在商中在线，不是腾讯云 DNSPod。acme.sh 的 DNS API 插件调不动，只能改用 webroot 模式。

**教训**：动手前先 `whois` 确认域名的 DNS 托管商。

### 6.2 301 跳转干扰验证

有些域名的 nginx 配了 301 跳转（比如 `business` 跳转到 `www`），导致浏览器看到的证书是跳转目标的。验证时要直接用 `openssl s_client` 命令绕过跳转：

```bash
openssl s_client -connect 域名:443 -servername 域名 2>/dev/null | openssl x509 -noout -dates
```

### 6.3 ZeroSSL 默认 CA

acme.sh 安装后默认使用 ZeroSSL 作为 CA 而不是 Let's Encrypt。功能上没区别（都是免费 90 天），如果一定想换回 Let's Encrypt：

```bash
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
```

---

## 七、运维命令速查

```bash
# 查看已签发证书列表
~/.acme.sh/acme.sh --list

# 查看某张证书的有效期
openssl x509 -in /证书路径/xxx_bundle.pem -noout -dates

# 手动触发续签
~/.acme.sh/acme.sh --cron --home ~/.acme.sh

# 查看 crontab 是否正常
crontab -l | grep acme

# 升级 acme.sh
~/.acme.sh/acme.sh --upgrade
```

---

## 八、效果对比

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| 证书来源 | 腾讯云免费证书 | Let's Encrypt / ZeroSSL |
| 续签操作 | 手动，每 3 个月操作一次 | 全自动，零人工 |
| 单次耗时 | 约 20 分钟 / 域名 | 0 |
| 忘记续签风险 | 高（服务直接挂） | 无 |
| 新服务器接入 | 要搞半天 | 3 条命令，5 分钟 |
| nginx 配置 | 不需要改 | 不需要改 |

---

## 九、下一步计划

1. 将 DNS 从商中在线迁移到腾讯云 DNSPod，开启 DNS API 验证
2. 用通配符证书 `*.域名.cn` 替代多个单域名证书
3. 用 Ansible 批量推送 acme.sh 到剩余服务器
4. 接入监控告警，证书剩余天数低于阈值时通知

---

> 总结：十几张证书从手动到自动，核心就是放下对"腾讯云证书服务"的依赖，拥抱 Let's Encrypt 生态。acme.sh 这个工具麻雀虽小五脏俱全。
