import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';

export interface PluginCommandMeta {
  description: string;
  usage: string;
  options?: Record<string, string>;
}

export interface PluginMeta {
  name: string;
  version: string;
  description?: string;
  commands: Record<string, PluginCommandMeta>;
}

export interface PluginContext {
  browser: BrowserManager;
  page: Page;

  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  scrape(url: string, opts?: { format?: string; selector?: string }): Promise<string>;
  eval(expression: string): Promise<any>;
  snapshot(opts?: { interactive?: boolean }): Promise<string>;

  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  select(selector: string, values: string | string[]): Promise<void>;

  wait(ms: number): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;

  title(): Promise<string>;
  url(): string;

  newTab(url?: string): Promise<Page>;
  closeTab(page?: Page): Promise<void>;
}

export type PluginCommandHandler = (
  ctx: PluginContext,
  args: string[],
  flags: Record<string, string | boolean>
) => Promise<any>;

export interface AgentBrowserPlugin {
  meta: PluginMeta;
  init?: (ctx: PluginContext) => Promise<void>;
  cleanup?: () => Promise<void>;
  handlers: Record<string, PluginCommandHandler>;
}

export type PluginSourceType = 'local' | 'npm' | 'git' | 'url' | 'builtin';

export interface PluginSource {
  type: PluginSourceType;
  ref: string;
}

export interface InstallResult {
  name: string;
  version: string;
  path: string;
}

export interface PluginInstaller {
  readonly type: PluginSourceType;
  detect(source: string): boolean;
  install(source: string, pluginsDir: string): Promise<InstallResult>;
  uninstall(name: string, pluginsDir: string): Promise<void>;
}

export interface PluginRegistryEntry {
  name: string;
  version: string;
  source: PluginSource;
  installedAt: string;
  path: string;
}

export interface PluginRegistryFile {
  plugins: Record<string, PluginRegistryEntry>;
}
