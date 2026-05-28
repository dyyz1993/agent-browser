# Plugin System Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix plugin lifecycle defects, add centralized plugin marketplace, implement plugin sandbox.

**Architecture:** Three-phase overhaul: (1) fix existing lifecycle/safety defects in plugin registry, (2) add a GitHub-based marketplace registry with search/publish/version, (3) implement permission-based sandbox for plugin execution.

**Tech Stack:** TypeScript, jiti (existing), zod (existing), GitHub API (for marketplace), Node.js worker_threads (sandbox)

---

## Phase 1: Fix Existing Defects

### Task 1: Fix Plugin cleanup() Lifecycle

**Problem:** `AgentBrowserPlugin.cleanup()` is defined in interface but never called by `PluginRegistry`. Only the Flow system's `PluginManager` calls it.

**Files:**
- Modify: `src/plugins/registry.ts:89-308`

**Step 1: Add cleanup tracking to registry**

Add a `loadedPlugins` Map to track loaded plugin instances, and call cleanup on uninstall/daemon-shutdown.

```typescript
// In PluginRegistry class, add property:
private loadedPlugins = new Map<string, AgentBrowserPlugin>();
```

**Step 2: Track loaded plugins in execute()**

In `execute()` method (line 279-305), after finding plugin, store it:

```typescript
async execute(...): Promise<unknown> {
  const plugin = await this.find(pluginName);
  if (!plugin) throw new Error(`Plugin "${pluginName}" not found`);
  this.loadedPlugins.set(pluginName, plugin);
  // ... rest unchanged
}
```

**Step 3: Call cleanup in uninstall()**

In `uninstall()` method (line 113-135), before deleting:

```typescript
const loaded = this.loadedPlugins.get(name);
if (loaded?.cleanup) {
  try { await loaded.cleanup(); } catch { /* log warning */ }
}
this.loadedPlugins.delete(name);
```

**Step 4: Add cleanupAll() for daemon shutdown**

```typescript
async cleanupAll(): Promise<void> {
  for (const [name, plugin] of this.loadedPlugins) {
    if (plugin.cleanup) {
      try { await plugin.cleanup(); } catch { /* log warning */ }
    }
  }
  this.loadedPlugins.clear();
}
```

**Step 5: Wire cleanupAll into daemon shutdown**

Find where daemon shuts down (search for daemon kill handler), call `pluginRegistry.cleanupAll()`.

**Step 6: Test**

Run: `npx vitest run src/__tests__/plugins --reporter=verbose`

---

### Task 2: Fix builtIn Installer — Register Core Built-in Plugins

**Problem:** `BUILTIN_LOADERS` map is empty. No plugins are registered as built-in.

**Files:**
- Modify: `src/plugins/installers/builtin-installer.ts`
- Create: `src/plugins/builtins/index.ts`

**Step 1: Create builtins index with a utility plugin**

Create `src/plugins/builtins/index.ts`:

```typescript
import type { AgentBrowserPlugin, PluginContext } from '../types.js';

const utilsPlugin: AgentBrowserPlugin = {
  meta: {
    name: 'utils',
    version: '1.0.0',
    description: 'Built-in utility commands',
    commands: {
      'wait-for-network': {
        description: 'Wait for network idle',
        usage: 'utils wait-for-network [--timeout 30000]',
        options: { '--timeout': 'Max wait time in ms (default: 30000)' },
      },
      'screenshot-diff': {
        description: 'Take screenshot and compare with baseline',
        usage: 'utils screenshot-diff <baseline-path> [--threshold 0.1]',
        options: { '--threshold': 'Diff threshold (default: 0.1)' },
      },
    },
  },
  handlers: {
    'wait-for-network': async (ctx: PluginContext, _args: string[], flags: Record<string, string | boolean>) => {
      const timeout = Number(flags.timeout) || 30000;
      await ctx.page.waitForLoadState('networkidle', { timeout });
      return { idle: true };
    },
    'screenshot-diff': async (ctx: PluginContext, args: string[], flags: Record<string, string | boolean>) => {
      const baselinePath = args[0];
      if (!baselinePath) throw new Error('Baseline path required');
      const threshold = Number(flags.threshold) || 0.1;
      const screenshot = await ctx.page.screenshot();
      // Compare with baseline file
      const fs = await import('node:fs');
      if (!fs.existsSync(baselinePath)) {
        fs.writeFileSync(baselinePath, screenshot);
        return { match: true, created: true };
      }
      const baseline = fs.readFileSync(baselinePath);
      const match = baseline.length === screenshot.length;
      return { match, threshold };
    },
  },
};

export function registerBuiltins(): void {
  // Will be called in builtin-installer.ts or at startup
  // Registration happens via the register() method
  const { builtinInstaller } = require('./installers/builtin-installer.js');
  builtinInstaller.register('utils', async () => utilsPlugin);
}
```

