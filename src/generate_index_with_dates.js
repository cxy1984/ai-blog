const fs = require('fs');
const path = require('path');
const isQuiet = process.env.QUIET === "1";
const log = (...args) => {
    if (!isQuiet) console.log(...args);
};

// Function to extract title from Markdown file
function extractTitleFromMarkdown(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Look for first # heading
        const titleMatch = content.match(/^#\s+(.*?)$/m);
        if (titleMatch) {
            return titleMatch[1];
        }
        
        // If no # heading, use filename
        return path.basename(filePath, '.md');
    } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
        return path.basename(filePath, '.md');
    }
}

// Function to extract title from HTML file
function extractTitleFromHTML(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Look for title tag
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) {
            return titleMatch[1];
        }
        
        // If no title tag, use filename
        return path.basename(filePath, '.html');
    } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
        return path.basename(filePath, '.html');
    }
}

// Function to extract excerpt from Markdown file (first 30 characters)
function extractExcerptFromMarkdown(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Remove the first line (title) and get the next lines
        const contentWithoutTitle = content.split('\n').slice(1).join(' ');
        // Remove markdown formatting and extra whitespace
        const cleanContent = contentWithoutTitle.replace(/[#*\-_`]/g, '').trim();
        // Return first 30 characters
        return cleanContent.substring(0, 30);
    } catch (error) {
        return "AI 协助生成的技术笔记内容";
    }
}

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
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Function to generate a document card HTML snippet for feed style
function generateDocCard(doc) {
    const formattedDate = formatDate(doc.date);
    
    // Different handling for markdown and html files
    if (doc.type === 'markdown') {
        const fragmentFilename = doc.filename.replace('.md', '-fragment.html');
        return `            <div class="feed-item">
                <div class="feed-item-header">
                    <h2 class="feed-item-title"><a href="/docs/${doc.monthDir}/${fragmentFilename}">${doc.title}</a></h2>
                    <div class="feed-item-meta">
                        <span class="feed-item-date">${formattedDate}</span>
                        <span class="feed-item-category">Markdown 文档</span>
                    </div>
                </div>
                <div class="feed-item-content">
                    <p>${doc.excerpt}...</p>
                </div>
                <div class="feed-item-footer">
                    <a href="/docs/${doc.monthDir}/${fragmentFilename}" class="read-more">阅读更多 →</a>
                </div>
            </div>`;
    } else {
        // HTML files
        const htmlPath = `/html/${doc.filename}`;
        return `            <div class="feed-item">
                <div class="feed-item-header">
                    <h2 class="feed-item-title"><a href="${htmlPath}">${doc.title}</a></h2>
                    <div class="feed-item-meta">
                        <span class="feed-item-date">${formattedDate}</span>
                        <span class="feed-item-category">HTML 文档</span>
                    </div>
                </div>
                <div class="feed-item-content">
                    <p>此文章为HTML格式内容，无特殊布局设计，阅读后请使用浏览器的返回功能回到首页。</p>
                </div>
                <div class="feed-item-footer">
                    <a href="${htmlPath}" class="read-more">阅读更多 →</a>
                </div>
            </div>`;
    }
}

// Main function
function main() {
    const markdownDir = "markdown";
    const docsDir = "docs";
    const htmlDir = "html";
    const ITEMS_PER_PAGE = 15;
    
    // Check if markdown directory exists
    if (!fs.existsSync(markdownDir)) {
        console.error(`Directory ${markdownDir} does not exist`);
        return;
    }
    
    // Get all month directories for markdown files
    const monthDirs = fs.readdirSync(markdownDir)
        .filter(file => fs.statSync(path.join(markdownDir, file)).isDirectory() && /^\d{4}-\d{2}$/.test(file))
        .sort()
        .reverse(); // Sort by newest first
    
    // Collect all documents with their dates
    const allDocuments = [];
    
    // Process each month directory for markdown files
    monthDirs.forEach(monthDir => {
        const monthPath = path.join(markdownDir, monthDir);
        
        // Get all Markdown files in the month directory
        const markdownFiles = fs.readdirSync(monthPath)
            .filter(file => path.extname(file) === '.md');
        
        if (markdownFiles.length === 0) {
            log(`No Markdown files found in ${monthPath}`);
            return;
        }
        
        // Collect document info
        markdownFiles.forEach(filename => {
            const filePath = path.join(monthPath, filename);
            const title = extractTitleFromMarkdown(filePath);
            const excerpt = extractExcerptFromMarkdown(filePath);
            const date = getFileDate(filePath, monthDir);
            
            allDocuments.push({
                type: 'markdown',
                monthDir,
                filename,
                title,
                excerpt,
                date
            });
        });
    });
    
    // Process HTML files
    if (fs.existsSync(htmlDir)) {
        const htmlFiles = fs.readdirSync(htmlDir)
            .filter(file => path.extname(file) === '.html');
        
        htmlFiles.forEach(filename => {
            const filePath = path.join(htmlDir, filename);
            const title = extractTitleFromHTML(filePath);
            const date = getFileDate(filePath);
            
            allDocuments.push({
                type: 'html',
                filename,
                title,
                date
            });
        });
    }
    
    // Sort all documents by date (newest first)
    allDocuments.sort((a, b) => b.date - a.date);
    
    // Calculate pagination
    const totalPages = Math.ceil(allDocuments.length / ITEMS_PER_PAGE);
    
    // Read template for feed list (without header)
    let template;
    try {
        template = fs.readFileSync("template_feed_list.html", "utf8");
    } catch (error) {
        console.error("template_feed_list.html not found");
        return;
    }
    
    // Generate each page
    for (let page = 1; page <= totalPages; page++) {
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pageDocuments = allDocuments.slice(startIndex, endIndex);
        
        // Generate feed items for this page
        const feedItems = pageDocuments.map(doc => 
            generateDocCard(doc)
        );
        
        // Generate pagination HTML for this specific page
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml += '<div class="pagination">\n';
            // Previous page link
            if (page > 1) {
                const prevPage = page === 2 ? '/pages/index.html' : `/pages/index${page-1}.html`;
                paginationHtml += `            <a href="${prevPage}">← 上一页</a>\n`;
            }

            // Page links
            for (let i = 1; i <= totalPages; i++) {
                if (i === page) {
                    paginationHtml += `            <a href="#" class="current">${i}</a>\n`;
                } else {
                    let pageLink;
                    if (i === 1) {
                        pageLink = '/pages/index.html';
                    } else {
                        pageLink = `/pages/index${i}.html`;
                    }
                    paginationHtml += `            <a href="${pageLink}">${i}</a>\n`;
                }
            }

            // Next page link
            if (page < totalPages) {
                const nextPage = `/pages/index${page+1}.html`;
                paginationHtml += `            <a href="${nextPage}">下一页 →</a>\n`;
            }
            paginationHtml += '        </div>';
        } else {
            // This case shouldn't happen since we're generating multiple pages
            paginationHtml = '<div class="pagination">\n            <a href="/pages/index.html" class="current">1</a>\n        </div>';
        }
        
        // Replace placeholder with feed items
        let updatedContent = template.replace("{{DOC_CARDS}}", feedItems.join('\n'));
        
        // Replace pagination placeholder - match various formats
        const paginationPatterns = [
            // 原始带缩进格式
            /<div class="pagination">\s*<a[^>]*class="current"[^>]*>1<\/a>\s*<a[^>]*>2<\/a>\s*<a[^>]*>3<\/a>\s*<a[^>]*>下一页[^<]*<\/a>\s*<\/div>/,
            // 无缩进或最少缩进格式
            /<div class="pagination">[^<]*<a href="#" class="current">1<\/a>[^<]*<a href="#">2<\/a>[^<]*<a href="#">3<\/a>[^<]*<a href="#">下一页 →<\/a>[^<]*<\/div>/,
        ];

        let replaced = false;
        for (const pattern of paginationPatterns) {
            if (pattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(pattern, paginationHtml);
                replaced = true;
                break;
            }
        }

        if (!replaced) {
            console.warn("Warning: Could not find pagination placeholder in template");
        }
        
        // Generate pagination pages in pages/ directory
        // Ensure pages directory exists
        if (!fs.existsSync("pages")) {
            fs.mkdirSync("pages");
        }

        if (page === 1) {
            // For page 1, generate pages/index.html
            const pageFilename = "pages/index.html";
            fs.writeFileSync(pageFilename, updatedContent, "utf8");
            log(`Generated ${pageFilename} with ${pageDocuments.length} documents`);
        } else {
            // For other pages, generate pages/index${page}.html
            const pageFilename = `pages/index${page}.html`;
            fs.writeFileSync(pageFilename, updatedContent, "utf8");
            log(`Generated ${pageFilename} with ${pageDocuments.length} documents`);
        }
    }
    
    console.log(`Generated ${totalPages} pages with ${allDocuments.length} total documents`);
    log("Files included:");
    allDocuments.forEach(doc => {
        const dir = doc.type === 'markdown' ? `${doc.monthDir}/` : 'html/';
        log(`  - ${dir}${doc.filename} (${formatDate(doc.date)})`);
    });

    // index.html is now the primary file, no replacement needed
}

// Run the main function
main();
