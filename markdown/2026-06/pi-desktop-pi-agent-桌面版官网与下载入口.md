# pi-desktop：pi 桌面版与 pi Agent 多项目工作台，官网与下载入口

## 摘要

`pi-desktop` 是我做的一个 pi 桌面版工具，也可以按 `pi desktop`、`pi agent desktop` 或常见误拼 `pi dekstop` 来理解：它用来在本地开发环境中管理多个 `pi agent` 会话。它不是 pi 的分支，也不替代 pi CLI，而是通过 Electron 启动多个 `pi --mode rpc` 进程，把项目管理、会话管理、文件抽屉、Git 分支、终端 Dock、模型配置、Skills 管理和工具调用展示整合到一个桌面应用里。

如果你在搜索 `pi desktop`、`pi-desktop`、`pi agent`、`pi 桌面版`、`pi 编码助手桌面端`，甚至手滑搜成 `pi dekstop`，这篇文章就是入口说明。官网已经发布到 GitHub Pages：

- pi-desktop 官网：<https://ayuayue.github.io/pi-desktop/>
- GitHub 仓库：<https://github.com/ayuayue/pi-desktop>
- 下载地址：<https://github.com/ayuayue/pi-desktop/releases>

## 为什么做 pi-desktop

日常使用 pi 做本地编码任务时，我遇到的主要问题不是 Agent 能力不够，而是会话和项目管理越来越分散。

典型场景包括：

- 同时维护多个项目，每个项目都需要独立的 pi agent 会话。
- 一个项目里既有功能开发，又有 bug 修复、配置调整、文档整理等不同上下文。
- 想恢复历史会话，但命令行里找起来不够直观。
- 想看本轮 Agent 改了哪些文件、用了哪些工具、当前 Git 分支是什么。
- 想统一管理 models、auth、settings 和 Skills，而不是频繁打开配置文件。
- 想在同一个界面里保留终端，方便执行命令和观察输出。

所以 `pi-desktop` 的定位很明确：**给 pi agent 加一个本地桌面工作台**。Agent 能力仍然由 pi 原生提供，桌面端只负责把开发工作流组织得更清楚。

## pi-desktop 是什么

一句话概括：

> pi-desktop 是一个面向本地开发工作的 Electron 桌面应用，用于管理多个项目目录中的 pi RPC Agent 会话。

它的核心设计是：

```text
一个 Agent Tab = 一个独立 pi --mode rpc 进程
```

这样做的好处是每个项目、每个会话都有相对清晰的边界。你可以在一个窗口里切换不同项目，但底层 Agent 进程不会混在一起。

## 主要功能

### 多项目工作区

你可以把多个本地项目目录加入 pi-desktop，在左侧工作区里搜索、排序和切换。每个项目都可以独立启动 pi agent，会话之间保持隔离。

这对同时处理多个仓库的人很有用。比如一个项目在修线上问题，另一个项目在写新功能，不需要来回切终端、切目录、找历史命令。

### Chat 入口

除了项目目录，pi-desktop 还提供一个内置 Chat 入口。它适合用来做不绑定具体代码仓库的通用对话，例如整理思路、生成命令、解释报错、写文档草稿。

### 会话历史与恢复

pi-desktop 会把历史会话放到更容易浏览的位置。你可以从项目历史里恢复旧会话，也可以重命名、导出 HTML 或关闭 Agent。

对于长任务来说，这比只在命令行里找 session 文件更直观。

### 文件抽屉与本轮修改摘要

文件抽屉可以查看项目文件树和 Git 状态。Agent 每轮回答结束后，还会在回答下方展示本轮修改过的文件和大致行数。

这个功能主要解决一个问题：你能快速判断 Agent 到底动了哪里，而不是在任务结束后再去翻 Git diff。

### Git 分支信息

顶部会显示当前分支，并提供本地和远程分支选择器。多项目、多会话时，分支信息放在对话区附近，可以减少误操作。

### 模型、配置与 Skills 管理

pi-desktop 提供配置弹窗，可以可视化管理：

- `models.json`
- `auth.json`
- `settings.json`
- 全局 Skills

Skills 页面支持查看、创建模板、启用或禁用、删除和打开目录。对经常调整 pi 配置的人来说，这比手动找文件更省心。

### 终端 Dock

当前 Agent 可以绑定独立终端 tab。你可以在桌面应用里直接执行命令、观察输出、保留上下文。

这让 pi agent 对话区、文件变化、Git 分支和终端输出集中在一个窗口里。

## 官网已经上线

这次也给 pi-desktop 做了一个简单的官网和文档站，使用 VitePress 构建，并发布到了 GitHub Pages：

<https://ayuayue.github.io/pi-desktop/>

官网主要包含：

- 首页介绍
- 快速开始
- 功能说明
- 配置与 Skills
- 开发与打包
- 更新日志入口
- GitHub Releases 下载入口

如果只是想快速判断这个 pi 桌面版工具是不是适合你，可以先看官网首页和功能介绍。

## 如何下载安装

预构建包发布在 GitHub Releases：

<https://github.com/ayuayue/pi-desktop/releases>

当前目标是支持：

- Windows
- macOS
- Linux

使用前需要单独安装 pi CLI，并确保系统能访问 `pi` 命令。

可以先在终端验证：

```bash
pi --version
pi --mode rpc
```

如果自动检测不到 pi 路径，可以在 pi-desktop 设置里手动填写。

## 从源码运行

如果你想自己构建或参与开发，可以从源码运行：

```bash
git clone https://github.com/ayuayue/pi-desktop.git
cd pi-desktop
npm install
npm run make-icon
npm run dev
```

常用开发命令：

```bash
npm run typecheck
npm run build
npm run dist
```

官网文档站的本地命令：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

## pi desktop、pi-desktop、pi dekstop 的区别

这里顺便把几个容易混的关键词说明一下，方便搜索引擎和读者理解：

- `pi`：原始 CLI 工具，负责 Agent 能力。
- `pi agent`：通过 pi 启动的编码助手会话。
- `pi desktop`：很多人会用这个词搜索 pi 的桌面端工作台。
- `pi-desktop`：这个项目的正式名称。
- `pi 桌面版`：中文搜索时更常见的叫法。
- `pi dekstop`：`desktop` 的常见拼写错误，如果你是这样搜到的，实际要找的也是 `pi desktop` 或 `pi-desktop`。

pi-desktop 的重点不是重新实现 pi agent，而是让 pi agent 在本地多项目开发时更容易管理。

## 适合谁使用

pi-desktop 更适合这些场景：

- 经常同时打开多个代码仓库。
- 希望每个项目都有独立的 pi agent 会话。
- 希望更直观看到历史会话、工具调用和文件修改。
- 希望用 GUI 管理 pi 配置和 Skills。
- 希望在桌面端集中查看聊天、文件、Git 分支和终端。

如果你只偶尔用一次 pi CLI，直接命令行就足够。如果你每天都在多个项目里使用 pi agent，桌面工作台会更顺手。

## 总结

`pi-desktop` 是一个围绕 pi agent 本地开发体验做的桌面工作台。它不替代 pi，也不改变 pi 的 Agent 能力，而是把多项目、会话、文件、Git、配置、Skills 和终端组织到一个更稳定的桌面界面里。

入口汇总：

- 官网：<https://ayuayue.github.io/pi-desktop/>
- GitHub：<https://github.com/ayuayue/pi-desktop>
- Releases 下载：<https://github.com/ayuayue/pi-desktop/releases>

后续如果继续更新 pi 桌面版能力，我也会优先同步到官网和 GitHub Releases。