**Step 2: Call registerBuiltins at startup**

In `src/plugins/index.ts`, add the call at module load time.

**Step 3: Test**

Run: `agent-browser plugin list` — should show `utils` as builtin.

---

### Task 3: Add Plugin Permission Declaration

**Problem:** Plugins have unrestricted access to browser, filesystem, and network. No permission model.

**Files:**
- Modify: `src/plugins/types.ts`
- Modify: `src/plugins/registry.ts`
- Modify: `src/plugins/context.ts`

**Step 1: Define permission types in types.ts**

```typescript
export type PluginPermission =
  | 'browser:read'      // snapshot, title, url
  | 'browser:write'     // click, fill, type, press, select
  | 'browser:navigate'  // goto, back, forward
  | 'browser:tab'       // newTab, closeTab
  | 'network:read'      // scrape, network.requests
  | 'network:write'     // network.route, network.mock
  | 'fs:read'           // read files
  | 'fs:write'          // write files
  | 'eval'              // page.evaluate, ctx.eval
  | 'clipboard'         // clipboard access
  | 'screenshot'        // screenshot, pdf
  | 'ask'               // ask user (viewer)
  | 'dispatch'          // dispatch() — implies all above
  ;

export interface PluginMeta {
  name: string;
  version: string;
  description?: string;
  commands: Record<string, PluginCommandMeta>;
  permissions?: PluginPermission[];
}
```

**Step 2: Create permission-checked PluginContext wrapper**

In `src/plugins/context.ts`, create `createSandboxedContext()`:

```typescript
export function createSandboxedContext(
  browser: BrowserManager,
  allowed: PluginPermission[]
): PluginContext {
  const full = createPluginContext(browser);

  function check(perm: PluginPermission, action: string): void {
    if (!allowed.includes(perm) && !allowed.includes('dispatch')) {
      throw new Error(`Permission denied: "${perm}" required for ${action}. Add "${perm}" to plugin meta.permissions.`);
    }
  }

  return {
    ...full,
    click(sel: string) { check('browser:write', 'click'); return full.click(sel); },
    fill(sel: string, val: string) { check('browser:write', 'fill'); return full.fill(sel, val); },
    eval(expr: string) { check('eval', 'eval'); return full.eval(expr); },
    // ... wrap each method with permission check
  };
}
```

**Step 3: Use sandboxed context in registry execute()**

In `registry.ts execute()`, check permissions:

```typescript
const permissions = plugin.meta.permissions;
if (permissions && !permissions.includes('dispatch')) {
  ctx = createSandboxedContext(browser, permissions);
} else {
  ctx = createPluginContext(browser);
}
```

If `permissions` is undefined (old plugins), allow all (backward compatible).

**Step 4: Test**

Write test: plugin without `browser:write` permission calling `click()` should throw.

---

## Phase 2: Plugin Marketplace

### Task 4: Design Marketplace Registry Format

**Architecture:** Use a GitHub repo as the registry backend. A JSON index file lists all available plugins.

**Files:**
- Create: `src/plugins/marketplace/types.ts`
- Create: `src/plugins/marketplace/registry.ts`

**Step 1: Define marketplace types**

`src/plugins/marketplace/types.ts`:

```typescript
export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  installSource: string;
  tags: string[];
  stars?: number;
  downloads?: number;
  verified: boolean;
  permissions?: string[];
  commands: Record<string, { description: string; usage: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceIndex {
  version: number;
  updatedAt: string;
  plugins: MarketplacePlugin[];
}

export interface SearchResult {
  query: string;
  total: number;
  results: MarketplacePlugin[];
}
```

**Step 2: Create registry client**

`src/plugins/marketplace/registry.ts`:

