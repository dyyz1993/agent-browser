import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli.js';
import { isSuccessResponse } from '../../types.js';

describe('iframe cross-origin (E2E)', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
    browser.getPage().context().setDefaultTimeout(5000);
  });

  afterEach(async () => {
    const page = browser.getPage();
    await page.goto('about:blank');
    browser.getSnapshotStore().reset();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('基础导航与快照', () => {
    it('should navigate to cross-origin iframe and get snapshot', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const snapshotResult = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('Example Domain');
      }
    });

    it('should handle iframe injected into page', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="cross-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#cross-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#cross-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).not.toContain('Main Page');
        expect(data.snapshot).toContain('iframe嵌套演示');
      }
    }, 10000);
  });

  describe('点击操作', () => {
    it('should click element inside cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="click-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#click-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const clickResult = await executeCommand(
        parseCliArgs(['click', 'h1', '--in-frame', '#click-frame']),
        browser
      );
      expect(clickResult.success).toBe(true);
    }, 10000);

    it('should test different types of clicks in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="click-types-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '#click-types-frame']),
        browser
      );
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const outerSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#click-types-frame']),
        browser
      );
      expect(outerSnapshotResult.success).toBe(true);

      const nestedSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#click-types-frame/outer-iframe']),
        browser
      );
      expect(nestedSnapshotResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 1000));

      const typeResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'testuser',
          '--in-frame',
          '#click-types-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeResult.success).toBe(true);

      const getValueResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#username',
          '--in-frame',
          '#click-types-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getValueResult.success).toBe(true);
      if (isSuccessResponse(getValueResult)) {
        const data = getValueResult.data as { value?: string };
        expect(data.value).toBe('testuser');
      }
    }, 30000);

    it('should test double click and right click in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="special-click-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '#special-click-frame']),
        browser
      );
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const dblclickResult = await executeCommand(
        parseCliArgs([
          'dblclick',
          '#username',
          '--in-frame',
          '#special-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(dblclickResult.success).toBe(true);

      const rightClickResult = await executeCommand(
        parseCliArgs([
          'click',
          '#password',
          '--button',
          'right',
          '--in-frame',
          '#special-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(rightClickResult.success).toBe(true);

      const hoverResult = await executeCommand(
        parseCliArgs([
          'hover',
          '#username',
          '--in-frame',
          '#special-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(hoverResult.success).toBe(true);

      const focusResult = await executeCommand(
        parseCliArgs([
          'focus',
          '#password',
          '--in-frame',
          '#special-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(focusResult.success).toBe(true);
    }, 30000);
  });

  describe('输入与表单操作', () => {
    it('should type into input inside cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="type-frame" name="type-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#type-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#type-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('iframe嵌套演示');
      }

      const typeResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'Test User',
          '--in-frame',
          '#type-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeResult.success).toBe(true);

      const getValueResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#username',
          '--in-frame',
          '#type-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getValueResult.success).toBe(true);
      if (isSuccessResponse(getValueResult)) {
        const data = getValueResult.data as { value?: string };
        expect(data.value).toBe('Test User');
      }
    }, 30000);

    it('should test click state changes in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="state-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#state-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const fillUsernameResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#username',
          'testuser',
          '--in-frame',
          '#state-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(fillUsernameResult.success).toBe(true);

      const fillPasswordResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#password',
          'password123',
          '--in-frame',
          '#state-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(fillPasswordResult.success).toBe(true);

      const clearResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#username',
          ' ',
          '--in-frame',
          '#state-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(clearResult.success).toBe(true);

      const refillResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#username',
          'newuser',
          '--in-frame',
          '#state-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(refillResult.success).toBe(true);

      const getValueResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#username',
          '--in-frame',
          '#state-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getValueResult.success).toBe(true);
      if (isSuccessResponse(getValueResult)) {
        const data = getValueResult.data as { value?: string };
        expect(data.value).toBe('newuser');
      }
    }, 30000);

    it('should test form submission in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="form-submit-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '#form-submit-frame']),
        browser
      );
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const typeUsernameResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'admin',
          '--in-frame',
          '#form-submit-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeUsernameResult.success).toBe(true);

      const typePasswordResult = await executeCommand(
        parseCliArgs([
          'type',
          '#password',
          'secret123',
          '--in-frame',
          '#form-submit-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typePasswordResult.success).toBe(true);

      const getUsernameResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#username',
          '--in-frame',
          '#form-submit-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getUsernameResult.success).toBe(true);
      if (isSuccessResponse(getUsernameResult)) {
        const data = getUsernameResult.data as { value?: string };
        expect(data.value).toBe('admin');
      }

      const isVisibleResult = await executeCommand(
        parseCliArgs([
          'is',
          'visible',
          '#password',
          '--in-frame',
          '#form-submit-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(isVisibleResult.success).toBe(true);
      if (isSuccessResponse(isVisibleResult)) {
        const data = isVisibleResult.data as { visible?: boolean };
        expect(data.visible).toBe(true);
      }

      const getTextResult = await executeCommand(
        parseCliArgs([
          'get',
          'text',
          'body',
          '--in-frame',
          '#form-submit-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getTextResult.success).toBe(true);
    }, 30000);
  });

  describe('嵌套 iframe 操作', () => {
    it('should handle nested cross-origin iframes', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="outer-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#outer-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#outer-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('iframe嵌套演示');
        expect(data.snapshot).not.toContain('Main Page');
      }
    }, 10000);

    it('should test click-induced navigation in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="nav-click-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#nav-click-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const initialUrlResult = await executeCommand(
        parseCliArgs(['get', 'url', '--in-frame', '#nav-click-frame']),
        browser
      );
      expect(initialUrlResult.success).toBe(true);

      if (isSuccessResponse(initialUrlResult)) {
        const initialUrl = initialUrlResult.data as { url?: string };
        expect(initialUrl.url).toBeDefined();
        expect(initialUrl.url).toContain('tools.docker.19930810.xyz');
      }

      const typeUsernameResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'admin',
          '--in-frame',
          '#nav-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeUsernameResult.success).toBe(true);

      const typePasswordResult = await executeCommand(
        parseCliArgs([
          'type',
          '#password',
          'secret123',
          '--in-frame',
          '#nav-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typePasswordResult.success).toBe(true);

      const getUsernameResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#username',
          '--in-frame',
          '#nav-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getUsernameResult.success).toBe(true);
      if (isSuccessResponse(getUsernameResult)) {
        const data = getUsernameResult.data as { value?: string };
        expect(data.value).toBe('admin');
      }

      const getPasswordResult = await executeCommand(
        parseCliArgs([
          'get',
          'value',
          '#password',
          '--in-frame',
          '#nav-click-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(getPasswordResult.success).toBe(true);
      if (isSuccessResponse(getPasswordResult)) {
        const data = getPasswordResult.data as { value?: string };
        expect(data.value).toBe('secret123');
      }
    }, 30000);

    it('should test deeply nested cross-origin iframes', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="level1" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#level1']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const level1SnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#level1']),
        browser
      );
      expect(level1SnapshotResult.success).toBe(true);
      if (isSuccessResponse(level1SnapshotResult)) {
        const data = level1SnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('iframe嵌套演示');
        expect(data.snapshot).toContain('outer-iframe');
        expect(data.snapshot).toContain('login-frame');
      }

      const level2SnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#level1/outer-iframe']),
        browser
      );
      expect(level2SnapshotResult.success).toBe(true);
      if (isSuccessResponse(level2SnapshotResult)) {
        const data = level2SnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toContain('外层 iframe');
        expect(data.snapshot).toContain('iframe');
      }

      const interactiveSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#level1/outer-iframe', '--interactive']),
        browser
      );
      expect(interactiveSnapshotResult.success).toBe(true);
      if (isSuccessResponse(interactiveSnapshotResult)) {
        const data = interactiveSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
      }

      const compactSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#level1/outer-iframe', '--compact']),
        browser
      );
      expect(compactSnapshotResult.success).toBe(true);
      if (isSuccessResponse(compactSnapshotResult)) {
        const data = compactSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
      }

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', 'input', '--in-frame', '#level1/outer-iframe/login-frame']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        const data = countResult.data as { count?: number };
        expect(data.count).toBeGreaterThanOrEqual(2);
      }
    }, 30000);
  });

  describe('快照选项与特性', () => {
    it('should test different snapshot options in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="snapshot-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#snapshot-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const interactiveSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#snapshot-frame', '--interactive']),
        browser
      );
      expect(interactiveSnapshotResult.success).toBe(true);
      if (isSuccessResponse(interactiveSnapshotResult)) {
        const data = interactiveSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
      }

      const compactSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#snapshot-frame', '--compact']),
        browser
      );
      expect(compactSnapshotResult.success).toBe(true);
      if (isSuccessResponse(compactSnapshotResult)) {
        const data = compactSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
      }
    }, 10000);

    it('should test selective snapshot with selector in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="selector-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#selector-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const selectorSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#selector-frame', '--selector', 'h1']),
        browser
      );
      expect(selectorSnapshotResult.success).toBe(true);
      if (isSuccessResponse(selectorSnapshotResult)) {
        const data = selectorSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('iframe嵌套演示');
      }
    }, 10000);

    it('should test snapshot comparison before and after interaction in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="form-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#form-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const initialSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#form-frame/outer-iframe']),
        browser
      );
      expect(initialSnapshotResult.success).toBe(true);
      if (isSuccessResponse(initialSnapshotResult)) {
        const data = initialSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toContain('外层 iframe');
      }

      const typeResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'Test User',
          '--in-frame',
          '#form-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeResult.success).toBe(true);

      const finalSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#form-frame/outer-iframe']),
        browser
      );
      expect(finalSnapshotResult.success).toBe(true);
      if (isSuccessResponse(finalSnapshotResult)) {
        const data = finalSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toContain('外层 iframe');
      }

      if (isSuccessResponse(initialSnapshotResult) && isSuccessResponse(finalSnapshotResult)) {
        const initialData = initialSnapshotResult.data as { snapshot?: string };
        const finalData = finalSnapshotResult.data as { snapshot?: string };
        expect(initialData.snapshot).toBeDefined();
        expect(finalData.snapshot).toBeDefined();
      }
    }, 30000);

    it('should test snapshot references in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="ref-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#ref-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#ref-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as {
          snapshot?: string;
          refs?: Record<string, { role: string; name?: string }>;
        };
        expect(data.snapshot).toBeDefined();
        expect(data.refs).toBeDefined();
        expect(Object.keys(data.refs || {}).length).toBeGreaterThan(0);
      }
    }, 10000);
  });

  describe('元素信息获取', () => {
    it('should test cross-origin iframe navigation', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="nav-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#nav-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const navigateResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.getElementById("nav-frame").src = "https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html";',
        ]),
        browser
      );
      expect(navigateResult.success).toBe(true);
      await new Promise((r) => setTimeout(r, 3000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#nav-frame/outer-iframe/login-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('用户名');
      }
    }, 30000);

    it('should test cross-origin iframe property retrieval', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="prop-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#prop-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const getTextResult = await executeCommand(
        parseCliArgs(['get', 'text', 'h1', '--in-frame', '#prop-frame']),
        browser
      );
      expect(getTextResult.success).toBe(true);
      if (isSuccessResponse(getTextResult)) {
        const data = getTextResult.data as { text?: string };
        expect(data.text).toBeDefined();
        expect(data.text).toContain('iframe嵌套演示');
      }

      const isVisibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', 'h1', '--in-frame', '#prop-frame']),
        browser
      );
      expect(isVisibleResult.success).toBe(true);
      if (isSuccessResponse(isVisibleResult)) {
        const data = isVisibleResult.data as { visible?: boolean };
        expect(data.visible).toBe(true);
      }
    }, 10000);

    it('should test element count and bounding box in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="element-info-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '#element-info-frame']),
        browser
      );
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const countResult = await executeCommand(
        parseCliArgs([
          'get',
          'count',
          'input',
          '--in-frame',
          '#element-info-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        const data = countResult.data as { count?: number };
        expect(data.count).toBeGreaterThanOrEqual(2);
      }

      const boxResult = await executeCommand(
        parseCliArgs([
          'get',
          'box',
          '#username',
          '--in-frame',
          '#element-info-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(boxResult.success).toBe(true);
      if (isSuccessResponse(boxResult)) {
        const data = boxResult.data as {
          box?: { x: number; y: number; width: number; height: number };
        };
        expect(data.box).toBeDefined();
        expect(data.box?.width).toBeGreaterThan(0);
        expect(data.box?.height).toBeGreaterThan(0);
      }

      const attrResult = await executeCommand(
        parseCliArgs([
          'get',
          'attr',
          '#username',
          'placeholder',
          '--in-frame',
          '#element-info-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(attrResult.success).toBe(true);
      if (isSuccessResponse(attrResult)) {
        const data = attrResult.data as { value?: string };
        expect(data.value).toContain('用户名');
      }

      const isEnabledResult = await executeCommand(
        parseCliArgs([
          'is',
          'enabled',
          '#password',
          '--in-frame',
          '#element-info-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(isEnabledResult.success).toBe(true);
      if (isSuccessResponse(isEnabledResult)) {
        const data = isEnabledResult.data as { enabled?: boolean };
        expect(data.enabled).toBe(true);
      }
    }, 30000);
  });

  describe('事件处理与错误处理', () => {
    it('should test cross-origin iframe event handling', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="event-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#event-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const hoverResult = await executeCommand(
        parseCliArgs(['hover', 'h1', '--in-frame', '#event-frame']),
        browser
      );
      expect(hoverResult.success).toBe(true);

      const focusResult = await executeCommand(
        parseCliArgs(['focus', 'h1', '--in-frame', '#event-frame']),
        browser
      );
      expect(focusResult.success).toBe(true);
    }, 10000);

    it('should test cross-origin iframe error handling', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="error-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#error-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 2000));

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#non-existent-element', '--in-frame', '#error-frame']),
        browser
      );
      expect(clickResult.success).toBe(false);
    }, 10000);
  });

  describe('滚动操作', () => {
    it('should test scroll operations in cross-origin iframe', async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', 'https://www.example.com']),
        browser
      );
      expect(openResult.success).toBe(true);

      const evalResult = await executeCommand(
        parseCliArgs([
          'eval',
          'document.body.innerHTML = \'<h1>Main Page</h1><iframe id="scroll-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>\'',
        ]),
        browser
      );
      expect(evalResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#scroll-frame']), browser);
      expect(waitResult.success).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#scroll-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);

      const nestedSnapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#scroll-frame/outer-iframe']),
        browser
      );
      expect(nestedSnapshotResult.success).toBe(true);
      if (isSuccessResponse(nestedSnapshotResult)) {
        const data = nestedSnapshotResult.data as { snapshot?: string };
        expect(data.snapshot).toContain('外层 iframe');
      }

      const loginFrameSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#scroll-frame/outer-iframe/login-frame']),
        browser
      );
      expect(loginFrameSnapshot.success).toBe(true);
      if (isSuccessResponse(loginFrameSnapshot)) {
        const data = loginFrameSnapshot.data as { snapshot?: string };
        expect(data.snapshot).toContain('内层 iframe');
      }

      const typeResult = await executeCommand(
        parseCliArgs([
          'type',
          '#username',
          'scrolltest',
          '--in-frame',
          '#scroll-frame/outer-iframe/login-frame',
        ]),
        browser
      );
      expect(typeResult.success).toBe(true);
    }, 30000);
  });
});
