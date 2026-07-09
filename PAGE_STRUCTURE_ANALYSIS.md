# AI 个人笔记项目 - 页面结构详细分析

## 项目概览
该项目是一个基于 Node.js 的 Markdown 文档转静态 HTML 网站系统。

---

## 1. 头部（Header）结构

**文件位置**: `template_with_dates.html` (第 56-203 行)

### Header 包含的主要内容

#### 1.1 Logo 和标题区域
- Logo: 60x60px 白色方形盒
- 标题: `<h1>AI 个人笔记</h1>`
- 字体大小: 2.5rem（桌面），响应式调整

#### 1.2 副标题和描述
```html
<p class="header-subtitle">记录 AI 协助解决的各种技术问题和学习笔记</p>
<div class="header-description">这里汇集了在日常开发和学习过程中...</div>
```

#### 1.3 话题区域（5 个技术领域）
- Java 深度解析
- Spring 全家桶
- 前端技术
- 系统架构
- 开发工具

#### 1.4 操作按钮
- 工具页面链接 (`tools.html`)
- 文档归档链接 (`overview.html`)

#### 1.5 固定元素
- 主题切换按钮（固定位置：右上角）
- 返回顶部按钮（固定位置：右下角）

### Header 样式特点
- 渐变背景: `linear-gradient(135deg, #8F94A8, #B74A43, #CE3321)`
- 暗色模式支持: `:root.dark-mode` CSS 变量
- 响应式: 平板和手机端调整布局

---

## 2. 文章列表/内容部分（Feed）

**文件位置**: `template_with_dates.html` (第 686-689 行)

### Feed 容器
```html
<div class="feed">
    <!-- {{DOC_CARDS}} 被替换为动态生成的卡片 -->
</div>
```

### 单个文章卡片结构
```html
<div class="feed-item">
    <div class="feed-item-header">
        <h2 class="feed-item-title"><a href="...">标题</a></h2>
        <div class="feed-item-meta">
            <span class="feed-item-date">日期</span>
            <span class="feed-item-category">分类</span>
        </div>
    </div>
    <div class="feed-item-content">
        <p>文章摘要...</p>
    </div>
    <div class="feed-item-footer">
        <a href="..." class="read-more">阅读更多 →</a>
    </div>
</div>
```

### Feed 样式特点
- 网格布局: `grid-template-columns: repeat(auto-fill, minmax(650px, 1fr))`
- Hover 效果: Y 轴上移 5px，阴影加强
- 响应式: 移动端改为单列布局
- 顶部装饰线: Hover 时从 0 扩展到 100%

---

## 3. 当前 index.html 页面结构

**文件位置**: `index.html`

### 完整页面布局
```
<html>
  <head>
    <!-- Meta 标签（SEO、Open Graph、Twitter）-->
    <!-- 内联 CSS -->
  </head>
  <body>
    <div class="container">
      <header class="header"><!-- 详见第 1 节 --></header>
      <div class="warning">⚠️ 警告信息</div>
      <div class="feed"><!-- 16 篇文章卡片 --></div>
      <div class="pagination"><!-- 分页导航 --></div>
      <footer class="footer"><!-- 页脚 --></footer>
    </div>
    
    <button class="theme-toggle" id="themeToggle"><!-- 主题切换 --></button>
    <a href="#" class="back-to-top" id="backToTop">↑</a>
    
    <script><!-- JavaScript 功能 --></script>
  </body>
</html>
```

### 当前文章数量
- 第 1 页: 16 篇（每页配置为 15 篇，但显示 16 篇）

---

## 4. JavaScript 路由和交互逻辑

### 重要发现：非 SPA 架构

**这不是单页应用！** 项目使用**静态网站生成（SSG）**：
- 每个页面都是预生成的独立 HTML 文件
- 没有前端路由框架（Vue、React）
- 页面导航通过传统 HTML `<a>` 链接

### JavaScript 功能（最小化）

#### 4.1 暗色模式切换 (第 719-736 行)
```javascript
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

// 从 localStorage 读取用户偏好
const savedTheme = localStorage.getItem('theme-mode');
if (savedTheme === 'dark') {
    html.classList.add('dark-mode');
}

// 切换暗色模式
themeToggle.addEventListener('click', () => {
    html.classList.toggle('dark-mode');
    const isDarkMode = html.classList.contains('dark-mode');
    localStorage.setItem('theme-mode', isDarkMode ? 'dark' : 'light');
});
```

工作原理：
1. 读取 localStorage 的 `theme-mode`
2. 在 `<html>` 根元素上切换 `dark-mode` 类
3. CSS 变量 `:root.dark-mode` 自动适配颜色

#### 4.2 返回顶部功能 (第 738-752 行)
```javascript
const backToTopButton = document.getElementById('backToTop');

// 滚动 > 300px 时显示按钮
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        backToTopButton.classList.add('visible');
    } else {
        backToTopButton.classList.remove('visible');
    }
});

// 平滑滚动到顶部
backToTopButton.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({top: 0, behavior: 'smooth'});
});
```

---

## 5. 模板生成流程

**核心脚本**: `src/generate_index_with_dates.js`

