const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const marked = require("marked");
const SITE_BASE_URL = process.env.SITE_BASE_URL || "https://cxy1984.github.io/ai-blog";
let pandocChecked = false;
let pandocAvailable = false;
const isQuiet = process.env.QUIET === "1";
const log = (...args) => {
  if (!isQuiet) console.log(...args);
};

function isPandocAvailable() {
  if (pandocChecked) {
    return pandocAvailable;
  }
  pandocChecked = true;
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    pandocAvailable = true;
  } catch (error) {
    pandocAvailable = false;
  }
  return pandocAvailable;
}

function buildMarkedRenderer() {
  const defaultRenderer = new marked.Renderer();
  const renderer = new marked.Renderer();
  renderer.code = function (code, infostring, escaped) {
    const lang = (infostring || "").trim().toLowerCase();
    if (lang === "mermaid") {
      return `<pre class="mermaid">${code}</pre>\n`;
    }
    return defaultRenderer.code.call(this, code, infostring, escaped);
  };
  return renderer;
}

const markedRenderer = buildMarkedRenderer();

// Simple concurrency limiter
class ConcurrencyLimiter {
  constructor(limit) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  async run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.tryNext();
    });
  }

  tryNext() {
    if (this.running >= this.limit || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.running++;

    task()
      .then(resolve, reject)
      .finally(() => {
        this.running--;
        this.tryNext();
      });
  }
}

// Function to convert Markdown to HTML with feed-style layout using Pandoc
function markdownToHtmlWithPandoc(
  markdownFilePath,
  title,
  date,
  monthDir,
  filename
) {
  try {
    let htmlContent;
    if (isPandocAvailable()) {
      // 浣跨敤 Pandoc 杞崲 Markdown 鍒?HTML
      // 娉ㄦ剰锛氭垜浠娇鐢?--mathjax 鏉ユ敮鎸佹暟瀛﹀叕寮忥紝--highlight-style 鏉ヨ缃唬鐮侀珮浜?
      const pandocCommand = `pandoc "${markdownFilePath}" -f markdown -t html --mathjax --highlight-style=tango`;
      htmlContent = execSync(pandocCommand, { encoding: "utf8" });
    } else {
      // Fallback: no Pandoc in PATH, use marked to keep build/dev workflow available
      const markdownContent = fs.readFileSync(markdownFilePath, "utf8");
      htmlContent = marked.parse(markdownContent, {
        renderer: markedRenderer,
      });
    }

    // Read SEO template
    const templatePath = path.join(__dirname, "..", "template_seo.html");
    let template = fs.readFileSync(templatePath, "utf8");

    // Generate SEO description from first few sentences
    const plainText = htmlContent.replace(/<[^>]*>/g, "").trim();
    const description =
      plainText.substring(0, 160) + (plainText.length > 160 ? "..." : "");

    // Generate keywords from title
    const keywords = title
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1)
      .join(", ");

    // Generate URL
    const url = `${SITE_BASE_URL}/docs/${monthDir}/${path.basename(
      filename,
      ".md"
    )}.html`;

    // Generate OG image URL (placeholder)
    const ogImage = `${SITE_BASE_URL}/images/og-image.png`;

    // Replace placeholders in template
    return (
      template
        .replace("{{TITLE}}", title)
        .replace("{{DESCRIPTION}}", description)
        .replace("{{KEYWORDS}}", keywords)
        .replace("{{OG_IMAGE}}", ogImage)
        .replace("{{URL}}", url)
        .replace("{{DATE}}", date)
        .replace("{{CATEGORY}}", monthDir)
        .replace("{{CONTENT}}", htmlContent)
        // Replace any remaining placeholders
        .replace(/{{TITLE}}/g, title)
        .replace(/{{DESCRIPTION}}/g, description)
        .replace(/{{OG_IMAGE}}/g, ogImage)
        .replace(/{{URL}}/g, url)
    );
  } catch (error) {
    console.error(
      `Error converting ${markdownFilePath} with Pandoc: ${error.message}`
    );
    throw error;
  }
}

