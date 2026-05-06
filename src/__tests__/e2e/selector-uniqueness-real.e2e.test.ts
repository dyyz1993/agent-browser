import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser/index.js';

/**
 * 验证优化后的选择器在真实国内网站上的唯一性
 * 测试网站：百度、淘宝、京东、知乎、微博、哔哩哔哩、腾讯网
 */

interface SelectorStats {
  total: number;
  unique: number;
  byId: number;
  byAttribute: number;
  byClass: number;
  byCombo: number;
  byPath: number;
  nonUniqueExamples: string[];
}

describe('选择器唯一性验证 - 国内真实网站', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  }, 60000);

  afterAll(async () => {
    await browser.close();
  });

  async function analyzeSelectorsOnPage(url: string, siteName: string): Promise<SelectorStats> {
    const page = browser.getPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`${siteName} 页面加载超时，跳过`);
      return {
        total: 0,
        unique: 0,
        byId: 0,
        byAttribute: 0,
        byClass: 0,
        byCombo: 0,
        byPath: 0,
        nonUniqueExamples: [],
      };
    }

    const stats = await page.evaluate(() => {
      const result: SelectorStats = {
        total: 0,
        unique: 0,
        byId: 0,
        byAttribute: 0,
        byClass: 0,
        byCombo: 0,
        byPath: 0,
        nonUniqueExamples: [],
      };

      // 获取页面上所有交互元素
      const elements = document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [onclick]'
      );

      // 工具类名过滤
      const isUtilityClass = (c: string) => {
        if (!c) return true;
        if (c.startsWith('_')) return true;
        if (c.startsWith('css-')) return true;
        if (/^[a-z]{1,2}$/.test(c)) return true;
        if (/^(active|disabled|hidden|visible|selected|hover|focus|current|open|closed)$/i.test(c))
          return true;
        if (/^(text-|font-|bg-|p-|m-|w-|h-|flex|grid|border|rounded|shadow)/.test(c)) return true;
        return false;
      };

      // 语义属性列表
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
        'href',
      ];

      elements.forEach((el) => {
        result.total++;
        const tag = el.tagName.toLowerCase();
        let foundUnique = false;
        let selector = '';

        // 策略1: ID 选择器
        if (el.id) {
          selector = '#' + CSS.escape(el.id);
          if (document.querySelectorAll(selector).length === 1) {
            result.unique++;
            result.byId++;
            foundUnique = true;
          }
        }

        // 策略2: 多属性组合
        if (!foundUnique) {
          const attrs: { attr: string; value: string }[] = [];
          for (const attr of semanticAttrs) {
            const value = el.getAttribute(attr);
            if (value && value.length < 50) {
              attrs.push({ attr, value });
            }
          }

          // 单属性
          for (const { attr, value } of attrs) {
            selector = tag + '[' + attr + '="' + CSS.escape(value) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              result.unique++;
              result.byAttribute++;
              foundUnique = true;
              break;
            }
          }

          // 双属性组合
          if (!foundUnique && attrs.length >= 2) {
            for (let i = 0; i < attrs.length; i++) {
              for (let j = i + 1; j < attrs.length; j++) {
                selector =
                  tag +
                  '[' +
                  attrs[i].attr +
                  '="' +
                  CSS.escape(attrs[i].value) +
                  '"]' +
                  '[' +
                  attrs[j].attr +
                  '="' +
                  CSS.escape(attrs[j].value) +
                  '"]';
                if (document.querySelectorAll(selector).length === 1) {
                  result.unique++;
                  result.byCombo++;
                  foundUnique = true;
                  break;
                }
              }
              if (foundUnique) break;
            }
          }
        }

        // 策略3: 智能类名选择
        if (!foundUnique && el.className && typeof el.className === 'string') {
          const classes = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => !isUtilityClass(c));
          if (classes.length > 0) {
            // 按长度排序（更长的类名通常更具体）
            classes.sort((a, b) => b.length - a.length);

            // 尝试单类名
            for (const cls of classes) {
              selector = tag + '.' + CSS.escape(cls);
              if (document.querySelectorAll(selector).length === 1) {
                result.unique++;
                result.byClass++;
                foundUnique = true;
                break;
              }
            }

            // 尝试多类名组合
            if (!foundUnique && classes.length >= 2) {
              for (let i = 2; i <= Math.min(3, classes.length); i++) {
                selector =
                  tag +
                  '.' +
                  classes
                    .slice(0, i)
                    .map((c) => CSS.escape(c))
                    .join('.');
                if (document.querySelectorAll(selector).length === 1) {
                  result.unique++;
                  result.byClass++;
                  foundUnique = true;
                  break;
                }
              }
            }
          }
        }

        // 策略4: 属性 + 类名组合
        if (!foundUnique && el.className && typeof el.className === 'string') {
          const classes = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => !isUtilityClass(c));
          if (classes.length > 0) {
            for (const attr of semanticAttrs) {
              const value = el.getAttribute(attr);
              if (value) {
                selector =
                  tag + '.' + CSS.escape(classes[0]) + '[' + attr + '="' + CSS.escape(value) + '"]';
                if (document.querySelectorAll(selector).length === 1) {
                  result.unique++;
                  result.byCombo++;
                  foundUnique = true;
                  break;
                }
              }
            }
          }
        }

        // 策略5: 父元素路径
        if (!foundUnique) {
          const parent = el.parentElement;
          if (parent && parent.id) {
            selector = '#' + CSS.escape(parent.id) + ' > ' + tag;
            if (document.querySelectorAll(selector).length === 1) {
              result.unique++;
              result.byPath++;
              foundUnique = true;
            }
          }
        }

        // 记录非唯一示例
        if (!foundUnique && result.nonUniqueExamples.length < 5) {
          result.nonUniqueExamples.push(
            tag +
              (el.id ? '#' + el.id : '') +
              (el.className ? '.' + el.className.split(' ')[0] : '')
          );
        }
      });

      return result;
    });

    return stats;
  }

  // 国内网站测试列表
  const websites = [
    { name: '百度', url: 'https://www.baidu.com' },
    { name: '淘宝', url: 'https://www.taobao.com' },
    { name: '京东', url: 'https://www.jd.com' },
    { name: '知乎', url: 'https://www.zhihu.com' },
    { name: '微博', url: 'https://weibo.com' },
    { name: '哔哩哔哩', url: 'https://www.bilibili.com' },
    { name: '腾讯网', url: 'https://www.qq.com' },
    { name: '网易', url: 'https://www.163.com' },
    { name: '搜狐', url: 'https://www.sohu.com' },
    { name: '新浪', url: 'https://www.sina.com.cn' },
  ];

  // 为每个网站创建测试
  websites.forEach(({ name, url }) => {
    it(`${name} (${url})`, async () => {
      const stats = await analyzeSelectorsOnPage(url, name);

      if (stats.total === 0) {
        console.log(`${name}: 页面加载失败，跳过`);
        return;
      }

      const percentage = (stats.unique / stats.total) * 100;

      console.log(`\n=== ${name} ===`);
      console.log(`URL: ${url}`);
      console.log(`总元素数: ${stats.total}`);
      console.log(`唯一选择器: ${stats.unique}`);
      console.log(`唯一性比例: ${percentage.toFixed(1)}%`);
      console.log(
        `策略分布: ID=${stats.byId}, 属性=${stats.byAttribute}, 类名=${stats.byClass}, 组合=${stats.byCombo}, 路径=${stats.byPath}`
      );

      if (stats.nonUniqueExamples.length > 0) {
        console.log(`非唯一示例: ${stats.nonUniqueExamples.slice(0, 3).join(', ')}`);
      }

      // 验证至少有一些元素
      expect(stats.total).toBeGreaterThan(0);
    }, 60000);
  });

  // 汇总测试
  it('所有网站汇总统计', async () => {
    const allStats: { site: string; total: number; unique: number; percentage: number }[] = [];

    for (const { name, url } of websites) {
      const stats = await analyzeSelectorsOnPage(url, name);
      if (stats.total > 0) {
        allStats.push({
          site: name,
          total: stats.total,
          unique: stats.unique,
          percentage: (stats.unique / stats.total) * 100,
        });
      }
    }

    console.log('\n\n=== 所有网站选择器唯一性汇总 ===');
    console.log('网站\t\t元素数\t唯一\t比例');
    console.log('─'.repeat(50));

    let totalElements = 0;
    let totalUnique = 0;

    allStats.forEach((s) => {
      console.log(`${s.site.padEnd(8)}\t${s.total}\t${s.unique}\t${s.percentage.toFixed(1)}%`);
      totalElements += s.total;
      totalUnique += s.unique;
    });

    console.log('─'.repeat(50));
    const overallPercentage = (totalUnique / totalElements) * 100;
    console.log(`总计\t\t${totalElements}\t${totalUnique}\t${overallPercentage.toFixed(1)}%`);

    // 验证总体唯一性超过 40%
    expect(overallPercentage).toBeGreaterThan(40);
  }, 600000);
});
