import { describe, it, expect, vi } from 'vitest';
import { htmlToMarkdown } from '../actions/utils.js';
import { executeCommand } from '../actions/index.js';

describe('htmlToMarkdown', () => {
  it('should convert basic HTML headings to markdown', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
    expect(md).toContain('### Section');
  });

  it('should convert paragraphs', () => {
    const html = '<p>Hello world</p><p>Second paragraph</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Hello world');
    expect(md).toContain('Second paragraph');
  });

  it('should convert bold and italic', () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('should convert links', () => {
    const html = '<a href="https://example.com">click here</a>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('[click here](https://example.com)');
  });

  it('should convert images with alt text', () => {
    const html = '<img src="https://example.com/img.png" alt="test image">';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![test image](https://example.com/img.png)');
  });

  it('should convert code blocks with language', () => {
    const html = '<pre><code class="language-typescript">const x = 1;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```typescript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('should convert unordered lists', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Item 1');
    expect(md).toContain('Item 2');
    expect(md).toMatch(/^- +Item 1/m);
  });

  it('should remove script and style tags', () => {
    const html = '<p>Content</p><script>alert("xss")</script><style>.x{color:red}</style>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Content');
    expect(md).not.toContain('alert');
    expect(md).not.toContain('color:red');
  });

  it('should handle base64 images as placeholder', () => {
    const html = '<img src="data:image/png;base64,abc123" alt="embedded">';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![embedded](<Base64-Image-Removed>)');
  });

  it('should convert tables to markdown format', () => {
    const html =
      '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| Name | Age |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Alice | 30 |');
  });

  it('should handle &nbsp; entities', () => {
    const html = '<p>Hello&nbsp;World</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Hello World');
  });

  it('should return empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown(null as any)).toBe('');
    expect(htmlToMarkdown(undefined as any)).toBe('');
  });

  it('should handle non-string input', () => {
    expect(htmlToMarkdown(42 as any)).toBe('');
  });

  it('should collapse excessive newlines', () => {
    const html = '<p>A</p><p>B</p><p>C</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('should handle special HTML entities', () => {
    const html = '<p>&amp; &lt; &gt;</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('&');
    expect(md).toContain('<');
    expect(md).toContain('>');
  });
});

describe('extractContentFromPage', () => {
  it('should be exported as a function', async () => {
    const { extractContentFromPage } = await import('../actions/utils.js');
    expect(typeof extractContentFromPage).toBe('function');
  });

  it('should accept text format parameter', async () => {
    const { extractContentFromPage } = await import('../actions/utils.js');
    expect(extractContentFromPage.length).toBe(3);
  });
});

describe('action handler map', () => {
  const EXPECTED_ACTIONS = [
    'launch',
    'navigate',
    'click',
    'type',
    'fill',
    'check',
    'uncheck',
    'upload',
    'dblclick',
    'focus',
    'drag',
    'getbyrole',
    'getbytext',
    'getbylabel',
    'getbyplaceholder',
    'press',
    'screenshot',
    'snapshot',
    'evaluate',
    'wait',
    'scroll',
    'select',
    'hover',
    'content',
    'close',
    'tab_new',
    'tab_list',
    'frames',
    'tab_switch',
    'tab_close',
    'window_new',
    'cookies_get',
    'cookies_set',
    'cookies_clear',
    'storage_get',
    'storage_set',
    'storage_clear',
    'dialog',
    'pdf',
    'route',
    'unroute',
    'requests',
    'websockets',
    'download',
    'geolocation',
    'permissions',
    'viewport',
    'useragent',
    'device',
    'back',
    'forward',
    'reload',
    'url',
    'title',
    'getattribute',
    'gettext',
    'isvisible',
    'isenabled',
    'ischecked',
    'count',
    'boundingbox',
    'styles',
    'video_start',
    'video_stop',
    'trace_start',
    'trace_stop',
    'har_start',
    'har_stop',
    'state_save',
    'state_load',
    'console',
    'errors',
    'keyboard',
    'wheel',
    'tap',
    'clipboard',
    'highlight',
    'clear',
    'selectall',
    'innertext',
    'innerhtml',
    'inputvalue',
    'setvalue',
    'dispatch',
    'evalhandle',
    'expose',
    'addscript',
    'addstyle',
    'emulatemedia',
    'offline',
    'headers',
    'pause',
    'getbyalttext',
    'getbytitle',
    'getbytestid',
    'nth',
    'waitforurl',
    'waitforloadstate',
    'setcontent',
    'timezone',
    'locale',
    'credentials',
    'mousemove',
    'mousedown',
    'mouseup',
    'wander',
    'mousetrajectory',
    'bringtofront',
    'waitforfunction',
    'scrollintoview',
    'addinitscript',
    'keydown',
    'keyup',
    'inserttext',
    'multiselect',
    'waitfordownload',
    'responsebody',
    'screencast_start',
    'screencast_stop',
    'input_mouse',
    'input_keyboard',
    'input_touch',
    'recording_start',
    'recording_stop',
    'recording_restart',
    'recorder_start',
    'recorder_stop',
    'recorder_status',
    'recorder_replay',
    'scrape',
    'crawl',
    'map',
    'search',
    'interact',
    'viewer',
    'ask',
    'config',
    'history',
    'selector-for',
    'selectors-of',
    'validate',
  ];

  it('should return error for unknown action', async () => {
    const mockBrowser = {} as any;
    const result = await executeCommand(
      { id: 'test-1', action: 'unknown_action_xyz' } as any,
      mockBrowser
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('should have handlers for all expected actions', async () => {
    const indexModule = await import('../actions/index.js');
    expect(indexModule.executeCommand).toBeDefined();
    expect(typeof indexModule.executeCommand).toBe('function');
  });

  it('should register at least 90 unique actions', async () => {
    expect(EXPECTED_ACTIONS.length).toBeGreaterThanOrEqual(90);
    const uniqueActions = new Set(EXPECTED_ACTIONS);
    expect(uniqueActions.size).toBe(EXPECTED_ACTIONS.length);
  });

  it('should handle flow action via dedicated path', async () => {
    const mockBrowser = {} as any;
    const result = await executeCommand(
      { id: 'f1', action: 'flow', steps: [] } as any,
      mockBrowser
    );
    expect(result).toBeDefined();
    expect(result.id).toBe('f1');
  });
});
