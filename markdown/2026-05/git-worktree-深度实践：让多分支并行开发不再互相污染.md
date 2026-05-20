# Git Worktree 深度实践：让多分支并行开发不再互相污染

## 摘要

`git worktree` 是 Git 内置但经常被低估的多工作区能力。它允许一个仓库同时签出多个分支到不同目录，共享同一套对象数据库，却拥有彼此独立的工作目录、索引和 `HEAD`。对于需要同时处理需求开发、线上热修、代码评审、CI 复现、版本回归验证的开发者来说，worktree 比频繁 `stash`、反复切分支、复制仓库更稳定、更快，也更容易形成团队规范。

本文从 Git worktree 的底层模型讲起，结合真实开发场景给出完整命令流程、目录规划、依赖隔离、清理维护、常见坑位和团队落地建议。读完后，你应该能判断什么时候该用 worktree，什么时候不该用，并能把它纳入日常开发工作流。

## 目录

- #git worktree 是什么
- #为什么它比 stash 和复制仓库更适合并行开发
- #核心模型主工作区链接工作区与裸仓库
- #常用命令从创建到清理
- #实战一需求开发与线上热修并行
- #实战二用 worktree 做代码评审和 CI 复现
- #实战三长期维护多个版本线
- #依赖与构建产物隔离
- #团队规范与目录设计
- #常见问题与排错
- #最佳实践清单
- #总结

## 正文

### Git worktree 是什么

普通 Git 仓库通常只有一个工作目录。你在这个目录里切换分支：

```bash
git switch feature/pay
git switch hotfix/login
git switch main
```

每次切换时，Git 会更新工作区文件、索引和 `HEAD`。如果当前目录有未提交修改，切换分支可能失败；如果你强行处理，就需要 `stash`、临时提交或者复制一份仓库。

`git worktree` 解决的是另一个问题：**让同一个 Git 仓库拥有多个并行工作目录**。

例如：

```bash
project/
project.worktrees/
  feature-pay/
  hotfix-login/
  review-pr-128/
```

这些目录可以分别签出不同分支：

```bash
project/                       -> main
project.worktrees/feature-pay/ -> feature/pay
project.worktrees/hotfix-login/ -> hotfix/login
```

它们共享同一个仓库对象库，因此不会像复制仓库那样重复下载全部历史对象；但每个工作目录都有自己的文件状态、索引和当前分支，因此不会互相覆盖工作现场。

一句话理解：**worktree 是 Git 原生支持的“一个仓库，多套工作现场”。**

### 为什么它比 stash 和复制仓库更适合并行开发

很多人第一次遇到并行开发时，会用三种方式解决：

| 方式 | 优点 | 问题 |
|------|------|------|
| `git stash` | 快，命令简单 | 工作现场被压成栈，容易忘记、冲突或恢复错 |
| 复制仓库 | 隔离彻底 | 占空间，拉取慢，远程配置和 hooks 容易不一致 |
| 临时提交 | 可追踪 | 历史会混入大量 WIP，需要后续整理 |
| `git worktree` | 原生、多目录、共享对象、状态清晰 | 需要理解工作区与分支绑定关系 |

`stash` 的本质是把当前修改暂存起来，适合很短的上下文切换，不适合长期并行。尤其是同时维护多个未完成任务时，`stash list` 很快会变成难以判断的临时栈：

```bash
stash@{0}: WIP on feature/pay: ...
stash@{1}: WIP on main: ...
stash@{2}: WIP on hotfix/login: ...
```

复制仓库虽然直观，但代价也明显：

- 大型仓库会重复占用磁盘空间。
- 每个副本都要单独配置 remote、hooks、局部配置。
- 多个副本的分支状态容易不一致。
- 清理时很难知道哪些副本还有价值。

worktree 的优势在于它让工作现场变成可见目录，而不是隐藏在 stash 栈里：

```bash
git worktree list
```

输出类似：

```text
D:/project/app                         abc1234 [main]
D:/project/app.worktrees/feature-pay   def5678 [feature/pay]
D:/project/app.worktrees/hotfix-login  89ab012 [hotfix/login]
```

你能一眼看到每个工作区对应的路径、提交和分支。

### 核心模型：主工作区、链接工作区与裸仓库

理解 worktree，关键是理解三个概念。

#### 主工作区

你平时 `git clone` 出来的目录就是主工作区：

