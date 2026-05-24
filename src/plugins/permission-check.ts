import type { PluginContext, PluginPermission } from './types.js';

export function createPermissionCheckedContext(
  fullContext: PluginContext,
  allowed: PluginPermission[]
): PluginContext {
  function check(perm: PluginPermission, action: string): void {
    if (!allowed.includes(perm) && !allowed.includes('dispatch')) {
      throw new Error(
        `Permission denied: "${perm}" required for ${action}. Add it to plugin meta.permissions.`
      );
    }
  }

  return {
    ...fullContext,
    click(sel) {
      check('browser:write', 'click');
      return fullContext.click(sel);
    },
    fill(sel, val) {
      check('browser:write', 'fill');
      return fullContext.fill(sel, val);
    },
    type(sel, text) {
      check('browser:write', 'type');
      return fullContext.type(sel, text);
    },
    press(key) {
      check('browser:write', 'press');
      return fullContext.press(key);
    },
    select(sel, vals) {
      check('browser:write', 'select');
      return fullContext.select(sel, vals);
    },
    goto(url, opts) {
      check('browser:navigate', 'goto');
      return fullContext.goto(url, opts);
    },
    newTab(url) {
      check('browser:tab', 'newTab');
      return fullContext.newTab(url);
    },
    closeTab(page) {
      check('browser:tab', 'closeTab');
      return fullContext.closeTab(page);
    },
    scrape(url, opts) {
      check('network:read', 'scrape');
      return fullContext.scrape(url, opts);
    },
    eval(expr) {
      check('eval', 'eval');
      return fullContext.eval(expr);
    },
    snapshot(opts) {
      check('browser:read', 'snapshot');
      return fullContext.snapshot(opts);
    },
    dispatch(cmd) {
      check('dispatch', 'dispatch');
      return fullContext.dispatch(cmd);
    },
  };
}
