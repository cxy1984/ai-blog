const fs = require("fs");
const path = require("path");

const SITE_BASE_URL = process.env.SITE_BASE_URL || "https://cxy1984.github.io/ai-blog";

function getFileDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch (error) {
    return new Date();
  }
}

function formatSitemapDate(date) {
  return date.toISOString();
}

function joinSiteUrl(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${SITE_BASE_URL}/${encodeURI(normalized)}`;
}

function collectDocsUrls(docsDir) {
  const urls = [];
  if (!fs.existsSync(docsDir)) {
    return urls;
  }

  const monthDirs = fs
    .readdirSync(docsDir)
    .filter((name) => {
      const monthPath = path.join(docsDir, name);
      return fs.statSync(monthPath).isDirectory() && /^\d{4}-\d{2}$/.test(name);
    });

  monthDirs.forEach((monthDir) => {
    const monthPath = path.join(docsDir, monthDir);
    const fullDocFiles = fs
      .readdirSync(monthPath)
      .filter(
        (filename) =>
          filename.endsWith(".html") && !filename.endsWith("-fragment.html"),
      );
    const fragmentDocFiles = fs
      .readdirSync(monthPath)
      .filter((filename) => filename.endsWith("-fragment.html"));
    const docFiles = fullDocFiles.length > 0 ? fullDocFiles : fragmentDocFiles;

    docFiles.forEach((filename) => {
      const relativePath = `docs/${monthDir}/${filename}`;
      const filePath = path.join(monthPath, filename);
      urls.push({
        url: joinSiteUrl(relativePath),
        date: getFileDate(filePath),
        changefreq: "monthly",
        priority: "0.8",
      });
    });
  });

  return urls;
}

function getPageOrder(filename) {
  if (filename === "index.html") {
    return 1;
  }
  const match = filename.match(/^index(\d+)\.html$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function collectPaginationUrls(pagesDir) {
  const urls = [];
  if (!fs.existsSync(pagesDir)) {
    return urls;
  }

  const pageFiles = fs
    .readdirSync(pagesDir)
    .filter((filename) => /^index(?:\d+)?\.html$/.test(filename))
    .sort((a, b) => getPageOrder(a) - getPageOrder(b));

  pageFiles.forEach((filename) => {
    const relativePath = `pages/${filename}`;
    const filePath = path.join(pagesDir, filename);
    const order = getPageOrder(filename);

    urls.push({
      url: joinSiteUrl(relativePath),
      date: getFileDate(filePath),
      changefreq: "daily",
      priority: order === 1 ? "0.9" : "0.8",
    });
  });

  return urls;
}

function collectStandaloneHtmlUrls(htmlDir) {
  const urls = [];
  if (!fs.existsSync(htmlDir)) {
    return urls;
  }

  const htmlFiles = fs
    .readdirSync(htmlDir)
    .filter((filename) => filename.endsWith(".html"));

  htmlFiles.forEach((filename) => {
    const relativePath = `html/${filename}`;
    const filePath = path.join(htmlDir, filename);
    urls.push({
      url: joinSiteUrl(relativePath),
      date: getFileDate(filePath),
      changefreq: "monthly",
      priority: "0.8",
    });
  });

  return urls;
}

function buildUrlEntry(entry) {
  return [
    "  <url>",
    `    <loc>${entry.url}</loc>`,
    `    <lastmod>${formatSitemapDate(entry.date)}</lastmod>`,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    "  </url>",
  ].join("\n");
}

function main() {
  const docsDir = "docs";
  const htmlDir = "html";
  const pagesDir = "pages";

  const entries = [];

  entries.push({
    url: joinSiteUrl("index.html"),
    date: getFileDate("index.html"),
    changefreq: "daily",
    priority: "1.0",
  });

  entries.push(...collectPaginationUrls(pagesDir));
  entries.push(...collectDocsUrls(docsDir));
  entries.push(...collectStandaloneHtmlUrls(htmlDir));

  const xmlLines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  xmlLines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  entries.forEach((entry) => xmlLines.push(buildUrlEntry(entry)));
  xmlLines.push("</urlset>");

  fs.writeFileSync("sitemap.xml", `${xmlLines.join("\n")}\n`, "utf8");

  console.log(`Generated sitemap.xml with ${entries.length} URLs`);
}

main();

