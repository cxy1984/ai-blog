# npm run build 完整流程分析

## 执行命令链

```bash
npm run build
  ├─ npm run convert-md-pandoc      # Markdown转HTML
  ├─ npm run generate-index         # 生成首页和分页列表
  ├─ npm run generate-sitemap       # 生成sitemap.xml
  └─ npm run generate-overview      # 生成概览页面
```

---

## 1️⃣ convert-md-pandoc (Markdown → HTML转换)

**脚本**: `src/convert_md_to_html_pandoc.js`

### 执行流程
- 扫描 `markdown/` 目录的所有年月文件夹 (格式: `YYYY-MM`)
- 对每个`.md`文件:
  - 使用Pandoc转换成HTML片段
  - 使用 `template_seo.html` 包裹成完整页面
  - 使用 `article-detail.html` 生成SPA用Fragment
  - 支持增量构建 (仅转换修改过的文件)
  - 4个并发进程加速转换

### 生成模板

#### template_seo.html (详情页模板)
```
用途: 生成完整的SEO优化页面
包含:
  - 完整HTML文档结构
  - SEO元标签 (title, description, keywords)
  - Open Graph标签 (og:title, og:image等)
  - Twitter Card标签
  - Canonical URL
  - Favicon链接
  - 代码高亮样式 (Pandoc生成)

输出: docs/{YYYY-MM}/{filename}.html
示例: docs/2025-10/spring-assert.html
```

#### article-detail.html (SPA用Fragment模板)
```
用途: 为Single Page Application提供内容片段
包含:
  - <article>容器
  - 标题 ({{TITLE}})
  - 日期和分类元数据 ({{DATE}}, {{CATEGORY}})
  - 文章内容 ({{CONTENT}})
  - AI生成内容提示警告
  - 代码复制按钮功能
  - 页脚

输出: docs/{YYYY-MM}/{filename}-fragment.html
示例: docs/2025-10/spring-assert-fragment.html
```

### 输出示例
```
docs/2025-10/spring-assert.html           ← 完整页面(SEO用)
docs/2025-10/spring-assert-fragment.html  ← Fragment (SPA用)
docs/2025-10/spring-beanutils.html
docs/2025-10/spring-beanutils-fragment.html
```

---

## 2️⃣ generate-index (生成首页和列表分页)

**脚本**: `src/generate_index_with_dates.js`

