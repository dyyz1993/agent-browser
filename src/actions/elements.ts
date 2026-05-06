import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
  GetAttributeCommand,
  GetTextCommand,
  IsVisibleCommand,
  IsEnabledCommand,
  IsCheckedCommand,
  CountCommand,
  BoundingBoxCommand,
  StylesCommand,
  StylesData,
} from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleGetAttribute(
  command: GetAttributeCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const value = await locator.getAttribute(command.attribute);
  return successResponse(command.id, { attribute: command.attribute, value });
}

export async function handleGetText(
  command: GetTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const text = await locator.textContent();
  return successResponse(command.id, { text });
}

export async function handleIsVisible(
  command: IsVisibleCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const visible = await locator.isVisible({ timeout: 5000 });
  return successResponse(command.id, { visible });
}

export async function handleIsEnabled(
  command: IsEnabledCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const enabled = await locator.isEnabled({ timeout: 5000 });
  return successResponse(command.id, { enabled });
}

export async function handleIsChecked(
  command: IsCheckedCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const checked = await locator.isChecked({ timeout: 5000 });
  return successResponse(command.id, { checked });
}

export async function handleCount(
  command: CountCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const count = await locator.count();
  return successResponse(command.id, { count });
}

export async function handleBoundingBox(
  command: BoundingBoxCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const box = await locator.boundingBox();
  return successResponse(command.id, { box });
}

export async function handleStyles(
  command: StylesCommand,
  browser: BrowserManager
): Promise<Response<StylesData>> {
  const frame = browser.getFrame(command.inFrame);

  const extractStylesScript = `(function(el) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: el.innerText?.trim().slice(0, 80) || null,
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      styles: {
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0].trim().replace(/"/g, ''),
        color: s.color,
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderRadius,
        border: s.border !== 'none' && s.borderWidth !== '0px' ? s.border : null,
        boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
        padding: s.padding,
      },
    };
  })`;

  if (browser.isRef(command.selector)) {
    const locator = browser.getLocator(command.selector);
    const element = (await locator.evaluate((el, script) => {
      const fn = new Function('return ' + script)();
      return fn(el);
    }, extractStylesScript)) as StylesData['elements'][0];
    return successResponse(command.id, { elements: [element] });
  }

  const elements = (await frame.locator(command.selector).evaluateAll((els, script) => {
    const fn = new Function('return ' + script)();
    return els.map((el) => fn(el));
  }, extractStylesScript)) as StylesData['elements'];

  return successResponse(command.id, { elements });
}
