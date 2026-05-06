import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli.js';
import { isSuccessResponse } from '../../types.js';

function stripSnapshotHeader(snapshot: string): string {
  const lines = snapshot.split('\n');
  const contentLines: string[] = [];
  let pastHeader = false;
  let beforeTips = true;
  for (const line of lines) {
    if (!pastHeader && line.startsWith('Snapshot #snap_')) {
      pastHeader = true;
      continue;
    }
    if (!pastHeader && line === '---') continue;
    if (pastHeader && !beforeTips) continue;
    if (pastHeader && beforeTips && line === '---') {
      beforeTips = false;
      continue;
    }
    if (line.startsWith('Tips:')) {
      beforeTips = false;
      continue;
    }
    contentLines.push(line);
  }
  return contentLines.join('\n').trim();
}

const MAIN_PAGE_URL =
  'https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html';
const OUTER_IFRAME_URL =
  'https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18/outer-iframe';
const LOGIN_FRAME_URL =
  'https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18/login-frame';

describe('iframe nested snapshot (E2E)', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
    browser.getPage().context().setDefaultTimeout(10000);
  });

  beforeEach(() => {
    browser.getSnapshotStore().reset();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('直接访问 URL 验证', () => {
    it('should get correct snapshot from main page', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        console.log('\n=== Main Page Snapshot ===');
        console.log(data.snapshot);
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('iframe嵌套演示');
        expect(data.snapshot).toContain('outer-iframe');
        expect(data.snapshot).toContain('login-frame');
      } else {
        throw new Error(`Snapshot failed: ${snapshotResult.error}`);
      }
    }, 30000);

    it('should get correct snapshot from outer-iframe URL directly', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', OUTER_IFRAME_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 1000));

      const snapshotResult = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        console.log('\n=== Outer iframe URL Direct Snapshot ===');
        console.log(data.snapshot);
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('外层 iframe');
        expect(data.snapshot).toContain('iframe');
        expect(data.snapshot).not.toContain('iframe嵌套演示');
      } else {
        throw new Error(`Snapshot failed: ${snapshotResult.error}`);
      }
    }, 30000);

    it('should get correct snapshot from login-frame URL directly', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', LOGIN_FRAME_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 1000));

      const snapshotResult = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        console.log('\n=== Login frame URL Direct Snapshot ===');
        console.log(data.snapshot);
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('内层 iframe');
        expect(data.snapshot).toContain('textbox "用户名');
        expect(data.snapshot).toContain('textbox "密码');
        expect(data.snapshot).toContain('button "登录"');
        expect(data.snapshot).not.toContain('外层 iframe');
        expect(data.snapshot).not.toContain('iframe嵌套演示');
      } else {
        throw new Error(`Snapshot failed: ${snapshotResult.error}`);
      }
    }, 30000);
  });

  describe('通过 --in-frame 访问嵌套 iframe', () => {
    it('should get correct snapshot from outer-iframe via --in-frame', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        console.log('\n=== Outer iframe via --in-frame ===');
        console.log(data.snapshot);
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('外层 iframe');
        expect(data.snapshot).not.toContain('iframe嵌套演示');
      } else {
        throw new Error(`Snapshot with --in-frame failed: ${snapshotResult.error}`);
      }
    }, 30000);

    it('should get correct snapshot from login-frame via --in-frame path', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string };
        console.log('\n=== Login frame via --in-frame path ===');
        console.log(data.snapshot);
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('内层 iframe');
        expect(data.snapshot).toContain('textbox "用户名');
        expect(data.snapshot).toContain('textbox "密码');
        expect(data.snapshot).toContain('button "登录"');
        expect(data.snapshot).not.toContain('外层 iframe');
        expect(data.snapshot).not.toContain('iframe嵌套演示');
      } else {
        throw new Error(`Snapshot with --in-frame path failed: ${snapshotResult.error}`);
      }
    }, 30000);
  });

  describe('交叉验证：--in-frame 与直接访问 URL 结果一致', () => {
    it('outer-iframe: --in-frame result should match direct URL access', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const inFrameSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe']),
        browser
      );
      expect(inFrameSnapshot.success).toBe(true);
      if (!isSuccessResponse(inFrameSnapshot)) {
        throw new Error(`--in-frame snapshot failed: ${inFrameSnapshot.error}`);
      }

      const directOpenResult = await executeCommand(
        parseCliArgs(['open', OUTER_IFRAME_URL]),
        browser
      );
      expect(directOpenResult.success).toBe(true);
      if (!isSuccessResponse(directOpenResult)) {
        throw new Error('Direct open failed');
      }

      await new Promise((r) => setTimeout(r, 1000));

      const directSnapshot = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(directSnapshot.success).toBe(true);
      if (!isSuccessResponse(directSnapshot)) {
        throw new Error(`Direct snapshot failed: ${directSnapshot.error}`);
      }

      const inFrameData = inFrameSnapshot.data as { snapshot?: string };
      const directData = directSnapshot.data as { snapshot?: string };

      console.log('\n=== Outer iframe via --in-frame ===');
      console.log(inFrameData.snapshot);
      console.log('\n=== Outer iframe via direct URL ===');
      console.log(directData.snapshot);

      expect(inFrameData.snapshot).toContain('外层 iframe');
      expect(directData.snapshot).toContain('外层 iframe');

      expect(inFrameData.snapshot).not.toContain('iframe嵌套演示');
      expect(directData.snapshot).not.toContain('iframe嵌套演示');

      expect(stripSnapshotHeader(inFrameData.snapshot!)).toBe(
        stripSnapshotHeader(directData.snapshot!)
      );
    }, 30000);

    it('login-frame: --in-frame result should match direct URL access', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const inFrameSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(inFrameSnapshot.success).toBe(true);
      if (!isSuccessResponse(inFrameSnapshot)) {
        throw new Error(`--in-frame snapshot failed: ${inFrameSnapshot.error}`);
      }

      const directOpenResult = await executeCommand(
        parseCliArgs(['open', LOGIN_FRAME_URL]),
        browser
      );
      expect(directOpenResult.success).toBe(true);
      if (!isSuccessResponse(directOpenResult)) {
        throw new Error('Direct open failed');
      }

      await new Promise((r) => setTimeout(r, 1000));

      const directSnapshot = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(directSnapshot.success).toBe(true);
      if (!isSuccessResponse(directSnapshot)) {
        throw new Error(`Direct snapshot failed: ${directSnapshot.error}`);
      }

      const inFrameData = inFrameSnapshot.data as { snapshot?: string };
      const directData = directSnapshot.data as { snapshot?: string };

      console.log('\n=== Login frame via --in-frame ===');
      console.log(inFrameData.snapshot);
      console.log('\n=== Login frame via direct URL ===');
      console.log(directData.snapshot);

      expect(inFrameData.snapshot).toContain('内层 iframe');
      expect(directData.snapshot).toContain('内层 iframe');

      expect(inFrameData.snapshot).toContain('textbox "用户名');
      expect(directData.snapshot).toContain('textbox "用户名');

      expect(inFrameData.snapshot).toContain('button "登录"');
      expect(directData.snapshot).toContain('button "登录"');

      expect(inFrameData.snapshot).not.toContain('外层 iframe');
      expect(directData.snapshot).not.toContain('外层 iframe');

      expect(stripSnapshotHeader(inFrameData.snapshot!)).toBe(
        stripSnapshotHeader(directData.snapshot!)
      );
    }, 30000);
  });

  describe('--in-frame 选择器格式验证', () => {
    it('should return error when frame name is wrong', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      // Test with wrong frame name
      const wrongNameSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'wrong-frame-name']),
        browser
      );

      console.log('\n=== Wrong frame name result ===');
      console.log('success:', wrongNameSnapshot.success);

      expect(wrongNameSnapshot.success).toBe(false);
      if (wrongNameSnapshot.success === false) {
        console.log('error:', wrongNameSnapshot.error);
        expect(wrongNameSnapshot.error).toBeDefined();
        expect(wrongNameSnapshot.error).toContain('Frame not found');
      }
    }, 30000);

    it('should return error when nested frame path is wrong', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      // Test with wrong nested frame path
      const wrongPathSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe/wrong-login-frame']),
        browser
      );

      console.log('\n=== Wrong nested frame path result ===');
      console.log('success:', wrongPathSnapshot.success);

      expect(wrongPathSnapshot.success).toBe(false);
      if (wrongPathSnapshot.success === false) {
        console.log('error:', wrongPathSnapshot.error);
        expect(wrongPathSnapshot.error).toBeDefined();
        expect(wrongPathSnapshot.error).toContain('Frame not found');
      }
    }, 30000);

    it('should work with both #outer-iframe and outer-iframe selectors', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      // Test with # prefix
      const hashSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#outer-iframe']),
        browser
      );
      expect(hashSnapshot.success).toBe(true);
      if (!isSuccessResponse(hashSnapshot)) {
        throw new Error(`--in-frame with # failed: ${hashSnapshot.error}`);
      }

      // Test without # prefix
      const noHashSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe']),
        browser
      );
      expect(noHashSnapshot.success).toBe(true);
      if (!isSuccessResponse(noHashSnapshot)) {
        throw new Error(`--in-frame without # failed: ${noHashSnapshot.error}`);
      }

      const hashData = hashSnapshot.data as { snapshot?: string };
      const noHashData = noHashSnapshot.data as { snapshot?: string };

      console.log('\n=== Snapshot with #outer-iframe ===');
      console.log(hashData.snapshot);
      console.log('\n=== Snapshot with outer-iframe ===');
      console.log(noHashData.snapshot);

      // Both should contain the same content
      expect(hashData.snapshot).toContain('外层 iframe');
      expect(noHashData.snapshot).toContain('外层 iframe');

      // Both should produce identical results
      expect(stripSnapshotHeader(hashData.snapshot!)).toBe(
        stripSnapshotHeader(noHashData.snapshot!)
      );
    }, 30000);

    it('should work with both #outer-iframe/login-frame and outer-iframe/login-frame paths', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      // Test with # prefix in path
      const hashSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#outer-iframe/#login-frame']),
        browser
      );
      expect(hashSnapshot.success).toBe(true);
      if (!isSuccessResponse(hashSnapshot)) {
        throw new Error(`--in-frame with # in path failed: ${hashSnapshot.error}`);
      }

      // Test without # prefix in path
      const noHashSnapshot = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(noHashSnapshot.success).toBe(true);
      if (!isSuccessResponse(noHashSnapshot)) {
        throw new Error(`--in-frame without # in path failed: ${noHashSnapshot.error}`);
      }

      const hashData = hashSnapshot.data as { snapshot?: string };
      const noHashData = noHashSnapshot.data as { snapshot?: string };

      console.log('\n=== Snapshot with #outer-iframe/#login-frame ===');
      console.log(hashData.snapshot);
      console.log('\n=== Snapshot with outer-iframe/login-frame ===');
      console.log(noHashData.snapshot);

      // Both should contain the same content
      expect(hashData.snapshot).toContain('内层 iframe');
      expect(noHashData.snapshot).toContain('内层 iframe');
      expect(hashData.snapshot).toContain('textbox "用户名');
      expect(noHashData.snapshot).toContain('textbox "用户名');

      // Both should produce identical results
      expect(stripSnapshotHeader(hashData.snapshot!)).toBe(
        stripSnapshotHeader(noHashData.snapshot!)
      );
    }, 30000);
  });

  describe('表单操作验证', () => {
    it('should fill form in nested login-frame', async () => {
      const openResult = await executeCommand(parseCliArgs(['open', MAIN_PAGE_URL]), browser);
      expect(openResult.success).toBe(true);
      if (!isSuccessResponse(openResult)) {
        throw new Error('Open failed');
      }

      await new Promise((r) => setTimeout(r, 2000));

      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#username', 'testuser', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(fillResult.success).toBe(true);
      if (!isSuccessResponse(fillResult)) {
        throw new Error(`Fill username failed: ${fillResult.error}`);
      }

      const fillPwdResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#password',
          'testpass123',
          '--in-frame',
          'outer-iframe/login-frame',
        ]),
        browser
      );
      expect(fillPwdResult.success).toBe(true);
      if (!isSuccessResponse(fillPwdResult)) {
        throw new Error(`Fill password failed: ${fillPwdResult.error}`);
      }

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#username', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        const data = valueResult.data as { value?: string };
        console.log('\n=== Username value ===');
        console.log(data.value);
        expect(data.value).toBe('testuser');
      } else {
        throw new Error(`Get username value failed: ${valueResult.error}`);
      }

      const pwdValueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#password', '--in-frame', 'outer-iframe/login-frame']),
        browser
      );
      expect(pwdValueResult.success).toBe(true);
      if (isSuccessResponse(pwdValueResult)) {
        const data = pwdValueResult.data as { value?: string };
        console.log('\n=== Password value ===');
        console.log(data.value);
        expect(data.value).toBe('testpass123');
      } else {
        throw new Error(`Get password value failed: ${pwdValueResult.error}`);
      }
    }, 30000);
  });
});
