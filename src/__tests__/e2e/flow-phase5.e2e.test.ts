import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import { PluginManager } from '../../flow/plugin-system.js';
import { createLoggingPlugin } from '../../flow/plugins/logging-plugin.js';
import { createFileOutputPlugin } from '../../flow/plugins/file-output-plugin.js';
import type { SiteDefinition } from '../../flow/types.js';
import type { FlowPlugin } from '../../flow/plugin-system.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
let PORT: number;
const TEST_OUTPUT_DIR = resolve('/tmp/flow-phase5-test-output');

function createTestServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/greet') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html>
<html><head><title>Greet</title></head><body>
  <div id="greeting">Hello World</div>
  <div id="result"></div>
  <script>
    window.greetCustom = function(name) {
      document.getElementById('result').textContent = 'Hello, ' + name + '!';
      return 'Hello, ' + name + '!';
    };
  </script>
</body></html>`);
    } else if (url.pathname === '/extract') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html>
<html><head><title>Extract</title></head><body>
  <div class="item"><span class="name">Widget A</span><span class="price">$10</span></div>
  <div class="item"><span class="name">Widget B</span><span class="price">$20</span></div>
  <div class="item"><span class="name">Widget C</span><span class="price">$30</span></div>
</body></html>`);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body><h1>Home</h1></body></html>');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

