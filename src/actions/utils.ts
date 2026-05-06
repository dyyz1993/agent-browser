import type { Locator } from 'playwright-core';

export interface SnapshotData {
  snapshot: string;
  refs?: Record<string, { role: string; name?: string }>;
}

export async function assertElementExists(
  locator: Locator,
  selector: string,
  isRef: boolean
): Promise<void> {
  const count = await locator.count();
  if (count === 0) {
    if (isRef) {
      throw new Error(
        `Element ref "${selector}" not found. ` + `Run 'snapshot' to get updated element refs.`
      );
    } else {
      throw new Error(
        `No element matches selector "${selector}". ` + `Run 'snapshot' to see available elements.`
      );
    }
  }
}

export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('strict mode violation')) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';

    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run 'snapshot' to get updated refs, or use a more specific CSS selector. ` +
        `Tip: Use 'find nth <index> ${selector} --click' to target a specific match.`
    );
  }

  if (message.includes('intercepts pointer events')) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal or overlay). ` +
        `Try dismissing any modals/cookie banners first. ` +
        `Tip: Run 'snapshot -i' to see all visible elements and identify what's blocking.`
    );
  }

  if (message.includes('not visible') && !message.includes('Timeout')) {
    return new Error(
      `Element "${selector}" is not visible. ` +
        `Try 'scrollintoview ${selector}' or check if it's hidden. ` +
        `Tip: Run 'is visible ${selector}' to confirm visibility state.`
    );
  }

  if (message.includes('Timeout') && message.includes('exceeded')) {
    return new Error(
      `Action on "${selector}" timed out. The element may be blocked, still loading, or not interactable. ` +
        `Run 'snapshot' to check the current page state. ` +
        `Tip: If the page is still loading, try 'wait --load networkidle' first.`
    );
  }

  if (
    message.includes('waiting for') &&
    (message.includes('to be visible') || message.includes('Timeout'))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run 'snapshot -i' to see current page elements and their refs. ` +
        `Tip: If using @ref, the page may have changed. Re-run 'snapshot -i' to get fresh refs.`
    );
  }

  if (message.includes('Execution context was destroyed') || message.includes('Target closed')) {
    return new Error(
      `Browser context was lost (page navigated or closed). ` +
        `Re-open the page with 'open <url>' and start fresh. ` +
        `Tip: This usually happens after a form submission triggers navigation.`
    );
  }

  if (message.includes('querySelector') || message.includes('is not a valid selector')) {
    return new Error(
      `Invalid selector "${selector}". ` +
        `CSS selectors like '#id', '.class', or 'tag' are supported. ` +
        `Tip: Use 'snapshot -i' to get @ref selectors (e.g., @e1) that are always valid.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}