```text
app/
  .git/
  src/
  package.json
```

它包含工作目录和 `.git` 目录。主工作区可以继续像普通仓库一样使用。

#### 链接工作区

通过 `git worktree add` 创建出来的目录叫 linked worktree。它看起来也是一个完整项目目录，但里面的 `.git` 不是目录，而是一个文本文件：

```text
gitdir: D:/project/app/.git/worktrees/feature-pay
```

真正的 Git 元数据仍然存放在主仓库的 `.git/worktrees/` 下。链接工作区通过这个指针找到自己的 Git 状态。

这也是为什么不要手动复制、移动或删除 worktree 目录。Git 需要同时维护工作目录和 `.git/worktrees/` 里的元数据。

#### 裸仓库模式

如果你把 worktree 当成长期工作流，也可以用 bare repository 作为中心仓库，只把所有实际开发目录都作为 worktree：

```text
app.git/                 # bare 仓库，只放 Git 数据
app.worktrees/
  main/
  feature-pay/
  hotfix-login/
```

这种模式更适合高级用户或团队工具化场景。日常开发中，从普通仓库创建 worktree 已经足够。

### 常用命令：从创建到清理

#### 查看当前 worktree

```bash
git worktree list
```

加上 `--porcelain` 可以得到脚本友好的格式：

```bash
git worktree list --porcelain
```

#### 为已有分支创建工作区

```bash
git worktree add ../app.worktrees/feature-pay feature/pay
```

含义是：把 `feature/pay` 分支签出到 `../app.worktrees/feature-pay`。

#### 创建新分支并创建工作区

```bash
git worktree add -b feature/refund ../app.worktrees/feature-refund main
```

含义是：基于 `main` 创建 `feature/refund`，并把它签出到指定目录。

#### 从远程分支创建工作区

```bash
git fetch origin
git worktree add ../app.worktrees/review-pr-128 origin/feature/pay
```

这会创建一个 detached HEAD 工作区，适合临时代码评审。如果你需要在本地提交修改，应显式创建本地分支：

```bash
git worktree add -b review/pr-128 ../app.worktrees/review-pr-128 origin/feature/pay
```

#### 删除工作区

优先使用：

```bash
git worktree remove ../app.worktrees/feature-pay
```

如果工作区有未提交修改，Git 会拒绝删除。确认不要这些修改时，才使用：

```bash
git worktree remove --force ../app.worktrees/feature-pay
```

#### 清理已经不存在的 worktree 记录

如果你手动删除了目录，Git 里可能还残留记录：

```bash
git worktree prune
```

建议先查看：

```bash
git worktree list
```

再清理，避免误判。

### 实战一：需求开发与线上热修并行

这是 worktree 最典型的场景。

你正在 `feature/payment-v2` 分支开发支付改造，工作区里有大量未完成代码：

```bash
git status
```

输出可能是：

```text
On branch feature/payment-v2
Changes not staged for commit:
  modified: src/payment/PaymentService.java
  modified: src/payment/PaymentConfig.java
```

此时线上突然出现登录问题，需要从 `main` 拉出热修分支。传统做法通常是 `stash` 当前修改，再切到 `main`，再建 hotfix。问题是支付改造现场被压进 stash，回来的时候还可能冲突。

使用 worktree，可以保持当前目录完全不动：

```bash
git fetch origin
git worktree add -b hotfix/login-timeout ../app.worktrees/hotfix-login-timeout origin/main
```

进入热修目录：

```bash
cd ../app.worktrees/hotfix-login-timeout
```

修复、测试、提交、推送：

```bash
git status
git add src/login/LoginService.java
git commit -m "fix: handle login timeout correctly"
git push -u origin hotfix/login-timeout
```

热修完成后删除工作区：

```bash
cd ../../app
git worktree remove ../app.worktrees/hotfix-login-timeout
```

整个过程中，原来的支付开发目录没有被切分支，也没有使用 stash。上下文切换从“保存现场”变成了“打开另一个现场”。

### 实战二：用 worktree 做代码评审和 CI 复现

代码评审经常需要把别人的分支拉下来运行。如果直接在当前项目目录切分支，会污染本地状态；如果用临时 clone，又慢又占空间。

推荐用固定目录保存评审工作区：

```bash
git fetch origin pull/128/head:review/pr-128
git worktree add ../app.worktrees/review-pr-128 review/pr-128
```

