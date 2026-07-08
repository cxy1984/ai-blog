# 理解代理模式：SwitchyOmega、mihomo、浏览器与 Git 代理配置

这次 GitHub 推送失败的问题，本质不是 GitHub 仓库权限，也不是博客项目本身的问题，而是不同软件使用代理的方式不一样。

我的实际环境是：

```text
浏览器使用 SwitchyOmega 插件做分流
mihomo 在本机提供 mixed port：127.0.0.1:7890
Git 原来没有单独配置代理
```

所以会出现一个看起来很奇怪的现象：

```text
浏览器能打开 GitHub
但是 git pull / git push 失败
```

原因是：浏览器和 Git 不是同一套代理配置。

## 一句话结论

当前链路可以分成两层：

```text
第一层：SwitchyOmega 决定浏览器请求要不要走代理
第二层：mihomo 接收代理请求后，再按自己的规则和节点转发
```

浏览器访问 GitHub 时，大概是：

```text
浏览器 -> SwitchyOmega 规则 -> 127.0.0.1:7890 -> mihomo -> GitHub
```

Git 原来访问 GitHub 时，大概是：

```text
Git -> github.com:443
```

Git 没有经过浏览器，也不会使用 SwitchyOmega 插件，所以 Git 还是直连 GitHub。当前网络直连 GitHub 不稳定，于是出现连接超时、连接重置。

后来给 Git 单独配置代理后，Git 的链路变成：

```text
Git -> 127.0.0.1:7890 -> mihomo -> GitHub
```

这就是为什么后面 `git pull` 和 `git push` 能成功。

## mihomo 做了什么

mihomo 的核心作用是：在本机启动一个代理入口，并根据配置把请求转发到不同节点。

当前使用的是 mixed port：

```text
127.0.0.1:7890
```

这个端口可以理解成一个本地代理入口。

任何程序只要把网络请求交给：

```text
127.0.0.1:7890
```

mihomo 就能接管这个请求。

接管以后，mihomo 会继续判断：

- 这个域名是否直连
- 这个域名是否走代理
- 走哪个节点
- 是否命中规则集
- 是否使用当前选中的策略组

也就是说，mihomo 不等于自动代理所有软件。它只是提供了一个本地入口，软件必须主动使用这个入口，或者通过系统代理/TUN 等方式被接管。

## SwitchyOmega 做了什么

SwitchyOmega 是浏览器插件。它只影响浏览器里的请求。

它通常会配置多个情景模式，例如：

```text
直连
代理
自动切换
```

如果你配置了“特定网站走代理”，那通常是 SwitchyOmega 在浏览器层做了规则判断。

例如：

```text
github.com      -> 走代理
google.com      -> 走代理
baidu.com       -> 直连
localhost       -> 直连
```

当浏览器访问 `github.com` 时，SwitchyOmega 判断这个域名应该走代理，于是把请求发给：

```text
127.0.0.1:7890
```

然后才轮到 mihomo 处理这个请求。

所以浏览器实际链路是：

```text
浏览器
  -> SwitchyOmega 判断规则
  -> 命中代理规则
  -> 发送到 127.0.0.1:7890
  -> mihomo 接管
  -> mihomo 选择节点
  -> GitHub
```

## 为什么说有两层规则

你的环境里至少有两层规则。

第一层是浏览器插件规则：

```text
SwitchyOmega：决定浏览器请求是否交给代理端口
```

第二层是 mihomo 规则：

```text
mihomo：决定收到的代理请求最终怎么转发
```

举个例子。

浏览器访问：

```text
https://github.com
```

SwitchyOmega 先判断：

```text
github.com 是否需要走代理？
```

如果答案是“是”，浏览器请求会被发到：

```text
127.0.0.1:7890
```

mihomo 收到请求后再判断：

```text
github.com 应该走哪个节点？
是否命中代理规则？
是否直连？
```

所以最终路径是两层决策叠加的结果。

## 浏览器为什么正常

浏览器正常，是因为浏览器里装了 SwitchyOmega。

SwitchyOmega 把需要代理的网站转发到了 mihomo 的 mixed port：

```text
127.0.0.1:7890
```

所以浏览器访问 GitHub 时，没有直接连 GitHub，而是通过代理链路访问。

这解释了为什么你能在浏览器里打开 GitHub 页面。

## Git 为什么失败

Git 是命令行程序，不运行在浏览器里。

它不会读取 SwitchyOmega 插件规则，也不会知道浏览器里哪些网站配置了代理。

所以之前 Git 执行：

```powershell
git pull
git push
```

实际链路是：

```text
Git -> github.com:443
```

而不是：

```text
Git -> SwitchyOmega -> 127.0.0.1:7890 -> mihomo -> GitHub
```

这里要特别注意：

```text
SwitchyOmega 只管浏览器，不管 Git。
```

这就是浏览器能访问 GitHub，但 Git 报错的根本原因。

## 之前的 Git 报错是什么意思

之前看到过这些错误：

