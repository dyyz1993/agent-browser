'use strict';

const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

turndown.use(gfm);

turndown.addRule('removeScripts', {
  filter: ['script', 'style', 'noscript', 'svg', 'head', 'meta', 'link'],
  replacement: function () { return ''; },
});

turndown.addRule('removeBase64Images', {
  filter: 'img',
  replacement: function (_content, node) {
    var src = node.getAttribute ? node.getAttribute('src') : '';
    var alt = node.getAttribute ? node.getAttribute('alt') : '';
    if (src && src.startsWith('data:image')) return '![' + alt + '](<Base64-Image-Removed>)';
    if (!src || src.startsWith('data:')) return '';
    return '![' + alt + '](' + src + ')';
  },
});

turndown.addRule('codeBlocks', {
  filter: function (node) {
    return node.nodeName === 'PRE' && node.querySelector('code') !== null;
  },
  replacement: function (_content, node) {
    var code = node.querySelector('code');
    var lang = code && code.className ? code.className.replace('language-', '').replace('lang-', '') : '';
    var text = code && code.textContent ? code.textContent : '';
    return '\n```' + lang + '\n' + text + '\n```\n';
  },
});

function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';

  var cleaned = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ');

  var markdown = turndown.turndown(cleaned);

  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return markdown;
}

module.exports = { htmlToMarkdown };