然后在独立目录中安装依赖、运行测试：

```bash
cd ../app.worktrees/review-pr-128
npm install
npm test
```

评审结束：

```bash
cd ../../app
git worktree remove ../app.worktrees/review-pr-128
git branch -D review/pr-128
```

如果你只是查看代码，不准备提交，也可以直接基于远程分支创建 detached 工作区：

```bash
git worktree add --detach ../app.worktrees/review-pr-128 origin/feature/pay
```

detached HEAD 不适合长期开发，但非常适合一次性验证。

### 实战三：长期维护多个版本线

很多企业项目同时维护多个版本：

- `main`：主干开发。
- `release/2.3`：当前稳定版本。
- `release/2.2`：仍在维护的旧版本。
- `hotfix/*`：线上紧急修复。

如果只用一个工作目录，你会频繁切换分支，依赖、构建缓存、IDE 索引都反复变化。用 worktree 可以把版本线固定下来：

```bash
git worktree add ../app.worktrees/main main
git worktree add ../app.worktrees/release-2.3 release/2.3
git worktree add ../app.worktrees/release-2.2 release/2.2
```

目录结构清晰后，日常维护会稳定很多：

```text
app.worktrees/
  main/          # 新功能开发
  release-2.3/   # 当前稳定版修复
  release-2.2/   # 老版本客户问题
```

当一个 bug 需要同时修复多个版本时，也可以在不同目录中分别验证，再用 cherry-pick 控制变更传播：

```bash
cd ../app.worktrees/release-2.3
git cherry-pick <fix-commit>

cd ../release-2.2
git cherry-pick <fix-commit>
```

这里要注意：worktree 解决的是工作目录并行问题，不自动解决版本间差异。补丁是否能直接 cherry-pick，仍然取决于代码差异和测试结果。

### 依赖与构建产物隔离

worktree 共享 Git 对象，但不共享工作目录文件。因此 `node_modules`、`target`、`build`、`.gradle`、`.idea` 这类本地文件默认是各自独立的。

这既是优点，也是成本。

优点是不同分支不会互相污染。例如一个分支升级了依赖，另一个分支仍使用旧版本：

```bash
app.worktrees/main/package-lock.json
app.worktrees/feature-upgrade/package-lock.json
```

它们的 `node_modules` 可以完全不同。

成本是磁盘占用可能增加。对于大型前端或 Java 项目，要提前规划缓存策略：

- Node.js 项目优先使用 lockfile，确保每个 worktree 可重复安装。
- Maven 和 Gradle 依赖缓存通常在用户目录下共享，不必复制。
- 构建输出目录必须写入 `.gitignore`，避免误提交。
- IDE 配置如果包含绝对路径，尽量不要提交。

Node 项目中可以这样处理：

```bash
cd ../app.worktrees/feature-pay
npm ci
npm test
```

`npm ci` 更适合在独立 worktree 中重建依赖，因为它严格按照 lockfile 安装，能减少“我这里可以运行”的环境偏差。

### 团队规范与目录设计

worktree 真正好用，靠的不只是命令，还包括稳定的目录规范。

推荐把 worktree 放在主仓库旁边，而不是放进主仓库里面：

```text
workspace/
  app/
  app.worktrees/
    feature-pay/
    hotfix-login/
    review-pr-128/
```

不要这样放：

```text
app/
  .git/
  src/
  worktrees/
    feature-pay/
```

原因很简单：如果 worktree 目录在主仓库内部，容易被构建脚本、搜索工具、IDE、格式化工具、测试扫描误处理，也容易被误加入 Git 跟踪。

命名建议：

| 场景 | 目录名示例 | 分支名示例 |
|------|------------|------------|
| 功能开发 | `feature-pay` | `feature/pay` |
| 热修 | `hotfix-login-timeout` | `hotfix/login-timeout` |
| 评审 | `review-pr-128` | `review/pr-128` |
| 版本线 | `release-2.3` | `release/2.3` |

团队还可以约定两个别名：

```bash
git config --global alias.wtl "worktree list"
git config --global alias.wtp "worktree prune"
```

如果团队大量使用 worktree，可以再写一个轻量脚本统一创建路径，避免每个人目录结构不同。

### 常见问题与排错

#### 问题一：同一个分支不能同时签出到两个 worktree

如果你执行：

```bash
git worktree add ../app.worktrees/main-copy main
```