```text
Failed to connect to github.com port 443
Recv failure: Connection was reset
OpenSSL SSL_connect: SSL_ERROR_SYSCALL
```

这些错误都说明 Git 和 GitHub 之间的网络链路不稳定。

在没有配置 Git 代理时，Git 尝试直连 GitHub，容易失败。

配置 Git 代理后，`git pull --rebase origin main` 成功，说明 Git 已经能通过 mihomo 访问 GitHub。

`git push` 第一次出现 `SSL_ERROR_SYSCALL`，重试后成功，说明代理链路可用，但节点或网络偶尔会抖动。

## 这次实际修改了什么

这次没有修改 SwitchyOmega。

这次也没有修改 mihomo 的节点、订阅、规则、策略组。

实际修改的是 Git 的全局配置：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

这两条命令的意思是：

```text
以后当前 Windows 用户执行 Git 的 HTTP/HTTPS 请求时，默认走 127.0.0.1:7890
```

修改后，Git 访问 GitHub 的链路变成：

```text
Git -> 127.0.0.1:7890 -> mihomo -> GitHub
```

## 修改范围是什么

这次修改的范围是：

```text
当前 Windows 用户的 Git 全局配置
```

一般写入这个文件：

```text
C:\Users\<你的用户名>\.gitconfig
```

影响范围：

- 当前用户下所有 Git 仓库
- 使用 HTTPS 地址的 Git 操作
- `git clone https://...`
- `git pull`
- `git push`
- `git fetch`

不影响：

- SwitchyOmega 插件配置
- 浏览器代理规则
- mihomo 节点配置
- mihomo 分流规则
- npm 代理配置
- SSH 地址的 Git 操作，例如 `git@github.com:xxx/xxx.git`

也就是说，这次只是让 Git 学会走 mihomo 的本地代理端口，没有改你原来别人帮你配置的浏览器插件规则。

## 三套配置的关系

可以这样理解：

```text
SwitchyOmega：只影响浏览器
mihomo：提供本地代理入口和节点分流
Git proxy：只影响 Git 命令
```

它们之间不是互相替代，而是搭配关系。

浏览器链路：

```text
浏览器 -> SwitchyOmega -> mihomo -> 目标网站
```

Git 链路：

```text
Git -> Git proxy 配置 -> mihomo -> GitHub
```

如果没有 Git proxy 配置，Git 不会经过 SwitchyOmega。

## 怎么查看 Git 当前代理

查看 Git 是否配置代理：

```powershell
git config --global --get http.proxy
git config --global --get https.proxy
```

如果输出：

```text
http://127.0.0.1:7890
http://127.0.0.1:7890
```

说明 Git 已经配置为走 mihomo mixed port。

## 怎么取消 Git 代理

如果以后不想让 Git 走代理，可以执行：

```powershell
git config --global --unset http.proxy
git config --global --unset https.proxy
```

取消后，Git 会回到默认网络行为。

如果当前网络不能直连 GitHub，取消后 `git pull` 和 `git push` 可能又会失败。

## 怎么判断 mihomo 的 7890 是否开启

可以执行：

```powershell
netstat -ano | findstr ":7890"
```

如果看到：

```text
127.0.0.1:7890 LISTENING
```

说明 mihomo 正在监听 mixed port。

也可以执行：

```powershell
git ls-remote https://github.com/cxy1984/ai-blog.git
```

如果能返回远程分支信息，说明 Git 可以通过当前网络访问 GitHub。

## 常见现象对照

| 现象 | 可能原因 |
|---|---|
| 浏览器能打开 GitHub，Git push 失败 | 浏览器走了 SwitchyOmega，但 Git 没配代理 |
| 浏览器打不开 GitHub，Git 可以 push | Git 配了代理，但浏览器规则没命中 |
| pull 成功，push 偶尔失败 | 代理节点或网络临时抖动 |
| 配了 Git 代理后所有仓库都走代理 | 使用了 `--global`，影响当前用户所有 Git 仓库 |
| 取消 Git 代理后又失败 | 当前网络不能稳定直连 GitHub |

## 当前博客项目发布时的网络路径

现在执行：

```powershell
git push
```

链路是：

```text
Git -> 127.0.0.1:7890 -> mihomo -> GitHub
```

推送成功后，GitHub Pages 会部署博客：

```text
https://cxy1984.github.io/ai-blog
```

## 安全提醒

代理配置里的 password、uuid、订阅链接都属于敏感信息。

不要把完整代理配置发到公开聊天、公开仓库或截图里。如果已经泄露，建议到服务商后台重置订阅链接或节点密码。

## 总结

之前的问题不是 mihomo 端口错了，也不是 GitHub 仓库没权限。

真正原因是：

```text
浏览器通过 SwitchyOmega 走了代理
Git 没有经过 SwitchyOmega
Git 也没有单独配置代理
```

解决办法是给 Git 单独配置：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

这样浏览器和 Git 都能使用 mihomo，但它们使用 mihomo 的方式不同：

```text
浏览器靠 SwitchyOmega
Git 靠 git config
```

