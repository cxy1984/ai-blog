# 理解代理模式：mihomo、浏览器与 Git 代理配置

最近在推送 GitHub 仓库时遇到了连接超时、连接重置的问题。后来发现浏览器虽然能正常访问 GitHub，但 Git 命令并没有自动走代理。

这篇文章用自己的环境做一次梳理：代理软件到底做了什么，浏览器为什么能走代理，Git 为什么不一定走代理，以及这次修改到底改了哪里。

## 一句话结论

代理软件本身通常只是本机启动一个代理服务，例如：

```text
127.0.0.1:7890
```

真正决定某个软件是否走代理的，是这个软件有没有把网络请求发到这个本地端口。

浏览器能走代理，是因为浏览器或系统代理配置指向了 `127.0.0.1:7890`。

Git 之前不能稳定访问 GitHub，是因为 Git 没有配置自己的代理，所以它仍然在尝试直连 `github.com:443`。

这次修改就是给 Git 单独增加了代理配置：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

## 代理软件在电脑里做了什么

mihomo 这类代理软件通常会做两件事：

1. 读取节点配置和规则配置。
2. 在本机启动一个代理监听端口。

你的 mixed port 是：

```text
127.0.0.1:7890
```

这个端口可以理解成一个“本地中转站”。

应用程序如果直接访问：

```text
https://github.com
```

那就是直连。

应用程序如果把请求交给：

```text
127.0.0.1:7890
```

mihomo 就会接管请求，然后根据规则判断：

- 国内网站直连
- GitHub、Google 等特定网站走代理节点
- 某些域名走指定节点
- 某些流量拒绝或拦截

所以代理软件不是自动接管所有程序。它只是提供了一个本地入口，程序要不要使用这个入口，取决于程序自己的网络配置，或者系统代理配置。

## 什么是“规则模式”

你之前说“做了一些网站配置，特定网站走代理”，这通常就是规则模式。

规则模式大概是这样：

```text
github.com        -> 走代理
google.com        -> 走代理
baidu.com         -> 直连
qq.com            -> 直连
局域网地址         -> 直连
默认其他流量       -> 按配置决定
```

实际配置里可能叫：

```text
rules
Rule Mode
规则模式
绕过大陆
全局模式
直连模式
```

常见模式区别：

| 模式 | 含义 |
|---|---|
| 直连模式 | 所有流量都不走代理 |
| 全局模式 | 大部分流量都走代理 |
| 规则模式 | 按域名、IP、地区、进程等规则判断 |

你现在的情况更像规则模式：浏览器访问普通国内网站不受影响，访问 GitHub 这类网站会走代理。

## 浏览器为什么能走代理

浏览器能走代理，一般有三种可能：

1. 浏览器使用系统代理。
2. 浏览器装了代理插件，例如 SwitchyOmega。
3. mihomo 开启了系统代理或 TUN 模式。

如果是系统代理，Windows 里通常会把代理服务器设置成：

```text
127.0.0.1:7890
```

这样浏览器访问网页时，请求路径大概是：

```text
浏览器 -> Windows 系统代理 -> 127.0.0.1:7890 -> mihomo -> 代理节点或直连 -> 目标网站
```

所以你会看到浏览器正常，但 Git 命令还是失败。原因是 Git 不一定完全跟随浏览器代理配置。

## Git 为什么没有自动走代理

Git for Windows 使用自己的网络库和配置系统。它可能读取一部分系统配置，但不能假设它一定会跟浏览器一样走代理。

之前执行：

```powershell
git config --global --get http.proxy
git config --global --get https.proxy
```

没有输出，说明 Git 全局没有配置代理。

所以当执行：

```powershell
git pull
git push
```

Git 实际在尝试：

```text
Git -> github.com:443
```

而不是：

```text
Git -> 127.0.0.1:7890 -> mihomo -> github.com
```

这就是为什么它报：

```text
Failed to connect to github.com port 443
Recv failure: Connection was reset
```

## 这次我修改了什么

这次只修改了 Git 的全局配置。

执行的是：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

它写入的是当前 Windows 用户的 Git 配置文件，通常是：

```text
C:\Users\<你的用户名>\.gitconfig
```

修改后的效果是：当前用户在这台电脑上执行的 Git HTTP/HTTPS 请求，都会优先走：

```text
http://127.0.0.1:7890
```

也就是：

