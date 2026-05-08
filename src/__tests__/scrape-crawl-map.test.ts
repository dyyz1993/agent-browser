import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, EXCLUDE_SELECTORS, FORCE_INCLUDE_SELECTORS } from '../actions/utils.js';
import { normalizeUrl, normalizeUrlFromUrl } from '../actions/crawl.js';
import { parseCommand } from '../protocol.js';

describe('htmlToMarkdown', () => {
  it('should convert pre>code to code blocks', () => {
    const html = '<pre><code class="language-python">print("hello")</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('print("hello")');
  });

  it('should convert pre without code to code blocks', () => {
    const html = '<pre>raw code here</pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('raw code here');
  });

  it('should convert code to inline code', () => {
    const html = '<p>Use <code>npm install</code> to install</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('`npm install`');
  });

  it('should convert h1', () => {
    const md = htmlToMarkdown('<h1>Title</h1>');
    expect(md).toContain('# Title');
  });

  it('should convert h2', () => {
    const md = htmlToMarkdown('<h2>Subtitle</h2>');
    expect(md).toContain('## Subtitle');
  });

  it('should convert h3', () => {
    const md = htmlToMarkdown('<h3>Section</h3>');
    expect(md).toContain('### Section');
  });

  it('should convert h4-h6', () => {
    expect(htmlToMarkdown('<h4>H4</h4>')).toContain('#### H4');
    expect(htmlToMarkdown('<h5>H5</h5>')).toContain('##### H5');
    expect(htmlToMarkdown('<h6>H6</h6>')).toContain('###### H6');
  });

  it('should convert links', () => {
    const html = '<a href="https://example.com">Example</a>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('[Example](https://example.com)');
  });

  it('should convert images with alt and src', () => {
    const html = '<img src="https://example.com/img.png" alt="Logo">';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![Logo](https://example.com/img.png)');
  });

  it('should convert images with alt before src', () => {
    const html = '<img alt="Photo" src="https://example.com/photo.jpg">';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![Photo](https://example.com/photo.jpg)');
  });

  it('should convert images without alt', () => {
    const html = '<img src="https://example.com/img.png">';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![](https://example.com/img.png)');
  });

  it('should convert unordered lists', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('- Item 1');
    expect(md).toContain('- Item 2');
    expect(md).toContain('- Item 3');
  });

  it('should convert ordered lists', () => {
    const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('1.');
    expect(md).toContain('2.');
    expect(md).toContain('3.');
  });

  it('should convert bold text', () => {
    const html = '<p>This is <strong>bold</strong> text</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('**bold**');
  });

  it('should convert b tags to bold', () => {
    const html = '<p>This is <b>bold</b> text</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('**bold**');
  });

  it('should convert italic text', () => {
    const html = '<p>This is <em>italic</em> text</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('*italic*');
  });

  it('should convert i tags to italic', () => {
    const html = '<p>This is <i>italic</i> text</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('*italic*');
  });

  it('should convert blockquotes', () => {
    const html = '<blockquote>A quote</blockquote>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('> A quote');
  });

  it('should convert hr', () => {
    const html = '<p>A</p><hr><p>B</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('---');
  });

  it('should convert br to newline', () => {
    const html = '<p>Line 1<br>Line 2</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Line 1\nLine 2');
  });

  it('should decode HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('A & B < C > D "E" \'F\'');
  });

  it('should decode &nbsp;', () => {
    const html = '<p>Hello&nbsp;World</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Hello World');
  });

  it('should strip style tags and content', () => {
    const html = '<style>.foo{color:red}</style><p>Text</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('.foo');
    expect(md).not.toContain('color');
    expect(md).toContain('Text');
  });

  it('should strip script tags and content', () => {
    const html = '<script>alert("x")</script><p>Text</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('alert');
    expect(md).toContain('Text');
  });

  it('should strip remaining HTML tags', () => {
    const html = '<div><span>Hello</span></div>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('<div>');
    expect(md).not.toContain('<span>');
    expect(md).toContain('Hello');
  });

  it('should handle complex nested HTML', () => {
    const html = `
      <h1>Title</h1>
      <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
      <ul>
        <li>Item with <code>code</code></li>
        <li><a href="https://example.com">Link</a></li>
      </ul>
      <pre><code class="language-js">const x = 1;</code></pre>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('`code`');
    expect(md).toContain('[Link](https://example.com)');
    expect(md).toContain('const x = 1;');
  });

  it('should collapse multiple newlines to double', () => {
    const html = '<p>A</p><p>B</p><p>C</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('should trim result', () => {
    const html = '  <p>Hello</p>  ';
    const md = htmlToMarkdown(html);
    expect(md).toBe('Hello');
  });
});

describe('URL normalization', () => {
  it('should normalize trailing slashes', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('should preserve root path slash when length is 1', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('should preserve URLs without trailing slash', () => {
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('should normalize hash route without query params', () => {
    const u = new URL('https://example.com/#/tutorial?id=xxx');
    const result = normalizeUrlFromUrl(u);
    expect(result).toBe('https://example.com/#/tutorial');
  });

  it('should normalize hash route without anchor', () => {
    const u = new URL('https://example.com/#/tutorial#section');
    const result = normalizeUrlFromUrl(u);
    expect(result).toBe('https://example.com/#/tutorial');
  });

  it('should treat #/ and # as same page', () => {
    const u1 = new URL('https://example.com/#/');
    const u2 = new URL('https://example.com/');
    expect(normalizeUrlFromUrl(u1)).toBe(normalizeUrlFromUrl(u2));
  });

  it('should preserve root path slash for #/ hash', () => {
    const u = new URL('https://example.com/#/');
    expect(normalizeUrlFromUrl(u)).toBe('https://example.com/');
  });

  it('should return raw string for invalid URL', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  it('should normalize URLs with query params in hash', () => {
    const u = new URL('https://docs.example.com/guide#/api?query=test');
    const result = normalizeUrlFromUrl(u);
    expect(result).toBe('https://docs.example.com/guide#/api');
  });
});

describe('EXCLUDE_SELECTORS', () => {
  it('should include common navigation elements', () => {
    expect(EXCLUDE_SELECTORS).toContain('header');
    expect(EXCLUDE_SELECTORS).toContain('footer');
    expect(EXCLUDE_SELECTORS).toContain('nav');
    expect(EXCLUDE_SELECTORS).toContain('aside');
  });

  it('should include ad-related selectors', () => {
    expect(EXCLUDE_SELECTORS).toContain('.ad');
    expect(EXCLUDE_SELECTORS).toContain('.ads');
    expect(EXCLUDE_SELECTORS).toContain('.advert');
  });

  it('should include script and style tags', () => {
    expect(EXCLUDE_SELECTORS).toContain('script');
    expect(EXCLUDE_SELECTORS).toContain('style');
    expect(EXCLUDE_SELECTORS).toContain('noscript');
    expect(EXCLUDE_SELECTORS).toContain('iframe');
  });

  it('should include social selectors', () => {
    expect(EXCLUDE_SELECTORS).toContain('.social');
    expect(EXCLUDE_SELECTORS).toContain('.social-media');
    expect(EXCLUDE_SELECTORS).toContain('.social-links');
  });

  it('should include cookie selectors', () => {
    expect(EXCLUDE_SELECTORS).toContain('.cookie');
    expect(EXCLUDE_SELECTORS).toContain('.cookie-banner');
  });
});

describe('FORCE_INCLUDE_SELECTORS', () => {
  it('should include main content selectors', () => {
    expect(FORCE_INCLUDE_SELECTORS).toContain('#main');
    expect(FORCE_INCLUDE_SELECTORS).toContain('#content');
    expect(FORCE_INCLUDE_SELECTORS).toContain('article');
    expect(FORCE_INCLUDE_SELECTORS).toContain('main');
  });

  it('should include class-based content selectors', () => {
    expect(FORCE_INCLUDE_SELECTORS).toContain('.main');
    expect(FORCE_INCLUDE_SELECTORS).toContain('.content');
    expect(FORCE_INCLUDE_SELECTORS).toContain('.article');
    expect(FORCE_INCLUDE_SELECTORS).toContain('.post');
  });

  it('should include docs-specific selectors', () => {
    expect(FORCE_INCLUDE_SELECTORS).toContain('.markdown-section');
    expect(FORCE_INCLUDE_SELECTORS).toContain('.theme-default-content');
    expect(FORCE_INCLUDE_SELECTORS).toContain('.md-content');
  });
});

describe('Protocol validation - scrape', () => {
  it('should validate valid scrape command', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'scrape',
        url: 'https://example.com',
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.action).toBe('scrape');
    }
  });

  it('should validate scrape with format', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '2',
        action: 'scrape',
        url: 'https://example.com',
        format: 'markdown',
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate scrape with all formats', () => {
    for (const fmt of ['text', 'html', 'markdown'] as const) {
      const result = parseCommand(
        JSON.stringify({
          id: '3',
          action: 'scrape',
          url: 'https://example.com',
          format: fmt,
        })
      );
      expect(result.success).toBe(true);
    }
  });

  it('should reject scrape without url', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '4',
        action: 'scrape',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject scrape with invalid format', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '5',
        action: 'scrape',
        url: 'https://example.com',
        format: 'invalid',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should validate scrape with selector', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '6',
        action: 'scrape',
        url: 'https://example.com',
        selector: '#content',
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate scrape with timeout', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '7',
        action: 'scrape',
        url: 'https://example.com',
        timeout: 30,
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('Protocol validation - crawl', () => {
  it('should validate valid crawl command', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'crawl',
        url: 'https://example.com',
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.action).toBe('crawl');
    }
  });

  it('should validate crawl with depth and limit', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '2',
        action: 'crawl',
        url: 'https://example.com',
        depth: 3,
        limit: 100,
      })
    );
    expect(result.success).toBe(true);
  });

  it('should reject crawl without url', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '3',
        action: 'crawl',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should validate crawl with format', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '4',
        action: 'crawl',
        url: 'https://example.com',
        format: 'html',
      })
    );
    expect(result.success).toBe(true);
  });

  it('should reject crawl with negative depth', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '5',
        action: 'crawl',
        url: 'https://example.com',
        depth: -1,
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject crawl with limit zero', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '6',
        action: 'crawl',
        url: 'https://example.com',
        limit: 0,
      })
    );
    expect(result.success).toBe(false);
  });
});

describe('Protocol validation - map', () => {
  it('should validate valid map command', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'map',
        url: 'https://example.com',
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.action).toBe('map');
    }
  });

  it('should validate map with limit', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '2',
        action: 'map',
        url: 'https://example.com',
        limit: 50,
      })
    );
    expect(result.success).toBe(true);
  });

  it('should reject map without url', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '3',
        action: 'map',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should validate map with timeout', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '4',
        action: 'map',
        url: 'https://example.com',
        timeout: 30,
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('Protocol validation - search', () => {
  it('should validate valid search command', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'search',
        query: 'test query',
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.action).toBe('search');
    }
  });

  it('should validate search with engine', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '2',
        action: 'search',
        query: 'test',
        engine: 'google',
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate search with all engines', () => {
    for (const engine of ['google', 'bing', 'duckduckgo'] as const) {
      const result = parseCommand(
        JSON.stringify({
          id: '3',
          action: 'search',
          query: 'test',
          engine,
        })
      );
      expect(result.success).toBe(true);
    }
  });

  it('should reject search without query', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '4',
        action: 'search',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject search with empty query', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '5',
        action: 'search',
        query: '',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject search with invalid engine', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '6',
        action: 'search',
        query: 'test',
        engine: 'yahoo',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should validate search with limit', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '7',
        action: 'search',
        query: 'test',
        limit: 5,
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('Protocol validation - interact', () => {
  it('should validate interact with steps', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'interact',
        steps: [
          { action: 'navigate', url: 'https://example.com' },
          { action: 'click', selector: '#button' },
        ],
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.action).toBe('interact');
    }
  });

  it('should validate interact with file', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '2',
        action: 'interact',
        file: '/path/to/steps.json',
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact navigate step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '3',
        action: 'interact',
        steps: [{ action: 'navigate', url: 'https://example.com' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact click step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '4',
        action: 'interact',
        steps: [{ action: 'click', selector: '#btn' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact fill step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '5',
        action: 'interact',
        steps: [{ action: 'fill', selector: '#input', value: 'hello' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact type step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '6',
        action: 'interact',
        steps: [{ action: 'type', selector: '#input', text: 'hello' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact press step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '7',
        action: 'interact',
        steps: [{ action: 'press', key: 'Enter' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact get step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '8',
        action: 'interact',
        steps: [{ action: 'get', type: 'text', selector: '#content' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact wait step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '9',
        action: 'interact',
        steps: [{ action: 'wait', selector: '#loaded', timeout: 5000 }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should validate interact screenshot step', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '10',
        action: 'interact',
        steps: [{ action: 'screenshot', path: '/tmp/shot.png' }],
      })
    );
    expect(result.success).toBe(true);
  });

  it('should reject interact click without selector', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '11',
        action: 'interact',
        steps: [{ action: 'click' }],
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject interact fill without value', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '12',
        action: 'interact',
        steps: [{ action: 'fill', selector: '#input' }],
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject interact with unknown step action', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '13',
        action: 'interact',
        steps: [{ action: 'unknown', foo: 'bar' }],
      })
    );
    expect(result.success).toBe(false);
  });

  it('should validate interact get all types', () => {
    for (const type of ['text', 'html', 'value', 'url', 'title'] as const) {
      const result = parseCommand(
        JSON.stringify({
          id: '14',
          action: 'interact',
          steps: [{ action: 'get', type }],
        })
      );
      expect(result.success).toBe(true);
    }
  });

  it('should validate interact wait with state', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '15',
        action: 'interact',
        steps: [{ action: 'wait', state: 'visible' }],
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('Protocol validation - general', () => {
  it('should reject invalid JSON', () => {
    const result = parseCommand('not json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  it('should reject unknown action', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'unknown_action',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should reject missing id', () => {
    const result = parseCommand(
      JSON.stringify({
        action: 'scrape',
        url: 'https://example.com',
      })
    );
    expect(result.success).toBe(false);
  });

  it('should extract id from failed validation', () => {
    const result = parseCommand(
      JSON.stringify({
        id: 'test-42',
        action: 'scrape',
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.id).toBe('test-42');
    }
  });

  it('should validate scrape with headless option', () => {
    const result = parseCommand(
      JSON.stringify({
        id: '1',
        action: 'scrape',
        url: 'https://example.com',
        headless: true,
      })
    );
    expect(result.success).toBe(true);
  });
});
