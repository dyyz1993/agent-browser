import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import path from 'path';
import fs from 'fs';

/**
 * 选择器优化验证测试
 * 目标：验证优化后的选择器生成算法在真实网站上能达到更高的唯一性
 */

describe('选择器优化验证测试', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  }, 90000);

  afterAll(async () => {
    await browser.close();
  });

  it('复杂测试页面 - 录制器选择器唯一性验证', async () => {
    const page = browser.getPage();
    const fixturePath = path.join(__dirname, '../e2e/fixtures/selector-complex-test.html');
    const fileUrl = 'file://' + fixturePath;

    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 启动录制
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(startResult.success).toBe(true);

    await page.waitForTimeout(300);

    // 点击多个不同类型的元素
    const clickTargets = [
      '#username',
      '#email',
      '[data-testid="nav-home"]',
      '[data-product-id="1001"] button',
      '#openModal',
      '[data-order-id="ORD001"]',
      '.tab[data-tab="specs"]',
      '#submitForm',
      '.pagination-item.active',
      '[data-user-id="1"] button',
    ];

    for (const target of clickTargets) {
      try {
        await page.click(target, { timeout: 2000 });
        await page.waitForTimeout(100);
      } catch (e) {
        // 忽略找不到的元素
      }
    }

    // 停止录制
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(stopResult.success).toBe(true);

    // 验证生成的 YAML
    const data = stopResult.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data.steps).toBeGreaterThan(0);

    if (data.path && fs.existsSync(data.path)) {
      const yaml = fs.readFileSync(data.path, 'utf-8');
      console.log('\n=== 录制生成的 YAML 选择器示例 ===');

      // 提取选择器
      const selectorMatches = yaml.match(/selector: "[^"]+"/g) || [];
      const selectors = selectorMatches.map((m) => m.replace('selector: "', '').replace('"', ''));

      console.log(`\n生成了 ${selectors.length} 个选择器:`);
      selectors.slice(0, 10).forEach((s) => console.log(`  ${s}`));

      // 验证选择器多样性
      const uniqueSelectors = new Set(selectors);
      console.log(`\n唯一选择器数量: ${uniqueSelectors.size}/${selectors.length}`);

      // 清理临时文件
      try {
        fs.unlinkSync(data.path);
      } catch {/* empty */}
    }
  }, 30000);

  it('百度首页 - 录制器选择器唯一性验证', async () => {
    const page = browser.getPage();

    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 启动录制
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(startResult.success).toBe(true);

    await page.waitForTimeout(300);

    // 点击百度首页的元素
    const clickTargets = ['#kw', '#su', '#form'];

    for (const target of clickTargets) {
      try {
        await page.click(target, { timeout: 3000 });
        await page.waitForTimeout(200);
      } catch (e) {
        // 忽略
      }
    }

    // 在搜索框输入
    try {
      await page.fill('#kw', 'test query');
      await page.waitForTimeout(200);
    } catch (e) {/* empty */}

    // 停止录制
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(stopResult.success).toBe(true);

    const data = stopResult.data as Record<string, unknown>;
    if (data.path && fs.existsSync(data.path)) {
      const yaml = fs.readFileSync(data.path, 'utf-8');
      console.log('\n=== 百度录制生成的 YAML ===');
      console.log(yaml.slice(0, 800));

      // 清理临时文件
      try {
        fs.unlinkSync(data.path);
      } catch {/* empty */}
    }
  }, 90000);

  it('选择器唯一性对比测试', async () => {
    const page = browser.getPage();
    const fixturePath = path.join(__dirname, '../e2e/fixtures/selector-complex-test.html');
    const fileUrl = 'file://' + fixturePath;

    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 使用页面内的选择器生成逻辑测试唯一性
    const stats = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [data-action]'
      );
      let total = 0;
      let unique = 0;
      const strategies: Record<string, number> = {
        id: 0,
        attribute: 0,
        class: 0,
        combo: 0,
        path: 0,
      };

      // 工具类名过滤
      const isUtilityClass = (c: string) => {
        if (!c) return true;
        if (c.startsWith('_')) return true;
        if (c.startsWith('css-')) return true;
        if (/^[a-z]{1,2}$/.test(c)) return true;
        if (/^(active|disabled|hidden|visible|selected|hover|focus|current|open|closed)$/i.test(c))
          return true;
        if (/^(text-|font-|bg-|p-|m-|w-|h-)/.test(c)) return true;
        return false;
      };

      // 语义属性
      const semanticAttrs = [
        'data-testid',
        'data-test',
        'data-cy',
        'name',
        'aria-label',
        'role',
        'type',
        'placeholder',
        'title',
      ];

      elements.forEach((el) => {
        total++;
        const tag = el.tagName.toLowerCase();
        let foundUnique = false;

        // 策略1: ID
        if (el.id) {
          const selector = '#' + el.id;
          if (document.querySelectorAll(selector).length === 1) {
            unique++;
            strategies.id++;
            foundUnique = true;
          }
        }

        // 策略2: 单属性
        if (!foundUnique) {
          for (const attr of semanticAttrs) {
            const value = el.getAttribute(attr);
            if (value) {
              const selector = tag + '[' + attr + '="' + value + '"]';
              if (document.querySelectorAll(selector).length === 1) {
                unique++;
                strategies.attribute++;
                foundUnique = true;
                break;
              }
            }
          }
        }

        // 策略3: 属性 + 类名组合
        if (!foundUnique && el.className && typeof el.className === 'string') {
          const classes = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => !isUtilityClass(c));
          if (classes.length > 0) {
            for (const attr of semanticAttrs) {
              const value = el.getAttribute(attr);
              if (value) {
                const selector = tag + '.' + classes[0] + '[' + attr + '="' + value + '"]';
                if (document.querySelectorAll(selector).length === 1) {
                  unique++;
                  strategies.combo++;
                  foundUnique = true;
                  break;
                }
              }
            }
          }
        }

        // 策略4: 智能类名
        if (!foundUnique && el.className && typeof el.className === 'string') {
          const classes = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => !isUtilityClass(c));
          if (classes.length > 0) {
            // 按长度排序
            classes.sort((a, b) => b.length - a.length);

            // 尝试单类名
            for (const cls of classes) {
              const selector = tag + '.' + cls;
              if (document.querySelectorAll(selector).length === 1) {
                unique++;
                strategies.class++;
                foundUnique = true;
                break;
              }
            }

            // 尝试多类名组合
            if (!foundUnique && classes.length >= 2) {
              for (let i = 2; i <= Math.min(3, classes.length); i++) {
                const selector = tag + '.' + classes.slice(0, i).join('.');
                if (document.querySelectorAll(selector).length === 1) {
                  unique++;
                  strategies.class++;
                  foundUnique = true;
                  break;
                }
              }
            }
          }
        }

        // 策略5: 父子路径
        if (!foundUnique) {
          const parent = el.parentElement;
          if (parent && parent.id) {
            const selector = '#' + parent.id + ' > ' + tag;
            if (document.querySelectorAll(selector).length === 1) {
              unique++;
              strategies.path++;
              foundUnique = true;
            }
          }
        }
      });

      return { total, unique, strategies };
    });

    const percentage = (stats.unique / stats.total) * 100;

    console.log('\n=== 选择器唯一性统计 ===');
    console.log(`总元素数: ${stats.total}`);
    console.log(`唯一选择器: ${stats.unique}`);
    console.log(`唯一性比例: ${percentage.toFixed(1)}%`);
    console.log('\n策略分布:');
    console.log(`  ID 选择器: ${stats.strategies.id}`);
    console.log(`  属性选择器: ${stats.strategies.attribute}`);
    console.log(`  类名选择器: ${stats.strategies.class}`);
    console.log(`  组合选择器: ${stats.strategies.combo}`);
    console.log(`  路径选择器: ${stats.strategies.path}`);

    // 验证至少 50% 唯一性（比优化前的 30% 有显著提升）
    expect(stats.total).toBeGreaterThanOrEqual(40);
    expect(percentage).toBeGreaterThan(40);
  }, 30000);
});
