import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import type { Command, Response } from '../types.js';

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

export interface AskOptions {
  /** Include a screenshot with the question */
  screenshot?: boolean;
  /** Maximum wait time for answer in ms (default: 120000) */
  timeout?: number;
}

export interface AskResult {
  answer: string;
  /** Base64-encoded screenshot if screenshot was taken */
  screenshot?: string;
}

export interface ViewerInfo {
  /** HTTP viewer URL */
  url: string;
  /** WebSocket URL */
  wsUrl: string;
  /** Stream server port */
  port: number;
}

export interface PluginContext {
  browser: BrowserManager;
  page: Page;

  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  scrape(url: string, opts?: { format?: string; selector?: string }): Promise<string>;
  eval(expression: string): Promise<unknown>;
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

  requireLogin(options: {
    site: string;
    loginUrl: string;
    checkScript: string;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<{ loggedIn: boolean; message: string }>;

  inFrame(frameSelector: string): {
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;
    eval(expression: string): Promise<unknown>;
    snapshot(): Promise<string>;
    locator(selector: string): import('playwright-core').Locator;
  };

  /**
   * Dispatch any CLI action from plugin code.  Type auto-inferred from action name.
   *
   *   ctx.dispatch({ action: 'screenshot', fullPage: true })        → Response<ScreenshotData>
   *   ctx.dispatch({ action: 'ask', question: '处理验证码?' })       → Response<AskData>
   *   ctx.dispatch({ action: 'viewer' })                            → Response<ViewerData>
   *   ctx.dispatch({ action: 'network.requests' })                  → Response<RequestsData>
   *
   * Never needs to change when new CLI commands are added.
   */
  dispatch<T extends Command>(cmd: Omit<T, 'id'>): Promise<Response<unknown>>;
}

export type PluginCommandHandler = (
  ctx: PluginContext,
  args: string[],
  flags: Record<string, string | boolean>
) => Promise<unknown>;

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