describe('Flow Engine Phase 5 - Plugin System', { sequential: true, timeout: 60000 }, () => {
  let browser: BrowserManager;
  let server: http.Server;

  beforeAll(async () => {
    if (!executablePath) {
      throw new Error('AGENT_BROWSER_EXECUTABLE_PATH not set');
    }

    PORT = await getFreePort();

    if (existsSync(TEST_OUTPUT_DIR)) rmSync(TEST_OUTPUT_DIR, { recursive: true });
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    server = await createTestServer(PORT);

    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-phase5',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close().catch(() => {});
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (existsSync(TEST_OUTPUT_DIR)) rmSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  describe('Custom action registration', () => {
    it('should execute a custom action registered via plugin', async () => {
      const pluginManager = new PluginManager();

      let customActionCalled = false;
      const customPlugin: FlowPlugin = {
        name: 'custom-greet',
        version: '1.0.0',
        actions: {
          customGreet: async (step, context, browser) => {
            customActionCalled = true;
            const name = step.value || 'World';
            const script = `JSON.stringify(window.greetCustom ? window.greetCustom('${name}') : 'no function')`;
            const { executeCommand } = await import('../../actions/index.js');
            const { parseCliArgs } = await import('../../__tests__/utils/parseCli.js');
            const { isSuccessResponse } = await import('../../types.js');
            const result = await executeCommand(parseCliArgs(['eval', script]), browser);
            if (isSuccessResponse(result)) {
              const evalResult = result.data as { result?: unknown };
              context.results[step.outputVar || 'greeting'] = evalResult.result;
            }
          },
        },
      };

      await pluginManager.registerPlugin(customPlugin);
      expect(pluginManager.hasAction('customGreet')).toBe(true);

      const executor = new FlowExecutor(browser, pluginManager);

      const site: SiteDefinition = {
        name: 'greet-site',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          greet: {
            id: 'greet',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/greet' },
              {
                id: 'greet',
                action: 'customGreet' as string,
                value: 'FlowPlugin',
                outputVar: 'greeting',
              },
            ],
            output: ['greeting'],
          },
        },
      };

      const result = await executor.execute(site, 'greet', {});
      expect(result.success).toBe(true);
      expect(customActionCalled).toBe(true);
      expect(result.data.greeting).toBeDefined();
    });
  });

  describe('Hooks', () => {
    it('should call hooks during flow execution', async () => {
      const pluginManager = new PluginManager();

      const events: string[] = [];
      const loggingPlugin: FlowPlugin = {
        name: 'test-logger',
        hooks: {
          onFlowStart: async () => {
            events.push('flowStart');
          },
          onStepStart: async (_ctx, step) => {
            events.push(`stepStart:${step.id}`);
          },
          onStepEnd: async (_ctx, step) => {
            events.push(`stepEnd:${step.id}`);
          },
          onFlowEnd: async () => {
            events.push('flowEnd');
          },
        },
      };

      await pluginManager.registerPlugin(loggingPlugin);

      const executor = new FlowExecutor(browser, pluginManager);

      const site: SiteDefinition = {
        name: 'hook-site',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          hookTest: {
            id: 'hookTest',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/greet' },
              { id: 'wait', action: 'wait', timeout: 500 },
            ],
          },
        },
      };

      const result = await executor.execute(site, 'hookTest', {});
      expect(result.success).toBe(true);

      expect(events).toContain('flowStart');
      expect(events).toContain('stepStart:nav');
      expect(events).toContain('stepEnd:nav');
      expect(events).toContain('stepStart:wait');
      expect(events).toContain('stepEnd:wait');
      expect(events).toContain('flowEnd');
    });

    it('should call onStepError hook when a step fails', async () => {
      const pluginManager = new PluginManager();

      const events: string[] = [];

      const errorActionPlugin: FlowPlugin = {
        name: 'error-action',
        actions: {
          throwError: async () => {
            throw new Error('Intentional test error');
          },
        },
        hooks: {
          onStepError: async (_ctx, step) => {
            events.push(`stepError:${step.id}`);
          },
        },
      };

      await pluginManager.registerPlugin(errorActionPlugin);

      const executor = new FlowExecutor(browser, pluginManager);

      const site: SiteDefinition = {
        name: 'error-site',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          errorTest: {
            id: 'errorTest',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/greet' },
              { id: 'fail', action: 'throwError' as string },
            ],
          },
        },
      };

      const result = await executor.execute(site, 'errorTest', {});
      expect(result.success).toBe(false);
      expect(events).toContain('stepError:fail');
    });
  });

  describe('Data pipeline', () => {
    it('should process data through file-output plugin', async () => {
      const outputDir = join(TEST_OUTPUT_DIR, 'file-output');
      if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      const pluginManager = new PluginManager();
      const filePlugin = createFileOutputPlugin({ outputDir, format: 'json', pretty: true });
      await pluginManager.registerPlugin(filePlugin);

      const executor = new FlowExecutor(browser, pluginManager);

      const site: SiteDefinition = {
        name: 'data-site',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          extractData: {
            id: 'extractData',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/extract' },
              {
                id: 'ext',
                action: 'extract',
                container: '.item',
                fields: { name: '.name', price: '.price' },
                outputVar: 'items',
              },
            ],
            output: ['items'],
          },
        },
      };

      const result = await executor.execute(site, 'extractData', {});
      expect(result.success).toBe(true);
      expect(result.data.items).toBeDefined();

      const outputFile = join(outputDir, 'items.json');
      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.length).toBe(3);
      expect(parsed[0].name).toBe('Widget A');
    });
  });

  describe('Plugin lifecycle', () => {
    it('should register and unregister plugins correctly', async () => {
      const pluginManager = new PluginManager();

      let cleanedUp = false;
      const testPlugin: FlowPlugin = {
        name: 'lifecycle-test',
        version: '1.0.0',
        actions: {
          lifecycleAction: async (step, context) => {
            context.results['lifecycle'] = 'called';
          },
        },
        cleanup: async () => {
          cleanedUp = true;
        },
      };

      await pluginManager.registerPlugin(testPlugin);
      expect(pluginManager.listPlugins().map((p) => p.name)).toContain('lifecycle-test');
      expect(pluginManager.listActions()).toContain('lifecycleAction');
      expect(pluginManager.hasAction('lifecycleAction')).toBe(true);

      await pluginManager.unregisterPlugin('lifecycle-test');
      expect(pluginManager.listPlugins().map((p) => p.name)).not.toContain('lifecycle-test');
      expect(pluginManager.hasAction('lifecycleAction')).toBe(false);
      expect(cleanedUp).toBe(true);
    });
  });

  describe('Multiple plugins', () => {
    it('should work with logging + file-output plugins together', async () => {
      const outputDir = join(TEST_OUTPUT_DIR, 'multi-plugin');
      if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      const pluginManager = new PluginManager();

      const logPlugin = createLoggingPlugin({ logSteps: true, logData: true, logTiming: true });
      const filePlugin = createFileOutputPlugin({ outputDir, format: 'json', pretty: true });

      await pluginManager.registerPlugin(logPlugin);
      await pluginManager.registerPlugin(filePlugin);

      expect(pluginManager.listPlugins().length).toBe(2);

      const executor = new FlowExecutor(browser, pluginManager);

      const site: SiteDefinition = {
        name: 'multi-site',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          multiTest: {
            id: 'multiTest',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/extract' },
              {
                id: 'ext',
                action: 'extract',
                container: '.item',
                fields: { name: '.name', price: '.price' },
                outputVar: 'products',
              },
            ],
            output: ['products'],
          },
        },
      };

      const result = await executor.execute(site, 'multiTest', {});
      expect(result.success).toBe(true);
      expect(result.data.products).toBeDefined();

      const outputFile = join(outputDir, 'products.json');
      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.length).toBe(3);
    });
  });

  describe('Plugin init', () => {
    it('should call init when plugin is registered', async () => {
      const pluginManager = new PluginManager();

      let initialized = false;
      const initPlugin: FlowPlugin = {
        name: 'init-test',
        init: async (ctx) => {
          initialized = true;
        },
      };

      await pluginManager.registerPlugin(initPlugin);
      expect(initialized).toBe(true);
    });
  });
});