// Function to generate article detail fragment for SPA
function generateArticleDetailFragment(htmlContent, title, date, monthDir) {
  try {
    // Fix Mermaid code blocks - remove unnecessary code wrapper
    // Pandoc wraps mermaid code in <pre class="mermaid"><code>...</code></pre>
    // But Mermaid expects <pre class="mermaid">...</pre>
    let fixedContent = htmlContent.replace(
      /<pre class="mermaid"><code>([\s\S]*?)<\/code><\/pre>/g,
      '<pre class="mermaid">$1</pre>'
    );

    // Remove the 'header' class from table rows to avoid style conflicts
    // Pandoc adds this class by default but it conflicts with site header styles
    fixedContent = fixedContent.replace(/<tr class="header">/g, "<tr>");

    // Remove the first h1 heading from content to avoid duplication
    // The title is already shown in the post-header
    // Use dotAll flag (s) to match across newlines
    fixedContent = fixedContent.replace(/<h1[^>]*>.*?<\/h1>\s*/s, "");

    // Read article detail template
    const fragmentPath = path.join(
      __dirname,
      "..",
      "pages",
      "article-detail.html"
    );
    let fragment = fs.readFileSync(fragmentPath, "utf8");

    // Replace placeholders
    return fragment
      .replace("{{TITLE}}", title)
      .replace("{{DATE}}", date)
      .replace("{{CATEGORY}}", monthDir)
      .replace("{{CONTENT}}", fixedContent);
  } catch (error) {
    console.error(`Error generating article detail fragment: ${error.message}`);
    throw error;
  }
}

// Function to check if file needs to be converted (incremental build)
function shouldConvertFile(markdownPath, outputPaths) {
  const outputs = Array.isArray(outputPaths) ? outputPaths : [outputPaths];

  // If any output file doesn't exist, we need to convert
  for (const outputPath of outputs) {
    if (!fs.existsSync(outputPath)) {
      return true;
    }
  }

  // Convert if markdown file is newer than any output file
  const markdownStats = fs.statSync(markdownPath);
  for (const outputPath of outputs) {
    const outputStats = fs.statSync(outputPath);
    if (markdownStats.mtime > outputStats.mtime) {
      return true;
    }
  }

  return false;
}