```typescript
import type { MarketplaceIndex, MarketplacePlugin, SearchResult } from './types.js';

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/dyyz1993/agent-browser-plugins/main/registry.json';

export class MarketplaceRegistry {
  private cache: MarketplaceIndex | null = null;
  private cacheExpiry = 0;
  private readonly ttl: number;

  constructor(
    private registryUrl: string = process.env.AGENT_BROWSER_PLUGIN_REGISTRY || DEFAULT_REGISTRY_URL,
    ttlMs: number = 5 * 60 * 1000
  ) {
    this.ttl = ttlMs;
  }

  async getIndex(): Promise<MarketplaceIndex> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) return this.cache;

    const response = await fetch(this.registryUrl);
    if (!response.ok) throw new Error(`Failed to fetch plugin registry: ${response.status}`);

    this.cache = await response.json() as MarketplaceIndex;
    this.cacheExpiry = now + this.ttl;
    return this.cache;
  }

  async search(query: string): Promise<SearchResult> {
    const index = await this.getIndex();
    const q = query.toLowerCase();
    const results = index.plugins.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
    return { query, total: results.length, results };
  }

  async getPlugin(name: string): Promise<MarketplacePlugin | null> {
    const index = await this.getIndex();
    return index.plugins.find((p) => p.name === name) ?? null;
  }

  async list(options?: { tag?: string; sort?: 'downloads' | 'stars' | 'updated' }): Promise<MarketplacePlugin[]> {
    const index = await this.getIndex();
    let plugins = [...index.plugins];
    if (options?.tag) {
      plugins = plugins.filter((p) => p.tags.includes(options.tag!));
    }
    if (options?.sort) {
      const key = options.sort as keyof MarketplacePlugin;
      plugins.sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
    }
    return plugins;
  }
}
```

---

### Task 5: Add Marketplace CLI Commands

**Files:**
- Modify: `src/cli/commands/plugin.ts`
- Modify: `src/actions/plugins.ts`
- Modify: `src/types/plugins.ts`

**New commands:**

```bash
agent-browser plugin browse              # List popular plugins from marketplace
agent-browser plugin search <keyword>    # Search marketplace (not just local)
agent-browser plugin publish             # Publish current plugin to marketplace (PR-based)
agent-browser plugin info <name>         # Show marketplace info if not found locally
```

**Step 1: Add marketplace search to CLI**

Modify `plugin.ts` command parser to add `browse` subcommand, and update `search` to also query marketplace.

**Step 2: Add action handler**

In `plugins.ts`, add `handlePluginBrowse` and update `handlePluginSearch` to fall through to marketplace when local results are empty.

**Step 3: Test**

```bash
agent-browser plugin browse
agent-browser plugin search twitter
```

---

### Task 6: Create Plugin Publish Workflow

**Architecture:** Publishing is PR-based. `plugin publish` generates a PR to the `agent-browser-plugins` repo.

**Files:**
- Create: `src/plugins/marketplace/publish.ts`

**Step 1: Implement publish command**

`src/plugins/marketplace/publish.ts`:

```typescript
export async function publishPlugin(pluginDir: string): Promise<{ prUrl: string }> {
  // 1. Load plugin's package.json and index.ts to get meta
  // 2. Validate: name, version, description, repository required
  // 3. Check name doesn't already exist (or is owner's own plugin)
  // 4. Generate registry entry JSON
  // 5. Open browser to GitHub PR creation page with pre-filled content
  //    OR use `gh` CLI to create PR if available
  const entry = await buildRegistryEntry(pluginDir);
  const prUrl = await createPullRequest(entry);
  return { prUrl };
}
```

**Step 2: Wire into CLI**

Add `publish` subcommand that calls `publishPlugin(cwd)`.

---

## Phase 3: Plugin Sandbox (Advanced)

### Task 7: Implement Worker-based Sandbox

**Problem:** Plugins run in the same process with full Node.js access. A malicious plugin can access filesystem, env vars, network.

**Architecture:** Run plugin handlers in a Node.js `worker_threads` Worker with restricted globals.

**Files:**
- Create: `src/plugins/sandbox/worker.ts`
- Create: `src/plugins/sandbox/bridge.ts`
- Modify: `src/plugins/registry.ts`

**Step 1: Design sandbox bridge protocol**

Communication between main thread and worker:

```
Main Thread                          Worker (Sandbox)
    |                                     |
    |-- { type: 'init', plugin } -------->|
    |                                     |
    |-- { type: 'execute', cmd, args } -->|
    |                                     |
    |<- { type: 'result', data } ---------|
    |                                     |
    |-- { type: 'api:click', sel } ------>|  (worker requests browser API)
    |<- { type: 'api:result', data } -----|  (main thread fulfills)
```

