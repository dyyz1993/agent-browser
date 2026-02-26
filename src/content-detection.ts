import type { Page, Frame } from 'playwright-core';

/**
 * 主体区域检测优先级
 * 优先检测语义化标签，避免返回友情链接、侧边栏等噪音
 */
const MAIN_CONTENT_SELECTORS = [
  'main', // HTML5 语义化标签
  'article', // 文章主体
  '#content', // 常见 ID
  '.content', // 常见 class
  '#main', // 常见 ID
  '[role="main"]', // ARIA role
  '.main-content', // 常见 class
  '.post-content', // 博客文章
  '.entry-content', // WordPress 等
  '.article-content',
  '#article',
  '.post',
  '.article',
];

export interface ContentDetectionResult {
  selector: string;
  isAutoDetected: boolean;
}

/**
 * 检测页面的主体内容区域
 * @param page - Playwright Page 或 Frame
 * @returns 检测结果，包含选择器和是否自动检测标记
 */
export async function detectMainContent(page: Page | Frame): Promise<ContentDetectionResult> {
  for (const selector of MAIN_CONTENT_SELECTORS) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();

      if (count > 0) {
        // 检查第一个元素是否可见
        const firstElement = locator.first();
        const isVisible = await firstElement.isVisible();

        if (isVisible) {
          // 计算区域内的大致元素数量
          const elementCount = await firstElement.locator('*').count();

          // 如果元素数量足够，认为是主体区域
          if (elementCount >= 3) {
            return {
              selector,
              isAutoDetected: true,
            };
          }
        }
      }
    } catch {
      // 忽略错误，继续检测下一个选择器
    }
  }

  // 没有检测到主体区域，返回 body
  return {
    selector: 'body',
    isAutoDetected: false,
  };
}

/**
 * Generate tips message
 * @param result - Detection result
 * @returns Tips string, or null if not applicable
 */
export function generateContentTips(result: ContentDetectionResult): string | null {
  if (result.isAutoDetected && result.selector !== 'body') {
    return `Showing ${result.selector} region. Use -s 'body' for full page`;
  }
  return null;
}
