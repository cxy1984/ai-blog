const fs = require("fs");
const path = require("path");
const isQuiet = process.env.QUIET === "1";
const log = (...args) => {
  if (!isQuiet) console.log(...args);
};

// Function to get file date
// Priority: 1) date from content (> 日期：...) 2) folder name 3) file mtime
function getFileDate(filePath, monthDir) {
  // Priority 1: Try to extract date from markdown content
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Match patterns like: > 日期：2026-07-08  or  > 日期: 2026-07-09
    const dateMatch = content.match(/日期[：:]\s*(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const day = parseInt(dateMatch[3]);
      return new Date(year, month, day);
    }
  } catch (error) {
    // Fall through to next priority
  }

  // Priority 2: Fall back to file modification time
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch (error) {
    // Fall through to next priority
  }

  // Priority 3: Use folder name (YYYY-MM) + first day of month
  if (monthDir && /^\d{4}-\d{2}$/.test(monthDir)) {
    const parts = monthDir.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    return new Date(year, month, 1);
  }

  return new Date();
}

// Function to format date
function formatDate(date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Function to extract title from Markdown file
function extractTitleFromMarkdown(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    // Look for first # heading
    const titleMatch = content.match(/^#\s+(.*?)$/m);
    if (titleMatch) {
      return titleMatch[1];
    }

    // If no # heading, use filename
    return path.basename(filePath, ".md");
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
    return path.basename(filePath, ".md");
  }
}

// Function to extract title from HTML file
function extractTitleFromHTML(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    // Look for title tag
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1];
    }

    // If no title tag, use filename
    return path.basename(filePath, ".html");
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
    return path.basename(filePath, ".html");
  }
}

// Main function
function main() {
  const markdownDir = "markdown";
  const docsDir = "docs";
  const htmlDir = "html";

  // Collect all documents with their dates
  const allDocuments = [];

  // Get all month directories for markdown files
  if (fs.existsSync(markdownDir)) {
    const monthDirs = fs
      .readdirSync(markdownDir)
      .filter(
        (file) =>
          fs.statSync(path.join(markdownDir, file)).isDirectory() &&
          /^\d{4}-\d{2}$/.test(file),
      )
      .sort()
      .reverse(); // Sort by newest first

    // Process each month directory for markdown files
    monthDirs.forEach((monthDir) => {
      const monthPath = path.join(markdownDir, monthDir);

      // Get all Markdown files in the month directory
      const markdownFiles = fs
        .readdirSync(monthPath)
        .filter((file) => path.extname(file) === ".md");

      if (markdownFiles.length === 0) {
        log(`No Markdown files found in ${monthPath}`);
        return;
      }

        // Collect document info
      markdownFiles.forEach((filename) => {
        const filePath = path.join(monthPath, filename);
        const htmlFilename = filename.replace(".md", "-fragment.html");
        const title = extractTitleFromMarkdown(filePath);
        const date = getFileDate(filePath, monthDir);
        const formattedDate = formatDate(date);

        allDocuments.push({
          type: "markdown",
          url: `./index.html#/docs/${monthDir}/${htmlFilename}`,
          title: title,
          date: formattedDate,
          category: "Markdown 文档",
          timestamp: date.getTime(),
        });
      });
    });
  }

  // Process HTML files
  if (fs.existsSync(htmlDir)) {
    const htmlFiles = fs
      .readdirSync(htmlDir)
      .filter((file) => path.extname(file) === ".html");

    htmlFiles.forEach((filename) => {
      const filePath = path.join(htmlDir, filename);
      const title = extractTitleFromHTML(filePath);
      const date = getFileDate(filePath);
      const formattedDate = formatDate(date);

      allDocuments.push({
        type: "html",
        url: `html/${filename}`,
        title: title,
        date: formattedDate,
        category: "HTML 文档",
        timestamp: date.getTime(),
      });
    });
  }

  // Sort all documents by date (newest first)
  allDocuments.sort((a, b) => b.timestamp - a.timestamp);

  const outputDocuments = allDocuments.map(({ timestamp, ...doc }) => doc);

  // Generate JavaScript array for the overview page
  const articlesJs = `const articles = ${JSON.stringify(outputDocuments, null, 2)};`;

  const overviewPath = "overview.html";
  const templatePath = "template_overview.html";

  // Read the overview.html file (fallback to template if missing)
  let overviewHtml = "";
  if (fs.existsSync(overviewPath)) {
    overviewHtml = fs.readFileSync(overviewPath, "utf8");
  } else if (fs.existsSync(templatePath)) {
    console.log(
      "overview.html 不存在，使用 template_overview.html 作为模板生成。",
    );
    overviewHtml = fs.readFileSync(templatePath, "utf8");
  } else {
    console.error(
      "overview.html 不存在，且未找到 template_overview.html，无法生成概览页。",
    );
    process.exit(1);
  }

  // Replace the placeholder script with the actual data
  const placeholderScriptStart = "const articles = [";
  const placeholderScriptEnd = "];";

  const newScript = `${articlesJs}`;

  // Find the articles array in the existing script and replace it
  const scriptStartIndex = overviewHtml.indexOf(placeholderScriptStart);
  const scriptEndIndex = overviewHtml.indexOf(
    placeholderScriptEnd,
    scriptStartIndex,
  );

  if (scriptStartIndex !== -1 && scriptEndIndex !== -1) {
    // Extract the part before and after the articles array
    const beforeScript = overviewHtml.substring(0, scriptStartIndex);
    const afterScript = overviewHtml.substring(
      scriptEndIndex + placeholderScriptEnd.length,
    );

    // Reconstruct the HTML with the new articles array
    overviewHtml = beforeScript + newScript + afterScript;
  } else {
    console.warn("Warning: Could not find placeholder script in overview.html");
  }

  // Write the updated overview.html file
  fs.writeFileSync(overviewPath, overviewHtml, "utf8");

  console.log(`Generated overview.html with ${allDocuments.length} articles`);
  log("Articles included:");
  allDocuments.forEach((doc) => {
    log(`  - ${doc.title} (${doc.date})`);
  });
}

// Run the main function
main();