// Main function
async function main() {
  const markdownDir = "markdown";
  const docsDir = "docs";
  if (!isPandocAvailable()) {
    console.warn("Pandoc not found, using marked fallback renderer.");
  }

  // Check if markdown directory exists
  if (!fs.existsSync(markdownDir)) {
    console.error(`Directory ${markdownDir} does not exist`);
    return;
  }

  // Create docs directory if it doesn't exist
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir);
  }

  // Get all month directories
  const monthDirs = fs
    .readdirSync(markdownDir)
    .filter(
      (file) =>
        fs.statSync(path.join(markdownDir, file)).isDirectory() &&
        /^\d{4}-\d{2}$/.test(file)
    );

  if (monthDirs.length === 0) {
    log("No month directories found in the markdown directory");
    return;
  }

  // Create a concurrency limiter with 4 concurrent processes
  const limiter = new ConcurrencyLimiter(4);

  let totalFiles = 0;
  let skippedFiles = 0;
  const conversionPromises = [];

  // Process each month directory
  monthDirs.forEach((monthDir) => {
    const monthPath = path.join(markdownDir, monthDir);
    const docsMonthPath = path.join(docsDir, monthDir);

    // Create corresponding docs directory
    if (!fs.existsSync(docsMonthPath)) {
      fs.mkdirSync(docsMonthPath, { recursive: true });
    }

    // Get all Markdown files in the month directory
    const markdownFiles = fs
      .readdirSync(monthPath)
      .filter((file) => path.extname(file) === ".md");

    if (markdownFiles.length === 0) {
      log(`No Markdown files found in ${monthPath}`);
      return;
    }

    // Add each file conversion to the promise array
    markdownFiles.forEach((filename) => {
      const conversionPromise = limiter.run(() => {
        return new Promise((resolve, reject) => {
          try {
            const filePath = path.join(monthPath, filename);

            // Create HTML filename
            const htmlFilename = path.basename(filename, ".md") + ".html";
            const fragmentFilename =
              path.basename(filename, ".md") + "-fragment.html";
            const htmlPath = path.join(docsMonthPath, htmlFilename);
            const fragmentPath = path.join(docsMonthPath, fragmentFilename);

            // Check if we need to convert this file (incremental build)
            if (!shouldConvertFile(filePath, [htmlPath, fragmentPath])) {
              skippedFiles++;
              resolve();
              return;
            }

            // Extract title from first line (assuming it's a # heading)
            const markdownContent = fs.readFileSync(filePath, "utf8");
            const titleLine = markdownContent.split("\n")[0];
            const title = titleLine.startsWith("# ")
              ? titleLine.substring(2)
              : path.basename(filename, ".md");

            // Get file date
            const fileStats = fs.statSync(filePath);
            const date = fileStats.mtime.toLocaleDateString("zh-CN");

            const htmlContent = markdownToHtmlWithPandoc(
              filePath,
              title,
              date,
              monthDir,
              filename
            );

            fs.writeFileSync(htmlPath, htmlContent, "utf8");
            log(`Generated ${monthDir}/${htmlFilename}`);

            // Generate fragment for SPA
            try {
              // Extract the post-content div content from the full HTML
              // This is what will be displayed in the SPA
              let contentToUse = htmlContent;

              // Try to find and extract post-content div
              const postContentRegex =
                /<div[^>]*class="post-content"[^>]*id="post-content"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/;
              let postMatch = htmlContent.match(postContentRegex);

              // Also process the extracted content if needed
              if (postMatch) {
                // Remove the 'header' class from table rows in extracted content
                postMatch[1] = postMatch[1].replace(
                  /<tr class="header">/g,
                  "<tr>"
                );
              }

              if (postMatch) {
                // Found post-content - use only its content
                contentToUse = postMatch[1];
                log(
                  `Extracted post-content, size: ${contentToUse.length}`
                );
              } else {
                // Fallback: try to get everything after body tag
                const bodyMatch = htmlContent.match(
                  /<body[^>]*>([\s\S]*)<\/body>/i
                );
                if (bodyMatch) {
                  contentToUse = bodyMatch[1];
                  log(
                    `Using body content, size: ${contentToUse.length}`
                  );
                }
              }

              const fragmentContent = generateArticleDetailFragment(
                contentToUse,
                title,
                date,
                monthDir
              );
              fs.writeFileSync(fragmentPath, fragmentContent, "utf8");
              log(`Generated ${monthDir}/${fragmentFilename}`);
            } catch (fragmentError) {
              console.error(
                `Error generating fragment for ${monthDir}/${filename}: ${fragmentError.message}`
              );
              reject(fragmentError);
              return;
            }

            totalFiles++;
            resolve();
          } catch (error) {
            console.error(
              `Error converting ${monthDir}/${filename}: ${error.message}`
            );
            reject(error);
          }
        });
      });

      conversionPromises.push(conversionPromise);
    });
  });

  // Wait for all conversions to complete
  try {
    await Promise.all(conversionPromises);
    console.log(
      `\nConversion complete! ${totalFiles} files converted, ${skippedFiles} files skipped (up to date).`
    );
  } catch (error) {
    console.error(`Error during conversion process: ${error.message}`);
  }
}

// Export the function for use in other scripts
module.exports = {
  markdownToHtmlWithPandoc,
  generateArticleDetailFragment,
  main,
  shouldConvertFile,
};

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