### 执行流程
1. 收集所有文档元数据 (Markdown + HTML)
2. 提取文档信息:
   - 标题 (从Markdown第一行 # 标题 或 HTML的<title>)
   - 摘要 (Markdown前30个字符)
   - 修改日期
   - 文档类型 (Markdown/HTML)
   - 分类 (目录或标签)
3. 按修改日期倒序排列 (最新优先)
4. 每15条分页一次
5. 为每页生成列表页面，保存到 `pages/` 目录

### 生成模板

#### template_feed_list.html (列表页面专用模板)
```
用途: 生成分页列表页面 (不包含header)
包含:
  - 警告提示 (AI协助生成声明)
  - Feed流式布局
  - 每个文档卡片 (feed-item):
    - 标题 + 链接
    - 发布日期
    - 分类标签
    - 摘要预览
    - "阅读更多"链接
  - 分页导航:
    - 上一页 / 下一页 按钮
    - 数字页码链接 (1, 2, 3...)
    - 当前页高亮显示
  - 页脚

路径配置:
  - 第1页: pages/index.html (SPA加载)
  - 第2页: pages/index2.html (SPA加载)
  - 第3页: pages/index3.html (SPA加载)
  - 第N页: pages/indexN.html (SPA加载)
```

### 输出详解

#### 分页结构 (每15条文档)
```
第1页 (文章1-15):
  - 输出文件: pages/index.html
  - 用途: 被index.html的SPA加载显示
  - 访问: /pages/index.html

第2页 (文章16-30):
  - 输出文件: pages/index2.html
  - 访问: /pages/index2.html

第3页 (文章31-45):
  - 输出文件: pages/index3.html
  - 访问: /pages/index3.html

第4页 (文章46-60):
  - 输出文件: pages/index4.html
  - 访问: /pages/index4.html
```

#### 文档卡片示例
```html
<div class="feed-item">
  <div class="feed-item-header">
    <h2 class="feed-item-title">
      <a href="/docs/2025-10/spring-assert.html">Spring Assert工具类详解</a>
    </h2>
    <div class="feed-item-meta">
      <span class="feed-item-date">2025/10/15</span>
      <span class="feed-item-category">Markdown 文档</span>
    </div>
  </div>
  <div class="feed-item-content">
    <p>本文介绍Spring框架中Assert工具类的用法...</p>
  </div>
  <div class="feed-item-footer">
    <a href="/docs/2025-10/spring-assert.html" class="read-more">阅读更多 →</a>
  </div>
</div>
```

#### 分页导航示例 (第2页: pages/index2.html)
```html
<div class="pagination">
  <a href="index.html">← 上一页</a>
  <a href="index.html">1</a>
  <a href="#" class="current">2</a>
  <a href="index3.html">3</a>
  <a href="index4.html">4</a>
  <a href="index3.html">下一页 →</a>
</div>
```

分页链接说明:
- 同目录引用 (都在 pages/ 目录下)
- index.html = 第1页
- index2.html = 第2页
- index3.html = 第3页
- 等等

### 当前项目的分页

项目已生成以下分页文件:
```
pages/index.html   ← 第1页
pages/index2.html  ← 第2页
pages/index3.html  ← 第3页
pages/index4.html  ← 第4页
```

---

## 3️⃣ generate-sitemap (生成SEO Sitemap)

**脚本**: `src/generate_sitemap.js`

### 执行流程
1. 收集所有文档的完整URL
2. 生成标准 `sitemap.xml` 格式
3. 设置优先级和更新频率

### 输出: sitemap.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- 首页 - 最高优先级 -->
  <url>
    <loc>https://www.caoayu.top/index.html</loc>
    <lastmod>2025-11-10T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- 分页 - 较高优先级 -->
  <url>
    <loc>https://www.caoayu.top/pages/index2.html</loc>
    <lastmod>2025-11-10T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- 所有文档 - 标准优先级 -->
  <url>
    <loc>https://www.caoayu.top/docs/2025-10/spring-assert.html</loc>
    <lastmod>2025-10-15T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>https://www.caoayu.top/docs/2025-10/spring-beanutils.html</loc>
    <lastmod>2025-10-14T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- ... 更多文档 ... -->
</urlset>
```

### 作用
- 帮助搜索引擎爬虫发现和索引所有页面
- 告知搜索引擎页面的重要程度
- 提示更新频率以便及时重新爬取

---

## 4️⃣ generate-overview (生成概览页面)

**脚本**: `src/generate_overview.js`

### 执行流程
1. 收集所有文档元数据
2. 生成JavaScript数组 `const articles = [...]`
3. 注入到 `overview.html`

### 输出: overview.html (更新)

```javascript
const articles = [
  {
    "type": "markdown",
    "url": "docs/2025-10/spring-assert.html",
    "title": "Spring Assert工具类详解",
    "date": "2025/10/15",
    "category": "Markdown 文档"
  },
  {
    "type": "markdown",
    "url": "docs/2025-10/spring-beanutils.html",
    "title": "Spring BeanUtils工具类详解",
    "date": "2025/10/14",
    "category": "Markdown 文档"
  },
  {
    "type": "html",
    "url": "html/jvm-desc.html",
    "title": "JVM类型描述符详解",
    "date": "2025/10/10",
    "category": "HTML 文档"
  },
  // ... 更多文档 ...
];
```

### 用途
- 提供前端JavaScript接口
- 支持动态搜索、筛选、排序
- 不需要后端API就能实现复杂的文章查询功能

---

## 📊 模板使用总结表

| 功能 | 模板文件 | 输出文件 | 用途 | 备注 |
|------|---------|---------|------|------|
| **详情页SEO** | `template_seo.html` | `docs/{年月}/{文件名}.html` | 完整页面，SEO优化 | 每篇文章一个 |
| **SPA Fragment** | `article-detail.html` | `docs/{年月}/{文件名}-fragment.html` | 前端SPA动态加载 | 用于AJAX获取内容 |
| **第1页列表** | `template_feed_list.html` | `pages/index.html` | 首页feed展示 | 被index.html加载 |
| **分页列表** | `template_feed_list.html` | `pages/index{N}.html` | 第N页的列表 | N ≥ 2 |
| **SEO地图** | 无 | `sitemap.xml` | 搜索引擎索引 | XML格式 |
| **概览页** | `overview.html` | `overview.html` (更新) | 文章数据+搜索功能 | 注入articles数组 |

---

## 🔄 完整数据流向图

```
markdown/
├─ 2025-10/
│  ├─ spring-assert.md
│  ├─ spring-beanutils.md
│  └─ spring-collectionutils.md
└─ 2025-09/
   ├─ javascript-async.md
   └─ maven-resource.md

        ↓ [convert-md-pandoc] (4个并发进程)
        ↓

docs/
├─ 2025-10/
│  ├─ spring-assert.html (SEO版)
│  ├─ spring-assert-fragment.html (SPA版)
│  ├─ spring-beanutils.html
│  ├─ spring-beanutils-fragment.html
│  └─ spring-collectionutils.html
│  └─ spring-collectionutils-fragment.html
└─ 2025-09/
   ├─ javascript-async.html
   ├─ javascript-async-fragment.html
   ├─ maven-resource.html
   └─ maven-resource-fragment.html

        ↓ [generate-index] (收集元数据 + 分页)
        ↓

pages/
├─ index.html (第1页: 文章1-15)
├─ index2.html (第2页: 文章16-30)
├─ index3.html (第3页: 文章31-45)
└─ index4.html (第4页: 文章46-60)

index.html (SPA主文件)
        ↓ 加载 pages/index.html

        ↓ [generate-sitemap]
        ↓

sitemap.xml (SEO地图)

        ↓ [generate-overview]
        ↓

overview.html (更新 articles 数组)
```

---

## 💡 关键特点

### 1. 双输出策略
- **完整页面** (`*.html`): 用于SEO和直接访问
- **Fragment片段** (`*-fragment.html`): 用于SPA通过AJAX加载

### 2. 分页机制
- 每15条文档一页
- 支持多页导航
- 分页文件独立存储在 `pages/` 目录

### 3. SEO优化
- 每个页面独立meta标签
- Open Graph支持社交分享
- Sitemap自动提交搜索引擎
- Canonical URL防止重复收录

### 4. 增量构建
- 仅转换修改过的Markdown文件
- 对比文件修改时间 (mtime)
- 加速重复构建速度

### 5. 并发处理
- Pandoc转换支持4个进程并行
- 充分利用多核CPU
- 加速整体构建时间

### 6. 灵活的文档管理
- 支持按年月组织文档
- Markdown和HTML混合支持
- 自动提取标题和摘要

---

## ⚙️ 构建时间估算

| 步骤 | 文件数 | 耗时 |
|------|-------|------|
| convert-md-pandoc | ~100个md | 10-15秒 (并发) |
| generate-index | - | 0.5秒 |
| generate-sitemap | - | 0.2秒 |
| generate-overview | - | 0.3秒 |
| **总耗时** | | **~11-16秒** |

---

## 🔧 常见问题

### Q: 如何修改分页数量？
**A**: 编辑 `src/generate_index_with_dates.js` 的 `ITEMS_PER_PAGE` 常量 (默认15)

### Q: 如何修改domain？
**A**: 编辑 `src/generate_sitemap.js` 的 `baseUrl` 和其他脚本中的URL前缀

### Q: Fragment是做什么的？
**A**: Fragment是去掉HTML文档结构的纯内容片段，用于SPA通过AJAX加载到页面中

### Q: 为什么要生成两份HTML？
**A**:
- 完整页面 = SEO友好 + 可独立访问
- Fragment = 快速加载 + SPA集成

### Q: Sitemap怎么用？
**A**: 提交到Google Search Console和Bing Webmaster Tools，帮助搜索引擎索引

---

## 🚀 优化建议

1. **缓存优化**: 在Fragment中添加HTTP缓存头
2. **图片优化**: 在Markdown中优化图片大小和格式
3. **代码分割**: 按分类生成单独的sitemap索引
4. **预加载**: 在首页预加载常访问页面的Fragment
5. **CDN**: 考虑将静态文件部署到CDN加速