```text
Git -> mihomo mixed port -> 按 mihomo 规则转发 -> GitHub
```

## 修改范围是什么

这次修改的范围是：

```text
Git 全局配置
```

也就是当前 Windows 用户下的所有 Git 仓库都会受影响。

影响对象：

- `git clone https://...`
- `git pull`
- `git push`
- `git fetch`
- 其他走 HTTP/HTTPS 的 Git 远程操作

不影响对象：

- 浏览器代理规则
- mihomo 节点配置
- mihomo 分流规则
- npm 代理配置
- PowerShell 自己的网络请求
- SSH 方式的 Git 地址，例如 `git@github.com:xxx/xxx.git`

所以这次没有修改你的代理节点，也没有修改你的 mihomo 规则，只是告诉 Git：以后访问 HTTPS 仓库时，先走本地 `7890` 端口。

## 怎么查看当前 Git 代理

查看 Git 是否配置了代理：

```powershell
git config --global --get http.proxy
git config --global --get https.proxy
```

如果输出：

```text
http://127.0.0.1:7890
http://127.0.0.1:7890
```

说明 Git 已经走 mihomo 的 mixed port。

## 怎么取消这次修改

如果以后不想让 Git 走代理，可以取消：

```powershell
git config --global --unset http.proxy
git config --global --unset https.proxy
```

取消后，Git 会回到默认行为。

如果当前网络不能直连 GitHub，取消后 `git pull`、`git push` 可能又会失败。

## 怎么判断 7890 是否真的存在

可以看本机端口：

```powershell
netstat -ano | findstr ":7890"
```

如果看到：

```text
127.0.0.1:7890 LISTENING
```

说明 mihomo 正在监听这个端口。

还可以测试 GitHub 连接：

```powershell
git ls-remote https://github.com/cxy1984/ai-blog.git
```

如果能返回远程分支或提交信息，说明 Git 能正常通过网络访问 GitHub。

## 为什么 pull 成功后 push 又失败了一次

配置代理后，`git pull --rebase origin main` 成功了，说明 Git 已经能通过代理访问 GitHub。

但第一次 `git push` 报了：

```text
OpenSSL SSL_connect: SSL_ERROR_SYSCALL
```

这个错误通常不是配置写错，而是代理链路中途断了一下。重试后推送成功。

这说明当前链路是可用的，但代理节点或网络本身可能偶尔不稳定。

如果以后再遇到类似问题，可以先重试：

```powershell
git push
```

如果连续失败，再切换 mihomo 节点。

## 浏览器代理和 Git 代理的区别

可以把它们理解成两套独立配置。

浏览器：

```text
浏览器设置或系统设置 -> 127.0.0.1:7890
```

Git：

```text
Git 配置 -> 127.0.0.1:7890
```

它们可以都走同一个 mihomo 端口，但配置位置不同。

所以会出现这些情况：

| 浏览器 | Git | 现象 |
|---|---|---|
| 走代理 | 不走代理 | 浏览器能打开 GitHub，Git push 失败 |
| 不走代理 | 走代理 | 浏览器可能打不开 GitHub，Git 正常 |
| 都走代理 | 都正常 |
| 都不走代理 | 取决于当前网络能否直连 GitHub |

你之前就是第一种。

## 当前博客项目的发布流程

现在写博客时，本地流程是：

```powershell
cd D:\code\ai-note
npm run build
git add .
git commit -m "add blog post"
git push
```

`git push` 会走：

```text
Git -> 127.0.0.1:7890 -> mihomo -> GitHub
```

推送成功后，GitHub Pages 会部署到：

```text
https://cxy1984.github.io/ai-blog
```

## 安全提醒

代理节点配置里的 password、uuid、订阅链接都属于敏感信息。

不要把完整代理配置发到公开聊天、公开仓库或截图里。如果已经泄露，建议到服务商后台重置订阅链接或节点密码。

## 总结

这次问题的根因是：浏览器配置了代理，但 Git 没有配置代理。

解决方式是给 Git 单独配置：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

这不会修改 mihomo 的节点和规则，只会影响当前 Windows 用户下 Git 的 HTTPS 网络请求。

以后如果 GitHub push 失败，排查顺序可以是：

1. mihomo 是否开启。
2. `127.0.0.1:7890` 是否监听。
3. Git 是否配置了 `http.proxy` 和 `https.proxy`。
4. 当前节点是否稳定。
5. GitHub 是否需要重新登录验证。

