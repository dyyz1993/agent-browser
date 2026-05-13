import type { BrowserManager } from '../browser/index.js';

export async function getElementBox(
  browser: BrowserManager,
  selector: string
): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
  try {
    const page = browser.getPage();
    if (!page) {
      return undefined;
    }
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }, selector);
    return box ?? undefined;
  } catch {
    return undefined;
  }
}
