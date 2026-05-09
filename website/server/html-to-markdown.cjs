'use strict';

function htmlToMarkdown(html) {
  let md = html;

  md = md.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  md = md.replace(/<meta[^>]*>/gi, '');
  md = md.replace(/<link[^>]*>/gi, '');

  md = md.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  md = md.replace(
    /<img[^>]*?(?:src|data-src)\s*=\s*["']?\s*data:image\/[^"'>]+["']?[^>]*\/?>/gi,
    ''
  );
  md = md.replace(/<img[^>]*?(?:src|data-src)\s*=\s*["']data:[^"']+["'][^>]*\/?>/gi, '');

  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`');

  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gis, '\n#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gis, '\n##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gis, '\n###### $1\n\n');

  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*');

  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '\n$1\n\n');
  md = md.replace(/<div[^>]*>(.*?)<\/div>/gis, '\n$1\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gis, (_match, content) => {
    return '\n' + content.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n') + '\n';
  });

  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gis, (_match, content) => {
    let index = 1;
    return '\n' + content.replace(/<li[^>]*>(.*?)<\/li>/gis, () => `${index++}. $1\n`) + '\n';
  });

  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gis, '![$2]($1)');
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gis, '![$1]($2)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/gis, '![]($1)');

  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n> $1\n\n');
  md = md.replace(/<hr[^>]*>/gi, '\n---\n');

  md = md.replace(/<[^>]+>/g, '');

  md = md.replace(/!\[[^\]]*\]\([^)]*data:[^)]*\)/gi, '');
  md = md.replace(/!\[[^\]]*\]\(data:image[^)]*\)/gi, '');
  md = md.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/gi, '');
  md = md.replace(/(?<!!)\[\]\([^)]*\)/g, '');
  md = md.replace(/\[Skip to Content\]\(.*?\)/gi, '');

  md = md.replace(/\[([^\]]*?)\n([^\]]*?)\]\(/g, '[$1 $2](');

  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

module.exports = { htmlToMarkdown };
