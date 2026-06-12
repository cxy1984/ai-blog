# npm run build 瀹屾暣娴佺▼鍒嗘瀽

## 鎵ц鍛戒护閾?

```bash
npm run build
  鈹溾攢 npm run convert-md-pandoc      # Markdown杞琀TML
  鈹溾攢 npm run generate-index         # 鐢熸垚棣栭〉鍜屽垎椤靛垪琛?
  鈹溾攢 npm run generate-sitemap       # 鐢熸垚sitemap.xml
  鈹斺攢 npm run generate-overview      # 鐢熸垚姒傝椤甸潰
```

---

## 1锔忊儯 convert-md-pandoc (Markdown 鈫?HTML杞崲)

**鑴氭湰**: `src/convert_md_to_html_pandoc.js`

### 鎵ц娴佺▼
- 鎵弿 `markdown/` 鐩綍鐨勬墍鏈夊勾鏈堟枃浠跺す (鏍煎紡: `YYYY-MM`)
- 瀵规瘡涓猔.md`鏂囦欢:
  - 浣跨敤Pandoc杞崲鎴怘TML鐗囨
  - 浣跨敤 `template_seo.html` 鍖呰９鎴愬畬鏁撮〉闈?
  - 浣跨敤 `article-detail.html` 鐢熸垚SPA鐢‵ragment
  - 鏀寔澧為噺鏋勫缓 (浠呰浆鎹慨鏀硅繃鐨勬枃浠?
  - 4涓苟鍙戣繘绋嬪姞閫熻浆鎹?

### 鐢熸垚妯℃澘

#### template_seo.html (璇︽儏椤垫ā鏉?
```
鐢ㄩ€? 鐢熸垚瀹屾暣鐨凷EO浼樺寲椤甸潰
鍖呭惈:
  - 瀹屾暣HTML鏂囨。缁撴瀯
  - SEO鍏冩爣绛?(title, description, keywords)
  - Open Graph鏍囩 (og:title, og:image绛?
  - Twitter Card鏍囩
  - Canonical URL
  - Favicon閾炬帴
  - 浠ｇ爜楂樹寒鏍峰紡 (Pandoc鐢熸垚)

杈撳嚭: docs/{YYYY-MM}/{filename}.html
绀轰緥: docs/2025-10/spring-assert.html
```

#### article-detail.html (SPA鐢‵ragment妯℃澘)
```
鐢ㄩ€? 涓篠ingle Page Application鎻愪緵鍐呭鐗囨
鍖呭惈:
  - <article>瀹瑰櫒
  - 鏍囬 ({{TITLE}})
  - 鏃ユ湡鍜屽垎绫诲厓鏁版嵁 ({{DATE}}, {{CATEGORY}})
  - 鏂囩珷鍐呭 ({{CONTENT}})
  - AI鐢熸垚鍐呭鎻愮ず璀﹀憡
  - 浠ｇ爜澶嶅埗鎸夐挳鍔熻兘
  - 椤佃剼

杈撳嚭: docs/{YYYY-MM}/{filename}-fragment.html
绀轰緥: docs/2025-10/spring-assert-fragment.html
```

### 杈撳嚭绀轰緥
```
docs/2025-10/spring-assert.html           鈫?瀹屾暣椤甸潰(SEO鐢?
docs/2025-10/spring-assert-fragment.html  鈫?Fragment (SPA鐢?
docs/2025-10/spring-beanutils.html
docs/2025-10/spring-beanutils-fragment.html
```

---

## 2锔忊儯 generate-index (鐢熸垚棣栭〉鍜屽垪琛ㄥ垎椤?

**鑴氭湰**: `src/generate_index_with_dates.js`

### 鎵ц娴佺▼
1. 鏀堕泦鎵€鏈夋枃妗ｅ厓鏁版嵁 (Markdown + HTML)
2. 鎻愬彇鏂囨。淇℃伅:
   - 鏍囬 (浠嶮arkdown绗竴琛?# 鏍囬 鎴?HTML鐨?title>)
   - 鎽樿 (Markdown鍓?0涓瓧绗?
   - 淇敼鏃ユ湡
   - 鏂囨。绫诲瀷 (Markdown/HTML)
   - 鍒嗙被 (鐩綍鎴栨爣绛?
3. 鎸変慨鏀规棩鏈熷€掑簭鎺掑垪 (鏈€鏂颁紭鍏?
4. 姣?5鏉″垎椤典竴娆?
5. 涓烘瘡椤电敓鎴愬垪琛ㄩ〉闈紝淇濆瓨鍒?`pages/` 鐩綍

### 鐢熸垚妯℃澘

#### template_feed_list.html (鍒楄〃椤甸潰涓撶敤妯℃澘)
```
鐢ㄩ€? 鐢熸垚鍒嗛〉鍒楄〃椤甸潰 (涓嶅寘鍚玥eader)
鍖呭惈:
  - 璀﹀憡鎻愮ず (AI鍗忓姪鐢熸垚澹版槑)
  - Feed娴佸紡甯冨眬
  - 姣忎釜鏂囨。鍗＄墖 (feed-item):
    - 鏍囬 + 閾炬帴
    - 鍙戝竷鏃ユ湡
    - 鍒嗙被鏍囩
    - 鎽樿棰勮
    - "闃呰鏇村"閾炬帴
  - 鍒嗛〉瀵艰埅:
    - 涓婁竴椤?/ 涓嬩竴椤?鎸夐挳
    - 鏁板瓧椤电爜閾炬帴 (1, 2, 3...)
    - 褰撳墠椤甸珮浜樉绀?
  - 椤佃剼

璺緞閰嶇疆:
  - 绗?椤? pages/index.html (SPA鍔犺浇)
  - 绗?椤? pages/index2.html (SPA鍔犺浇)
  - 绗?椤? pages/index3.html (SPA鍔犺浇)
  - 绗琋椤? pages/indexN.html (SPA鍔犺浇)
```

### 杈撳嚭璇﹁В

#### 鍒嗛〉缁撴瀯 (姣?5鏉℃枃妗?
```
绗?椤?(鏂囩珷1-15):
  - 杈撳嚭鏂囦欢: pages/index.html
  - 鐢ㄩ€? 琚玦ndex.html鐨凷PA鍔犺浇鏄剧ず
  - 璁块棶: /pages/index.html

绗?椤?(鏂囩珷16-30):
  - 杈撳嚭鏂囦欢: pages/index2.html
  - 璁块棶: /pages/index2.html

绗?椤?(鏂囩珷31-45):
  - 杈撳嚭鏂囦欢: pages/index3.html
  - 璁块棶: /pages/index3.html

绗?椤?(鏂囩珷46-60):
  - 杈撳嚭鏂囦欢: pages/index4.html
  - 璁块棶: /pages/index4.html
```

#### 鏂囨。鍗＄墖绀轰緥
```html
<div class="feed-item">
  <div class="feed-item-header">
    <h2 class="feed-item-title">
      <a href="/docs/2025-10/spring-assert.html">Spring Assert宸ュ叿绫昏瑙?/a>
    </h2>
    <div class="feed-item-meta">
      <span class="feed-item-date">2025/10/15</span>
      <span class="feed-item-category">Markdown 鏂囨。</span>
    </div>
  </div>
  <div class="feed-item-content">
    <p>鏈枃浠嬬粛Spring妗嗘灦涓瑼ssert宸ュ叿绫荤殑鐢ㄦ硶...</p>
  </div>
  <div class="feed-item-footer">
    <a href="/docs/2025-10/spring-assert.html" class="read-more">闃呰鏇村 鈫?/a>
  </div>
</div>
```

#### 鍒嗛〉瀵艰埅绀轰緥 (绗?椤? pages/index2.html)
```html
<div class="pagination">
  <a href="index.html">鈫?涓婁竴椤?/a>
  <a href="index.html">1</a>
  <a href="#" class="current">2</a>
  <a href="index3.html">3</a>
  <a href="index4.html">4</a>
  <a href="index3.html">涓嬩竴椤?鈫?/a>
</div>
```

鍒嗛〉閾炬帴璇存槑:
- 鍚岀洰褰曞紩鐢?(閮藉湪 pages/ 鐩綍涓?
- index.html = 绗?椤?
- index2.html = 绗?椤?
- index3.html = 绗?椤?
- 绛夌瓑

### 褰撳墠椤圭洰鐨勫垎椤?

椤圭洰宸茬敓鎴愪互涓嬪垎椤垫枃浠?
```
pages/index.html   鈫?绗?椤?
pages/index2.html  鈫?绗?椤?
pages/index3.html  鈫?绗?椤?
pages/index4.html  鈫?绗?椤?
```

---

## 3锔忊儯 generate-sitemap (鐢熸垚SEO Sitemap)

**鑴氭湰**: `src/generate_sitemap.js`

### 鎵ц娴佺▼
1. 鏀堕泦鎵€鏈夋枃妗ｇ殑瀹屾暣URL
2. 鐢熸垚鏍囧噯 `sitemap.xml` 鏍煎紡
3. 璁剧疆浼樺厛绾у拰鏇存柊棰戠巼

### 杈撳嚭: sitemap.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- 棣栭〉 - 鏈€楂樹紭鍏堢骇 -->
  <url>
    <loc>https://cxy1984.github.io/ai-blog/index.html</loc>
    <lastmod>2025-11-10T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- 鍒嗛〉 - 杈冮珮浼樺厛绾?-->
  <url>
    <loc>https://cxy1984.github.io/ai-blog/pages/index2.html</loc>
    <lastmod>2025-11-10T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- 鎵€鏈夋枃妗?- 鏍囧噯浼樺厛绾?-->
  <url>
    <loc>https://cxy1984.github.io/ai-blog/docs/2025-10/spring-assert.html</loc>
    <lastmod>2025-10-15T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>https://cxy1984.github.io/ai-blog/docs/2025-10/spring-beanutils.html</loc>
    <lastmod>2025-10-14T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- ... 鏇村鏂囨。 ... -->
</urlset>
```

### 浣滅敤
- 甯姪鎼滅储寮曟搸鐖櫕鍙戠幇鍜岀储寮曟墍鏈夐〉闈?
- 鍛婄煡鎼滅储寮曟搸椤甸潰鐨勯噸瑕佺▼搴?
- 鎻愮ず鏇存柊棰戠巼浠ヤ究鍙婃椂閲嶆柊鐖彇

---

## 4锔忊儯 generate-overview (鐢熸垚姒傝椤甸潰)

**鑴氭湰**: `src/generate_overview.js`

### 鎵ц娴佺▼
1. 鏀堕泦鎵€鏈夋枃妗ｅ厓鏁版嵁
2. 鐢熸垚JavaScript鏁扮粍 `const articles = [...]`
3. 娉ㄥ叆鍒?`overview.html`

### 杈撳嚭: overview.html (鏇存柊)

```javascript
const articles = [
  {
    "type": "markdown",
    "url": "docs/2025-10/spring-assert.html",
    "title": "Spring Assert宸ュ叿绫昏瑙?,
    "date": "2025/10/15",
    "category": "Markdown 鏂囨。"
  },
  {
    "type": "markdown",
    "url": "docs/2025-10/spring-beanutils.html",
    "title": "Spring BeanUtils宸ュ叿绫昏瑙?,
    "date": "2025/10/14",
    "category": "Markdown 鏂囨。"
  },
  {
    "type": "html",
    "url": "html/jvm-desc.html",
    "title": "JVM绫诲瀷鎻忚堪绗﹁瑙?,
    "date": "2025/10/10",
    "category": "HTML 鏂囨。"
  },
  // ... 鏇村鏂囨。 ...
];
```

### 鐢ㄩ€?
- 鎻愪緵鍓嶇JavaScript鎺ュ彛
- 鏀寔鍔ㄦ€佹悳绱€佺瓫閫夈€佹帓搴?
- 涓嶉渶瑕佸悗绔疉PI灏辫兘瀹炵幇澶嶆潅鐨勬枃绔犳煡璇㈠姛鑳?

---

## 馃搳 妯℃澘浣跨敤鎬荤粨琛?

| 鍔熻兘 | 妯℃澘鏂囦欢 | 杈撳嚭鏂囦欢 | 鐢ㄩ€?| 澶囨敞 |
|------|---------|---------|------|------|
| **璇︽儏椤礢EO** | `template_seo.html` | `docs/{骞存湀}/{鏂囦欢鍚峿.html` | 瀹屾暣椤甸潰锛孲EO浼樺寲 | 姣忕瘒鏂囩珷涓€涓?|
| **SPA Fragment** | `article-detail.html` | `docs/{骞存湀}/{鏂囦欢鍚峿-fragment.html` | 鍓嶇SPA鍔ㄦ€佸姞杞?| 鐢ㄤ簬AJAX鑾峰彇鍐呭 |
| **绗?椤靛垪琛?* | `template_feed_list.html` | `pages/index.html` | 棣栭〉feed灞曠ず | 琚玦ndex.html鍔犺浇 |
| **鍒嗛〉鍒楄〃** | `template_feed_list.html` | `pages/index{N}.html` | 绗琋椤电殑鍒楄〃 | N 鈮?2 |
| **SEO鍦板浘** | 鏃?| `sitemap.xml` | 鎼滅储寮曟搸绱㈠紩 | XML鏍煎紡 |
| **姒傝椤?* | `overview.html` | `overview.html` (鏇存柊) | 鏂囩珷鏁版嵁+鎼滅储鍔熻兘 | 娉ㄥ叆articles鏁扮粍 |

---

## 馃攧 瀹屾暣鏁版嵁娴佸悜鍥?

```
markdown/
鈹溾攢 2025-10/
鈹? 鈹溾攢 spring-assert.md
鈹? 鈹溾攢 spring-beanutils.md
鈹? 鈹斺攢 spring-collectionutils.md
鈹斺攢 2025-09/
   鈹溾攢 javascript-async.md
   鈹斺攢 maven-resource.md

        鈫?[convert-md-pandoc] (4涓苟鍙戣繘绋?
        鈫?

docs/
鈹溾攢 2025-10/
鈹? 鈹溾攢 spring-assert.html (SEO鐗?
鈹? 鈹溾攢 spring-assert-fragment.html (SPA鐗?
鈹? 鈹溾攢 spring-beanutils.html
鈹? 鈹溾攢 spring-beanutils-fragment.html
鈹? 鈹斺攢 spring-collectionutils.html
鈹? 鈹斺攢 spring-collectionutils-fragment.html
鈹斺攢 2025-09/
   鈹溾攢 javascript-async.html
   鈹溾攢 javascript-async-fragment.html
   鈹溾攢 maven-resource.html
   鈹斺攢 maven-resource-fragment.html

        鈫?[generate-index] (鏀堕泦鍏冩暟鎹?+ 鍒嗛〉)
        鈫?

pages/
鈹溾攢 index.html (绗?椤? 鏂囩珷1-15)
鈹溾攢 index2.html (绗?椤? 鏂囩珷16-30)
鈹溾攢 index3.html (绗?椤? 鏂囩珷31-45)
鈹斺攢 index4.html (绗?椤? 鏂囩珷46-60)

index.html (SPA涓绘枃浠?
        鈫?鍔犺浇 pages/index.html

        鈫?[generate-sitemap]
        鈫?

sitemap.xml (SEO鍦板浘)

        鈫?[generate-overview]
        鈫?

overview.html (鏇存柊 articles 鏁扮粍)
```

---

## 馃挕 鍏抽敭鐗圭偣

### 1. 鍙岃緭鍑虹瓥鐣?
- **瀹屾暣椤甸潰** (`*.html`): 鐢ㄤ簬SEO鍜岀洿鎺ヨ闂?
- **Fragment鐗囨** (`*-fragment.html`): 鐢ㄤ簬SPA閫氳繃AJAX鍔犺浇

### 2. 鍒嗛〉鏈哄埗
- 姣?5鏉℃枃妗ｄ竴椤?
- 鏀寔澶氶〉瀵艰埅
- 鍒嗛〉鏂囦欢鐙珛瀛樺偍鍦?`pages/` 鐩綍

### 3. SEO浼樺寲
- 姣忎釜椤甸潰鐙珛meta鏍囩
- Open Graph鏀寔绀句氦鍒嗕韩
- Sitemap鑷姩鎻愪氦鎼滅储寮曟搸
- Canonical URL闃叉閲嶅鏀跺綍

### 4. 澧為噺鏋勫缓
- 浠呰浆鎹慨鏀硅繃鐨凪arkdown鏂囦欢
- 瀵规瘮鏂囦欢淇敼鏃堕棿 (mtime)
- 鍔犻€熼噸澶嶆瀯寤洪€熷害

### 5. 骞跺彂澶勭悊
- Pandoc杞崲鏀寔4涓繘绋嬪苟琛?
- 鍏呭垎鍒╃敤澶氭牳CPU
- 鍔犻€熸暣浣撴瀯寤烘椂闂?

### 6. 鐏垫椿鐨勬枃妗ｇ鐞?
- 鏀寔鎸夊勾鏈堢粍缁囨枃妗?
- Markdown鍜孒TML娣峰悎鏀寔
- 鑷姩鎻愬彇鏍囬鍜屾憳瑕?

---

## 鈿欙笍 鏋勫缓鏃堕棿浼扮畻

| 姝ラ | 鏂囦欢鏁?| 鑰楁椂 |
|------|-------|------|
| convert-md-pandoc | ~100涓猰d | 10-15绉?(骞跺彂) |
| generate-index | - | 0.5绉?|
| generate-sitemap | - | 0.2绉?|
| generate-overview | - | 0.3绉?|
| **鎬昏€楁椂** | | **~11-16绉?* |

---

## 馃敡 甯歌闂

### Q: 濡備綍淇敼鍒嗛〉鏁伴噺锛?
**A**: 缂栬緫 `src/generate_index_with_dates.js` 鐨?`ITEMS_PER_PAGE` 甯搁噺 (榛樿15)

### Q: 濡備綍淇敼domain锛?
**A**: 缂栬緫 `src/generate_sitemap.js` 鐨?`baseUrl` 鍜屽叾浠栬剼鏈腑鐨刄RL鍓嶇紑

### Q: Fragment鏄仛浠€涔堢殑锛?
**A**: Fragment鏄幓鎺塇TML鏂囨。缁撴瀯鐨勭函鍐呭鐗囨锛岀敤浜嶴PA閫氳繃AJAX鍔犺浇鍒伴〉闈腑

### Q: 涓轰粈涔堣鐢熸垚涓や唤HTML锛?
**A**:
- 瀹屾暣椤甸潰 = SEO鍙嬪ソ + 鍙嫭绔嬭闂?
- Fragment = 蹇€熷姞杞?+ SPA闆嗘垚

### Q: Sitemap鎬庝箞鐢紵
**A**: 鎻愪氦鍒癎oogle Search Console鍜孊ing Webmaster Tools锛屽府鍔╂悳绱㈠紩鎿庣储寮?

---

## 馃殌 浼樺寲寤鸿

1. **缂撳瓨浼樺寲**: 鍦‵ragment涓坊鍔燞TTP缂撳瓨澶?
2. **鍥剧墖浼樺寲**: 鍦∕arkdown涓紭鍖栧浘鐗囧ぇ灏忓拰鏍煎紡
3. **浠ｇ爜鍒嗗壊**: 鎸夊垎绫荤敓鎴愬崟鐙殑sitemap绱㈠紩
4. **棰勫姞杞?*: 鍦ㄩ椤甸鍔犺浇甯歌闂〉闈㈢殑Fragment
5. **CDN**: 鑰冭檻灏嗛潤鎬佹枃浠堕儴缃插埌CDN鍔犻€?

