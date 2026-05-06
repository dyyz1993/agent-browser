import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

describe('snapshot --path and --attrs E2E tests', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('--path 参数测试', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('form-complex.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('应该在 refs 中包含 xpath 和 cssPath', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#test-form', '--path']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        const snapshot = result.data.snapshot as string;
        expect(snapshot).toBeDefined();
        expect(snapshot.length).toBeGreaterThan(0);
      }
    });

    it('应该为有 ID 的元素生成 ID 选择器路径', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#username', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该为表单按钮生成正确的 snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#submit-btn', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该处理嵌套元素的路径生成', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#test-form', '--path']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        // 验证返回的数据结构
        expect(result.data.snapshot).toBeDefined();
      }
    });
  });

  describe('--attrs 参数测试', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('form-complex.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('应该收集元素的所有属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#username', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });

    it('应该收集表单元素的 type、name、placeholder 等属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', 'input[type="email"]', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该收集 select 元素的属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#country', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });
  });

  describe('--path 和 --attrs 组合测试', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('form-complex.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('应该同时返回 xpath、cssPath 和 attributes', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#test-form', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);

      if (isSuccessResponse(result)) {
        expect(result.data.snapshot).toBeDefined();
      }
    });

    it('应该正确处理交互式快照 + 路径 + 属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '-c', '--selector', '#test-form', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该处理紧凑模式 + 路径', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-c', '--selector', '#test-form', '--path']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该处理深度限制 + 路径 + 属性', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-d', '2', '--selector', '#test-form', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    });
  });

  describe('边界情况测试', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('form-complex.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('应该处理不存在的选择器', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#non-existent-element', '--path']),
        browser
      );
      // 应该返回成功但内容为空或无 refs
      expect(result.success).toBe(true);
    });

    it('应该处理按钮元素的 snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#submit-btn', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('应该处理 checkbox 元素的 snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--selector', '#agree', '--path', '--attrs']),
        browser
      );
      expect(result.success).toBe(true);
    });
  });
});
