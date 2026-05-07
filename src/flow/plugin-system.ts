import type { FlowStep, FlowContext } from './types.js';
import { BrowserManager } from '../browser/index.js';

export type ActionHandler = (
  step: FlowStep,
  context: FlowContext,
  browser: BrowserManager
) => Promise<void>;

export type HookCallback = (
  context: FlowContext,
  step: FlowStep,
  result?: unknown
) => Promise<void>;

export type HookType =
  | 'onFlowStart'
  | 'onFlowEnd'
  | 'onStepStart'
  | 'onStepEnd'
  | 'onStepError'
  | 'onPageChange'
  | 'onDataExtracted'
  | 'onHumanIntervention';

export type DataPipelineHandler = (
  data: Record<string, unknown>,
  context: FlowContext
) => Promise<void>;

export interface FlowPlugin {
  name: string;
  version?: string;
  description?: string;
  actions?: Record<string, ActionHandler>;
  hooks?: Partial<Record<HookType, HookCallback>>;
  dataHandlers?: DataPipelineHandler[];
  init?: (context: PluginContext) => Promise<void>;
  cleanup?: () => Promise<void>;
}

export interface PluginContext {
  getBrowser: () => BrowserManager;
  getContext: () => FlowContext;
  getActionHandler: (actionName: string) => ActionHandler | undefined;
  executeStep: (step: FlowStep) => Promise<void>;
}

export class PluginManager {
  private customActions: Map<string, ActionHandler> = new Map();
  private hooks: Map<HookType, HookCallback[]> = new Map();
  private dataHandlers: DataPipelineHandler[] = [];
  private plugins: Map<string, FlowPlugin> = new Map();
  private browser: BrowserManager | null = null;
  private context: FlowContext | null = null;
  private executeStepFn: ((step: FlowStep) => Promise<void>) | null = null;

  async registerPlugin(plugin: FlowPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered, replacing...`);
      await this.unregisterPlugin(plugin.name);
    }

    if (plugin.actions) {
      for (const [actionName, handler] of Object.entries(plugin.actions)) {
        this.customActions.set(actionName, handler);
      }
    }

    if (plugin.hooks) {
      for (const [hookType, callback] of Object.entries(plugin.hooks)) {
        if (!this.hooks.has(hookType as HookType)) {
          this.hooks.set(hookType as HookType, []);
        }
        this.hooks.get(hookType as HookType)?.push(callback as HookCallback);
      }
    }

    if (plugin.dataHandlers) {
      this.dataHandlers.push(...plugin.dataHandlers);
    }

    this.plugins.set(plugin.name, plugin);

    if (plugin.init) {
      await plugin.init(this.createPluginContext());
    }

    console.log(
      `[PluginManager] Registered plugin: ${plugin.name} (${
        Object.keys(plugin.actions || {}).length
      } actions, ${Object.keys(plugin.hooks || {}).length} hooks)`
    );
  }

  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    if (plugin.actions) {
      for (const actionName of Object.keys(plugin.actions)) {
        this.customActions.delete(actionName);
      }
    }

    if (plugin.hooks) {
      for (const [hookType, callback] of Object.entries(plugin.hooks)) {
        const hooks = this.hooks.get(hookType as HookType);
        if (hooks) {
          const idx = hooks.indexOf(callback as HookCallback);
          if (idx >= 0) hooks.splice(idx, 1);
        }
      }
    }

    if (plugin.dataHandlers) {
      this.dataHandlers = this.dataHandlers.filter((h) => !(plugin.dataHandlers ?? []).includes(h));
    }

    if (plugin.cleanup) {
      await plugin.cleanup();
    }

    this.plugins.delete(name);
    console.log(`[PluginManager] Unregistered plugin: ${name}`);
  }

  setBrowser(browser: BrowserManager): void {
    this.browser = browser;
  }

  setContext(context: FlowContext): void {
    this.context = context;
  }

  setExecuteStep(fn: (step: FlowStep) => Promise<void>): void {
    this.executeStepFn = fn;
  }

  hasAction(actionName: string): boolean {
    return this.customActions.has(actionName);
  }

  async executeAction(actionName: string, step: FlowStep): Promise<void> {
    const handler = this.customActions.get(actionName);
    if (!handler) {
      throw new Error(`Unknown custom action: ${actionName}`);
    }
    if (!this.context) {
      throw new Error('PluginManager context not initialized');
    }
    await handler(step, this.context, this.browser as BrowserManager);
  }

  async triggerHook(hookType: HookType, step?: FlowStep, result?: unknown): Promise<void> {
    const callbacks = this.hooks.get(hookType);
    if (!callbacks || callbacks.length === 0) return;

    if (!this.context) return;

    for (const callback of callbacks) {
      try {
        await callback(
          this.context,
          step || { id: '', action: '' as unknown as import('./types.js').StepAction },
          result
        );
      } catch (e) {
        console.warn(`[PluginManager] Hook ${hookType} error: ${e}`);
      }
    }
  }

  async processData(data: Record<string, unknown>): Promise<void> {
    if (!this.context) return;

    for (const handler of this.dataHandlers) {
      try {
        await handler(data, this.context);
      } catch (e) {
        console.warn(`[PluginManager] Data handler error: ${e}`);
      }
    }
  }

  listPlugins(): Array<{ name: string; version?: string; description?: string }> {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
    }));
  }

  listActions(): string[] {
    return Array.from(this.customActions.keys());
  }

  private createPluginContext(): PluginContext {
    return {
      getBrowser: () => this.browser as BrowserManager,
      getContext: () => this.context as FlowContext,
      getActionHandler: (name: string) => this.customActions.get(name),
      executeStep: (step: FlowStep) =>
        (this.executeStepFn as (step: FlowStep) => Promise<void>)(step),
    };
  }
}