### 完整工作流

```
markdown/2025-10/article.md
    ↓ (convert_md_to_html_pandoc.js)
docs/2025-10/article.html  ← 完整的独立文章页面
    ↓ (generate_index_with_dates.js)
index.html         ← 第 1 页（15 篇）
pages/index2.html  ← 第 2 页（15 篇）
pages/index3.html  ← 第 3 页（15 篇）
pages/index4.html  ← 第 4 页（剩余）
```

### 关键步骤

#### 步骤 1: 收集所有 Markdown 文件
```javascript
const monthDirs = fs.readdirSync("markdown")
    .filter(file => /^\d{4}-\d{2}$/.test(file))  // YYYY-MM 格式目录
    .sort()
    .reverse();  // 最新优先
```

#### 步骤 2: 提取文档信息
对每个 Markdown 文件提取：
- `title`: 从第一行 `# 标题` 提取
- `excerpt`: 前 30 字符摘要
- `date`: 文件修改时间
- `monthDir`: 所属目录（如 "2025-10"）

#### 步骤 3: 排序和分页
```javascript
const ITEMS_PER_PAGE = 15;
allDocuments.sort((a, b) => b.date - a.date);  // 按日期倒序
const totalPages = Math.ceil(allDocuments.length / ITEMS_PER_PAGE);
```

#### 步骤 4: 为每页生成 HTML
- 读取 `template_with_dates.html` 模板
- 替换 `{{DOC_CARDS}}` 占位符为卡片 HTML
- 替换分页导航占位符
- 添加 SEO meta 标签
- 处理路径（子目录页面需要 ../ 相对路径）
- 输出到 `index.html` 或 `pages/index{N}.html`

### 模板占位符

| 占位符 | 替换内容 |
|-------|--------|
| `{{DOC_CARDS}}` | 生成的文章卡片 HTML |
| `分页导航` | 上一页/页码/下一页 HTML |
| `</title>` 后 | SEO Meta 标签 |

---

## 6. Markdown 转 HTML 流程

**脚本**: `src/convert_md_to_html_pandoc.js`

### 核心转换函数

```javascript
function markdownToHtml(markdownContent, title, date, monthDir, filename) {
    // 1. 使用 marked 库转换 Markdown → HTML
    const htmlContent = marked.parse(markdownContent, { renderer: renderer });
    
    // 2. 包装在完整 HTML 模板中
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>${title}</title>
    <!-- ... 完整样式定义 ... -->
</head>
<body>
    <!-- 导航 -->
    <!-- 文章内容 -->
    <!-- 页脚 -->
</body>
</html>`;
}
```

### Mermaid 图表支持

```javascript
renderer.code = function(code, infostring, escaped) {
    if (infostring === 'mermaid') {
        return `<div class="mermaid">\n${code}\n</div>`;
    }
    // ... 其他代码块处理
};
```

---

## 7. 项目构建命令

**文件**: `package.json`

### 可用命令

```bash
npm run build          # 完整构建（转换 + 分页 + 站点地图 + 概览）
npm run dev            # 开发模式 + 本地服务器 + 监听
npm run watch          # 文件监听和自动转换
npm run clean          # 清理构建产物
```

### 标准构建流程

```bash
npm run build
# 执行顺序：
# 1. convert_md_to_html_pandoc.js
# 2. generate_index_with_dates.js
# 3. generate_sitemap.js
# 4. generate_overview.js
```

---

## 8. 项目文件组织

```
ai-blog/
├── markdown/                # 源文件
│   ├── 2025-10/
│   │   ├── article1.md
│   │   └── ...
│   └── 2025-09/
│       └── ...
│
├── docs/                    # 生成的 HTML 文章页面
│   ├── 2025-10/
│   │   ├── article1.html    # 完整独立页面
│   │   └── ...
│   └── 2025-09/
│
├── html/                    # 旧格式 HTML 文档
│
├── pages/                   # 生成的分页索引
│   ├── index2.html
│   ├── index3.html
│   └── index4.html
│
├── src/                     # Node.js 脚本
│   ├── generate_index_with_dates.js
│   ├── convert_md_to_html_pandoc.js
│   ├── generate_overview.js
│   ├── generate_sitemap.js
│   └── ...
│
├── template_with_dates.html # 主模板
├── template_seo.html        # SEO 模板
│
├── index.html               # 首页（第 1 页）
├── sitemap.xml              # 网站地图
├── overview.html            # 归档页
│
└── package.json             # 配置文件
```

---

## 9. 核心特性总结

### 页面特点
- 响应式设计（桌面/平板/手机）
- 暗色模式（localStorage 保存偏好）
- SEO 优化（Meta 标签、Canonical）
- 静态生成（无服务器渲染）

### 文章系统
- 按月分类（YYYY-MM 目录）
- 自动分页（15 篇/页）
- 日期排序（最新优先）
- 自动摘要（前 30 字符）
- GitHub 源文件链接

### 生成系统
- 增量构建（只转换修改的文件）
- 多种转换选项（marked 或 Pandoc）
- 实时开发模式
- 自动化构建流程

