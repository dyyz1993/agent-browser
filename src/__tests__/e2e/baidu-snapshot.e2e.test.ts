import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { isSuccessResponse } from '../../types.js';

/**
 * 百度页面 snapshot --path 和 --attrs 验证测试
 *
 * 注意：这些测试需要网络连接，可能因为网络问题或反爬机制而失败
 * 如果测试不稳定，可以使用 it.skip 跳过
 */
describe('百度页面 snapshot --path 和 --attrs 验证', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  describe('百度首页测试', () => {
    beforeAll(async () => {
      // 注意：百度可能需要较长的加载时间
      const result = await executeCommand(parseCliArgs(['open', 'https://www.baidu.com']), browser);
      expect(result.success).toBe(true);

      // 等待页面加载
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }, 30000);

    it('应该成功获取搜索框的 snapshot（带 --path）', async () => {
      // 百度搜索框通常有 id="kw"
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#kw', '--path']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });

    it('应该成功获取搜索按钮的 snapshot（带 --attrs）', async () => {
      // 百度搜索按钮通常有 id="su"
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#su', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });

    it('应该成功获取表单区域的完整 snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selector', '#form', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });

    it('应该成功获取页面主体内容', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#wrapper', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    });
  });

  describe('百度搜索结果页测试', () => {
    beforeAll(async () => {
      // 执行搜索
      await executeCommand(parseCliArgs(['fill', '#kw', 'agent-browser testing']), browser);
      await executeCommand(parseCliArgs(['click', '#su']), browser);

      // 等待搜索结果加载
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }, 90000);

    it('应该成功获取搜索结果区域的 snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selector', '#content_left', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    }, 30000);

    it('应该获取搜索结果条目的属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '.result', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    }, 30000);

    it('应该处理搜索结果的链接元素', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '.c-container a', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('边界情况测试', () => {
    it('应该处理不存在的元素', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#non-existent-baidu-element', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    });
  });
});
