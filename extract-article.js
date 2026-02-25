const article = {
  title: document.querySelector("h1")?.textContent?.trim() || "",
  author: "",
  date: "",
  views: "0",
  comments: "0",
  cover_image: "",
  content: [],
  tags: []
};

// 提取作者、日期、阅读数、评论数
const metaText = document.body.innerText;
const authorMatch = metaText.match(/👤\s*(\S+)/);
if (authorMatch) article.author = authorMatch[1];

const dateMatch = metaText.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
if (dateMatch) article.date = dateMatch[1];

const viewsMatch = metaText.match(/👁️\s*([\d,]+)/);
if (viewsMatch) article.views = viewsMatch[1].replace(/,/g, "");

const commentsMatch = metaText.match(/💬\s*(\d+)/);
if (commentsMatch) article.comments = commentsMatch[1];

// 提取封面图片
const img = document.querySelector("article img") || document.querySelector("img");
if (img) article.cover_image = img.src || "";

// 提取正文内容
const articleEl = document.querySelector("article");
if (articleEl) {
  const elements = articleEl.querySelectorAll("h2, h3, p");
  elements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      article.content.push({
        type: el.tagName.toLowerCase() === "p" ? "paragraph" : "heading",
        text: text
      });
    }
  });
}

// 提取标签
const tagsMatch = document.body.innerText.match(/#[\w\u4e00-\u9fa5]+/g);
if (tagsMatch) {
  article.tags = tagsMatch.map(t => t.replace("#", ""));
}

JSON.stringify(article, null, 2);
