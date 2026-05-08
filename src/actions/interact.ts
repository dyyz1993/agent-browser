import type { BrowserManager } from '../browser/index.js';
import type {
  InteractCommand,
  Response,
  InteractResult,
  StepResult,
  InteractStep,
} from '../types.js';
import { successResponse } from '../protocol.js';
import * as fs from 'fs';
import * as path from 'path';

async function executeStep(step: InteractStep, browser: BrowserManager): Promise<StepResult> {
  const page = browser.getPage();

  try {
    switch (step.action) {
      case 'navigate': {
        await page.goto(step.url);
        return { action: 'navigate', success: true };
      }

      case 'click': {
        const locator = browser.getLocator(step.selector);
        await locator.click();
        return { action: 'click', success: true };
      }

      case 'fill': {
        const locator = browser.getLocator(step.selector);
        await locator.fill(step.value);
        return { action: 'fill', success: true };
      }

      case 'type': {
        const locator = browser.getLocator(step.selector);
        await locator.type(step.text);
        return { action: 'type', success: true };
      }

      case 'press': {
        await page.keyboard.press(step.key);
        return { action: 'press', success: true };
      }

      case 'get': {
        let data: any;

        switch (step.type) {
          case 'url':
            data = page.url();
            break;
          case 'title':
            data = await page.title();
            break;
          case 'text':
            if (step.selector) {
              const locator = browser.getLocator(step.selector);
              data = await locator.textContent();
            } else {
              data = await page.textContent('body');
            }
            break;
          case 'html':
            if (step.selector) {
              const locator = browser.getLocator(step.selector);
              data = await locator.innerHTML();
            } else {
              data = await page.content();
            }
            break;
          case 'value':
            if (step.selector) {
              const locator = browser.getLocator(step.selector);
              data = await locator.inputValue();
            }
            break;
        }

        return { action: 'get', success: true, data };
      }

      case 'wait': {
        if (step.selector) {
          const locator = browser.getLocator(step.selector);
          await locator.waitFor({
            state: step.state ?? 'attached',
            timeout: step.timeout,
          });
        } else {
          await page.waitForTimeout(step.timeout ?? 1000);
        }
        return { action: 'wait', success: true };
      }

      case 'screenshot': {
        const screenshotPath = step.path
          ? path.resolve(step.path)
          : path.join(process.cwd(), `screenshot-${Date.now()}.png`);

        await page.screenshot({
          path: screenshotPath,
          fullPage: step.fullPage ?? false,
        });

        return { action: 'screenshot', success: true, data: { path: screenshotPath } };
      }

      default:
        return {
          action: (step as any).action,
          success: false,
          error: 'Unknown step action',
        };
    }
  } catch (error) {
    return {
      action: (step as any).action,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleInteract(
  command: InteractCommand,
  browser: BrowserManager
): Promise<Response<InteractResult>> {
  if (!browser.isLaunched()) {
    await browser.launch({
      id: 'auto',
      action: 'launch',
      headless: command.headless ?? true,
    });
  }

  try {
    let steps: InteractStep[];

    if (command.file) {
      const filePath = path.resolve(command.file);
      const content = fs.readFileSync(filePath, 'utf-8');
      steps = JSON.parse(content);
    } else if (command.steps) {
      steps = command.steps;
    } else {
      return {
        id: command.id,
        success: false,
        error: 'No steps provided. Use --file <path> or pass steps as JSON',
      };
    }

    const results: StepResult[] = [];
    let allSuccess = true;

    for (const step of steps) {
      const result = await executeStep(step, browser);
      results.push(result);

      if (!result.success) {
        allSuccess = false;
        break;
      }
    }

    const page = browser.getPage();
    const interactResult: InteractResult = {
      success: allSuccess,
      steps: results,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    const lastResult = results[results.length - 1];
    if (lastResult?.action === 'get' && lastResult.data) {
      interactResult.output = lastResult.data;
    }

    return successResponse(command.id, interactResult);
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
