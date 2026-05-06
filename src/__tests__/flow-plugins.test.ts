import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from '../flow/plugin-system.js';
import type { FlowPlugin, HookType } from '../flow/plugin-system.js';
import { createWebhookPlugin } from '../flow/plugins/webhook-plugin.js';

describe('PluginManager', () => {
  it('should register a plugin with actions and hooks', async () => {
    const manager = new PluginManager();
    const handler = vi.fn();
    const hookCb = vi.fn();

    const plugin: FlowPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      actions: {
        customAction: handler,
      },
      hooks: {
        onStepStart: hookCb,
      },
    };

    await manager.registerPlugin(plugin);

    expect(manager.hasAction('customAction')).toBe(true);
    expect(manager.hasAction('unknownAction')).toBe(false);
    expect(manager.listPlugins()).toHaveLength(1);
    expect(manager.listPlugins()[0].name).toBe('test-plugin');
    expect(manager.listActions()).toContain('customAction');
  });

  it('should call onStepStart hook via triggerHook', async () => {
    const manager = new PluginManager();
    const hookCb = vi.fn();

    await manager.registerPlugin({
      name: 'hook-test',
      hooks: {
        onStepStart: hookCb,
      },
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.triggerHook('onStepStart', { id: 's1', action: 'click' });

    expect(hookCb).toHaveBeenCalledTimes(1);
    expect(hookCb).toHaveBeenCalledWith(
      expect.objectContaining({ currentPage: 1 }),
      expect.objectContaining({ id: 's1' }),
      undefined
    );
  });

  it('should call onStepEnd hook with result', async () => {
    const manager = new PluginManager();
    const hookCb = vi.fn();

    await manager.registerPlugin({
      name: 'end-hook',
      hooks: {
        onStepEnd: hookCb,
      },
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.triggerHook('onStepEnd', { id: 's1', action: 'extract' }, { data: 42 });

    expect(hookCb).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 's1' }), {
      data: 42,
    });
  });

  it('should handle plugin errors in hooks gracefully', async () => {
    const manager = new PluginManager();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.registerPlugin({
      name: 'failing-plugin',
      hooks: {
        onStepStart: async () => {
          throw new Error('hook boom');
        },
      },
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.triggerHook('onStepStart', { id: 's1', action: 'click' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('onStepStart error'));
    consoleSpy.mockRestore();
  });

  it('should unregister a plugin and remove its actions/hooks', async () => {
    const manager = new PluginManager();
    const handler = vi.fn();

    await manager.registerPlugin({
      name: 'temp',
      actions: { myAction: handler },
      hooks: { onStepStart: vi.fn() },
    });

    expect(manager.hasAction('myAction')).toBe(true);

    await manager.unregisterPlugin('temp');

    expect(manager.hasAction('myAction')).toBe(false);
    expect(manager.listPlugins()).toHaveLength(0);
  });

  it('should not throw when unregistering non-existent plugin', async () => {
    const manager = new PluginManager();
    await expect(manager.unregisterPlugin('nonexistent')).resolves.toBeUndefined();
  });

  it('should replace existing plugin on re-register', async () => {
    const manager = new PluginManager();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.registerPlugin({
      name: 'dup',
      actions: { act1: vi.fn() },
    });

    await manager.registerPlugin({
      name: 'dup',
      actions: { act2: vi.fn() },
    });

    expect(manager.hasAction('act1')).toBe(false);
    expect(manager.hasAction('act2')).toBe(true);
    expect(manager.listPlugins()).toHaveLength(1);

    consoleSpy.mockRestore();
  });

  it('should execute custom action', async () => {
    const manager = new PluginManager();
    const handler = vi.fn();

    await manager.registerPlugin({
      name: 'act-plugin',
      actions: { doThing: handler },
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    const step = { id: 's1', action: 'doThing' as const };
    await manager.executeAction('doThing', step);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should throw for unknown action', async () => {
    const manager = new PluginManager();
    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await expect(
      manager.executeAction('unknown', { id: 's1', action: 'unknown' as any })
    ).rejects.toThrow('Unknown custom action: unknown');
  });

  it('should throw for executeAction without context', async () => {
    const manager = new PluginManager();
    await manager.registerPlugin({
      name: 'ctx-test',
      actions: { act: vi.fn() },
    });

    await expect(manager.executeAction('act', { id: 's1', action: 'act' as any })).rejects.toThrow(
      'PluginManager context not initialized'
    );
  });

  it('should skip triggerHook when no context set', async () => {
    const manager = new PluginManager();
    const hookCb = vi.fn();

    await manager.registerPlugin({
      name: 'no-ctx',
      hooks: { onFlowStart: hookCb },
    });

    await manager.triggerHook('onFlowStart');
    expect(hookCb).not.toHaveBeenCalled();
  });

  it('should skip triggerHook when no hooks registered for type', async () => {
    const manager = new PluginManager();
    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.triggerHook('onPageChange');
  });

  it('should call dataHandlers via processData', async () => {
    const manager = new PluginManager();
    const dataHandler = vi.fn();

    await manager.registerPlugin({
      name: 'data-plugin',
      dataHandlers: [dataHandler],
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    const data = { items: [1, 2, 3] };
    await manager.processData(data);

    expect(dataHandler).toHaveBeenCalledWith(data, expect.objectContaining({ currentPage: 1 }));
  });

  it('should handle data handler errors gracefully', async () => {
    const manager = new PluginManager();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.registerPlugin({
      name: 'bad-data',
      dataHandlers: [
        async () => {
          throw new Error('data boom');
        },
      ],
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.processData({ x: 1 });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Data handler error'));
    consoleSpy.mockRestore();
  });

  it('should call plugin init on register', async () => {
    const manager = new PluginManager();
    const initFn = vi.fn();

    await manager.registerPlugin({
      name: 'init-plugin',
      init: initFn,
    });

    expect(initFn).toHaveBeenCalledTimes(1);
    expect(initFn).toHaveBeenCalledWith(
      expect.objectContaining({
        getBrowser: expect.any(Function),
        getContext: expect.any(Function),
        getActionHandler: expect.any(Function),
        executeStep: expect.any(Function),
      })
    );
  });

  it('should call plugin cleanup on unregister', async () => {
    const manager = new PluginManager();
    const cleanupFn = vi.fn();

    await manager.registerPlugin({
      name: 'cleanup-plugin',
      cleanup: cleanupFn,
    });

    expect(cleanupFn).not.toHaveBeenCalled();

    await manager.unregisterPlugin('cleanup-plugin');

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should register multiple hooks of same type', async () => {
    const manager = new PluginManager();
    const hook1 = vi.fn();
    const hook2 = vi.fn();

    await manager.registerPlugin({
      name: 'p1',
      hooks: { onStepStart: hook1 },
    });
    await manager.registerPlugin({
      name: 'p2',
      hooks: { onStepStart: hook2 },
    });

    manager.setContext({
      variables: {},
      params: {},
      results: {},
      pageCount: 0,
      currentPage: 1,
    });

    await manager.triggerHook('onStepStart', { id: 's1', action: 'click' });

    expect(hook1).toHaveBeenCalledTimes(1);
    expect(hook2).toHaveBeenCalledTimes(1);
  });

  it('should listPlugins return name, version, description', async () => {
    const manager = new PluginManager();
    await manager.registerPlugin({
      name: 'info-plugin',
      version: '2.0.0',
      description: 'Test info',
    });

    const list = manager.listPlugins();
    expect(list).toEqual([{ name: 'info-plugin', version: '2.0.0', description: 'Test info' }]);
  });
});

describe('WebhookPlugin', () => {
  it('should create plugin with correct name and version', () => {
    const plugin = createWebhookPlugin({ url: 'https://example.com/hook' });
    expect(plugin.name).toBe('webhook');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.description).toBe('Sends extracted data to a webhook endpoint');
  });

  it('should have a dataHandler', () => {
    const plugin = createWebhookPlugin({ url: 'https://example.com/hook' });
    expect(plugin.dataHandlers).toBeDefined();
    expect(plugin.dataHandlers!.length).toBe(1);
  });

  it('should create with custom method and headers', () => {
    const plugin = createWebhookPlugin({
      url: 'https://example.com/hook',
      method: 'PUT',
      headers: { Authorization: 'Bearer token' },
    });
    expect(plugin.name).toBe('webhook');
    expect(plugin.dataHandlers).toHaveLength(1);
  });
});
