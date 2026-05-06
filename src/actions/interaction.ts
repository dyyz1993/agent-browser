import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import { getInstanceId, getAppDir } from '../daemon.js';
import { getEnhancedSnapshot } from '../snapshot.js';
import { performDiff } from '../diff.js';
import { detectMainContent, generateContentTips } from '../content-detection.js';
import {
  humanClick,
  humanType,
  humanWander,
  humanMoveTo,
  getHumanConfigFromEnv,
} from '../human-mouse.js';
import type { HumanConfig } from '../human-mouse.js';
import { getViewerUrl } from '../rc-config.js';
import type {
  Command,
  Response,
  NavigateCommand,
  NavigateData,
  ClickCommand,
  TypeCommand,
  PressCommand,
  ScreenshotCommand,
  ScreenshotData,
  EvaluateCommand,
  WaitCommand,
  ScrollCommand,
  SelectCommand,
  HoverCommand,
  ContentCommand,
  ContentData,
} from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';
import { assertElementExists, toAIFriendlyError, type SnapshotData } from './utils.js';

export async function handleLaunch(
  command: Command & { action: 'launch' },
  browser: BrowserManager
): Promise<Response> {
  await browser.launch(command);
  const instanceId = getInstanceId();
  return successResponse(command.id, {
    launched: true,
    instanceId,
    viewerUrl: getViewerUrl(instanceId),
  });
}

export async function handleNavigate(
  command: NavigateCommand,
  browser: BrowserManager
): Promise<Response<NavigateData>> {
  const page = browser.getPage();

  if (command.headers && Object.keys(command.headers).length > 0) {
    await browser.setScopedHeaders(command.url, command.headers);
  }

  await page.goto(command.url, {
    waitUntil: command.waitUntil ?? 'domcontentloaded',
    timeout: command.timeout ?? 30000,
  });

  if (browser.isRecordingSession()) {
    await browser.injectRecorderIfNeeded();
  }

  return successResponse(command.id, {
    url: page.url(),
    title: await page.title(),
  });
}

