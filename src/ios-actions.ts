/**
 * iOS command execution - mirrors actions.ts but for iOS Safari via Appium.
 * Provides 1:1 command parity where possible.
 */

import type { IOSManager } from './ios-manager.js';
import type { Command, LooseCommand, Response } from './types.js';

function successResponse<T>(id: string, data: T): Response<T> {
  return { id, success: true, data };
}

function errorResponse(id: string, error: string): Response {
  return { id, success: false, error };
}

function getStr(command: Command, key: string): string {
  return (command as unknown as LooseCommand)[key] as string;
}

function getOptStr(command: Command, key: string): string | undefined {
  const val = (command as unknown as LooseCommand)[key];
  return typeof val === 'string' ? val : undefined;
}

function getOptNum(command: Command, key: string): number | undefined {
  const val = (command as unknown as LooseCommand)[key];
  return typeof val === 'number' ? val : undefined;
}

function getOptBool(command: Command, key: string): boolean | undefined {
  const val = (command as unknown as LooseCommand)[key];
  return typeof val === 'boolean' ? val : undefined;
}

export async function executeIOSCommand(command: Command, manager: IOSManager): Promise<Response> {
  const { id, action } = command;

  try {
    switch (action) {
      case 'launch': {
        await manager.launch({
          device: getOptStr(command, 'device'),
          udid: getOptStr(command, 'udid'),
        });
        const info = manager.getDeviceInfo();
        return successResponse(id, {
          launched: true,
          device: info?.name ?? 'iOS Simulator',
          udid: info?.udid,
        });
      }

      case 'navigate': {
        const result = await manager.navigate(getStr(command, 'url'));
        return successResponse(id, result);
      }

      case 'click': {
        await manager.click(getStr(command, 'selector'));
        return successResponse(id, { clicked: true });
      }

      case 'tap': {
        await manager.tap(getStr(command, 'selector'));
        return successResponse(id, { tapped: true });
      }

      case 'type': {
        await manager.type(getStr(command, 'selector'), getStr(command, 'text'), {
          delay: getOptNum(command, 'delay'),
          clear: getOptBool(command, 'clear'),
        });
        return successResponse(id, { typed: true });
      }

      case 'fill': {
        await manager.fill(getStr(command, 'selector'), getStr(command, 'value'));
        return successResponse(id, { filled: true });
      }

      case 'screenshot': {
        const result = await manager.screenshot({
          path: getOptStr(command, 'path'),
          fullPage: getOptBool(command, 'fullPage'),
        });
        return successResponse(id, result);
      }

      case 'snapshot': {
        const result = await manager.getSnapshot({
          interactive: getOptBool(command, 'interactive'),
        });
        return successResponse(id, { snapshot: result.tree, refs: result.refs });
      }

      case 'scroll': {
        await manager.scroll({
          selector: getOptStr(command, 'selector'),
          x: getOptNum(command, 'x'),
          y: getOptNum(command, 'y'),
          direction: getOptStr(command, 'direction') as
            | 'up'
            | 'down'
            | 'left'
            | 'right'
            | undefined,
          amount: getOptNum(command, 'amount'),
        });
        return successResponse(id, { scrolled: true });
      }

      case 'swipe': {
        await manager.swipe(getStr(command, 'direction') as 'up' | 'down' | 'left' | 'right', {
          distance: getOptNum(command, 'distance'),
        });
        return successResponse(id, { swiped: true });
      }

      case 'evaluate': {
        const args = (command as unknown as LooseCommand)['args'];
        const evalArgs = Array.isArray(args) ? args : [];
        const result = await manager.evaluate(getStr(command, 'script'), ...evalArgs);
        return successResponse(id, { result });
      }

      case 'wait': {
        await manager.wait({
          selector: getOptStr(command, 'selector'),
          timeout: getOptNum(command, 'timeout'),
          state: getOptStr(command, 'state') as
            | 'attached'
            | 'detached'
            | 'visible'
            | 'hidden'
            | undefined,
        });
        return successResponse(id, { waited: true });
      }

      case 'press': {
        await manager.press(getStr(command, 'key'));
        return successResponse(id, { pressed: true });
      }

      case 'hover': {
        await manager.hover(getStr(command, 'selector'));
        return successResponse(id, { hovered: true });
      }

      case 'content': {
        const html = await manager.getContent(getOptStr(command, 'selector'));
        return successResponse(id, { html });
      }

      case 'gettext': {
        const text = await manager.getText(getStr(command, 'selector'));
        return successResponse(id, { text });
      }

      case 'getattribute': {
        const value = await manager.getAttribute(
          getStr(command, 'selector'),
          getStr(command, 'attribute')
        );
        return successResponse(id, { value });
      }

      case 'isvisible': {
        const visible = await manager.isVisible(getStr(command, 'selector'));
        return successResponse(id, { visible });
      }

      case 'isenabled': {
        const enabled = await manager.isEnabled(getStr(command, 'selector'));
        return successResponse(id, { enabled });
      }

      case 'url': {
        const url = await manager.getUrl();
        return successResponse(id, { url });
      }

      case 'title': {
        const title = await manager.getTitle();
        return successResponse(id, { title });
      }

      case 'back': {
        await manager.goBack();
        return successResponse(id, { navigated: 'back' });
      }

      case 'forward': {
        await manager.goForward();
        return successResponse(id, { navigated: 'forward' });
      }

      case 'reload': {
        await manager.reload();
        return successResponse(id, { reloaded: true });
      }

      case 'select': {
        const values = (command as unknown as LooseCommand)['values'];
        await manager.select(getStr(command, 'selector'), (values as string | string[]) ?? []);
        return successResponse(id, { selected: true });
      }

      case 'check': {
        await manager.check(getStr(command, 'selector'));
        return successResponse(id, { checked: true });
      }

      case 'uncheck': {
        await manager.uncheck(getStr(command, 'selector'));
        return successResponse(id, { unchecked: true });
      }

      case 'focus': {
        await manager.focus(getStr(command, 'selector'));
        return successResponse(id, { focused: true });
      }

      case 'clear': {
        await manager.clear(getStr(command, 'selector'));
        return successResponse(id, { cleared: true });
      }

      case 'count': {
        const count = await manager.count(getStr(command, 'selector'));
        return successResponse(id, { count });
      }

      case 'boundingbox': {
        const box = await manager.getBoundingBox(getStr(command, 'selector'));
        return successResponse(id, { box });
      }

      case 'close': {
        await manager.close();
        return successResponse(id, { closed: true });
      }

      case 'device_list': {
        const devices = await manager.listDevices();
        return successResponse(id, { devices });
      }

      case 'tab_new':
      case 'tab_list':
      case 'tab_switch':
      case 'tab_close':
      case 'window_new':
        return errorResponse(
          id,
          `Command '${action}' is not supported on iOS Safari. Mobile Safari does not support programmatic tab management.`
        );

      case 'pdf':
        return errorResponse(id, 'PDF generation is not supported on iOS Safari.');

      case 'screencast_start':
      case 'screencast_stop':
        return errorResponse(id, 'Screencast is not supported on iOS (requires CDP).');

      case 'recording_start':
      case 'recording_stop':
      case 'recording_restart':
        return errorResponse(id, 'Video recording is not yet supported on iOS.');

      default:
        return errorResponse(id, `Unknown or unsupported iOS command: ${action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(id, message);
  }
}