可能看到类似错误：

```text
fatal: 'main' is already checked out
```

Git 默认不允许同一个分支同时被两个工作区签出，因为两个目录都能移动同一个分支指针，容易造成混乱。

如果只是想看同一个提交，用 detached HEAD：

```bash
git worktree add --detach ../app.worktrees/main-copy main
```

如果要独立开发，创建新分支：

```bash
git worktree add -b experiment/main-copy ../app.worktrees/main-copy main
```

#### 问题二：手动删除目录后 worktree list 仍然存在

先查看：

```bash
git worktree list
```

再清理失效记录：

```bash
git worktree prune
```

更好的习惯是始终用：

```bash
git worktree remove <path>
```

#### 问题三：删除 worktree 后分支还在

`git worktree remove` 删除的是工作目录，不会自动删除分支。需要你确认分支是否还要保留：

```bash
git branch -d feature/pay
```

如果分支未合并，Git 会拒绝删除。确认不需要时才使用：

```bash
git branch -D feature/pay
```

#### 问题四：IDE 打开多个 worktree 后索引很慢

这是正常现象。每个 worktree 对 IDE 来说都是一个完整项目。建议：

- 只打开当前需要工作的 worktree。
- 把 `app.worktrees/` 放在主仓库外部。
- 对大型项目关闭无关目录的自动索引。
- 不要让 IDE 同时把主仓库和所有 worktree 当成一个超大工作区。

#### 问题五：hooks 和配置是否共享

Git hooks 通常来自主仓库的 `.git/hooks` 或项目内的 hooks 管理工具。worktree 与主仓库共享 Git 数据目录，但每个 worktree 的工作目录文件不同。

实践上要注意：

- 如果 hooks 依赖工作目录中的脚本，确保每个 worktree 都安装了依赖。
- 如果项目使用 Husky，通常需要依赖已安装后 hooks 才能正常执行。
- 如果使用 `core.hooksPath`，确认路径是相对路径还是绝对路径。

### 最佳实践清单

把 worktree 用好，可以遵循下面这份清单：

- 用 `git worktree add -b <branch> <path> <base>` 创建新任务工作区。
- 把所有 worktree 放在主仓库同级的 `<repo>.worktrees/` 目录。
- 用 `git worktree list` 定期检查当前工作区。
- 用 `git worktree remove` 删除工作区，不直接删目录。
- 临时代码评审优先使用 detached worktree。
- 长期开发必须使用明确命名的本地分支。
- 每个 worktree 单独安装依赖、单独运行测试。
- 不把 worktree 目录放进主仓库内部。
- 不用 worktree 掩盖分支过多、任务拆分混乱的问题。
- 合并完成后及时删除工作区和无用分支。

### 什么时候不该使用 worktree

worktree 很强，但不是所有场景都适合。

如果你只是临时切换几分钟，当前工作区也没有复杂修改，直接 `git switch` 更简单。

如果你只是保存一小段未完成修改，稍后马上恢复，`git stash push -m "..."` 也足够。

如果你需要完全隔离 remote、Git 配置、hooks、子模块策略，单独 clone 可能更清晰。

如果项目依赖大量不可共享的大型构建产物，多个 worktree 会增加磁盘压力，需要结合缓存策略使用。

判断标准很简单：**当上下文切换开始影响你的判断，或者多个任务需要同时保留可运行状态时，就该考虑 worktree。**

## 总结

`git worktree` 的价值不在于多一个 Git 命令，而在于它改变了多任务开发的组织方式。它把隐藏在 stash、临时提交、复制仓库里的上下文，变成了清晰可见、可运行、可删除的目录。

对于个人开发，它能减少切分支和恢复现场的心理负担。对于团队协作，它能让热修、评审、版本维护和 CI 复现变得更加规范。真正落地时，建议从三个习惯开始：固定 worktree 目录、用命令删除工作区、为不同任务创建明确分支。

当你的工作不再是“一个分支做完再做下一个”，而是每天都要在需求、bug、评审、发布之间切换时，worktree 就不是高级技巧，而是应该掌握的基础工程能力。

## 延伸阅读

- `git help worktree`
- `git help switch`
- `git help branch`
- `git help stash`

## 一句话记忆

`git worktree` 让一个仓库拥有多个独立工作现场：共享历史对象，隔离工作目录，用目录管理上下文，而不是用 stash 赌记忆力。