export async function handleClick(
  command: ClickCommand,
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
          button: command.button,
          clickCount: command.clickCount,
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
    browser.recordCommand('click', command.selector, undefined, true);
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.click({
        button: command.button,
        clickCount: command.clickCount,
        delay: command.delay,
        timeout: command.timeout || 5000,
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { clicked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  browser.recordCommand('click', command.selector, undefined, true);
  return successResponse(command.id, result);
}

export async function handleType(command: TypeCommand, browser: BrowserManager): Promise<Response> {
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
        await humanType(page, command.text, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { typed: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    browser.recordCommand('type', command.selector, command.text, true);
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      if (command.clear) {
        await locator.fill('');
      }

      await locator.pressSequentially(command.text, {
        delay: command.delay,
      });

      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { typed: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  browser.recordCommand('type', command.selector, command.text, true);
  return successResponse(command.id, result);
}

export async function handlePress(
  command: PressCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  let locator = page.locator('body');

  if (command.inFrame && command.selector) {
    const frameLocator = browser.getFrame(command.inFrame);
    locator = frameLocator.locator(command.selector);
  } else if (command.selector) {
    locator = page.locator(command.selector);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    if (command.inFrame && command.selector) {
      const frameLocator = browser.getFrame(command.inFrame);
      await frameLocator.locator(command.selector).press(command.key);
    } else {
      if (command.selector) {
        await page.press(command.selector, command.key);
      } else {
        await page.keyboard.press(command.key);
      }
    }

    await page.evaluate((key) => {
      const specialKeys = [
        'Enter',
        'Tab',
        'Escape',
        'Backspace',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ];
      const keyParts = key.split('+');
      const mainKey = keyParts[keyParts.length - 1];
      const hasCtrl = keyParts.includes('Control') || keyParts.includes('Ctrl');
      const hasMeta = keyParts.includes('Meta') || keyParts.includes('Command');
      const hasAlt = keyParts.includes('Alt');
      const hasShift = keyParts.includes('Shift');

      if (specialKeys.includes(mainKey) || hasCtrl || hasMeta || hasAlt) {
        const event = new KeyboardEvent('keydown', {
          key: mainKey,
          code: mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey,
          ctrlKey: hasCtrl,
          metaKey: hasMeta,
          altKey: hasAlt,
          shiftKey: hasShift,
          bubbles: true,
        });
        document.activeElement?.dispatchEvent(event);
      }
    }, command.key);
  });

  const result: Record<string, unknown> = { pressed: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

export async function handleScreenshot(
  command: ScreenshotCommand,
  browser: BrowserManager
): Promise<Response<ScreenshotData>> {
  const page = browser.getPage();

  const options: Parameters<Page['screenshot']>[0] = {
    fullPage: command.fullPage,
    type: command.format ?? 'png',
  };

  if (command.format === 'jpeg' && command.quality !== undefined) {
    options.quality = command.quality;
  }

  let target: Page | ReturnType<Page['locator']> = page;
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    if (command.selector) {
      target = frameLocator.locator(command.selector);
    } else {
      target = frameLocator.locator(':root');
    }
  } else if (command.selector) {
    target = browser.getLocator(command.selector);
  }

  try {
    let savePath = command.path;
    if (!savePath) {
      const ext = command.format === 'jpeg' ? 'jpg' : 'png';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const random = Math.random().toString(36).substring(2, 8);
      const filename = `screenshot-${timestamp}-${random}.${ext}`;
      const screenshotDir = path.join(getAppDir(), 'tmp', 'screenshots');
      mkdirSync(screenshotDir, { recursive: true });
      savePath = path.join(screenshotDir, filename);
    }

    await target.screenshot({ ...options, path: savePath });
    return successResponse(command.id, { path: savePath });
  } catch (error) {
    if (command.selector) {
      throw toAIFriendlyError(error, command.selector);
    }
    throw error;
  }
}

export async function handleSnapshot(
  command: Command & {
    action: 'snapshot';
    interactive?: boolean;
    cursor?: boolean;
    maxDepth?: number;
    compact?: boolean;
    selector?: string;
    inFrame?: string;
    path?: boolean;
    attrs?: boolean;
    selectors?: boolean;
    all?: boolean;
  },
  browser: BrowserManager
): Promise<Response<SnapshotData>> {
  let effectiveSelector = command.selector;
  let detectionResult = null;

  if (!command.selector) {
    const page = browser.getPage();
    detectionResult = await detectMainContent(page);
    effectiveSelector = detectionResult.selector;
  }

  const snapshot = await browser.getSnapshot({
    interactive: command.interactive,
    cursor: command.cursor,
    maxDepth: command.maxDepth,
    compact: command.compact,
    selector: effectiveSelector,
    framePath: command.inFrame,
    path: command.path,
    attrs: command.attrs,
    selectors: command.selectors,
    all: command.all,
  });

  const simpleRefs: Record<
    string,
    {
      role: string;
      name?: string;
      xpath?: string;
      cssPath?: string;
      attributes?: Record<string, string>;
    }
  > = {};
  const refs = snapshot.refs || {};
  for (const [ref, data] of Object.entries(refs)) {
    simpleRefs[ref] = {
      role: data.role,
      name: data.name,
      ...(data.xpath && { xpath: data.xpath }),
      ...(data.cssPath && { cssPath: data.cssPath }),
      ...(data.attributes && { attributes: data.attributes }),
    };
  }

  const tips = detectionResult ? generateContentTips(detectionResult) : undefined;

  return successResponse(
    command.id,
    {
      snapshot: snapshot.tree || 'Empty page',
      refs: Object.keys(simpleRefs).length > 0 ? simpleRefs : undefined,
    },
    tips ?? undefined
  );
}

export async function handleEvaluate(
  command: EvaluateCommand,
  browser: BrowserManager
): Promise<Response> {
  try {
    let script: string;
    if (command.file) {
      const resolvedPath = path.resolve(command.file);
      const cwd = process.cwd();
      if (!resolvedPath.startsWith(cwd)) {
        throw new Error(
          `Security: file path must be within project directory. Got: ${resolvedPath}`
        );
      }
      if (!existsSync(resolvedPath)) {
        throw new Error(`Script file not found: ${resolvedPath}`);
      }
      script = readFileSync(resolvedPath, 'utf-8');
    } else if (command.script) {
      script = command.script;
    } else {
      throw new Error('Either script or file must be provided for evaluate command');
    }

    let result;
    if (command.inFrame) {
      const frameLocator = browser.getFrame(command.inFrame);
      result = await frameLocator.locator(':root').evaluate(script);
    } else {
      const page = browser.getPage();
      result = await page.evaluate(script);
    }

    browser.recordCommand(
      'eval',
      'javascript',
      script.length > 200 ? script.substring(0, 200) + '...' : script,
      true
    );

    return successResponse(command.id, { result });
  } catch (error) {
    const script = command.script || command.file || '';
    browser.recordCommand(
      'eval',
      'javascript',
      script.length > 200 ? script.substring(0, 200) + '...' : script,
      false
    );
    console.error('Error in handleEvaluate:', error);
    return errorResponse(command.id, error instanceof Error ? error.message : String(error));
  }
}

export async function handleWait(command: WaitCommand, browser: BrowserManager): Promise<Response> {
  const humanConfig = getHumanConfigFromEnv();
  const page = browser.getPage();

  if (humanConfig.enabled && command.timeout && !command.selector) {
    await humanWander(page, humanConfig, { duration: command.timeout });
    return successResponse(command.id, { waited: true, wandered: true });
  }

  if (command.inFrame) {
    const frame = browser.getFrame(command.inFrame);
    if (command.selector) {
      await frame.waitForSelector(command.selector, {
        state: command.state ?? 'visible',
        timeout: command.timeout,
      });
    } else if (command.timeout) {
      await frame.waitForTimeout(command.timeout);
    } else {
      await frame.waitForLoadState('load');
    }
  } else {
    const frame = browser.getFrame();
    if (command.selector) {
      await frame.waitForSelector(command.selector, {
        state: command.state ?? 'visible',
        timeout: command.timeout,
      });
    } else if (command.timeout) {
      await frame.waitForTimeout(command.timeout);
    } else {
      await frame.waitForLoadState('load');
    }
  }

  return successResponse(command.id, { waited: true });
}

export async function handleScroll(
  command: ScrollCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    const element = page.locator(command.selector);
    await element.scrollIntoViewIfNeeded();

    if (command.x !== undefined || command.y !== undefined) {
      await element.evaluate(
        (el, { x, y }) => {
          if ('scrollBy' in el) {
            (el as HTMLElement).scrollBy(x ?? 0, y ?? 0);
          }
        },
        { x: command.x, y: command.y }
      );
    }
  } else {
    let deltaX = command.x ?? 0;
    let deltaY = command.y ?? 0;

    if (command.direction) {
      const amount = command.amount ?? 100;
      switch (command.direction) {
        case 'up':
          deltaY = -amount;
          break;
        case 'down':
          deltaY = amount;
          break;
        case 'left':
          deltaX = -amount;
          break;
        case 'right':
          deltaX = amount;
          break;
      }
    }

    const safeDeltaX = Number(deltaX) || 0;
    const safeDeltaY = Number(deltaY) || 0;
    await page.evaluate(({ dx, dy }) => window.scrollBy(dx, dy), {
      dx: safeDeltaX,
      dy: safeDeltaY,
    });
  }

  return successResponse(command.id, { scrolled: true });
}

export async function handleSelect(
  command: SelectCommand,
  browser: BrowserManager
): Promise<Response> {
  const values = Array.isArray(command.values) ? command.values : [command.values];
  const locator = browser.getLocator(command.selector, command.inFrame);
  const isRef = browser.isRef(command.selector);

  await assertElementExists(locator, command.selector, isRef);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.selectOption(values);
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { selected: values };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  browser.recordCommand('select', command.selector, values.join(','), true);
  return successResponse(command.id, result);
}

export async function handleHover(
  command: HoverCommand,
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

        await humanMoveTo(page, { x: targetX, y: targetY }, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { hovered: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.hover();
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { hovered: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

export async function handleContent(
  command: ContentCommand,
  browser: BrowserManager
): Promise<Response<ContentData>> {
  const page = browser.getPage();

  let html: string;
  if (command.selector) {
    html = await page.locator(command.selector).innerHTML();
  } else {
    html = await page.content();
  }

  return successResponse(command.id, { html });
}