**Step 2: Create sandbox bridge**

`src/plugins/sandbox/bridge.ts`:

```typescript
import { Worker } from 'node:worker_threads';
import path from 'node:path';

export class SandboxBridge {
  private worker: Worker | null = null;

  async start(pluginPath: string, permissions: string[]): Promise<void> {
    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { pluginPath, permissions },
      // Restrict require to only plugin-safe modules
    });
  }

  async execute(command: string, args: string[], flags: Record<string, string | boolean>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const handler = (msg: { id: string; type: string; data?: unknown; error?: string }) => {
        if (msg.id !== id) return;
        this.worker!.off('message', handler);
        if (msg.type === 'error') reject(new Error(msg.error));
        else resolve(msg.data);
      };
      this.worker!.on('message', handler);
      this.worker!.postMessage({ id, type: 'execute', command, args, flags });
    });
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
```

**Step 3: Create worker script**

`src/plugins/sandbox/worker.ts`:

```typescript
import { parentPort, workerData } from 'node:worker_threads';
import type { PluginPermission } from '../types.js';

const { pluginPath, permissions } = workerData as { pluginPath: string; permissions: PluginPermission[] };

const allowed = new Set(permissions);

async function loadAndRun(): Promise<void> {
  const mod = await import(pluginPath);
  const plugin = mod.default ?? mod;

  parentPort!.on('message', async (msg: { id: string; type: string; command: string; args: string[]; flags: Record<string, string | boolean> }) => {
    if (msg.type === 'execute') {
      try {
        // Request context from main thread via API calls
        const handler = plugin.handlers[msg.command];
        if (!handler) throw new Error(`Unknown command: ${msg.command}`);
        // Handler receives a proxied context that sends API calls back to main thread
        const result = await handler(createProxiedContext(msg.id), msg.args, msg.flags);
        parentPort!.postMessage({ id: msg.id, type: 'result', data: result });
      } catch (e) {
        parentPort!.postMessage({ id: msg.id, type: 'error', error: String(e) });
      }
    }
  });
}

function createProxiedContext(requestId: string) {
  return new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      return (...args: unknown[]) => {
        return new Promise((resolve, reject) => {
          const subId = `${requestId}:${prop}:${Date.now()}`;
          const handler = (msg: { subId: string; type: string; data?: unknown; error?: string }) => {
            if (msg.subId !== subId) return;
            parentPort!.off('message', handler);
            if (msg.type === 'error') reject(new Error(msg.error));
            else resolve(msg.data);
          };
          parentPort!.on('message', handler);
          parentPort!.postMessage({ id: requestId, subId, type: 'api', method: prop, args });
        });
      };
    },
  });
}

loadAndRun().catch((e) => parentPort!.postMessage({ type: 'fatal', error: String(e) }));
```

**Step 4: Integrate sandbox into registry**

In `registry.ts execute()`, check if sandbox mode is enabled:

```typescript
const useSandbox = process.env.AGENT_BROWSER_PLUGIN_SANDBOX === '1';
if (useSandbox && plugin.meta.permissions) {
  const bridge = new SandboxBridge();
  await bridge.start(entry.path, plugin.meta.permissions);
  const result = await bridge.execute(commandName, args, flags);
  await bridge.stop();
  return result;
}
```

**Step 5: Test**

```bash
AGENT_BROWSER_PLUGIN_SANDBOX=1 agent-browser plugin run utils wait-for-network
```

---

## Summary: Task Dependency Order

```
Phase 1 (fix defects):
  Task 1: cleanup lifecycle       → independent
  Task 2: builtin plugins         → independent
  Task 3: permission declaration  → independent

Phase 2 (marketplace):
  Task 4: registry types/client   → depends on nothing
  Task 5: marketplace CLI         → depends on Task 4
  Task 6: publish workflow        → depends on Task 4

Phase 3 (sandbox):
  Task 7: worker sandbox          → depends on Task 3 (permissions)
```

**Recommended execution order:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7

**Estimated effort:**
- Phase 1: ~2 hours (3 tasks, small changes)
- Phase 2: ~4 hours (3 tasks, new code)
- Phase 3: ~4 hours (1 task, complex worker bridge)
