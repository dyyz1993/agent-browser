import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
  FillCommand,
  CheckCommand,
  UncheckCommand,
  UploadCommand,
  DoubleClickCommand,
  FocusCommand,
  DragCommand,
  GetByRoleCommand,
  GetByTextCommand,
  GetByLabelCommand,
  GetByPlaceholderCommand,
} from '../types.js';
import { successResponse } from '../protocol.js';
import { performDiff } from '../diff.js';
import { humanClick, humanType } from '../human-mouse.js';
import type { HumanConfig } from '../human-mouse.js';
import { assertElementExists, toAIFriendlyError } from './utils.js';

export async function handleFill(command: FillCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig);
        await locator.focus();
        await page.mouse.click(targetX, targetY, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await humanType(page, command.value, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { filled: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    browser.recordCommand('fill', command.selector, command.value, true);
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.fill(command.value);
      if (!isRef) {
        const page = browser.getPage();
        if (page) {
          await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, command.selector);
        }
      }
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { filled: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  browser.recordCommand('fill', command.selector, command.value, true);
  return successResponse(command.id, result);
}

export async function handleCheck(
  command: CheckCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.check();
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { checked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  browser.recordCommand('check', command.selector, undefined, true);
  return successResponse(command.id, result);
}

export async function handleUncheck(
  command: UncheckCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.uncheck();
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { unchecked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  browser.recordCommand('uncheck', command.selector, undefined, true);
  return successResponse(command.id, result);
}

export async function handleUpload(
  command: UploadCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  const files = Array.isArray(command.files) ? command.files : [command.files];
  try {
    await locator.setInputFiles(files);
  } catch (error) {
    throw toAIFriendlyError(error, command.selector);
  }
  return successResponse(command.id, { uploaded: files });
}

export async function handleDoubleClick(
  command: DoubleClickCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig, {
          clickCount: 2,
        });
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { clicked: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.dblclick();
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { clicked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

export async function handleFocus(
  command: FocusCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.focus({ timeout: 5000 });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { focused: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

export async function handleDrag(command: DragCommand, browser: BrowserManager): Promise<Response> {
  const sourceLocator = browser.getLocator(command.source, command.inFrame);
  const targetLocator = browser.getLocator(command.target, command.inFrame);

  const isSourceRef = browser.isRef(command.source);
  const isTargetRef = browser.isRef(command.target);
  await assertElementExists(sourceLocator, command.source, isSourceRef);
  await assertElementExists(targetLocator, command.target, isTargetRef);

  await sourceLocator.dragTo(targetLocator);
  return successResponse(command.id, { dragged: true });
}

export async function handleGetByRole(
  command: GetByRoleCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByRole(command.role as Parameters<typeof frame.getByRole>[0], {
    name: command.name,
    exact: command.exact,
  });

  try {
    switch (command.subaction) {
      case 'click':
        await locator.click();
        return successResponse(command.id, { clicked: true });
      case 'fill':
        await locator.fill(command.value ?? '');
        return successResponse(command.id, { filled: true });
      case 'check':
        await locator.check();
        return successResponse(command.id, { checked: true });
      case 'hover':
        await locator.hover();
        return successResponse(command.id, { hovered: true });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('strict mode violation')) {
      const countMatch = msg.match(/resolved to (\d+) elements/);
      const count = countMatch ? countMatch[1] : 'multiple';
      const first = locator.first();
      const warning = `Matched ${count} elements, used first match. Use 'find nth <index> role "${command.role}" --click' for a specific match.`;
      switch (command.subaction) {
        case 'click':
          await first.click();
          return successResponse(command.id, { clicked: true, warning });
        case 'fill':
          await first.fill(command.value ?? '');
          return successResponse(command.id, { filled: true, warning });
        case 'check':
          await first.check();
          return successResponse(command.id, { checked: true, warning });
        case 'hover':
          await first.hover();
          return successResponse(command.id, { hovered: true, warning });
      }
    }
    throw error;
  }
  return successResponse(command.id, {});
}

export async function handleGetByText(
  command: GetByTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByText(command.text, { exact: command.exact });

  try {
    switch (command.subaction) {
      case 'click':
        await locator.click();
        return successResponse(command.id, { clicked: true });
      case 'hover':
        await locator.hover();
        return successResponse(command.id, { hovered: true });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('strict mode violation')) {
      const countMatch = msg.match(/resolved to (\d+) elements/);
      const count = countMatch ? countMatch[1] : 'multiple';
      const first = locator.first();
      switch (command.subaction) {
        case 'click':
          await first.click();
          return successResponse(command.id, {
            clicked: true,
            warning: `Matched ${count} elements, used first match. Use 'find nth <index> text "${command.text}" --click' for a specific match.`,
          });
        case 'hover':
          await first.hover();
          return successResponse(command.id, {
            hovered: true,
            warning: `Matched ${count} elements, used first match. Use 'find nth <index> text "${command.text}" --hover' for a specific match.`,
          });
      }
    }
    throw error;
  }
  return successResponse(command.id, {});
}

export async function handleGetByLabel(
  command: GetByLabelCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByLabel(command.label, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
  }
}

export async function handleGetByPlaceholder(
  command: GetByPlaceholderCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByPlaceholder(command.placeholder, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
  }
}
