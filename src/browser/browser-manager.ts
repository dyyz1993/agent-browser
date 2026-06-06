import {
  chromium,
  firefox,
  webkit,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
  type Frame,
  type Dialog,
  type Route,
  type Locator,
  type CDPSession,
} from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import type { LaunchCommand } from '../types.js';
import {
  type RefMap,
  type EnhancedSnapshot,
  getEnhancedSnapshot,
  generateStableSelectors,
  parseRef,
} from '../snapshot.js';
import { SnapshotStore, SnapshotElement } from '../snapshot-store.js';
import { getEventCallbacks } from '../browser-events.js';
import { NetworkTracker } from './network-tracker.js';
import type { NetworkPatternStore } from './network-pattern-store.js';
import { ScreencastManager } from './screencast-manager.js';
import { RecordingManager } from './recording-manager.js';
import { RecorderManager } from './recorder-manager.js';
import { CollectorManager } from './collector-manager.js';
import {
  connectToBrowserbase,
  connectToKernel,
  connectToBrowserUse,
  connectViaCDP,
  closeBrowserbaseSession,
  closeBrowserUseSession,
  closeKernelSession,
} from './providers.js';
import type { ScreencastFrame, ScreencastOptions } from './types.js';

export type { ScreencastFrame, ScreencastOptions } from './types.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private cdpEndpoint: string | null = null;
  private isPersistentContext = false;
  private browserbaseSessionId: string | null = null;
  private browserbaseApiKey: string | null = null;
  private browserUseSessionId: string | null = null;
  private browserUseApiKey: string | null = null;
  private kernelSessionId: string | null = null;
  private kernelApiKey: string | null = null;
  private contexts: BrowserContext[] = [];
  private pages: Page[] = [];
  private activePageIndex = 0;
  private dialogHandler: ((dialog: Dialog) => Promise<void>) | null = null;
  private isRecordingHar = false;
  private refMap: RefMap = {};
  private lastSnapshot = '';
  private snapshotStore: SnapshotStore = new SnapshotStore();
  private scopedHeaderRoutes: Map<string, (route: Route) => Promise<void>> = new Map();
  private commandHistory: Array<{
    action: string;
    selector: string;
    value?: string;
    success: boolean;
    timestamp: number;
  }> = [];
  private cdpSession: CDPSession | null = null;
  private routes: Map<string, (route: Route) => Promise<void>> = new Map();

  readonly network: NetworkTracker;
  readonly screencast: ScreencastManager;
  readonly recording: RecordingManager;
  readonly recorder: RecorderManager;
  readonly collector: CollectorManager;

  private _patternStore?: NetworkPatternStore;

  constructor(patternStore?: NetworkPatternStore) {
    this._patternStore = patternStore;
    this.network = new NetworkTracker(() => this.getPage(), patternStore);
    this.screencast = new ScreencastManager(() => this.getCDPSession());
    this.recording = new RecordingManager({
      getBrowser: () => this.browser,
      getPage: () => this.getPage(),
      getContexts: () => this.contexts,
      getPages: () => this.pages,
      getActivePageIndex: () => this.activePageIndex,
      setActivePageIndex: (i: number) => {
        this.activePageIndex = i;
      },
      addPage: (page: Page) => {
        if (!this.pages.includes(page)) this.pages.push(page);
      },
      addContext: (context: BrowserContext) => {
        if (!this.contexts.includes(context)) this.contexts.push(context);
      },
      removePage: (page: Page) => {
        const idx = this.pages.indexOf(page);
        if (idx !== -1) this.pages.splice(idx, 1);
      },
      removeContext: (context: BrowserContext) => {
        const idx = this.contexts.indexOf(context);
        if (idx !== -1) this.contexts.splice(idx, 1);
      },
      setupPageTracking: (page: Page) => this.setupPageTracking(page),
      invalidateCDPSession: () => this.invalidateCDPSession(),
    });
    this.recorder = new RecorderManager({
      getPage: () => this.getPage(),
      getPages: () => this.pages,
      getActivePageIndex: () => this.activePageIndex,
      setActivePageIndex: (i: number) => {
        this.activePageIndex = i;
      },
      getCDPSession: () => this.getCDPSession(),
      getCdpEndpoint: () => this.cdpEndpoint,
    });
    this.collector = new CollectorManager(() => this.getPage());
  }

  isLaunched(): boolean {
    if (this.isPersistentContext) return true;
    if (!this.browser) return false;
    return this.browser.isConnected();
  }

  getPatternStore(): NetworkPatternStore | undefined {
    return this._patternStore;
  }

  async getSnapshot(options?: {
    interactive?: boolean;
    cursor?: boolean;
    maxDepth?: number;
    compact?: boolean;
    selector?: string;
    framePath?: string;
    path?: boolean;
    attrs?: boolean;
    selectors?: boolean;
    all?: boolean;
  }): Promise<EnhancedSnapshot & { snapshotId?: string }> {
    const frame = options?.framePath ? this.getFrame(options.framePath) : this.getFrame();
    const snapshot = await getEnhancedSnapshot(frame, options);
    this.refMap = snapshot.refs;
    this.lastSnapshot = snapshot.tree;

    const url = this.pages.length > 0 ? this.getPage().url() : '';
    const elements: SnapshotElement[] = [];
    let index = 1;
    for (const [ref, data] of Object.entries(snapshot.refs)) {
      elements.push({
        ref,
        index: index,
        role: data.role,
        name: data.name,
        cssSelector: '',
        xpath: '',
      });
      index++;
    }
    const snapshotId = this.snapshotStore.create(url, elements, options?.framePath);

    const elementCount = elements.length;
    const header = `Snapshot #${snapshotId} (${elementCount} interactive elements)\n---`;
    const tips = `---\nTips:\n  Get selector:  snapshot --selector-for ${snapshotId}:@e1\n  Or by index:   snapshot --selector-for ${snapshotId}:1\n  List all:      snapshot --selectors-of ${snapshotId}\n  Validate:      snapshot --validate ${snapshotId}`;
    snapshot.tree = `${header}\n${snapshot.tree}\n${tips}`;
    this.lastSnapshot = snapshot.tree;

    return { ...snapshot, snapshotId };
  }

  async ensureSelectorsGenerated(snapId: string): Promise<boolean> {
    const store = this.snapshotStore;
    if (store.isSelectorsGenerated(snapId)) return true;

    const entry = store.get(snapId);
    if (!entry) return false;

    const refs: RefMap = {};
    for (const [ref, el] of entry.elements) {
      refs[ref] = {
        selector: `getByRole('${el.role}'${el.name ? `, { name: "${el.name}", exact: true }` : ''})`,
        role: el.role,
        name: el.name,
      };
    }

    const frame = entry.framePath ? this.getFrame(entry.framePath) : this.getFrame();
    let stableSelectors: Record<string, { cssSelector: string; xpath: string }> = {};
    try {
      stableSelectors = await generateStableSelectors(frame, refs);
    } catch {
      /* empty */
    }

    for (const [ref, sel] of Object.entries(stableSelectors)) {
      const el = entry.elements.get(ref);
      if (el) {
        el.cssSelector = sel.cssSelector;
        el.xpath = sel.xpath;
      }
    }

    store.markSelectorsGenerated(snapId);
    return true;
  }

  getRefMap(): RefMap {
    return this.refMap;
  }

  getSnapshotStore(): SnapshotStore {
    return this.snapshotStore;
  }

  recordCommand(
    action: string,
    selector: string,
    value: string | undefined,
    success: boolean
  ): void {
    this.commandHistory.push({ action, selector, value, success, timestamp: Date.now() });

    if (success && value && ['fill', 'type', 'select', 'press'].includes(action)) {
      this.network.analysis.rememberInput({ selector, value, timestamp: Date.now() });
    }
  }

  getHistory(filter?: string): Array<{
    action: string;
    selector: string;
    value?: string;
    success: boolean;
    timestamp: number;
  }> {
    let history = this.commandHistory;
    if (filter) {
      history = history.filter((h) => h.selector.includes(filter) || h.action.includes(filter));
    }
    return history;
  }

  clearHistory(): void {
    this.commandHistory = [];
  }

  getLocatorFromRef(refArg: string, framePath?: string): Locator | null {
    const ref = parseRef(refArg);
    if (!ref) return null;

    const refData = this.refMap[ref];
    if (!refData) return null;

    const frame = this.getFrame(framePath);

    if (refData.role === 'clickable' || refData.role === 'focusable') {
      return frame.locator(refData.selector);
    }

    let locator: Locator;
    if (refData.name) {
      locator = frame.getByRole(refData.role as Parameters<typeof frame.getByRole>[0], {
        name: refData.name,
        exact: true,
      });
    } else {
      locator = frame.getByRole(refData.role as Parameters<typeof frame.getByRole>[0]);
    }

    if (refData.nth !== undefined) {
      locator = locator.nth(refData.nth);
    }

    return locator;
  }

  async getRefSelectorTip(selector: string): Promise<string | null> {
    const ref = parseRef(selector);
    if (!ref) return null;

    const store = this.snapshotStore;
    for (const snapId of store.getRecentIds()) {
      await this.ensureSelectorsGenerated(snapId);
      const el = store.getElement(snapId, ref);
      if (el && el.cssSelector) {
        return `[ref=${ref}] => ${el.cssSelector}`;
      }
    }
    return null;
  }

  isRef(selector: string): boolean {
    return parseRef(selector) !== null;
  }

  getLocator(selectorOrRef: string, framePath?: string): Locator {
    const locator = this.getLocatorFromRef(selectorOrRef, framePath);
    if (locator) return locator;

    const frame = framePath ? this.getFrame(framePath) : this.getFrame();
    return frame.locator(selectorOrRef);
  }

  getPage(): Page {
    if (this.pages.length === 0) {
      throw new Error('Browser not launched. Call launch first.');
    }
    return this.pages[this.activePageIndex];
  }

  getFrame(framePath?: string): Frame {
    if (!framePath) {
      return this.getPage().mainFrame();
    }
    return this.getFrameByPath(framePath);
  }

  private getFrameByPath(framePath: string): Frame {
    const page = this.getPage();

    const selectors = framePath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    if (selectors.length === 0) {
      return page.mainFrame();
    }

    let current: Frame = page.mainFrame();

    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const childFrames = current.childFrames();

      if (childFrames.length === 0) {
        throw new Error(
          `No child frames found for selector "${selector}" at path position ${i + 1}. ` +
            `Path: "${framePath}". ` +
            `Current frame has no child frames.`
        );
      }

      const matchedFrame = this.findMatchingFrame(childFrames, selector);

      if (!matchedFrame) {
        const availableInfo = childFrames.map((f, idx) => ({
          index: idx,
          name: f.name(),
          url: f.url(),
        }));
        const suggestion =
          childFrames.length > 0
            ? ` Use 'agent-browser frames' to list all iframes, or try: ${childFrames.map((f, idx) => `--in-frame "${idx}"`).join(', ')}`
            : '';
        throw new Error(
          `Frame not found for selector "${selector}" at path position ${i + 1}. ` +
            `Path: "${framePath}". ` +
            `Available child frames: ${JSON.stringify(availableInfo, null, 2)}.${suggestion}`
        );
      }

      current = matchedFrame;
    }

    return current;
  }

  private findMatchingFrame(frames: Frame[], selector: string): Frame | undefined {
    const indexMatch = selector.match(/^(\d+)$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10);
      return frames[index];
    }

    const cleanSelector = selector.replace('#', '');
    const nameMatch = frames.find((f) => f.name() === selector || f.name() === cleanSelector);
    if (nameMatch) return nameMatch;

    const urlPathMatch = frames.find((f) => {
      const url = f.url();
      return url.includes(`/${cleanSelector}`) || url.endsWith(`/${cleanSelector}`);
    });
    if (urlPathMatch) return urlPathMatch;

    return undefined;
  }

  listFrames(): Array<{ name: string; url: string; path: string }> {
    const page = this.getPage();
    const result: Array<{ name: string; url: string; path: string }> = [];

    const walk = (frame: Frame, pathSoFar: string) => {
      const children = frame.childFrames();
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const name = child.name() || '';
        const segment = name || String(i);
        const childPath = pathSoFar ? `${pathSoFar}/${segment}` : segment;
        result.push({ name, url: child.url(), path: childPath });
        walk(child, childPath);
      }
    };

    walk(page.mainFrame(), '');
    return result;
  }

  setDialogHandler(response: 'accept' | 'dismiss', promptText?: string): void {
    const page = this.getPage();

    if (this.dialogHandler) {
      page.removeListener('dialog', this.dialogHandler);
    }

    this.dialogHandler = async (dialog: Dialog) => {
      if (response === 'accept') {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    };

    page.on('dialog', this.dialogHandler);
  }

  clearDialogHandler(): void {
    if (this.dialogHandler) {
      const page = this.getPage();
      page.removeListener('dialog', this.dialogHandler);
      this.dialogHandler = null;
    }
  }

  startRequestTracking(captureResponse = false): void {
    this.network.startRequestTracking(captureResponse);
  }

  get trackingEnabled(): boolean {
    return this.network.trackingEnabled;
  }

  getRequests(filter?: string, type?: 'json') {
    return this.network.getRequests(filter, type);
  }

  clearRequests(): void {
    this.network.clearRequests();
  }

  startWebSocketTracking(): void {
    this.network.startWebSocketTracking();
  }

  get wsTrackingEnabled(): boolean {
    return this.network.wsTrackingEnabled;
  }

  getWebSockets(filter?: string) {
    return this.network.getWebSockets(filter);
  }

  clearWebSockets(): void {
    this.network.clearWebSockets();
  }

  saveRequestsToDir(
    outputDir: string,
    filter?: string,
    type?: 'json'
  ): { savedCount: number; outputPath: string; indexPath: string } {
    return this.network.saveRequestsToDir(outputDir, filter, type);
  }

  startConsoleTracking(): void {
    this.network.startConsoleTracking();
  }

  getConsoleMessages() {
    return this.network.getConsoleMessages();
  }

  clearConsoleMessages(): void {
    this.network.clearConsoleMessages();
  }

  startErrorTracking(): void {
    this.network.startErrorTracking();
  }

  getPageErrors() {
    return this.network.getPageErrors();
  }

  clearPageErrors(): void {
    this.network.clearPageErrors();
  }

  async addRoute(
    url: string,
    options: {
      response?: {
        status?: number;
        body?: string;
        contentType?: string;
        headers?: Record<string, string>;
      };
      abort?: boolean;
    }
  ): Promise<void> {
    const page = this.getPage();

    const handler = async (route: Route) => {
      if (options.abort) {
        await route.abort();
      } else if (options.response) {
        await route.fulfill({
          status: options.response.status ?? 200,
          body: options.response.body ?? '',
          contentType: options.response.contentType ?? 'text/plain',
          headers: options.response.headers,
        });
      } else {
        await route.continue();
      }
    };

    this.routes.set(url, handler);
    await page.route(url, handler);
  }

  async removeRoute(url?: string): Promise<void> {
    const page = this.getPage();

    if (url) {
      const handler = this.routes.get(url);
      if (handler) {
        await page.unroute(url, handler);
        this.routes.delete(url);
      }
    } else {
      for (const [routeUrl, handler] of this.routes) {
        await page.unroute(routeUrl, handler);
      }
      this.routes.clear();
    }
  }

  async setGeolocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setGeolocation({ latitude, longitude, accuracy });
    }
  }

  async setPermissions(permissions: string[], grant: boolean): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      if (grant) {
        await context.grantPermissions(permissions);
      } else {
        await context.clearPermissions();
      }
    }
  }

  async setViewport(width: number, height: number): Promise<void> {
    const page = this.getPage();
    await page.setViewportSize({ width, height });
  }

  async setDeviceScaleFactor(
    deviceScaleFactor: number,
    width: number,
    height: number,
    mobile: boolean = false
  ): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
  }

  async clearDeviceMetricsOverride(): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }

  getDevice(deviceName: string): (typeof devices)[keyof typeof devices] | undefined {
    return devices[deviceName as keyof typeof devices];
  }

  listDevices(): string[] {
    return Object.keys(devices);
  }

  private static readonly QUICK_PROFILES: Record<
    string,
    { width: number; height: number; label: string }
  > = {
    mobile: { width: 375, height: 812, label: 'Mobile (iPhone X)' },
    tablet: { width: 768, height: 1024, label: 'Tablet (iPad)' },
    desktop: { width: 1280, height: 720, label: 'Desktop' },
    desktop_lg: { width: 1920, height: 1080, label: 'Desktop Large' },
  };

  getQuickProfile(name: string): { width: number; height: number; label: string } | undefined {
    return BrowserManager.QUICK_PROFILES[name.toLowerCase()];
  }

  listQuickProfiles(): string[] {
    return Object.keys(BrowserManager.QUICK_PROFILES);
  }

  async startHarRecording(): Promise<void> {
    this.isRecordingHar = true;
  }

  isHarRecording(): boolean {
    return this.isRecordingHar;
  }

  async setOffline(offline: boolean): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setOffline(offline);
    }
  }

  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setExtraHTTPHeaders(headers);
    }
  }

  async setScopedHeaders(origin: string, headers: Record<string, string>): Promise<void> {
    const page = this.getPage();

    let urlPattern: string;
    try {
      const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`);
      urlPattern = `**://${url.host}/**`;
    } catch {
      urlPattern = `**://${origin}/**`;
    }

    const existingHandler = this.scopedHeaderRoutes.get(urlPattern);
    if (existingHandler) {
      await page.unroute(urlPattern, existingHandler);
    }

    const handler = async (route: Route) => {
      const requestHeaders = route.request().headers();
      await route.continue({
        headers: {
          ...requestHeaders,
          ...headers,
        },
      });
    };

    this.scopedHeaderRoutes.set(urlPattern, handler);
    await page.route(urlPattern, handler);
  }

  async clearScopedHeaders(origin?: string): Promise<void> {
    const page = this.getPage();

    if (origin) {
      let urlPattern: string;
      try {
        const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`);
        urlPattern = `**://${url.host}/**`;
      } catch {
        urlPattern = `**://${origin}/**`;
      }

      const handler = this.scopedHeaderRoutes.get(urlPattern);
      if (handler) {
        await page.unroute(urlPattern, handler);
        this.scopedHeaderRoutes.delete(urlPattern);
      }
    } else {
      for (const [pattern, handler] of this.scopedHeaderRoutes) {
        await page.unroute(pattern, handler);
      }
      this.scopedHeaderRoutes.clear();
    }
  }

  async startTracing(options: { screenshots?: boolean; snapshots?: boolean }): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.start({
        screenshots: options.screenshots ?? true,
        snapshots: options.snapshots ?? true,
      });
    }
  }

  async stopTracing(path: string): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.stop({ path });
    }
  }

  async saveStorageState(path: string): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.storageState({ path });
    }
  }

  getPages(): Page[] {
    return this.pages;
  }

  getActiveIndex(): number {
    return this.activePageIndex;
  }

  async detectNewTabDuringAction<T>(
    action: () => Promise<T>,
    timeout = 2000
  ): Promise<{ result: T; newTab?: { index: number; url: string; title: string } }> {
    const context = this.contexts[0];
    if (!context) {
      const result = await action();
      return { result };
    }

    const pagesBefore = new Set(this.pages);
    let newPageInfo: { index: number; url: string; title: string } | undefined;

    const pagePromise = new Promise<{ page: Page }>((resolve) => {
      const handler = (page: Page) => {
        if (!pagesBefore.has(page)) {
          context.off('page', handler);
          resolve({ page });
        }
      };
      context.on('page', handler);

      setTimeout(() => {
        context.off('page', handler);
        resolve({ page: null as unknown as Page });
      }, timeout);
    });

    const result = await action();

    const { page: newPage } = await pagePromise;

    if (newPage && this.pages.includes(newPage)) {
      const index = this.pages.indexOf(newPage);
      const url = newPage.url();
      let title = '';
      try {
        title = await newPage.title();
      } catch {
        // title not available yet
      }

      newPageInfo = { index, url, title: title || url };
    }

    return { result, newTab: newPageInfo };
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  private isCdpConnectionAlive(): boolean {
    if (!this.browser) return false;
    try {
      const contexts = this.browser.contexts();
      if (contexts.length === 0) {
        return false;
      }
      return contexts.some((context) => context.pages().length > 0);
    } catch {
      return false;
    }
  }

  private needsCdpReconnect(cdpEndpoint: string): boolean {
    if (!this.browser?.isConnected()) {
      return true;
    }
    if (this.cdpEndpoint !== cdpEndpoint) {
      return true;
    }
    if (!this.isCdpConnectionAlive()) {
      return true;
    }
    return false;
  }

  async launch(options: LaunchCommand): Promise<void> {
    const cdpEndpoint = options.cdpUrl ?? (options.cdpPort ? String(options.cdpPort) : undefined);
    const hasExtensions = !!options.extensions?.length;
    const hasProfile = !!options.profile;
    const hasStorageState = !!options.storageState;

    if (hasExtensions && cdpEndpoint) {
      throw new Error('Extensions cannot be used with CDP connection');
    }

    if (hasProfile && cdpEndpoint) {
      throw new Error('Profile cannot be used with CDP connection');
    }

    if (hasStorageState && hasProfile) {
      throw new Error(
        'Storage state cannot be used with profile (profile is already persistent storage)'
      );
    }

    if (hasStorageState && hasExtensions) {
      throw new Error(
        'Storage state cannot be used with extensions (extensions require persistent context)'
      );
    }

    if (this.browser && !this.browser.isConnected()) {
      await this.close();
    }

    if (this.isLaunched()) {
      const needsRelaunch =
        (!cdpEndpoint && this.cdpEndpoint !== null) ||
        (!!cdpEndpoint && this.needsCdpReconnect(cdpEndpoint));
      if (needsRelaunch) {
        await this.close();
      } else {
        return;
      }
    }

    if (cdpEndpoint) {
      const result = await connectViaCDP(cdpEndpoint, {
        addContext: (ctx) => this.contexts.push(ctx),
        addPage: (p) => this.pages.push(p),
        setupContextTracking: (ctx) => this.setupContextTracking(ctx),
        setupPageTracking: (p) => this.setupPageTracking(p),
      });
      this.browser = result.browser;
      this.cdpEndpoint = result.cdpEndpoint;
      this.activePageIndex = 0;
      return;
    }

    const provider = options.provider ?? process.env.AGENT_BROWSER_PROVIDER;
    if (provider === 'browserbase') {
      const session = await connectToBrowserbase();
      this.browser = session.browser;
      this.browserbaseSessionId = session.sessionId;
      this.browserbaseApiKey = session.apiKey;
      session.context.setDefaultTimeout(10000);
      this.contexts.push(session.context);
      this.setupContextTracking(session.context);
      this.pages.push(session.page);
      this.activePageIndex = 0;
      this.setupPageTracking(session.page);
      return;
    }
    if (provider === 'browseruse') {
      const session = await connectToBrowserUse();
      this.browser = session.browser;
      this.browserUseSessionId = session.sessionId;
      this.browserUseApiKey = session.apiKey;
      session.context.setDefaultTimeout(60000);
      this.contexts.push(session.context);
      this.pages.push(session.page);
      this.activePageIndex = 0;
      this.setupPageTracking(session.page);
      this.setupContextTracking(session.context);
      return;
    }

    if (provider === 'kernel') {
      const session = await connectToKernel();
      this.browser = session.browser;
      this.kernelSessionId = session.sessionId;
      this.kernelApiKey = session.apiKey;
      session.context.setDefaultTimeout(60000);
      this.contexts.push(session.context);
      this.pages.push(session.page);
      this.activePageIndex = 0;
      this.setupPageTracking(session.page);
      this.setupContextTracking(session.context);
      return;
    }

    const browserType = options.browser ?? 'chromium';
    if (hasExtensions && browserType !== 'chromium') {
      throw new Error('Extensions are only supported in Chromium');
    }

    if (options.allowFileAccess && browserType !== 'chromium') {
      throw new Error('allowFileAccess is only supported in Chromium');
    }

    const launcher =
      browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;
    const devicePreset = options.device
      ? devices[options.device as keyof typeof devices]
      : undefined;
    const resolvedViewport = options.viewport ??
      devicePreset?.viewport ?? { width: 1280, height: 720 };
    const resolvedUserAgent = options.userAgent ?? devicePreset?.userAgent;

    const fileAccessArgs = options.allowFileAccess
      ? ['--allow-file-access-from-files', '--allow-file-access']
      : [];

    const isHeaded = hasExtensions || options.headless === false;
    const antiDetectionArgs = [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      ...(isHeaded ? [] : ['--disable-gpu']),
      '--enable-features=WebGL',
      '--ignore-gpu-blacklist',
      ...(isHeaded ? ['--use-gl=desktop', '--enable-gpu-compositing'] : []),
    ];

    const baseArgs = options.args
      ? [...fileAccessArgs, ...antiDetectionArgs, ...options.args]
      : [...fileAccessArgs, ...antiDetectionArgs];

    let context: BrowserContext;
    if (hasExtensions) {
      const extPaths = (options.extensions ?? []).join(',');
      const session = process.env.AGENT_BROWSER_SESSION || 'default';
      const extArgs = [`--disable-extensions-except=${extPaths}`, `--load-extension=${extPaths}`];
      const allArgs = baseArgs ? [...extArgs, ...baseArgs] : extArgs;
      context = await launcher.launchPersistentContext(
        path.join(os.tmpdir(), `agent-browser-ext-${session}`),
        {
          headless: false,
          executablePath: options.executablePath,
          args: allArgs,
          viewport: resolvedViewport,
          extraHTTPHeaders: options.headers,
          userAgent: resolvedUserAgent,
          ...(options.proxy && { proxy: options.proxy }),
          ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        }
      );
      this.isPersistentContext = true;
    } else if (hasProfile) {
      const profilePath = (options.profile ?? '').replace(/^~\//, os.homedir() + '/');
      context = await launcher.launchPersistentContext(profilePath, {
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        args: baseArgs,
        viewport: resolvedViewport,
        extraHTTPHeaders: options.headers,
        userAgent: resolvedUserAgent,
        ...(options.proxy && { proxy: options.proxy }),
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
      });
      this.isPersistentContext = true;
    } else {
      this.browser = await launcher.launch({
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        args: baseArgs,
      });
      this.cdpEndpoint = null;
      context = await this.browser.newContext({
        viewport: resolvedViewport,
        extraHTTPHeaders: options.headers,
        userAgent: resolvedUserAgent,
        ...(options.proxy && { proxy: options.proxy }),
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        ...(options.storageState && { storageState: options.storageState }),
      });
    }

    await context.addInitScript(() => {
      if (!(window as unknown as Record<string, unknown>).chrome) {
        (window as unknown as Record<string, unknown>).chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        };
      }

      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
          },
          {
            name: 'Chrome PDF Viewer',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            description: '',
          },
          {
            name: 'Native Client',
            filename: 'internal-nacl-plugin',
            description: '',
          },
        ],
      });

      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => [
          {
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format',
          },
          {
            type: 'application/x-google-chrome-pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format',
          },
        ],
      });
    });

    context.setDefaultTimeout(60000);
    this.contexts.push(context);
    this.setupContextTracking(context);

    const page = context.pages()[0] ?? (await context.newPage());
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length > 0 ? this.pages.length - 1 : 0;

    if (devicePreset?.deviceScaleFactor && devicePreset.deviceScaleFactor !== 1) {
      try {
        const cdp = await this.getCDPSession();
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: resolvedViewport.width,
          height: resolvedViewport.height,
          deviceScaleFactor: devicePreset.deviceScaleFactor,
          mobile: devicePreset.isMobile ?? false,
        });
      } catch {
        // CDP not available for non-Chromium browsers
      }
    }
  }

  private setupPageTracking(page: Page): void {
    this.network.setupPageTracking(page);

    page.on('load', async () => {
      const callbacks = getEventCallbacks();
      callbacks.onNavigation?.({
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    });

    page.on('close', () => {
      const index = this.pages.indexOf(page);
      if (index !== -1) {
        this.pages.splice(index, 1);
        if (this.activePageIndex >= this.pages.length) {
          this.activePageIndex = Math.max(0, this.pages.length - 1);
        }

        const callbacks = getEventCallbacks();
        callbacks.onTabClosed?.({
          index,
          remainingTabs: this.pages.length,
        });
      }
    });
  }

  private async setupContextTracking(context: BrowserContext): Promise<void> {
    context.on('page', async (page) => {
      if (!this.pages.includes(page)) {
        this.pages.push(page);
        this.setupPageTracking(page);
      }
      const callbacks = getEventCallbacks();
      if (callbacks.onTabCreated) {
        const index = this.pages.length - 1;
        callbacks.onTabCreated({
          index,
          url: page.url(),
          title: await page.title().catch(() => ''),
        });
      }

      const newIndex = this.pages.indexOf(page);
      if (newIndex !== -1 && newIndex !== this.activePageIndex) {
        this.activePageIndex = newIndex;
        this.invalidateCDPSession().catch(() => {});
      }
    });
  }

  async newTab(): Promise<{ index: number; total: number }> {
    if (!this.browser || this.contexts.length === 0) {
      throw new Error('Browser not launched');
    }

    await this.invalidateCDPSession();

    const context = this.contexts[0];
    const page = await context.newPage();
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length - 1;

    const callbacks = getEventCallbacks();
    if (callbacks.onTabCreated) {
      const index = this.pages.length - 1;
      callbacks.onTabCreated({
        index,
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    }

    return { index: this.activePageIndex, total: this.pages.length };
  }

  async newWindow(viewport?: {
    width: number;
    height: number;
  }): Promise<{ index: number; total: number }> {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }

    const context = await this.browser.newContext({
      viewport: viewport ?? { width: 1280, height: 720 },
    });
    context.setDefaultTimeout(60000);
    this.contexts.push(context);
    this.setupContextTracking(context);

    const page = await context.newPage();
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length - 1;

    const callbacks = getEventCallbacks();
    if (callbacks.onTabCreated) {
      const index = this.pages.length - 1;
      callbacks.onTabCreated({
        index,
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    }

    return { index: this.activePageIndex, total: this.pages.length };
  }

  private async invalidateCDPSession(): Promise<void> {
    const shouldRestart = this.screencast.shouldBeActive;
    const savedCallback = this.screencast.savedCallback;
    const savedOptions = this.screencast.savedOptions;

    if (this.screencast.active) {
      await this.screencast.stopScreencastInternal();
    }

    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {});
      this.cdpSession = null;
    }

    if (shouldRestart && savedCallback) {
      try {
        await this.screencast.startScreencast(savedCallback, savedOptions ?? undefined);
      } catch {
        // Ignore errors when restarting screencast on new page
      }
    }
  }

  async switchTo(index: number): Promise<{ index: number; url: string; title: string }> {
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Invalid tab index: ${index}. Available: 0-${this.pages.length - 1}`);
    }

    if (index !== this.activePageIndex) {
      await this.invalidateCDPSession();
    }

    const previousIndex = this.activePageIndex;
    this.activePageIndex = index;
    const page = this.pages[index];

    if (this.recorder.getSessionId() && previousIndex !== index) {
      this.recorder.addStep({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: 'tab_switch',
        index: index,
      });
    }

    const callbacks = getEventCallbacks();
    callbacks.onTabSwitched?.({
      fromIndex: previousIndex,
      toIndex: index,
    });

    return {
      index: this.activePageIndex,
      url: page.url(),
      title: '',
    };
  }

  async closeTab(index?: number): Promise<{ closed: number; remaining: number }> {
    const targetIndex = index ?? this.activePageIndex;

    if (targetIndex < 0 || targetIndex >= this.pages.length) {
      throw new Error(`Invalid tab index: ${targetIndex}`);
    }

    if (this.pages.length === 1) {
      throw new Error('Cannot close the last tab. Use "close" to close the browser.');
    }

    if (this.recorder.getSessionId()) {
      this.recorder.addStep({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: 'tab_close',
        index: targetIndex,
      });
    }

    if (targetIndex === this.activePageIndex) {
      await this.invalidateCDPSession();
    }

    const page = this.pages[targetIndex];
    await page.close();
    this.pages.splice(targetIndex, 1);

    if (this.activePageIndex >= this.pages.length) {
      this.activePageIndex = this.pages.length - 1;
    } else if (this.activePageIndex > targetIndex) {
      this.activePageIndex--;
    }

    return { closed: targetIndex, remaining: this.pages.length };
  }

  async listTabs(): Promise<Array<{ index: number; url: string; title: string; active: boolean }>> {
    const tabs = await Promise.all(
      this.pages.map(async (page, index) => ({
        index,
        url: page.url(),
        title: await page.title().catch(() => ''),
        active: index === this.activePageIndex,
      }))
    );
    return tabs;
  }

  async getCDPSession(): Promise<CDPSession> {
    if (this.cdpSession) {
      return this.cdpSession;
    }

    const page = this.getPage();
    const context = page.context();

    this.cdpSession = await context.newCDPSession(page);
    return this.cdpSession;
  }

  isScreencasting(): boolean {
    return this.screencast.isScreencasting();
  }

  async startScreencast(
    callback: (frame: ScreencastFrame) => void,
    options?: ScreencastOptions
  ): Promise<void> {
    return this.screencast.startScreencast(callback, options);
  }

  async stopScreencast(): Promise<void> {
    return this.screencast.stopScreencast();
  }

  async injectMouseEvent(params: {
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle' | 'none';
    clickCount?: number;
    deltaX?: number;
    deltaY?: number;
    modifiers?: number;
  }): Promise<void> {
    return this.screencast.injectMouseEvent(params);
  }

  async injectKeyboardEvent(params: {
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
    key?: string;
    code?: string;
    text?: string;
    modifiers?: number;
  }): Promise<void> {
    return this.screencast.injectKeyboardEvent(params);
  }

  async injectTouchEvent(params: {
    type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
    touchPoints: Array<{ x: number; y: number; id?: number }>;
    modifiers?: number;
  }): Promise<void> {
    return this.screencast.injectTouchEvent(params);
  }

  async insertText(text: string): Promise<void> {
    return this.screencast.insertText(text);
  }

  private _lastFillSelector = '';
  private _lastFillValue = '';
  private _fillFocusedSelector = '';

  async fillValue(selector: string, value: string): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    if (!selector || value === undefined) return;

    if (value === this._lastFillValue && selector === this._lastFillSelector) return;

    this._lastFillSelector = selector;
    this._lastFillValue = value;

    const needsFocus = !this._fillFocusedSelector || this._fillFocusedSelector !== selector;

    await page.evaluate(
      ({ selector, value, needsFocus }) => {
        const el = document.querySelector(selector) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLElement
          | null;
        if (!el) return { ok: false, reason: 'not_found' };

        const isContentEditable =
          el instanceof HTMLElement &&
          (el.isContentEditable || el.getAttribute('contenteditable') === 'true');

        if (needsFocus && !isContentEditable) {
          el.focus();
        }

        if (isContentEditable) {
          if (needsFocus) el.focus();
          document.execCommand('selectAll', false, undefined);
          document.execCommand('insertText', false, value);
          return { ok: true, method: 'contenteditable' };
        }

        const tag = el.tagName.toLowerCase();
        const isInput = tag === 'input';
        const isTextarea = tag === 'textarea';

        if (!isInput && !isTextarea) {
          return { ok: false, reason: 'not_input' };
        }

        const proto = isInput
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, value);
        } else {
          (el as HTMLInputElement | HTMLTextAreaElement).value = value;
        }

        el.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertReplacementText',
            data: value,
          })
        );

        return { ok: true, method: 'native_setter' };
      },
      { selector, value, needsFocus }
    );

    if (needsFocus) {
      this._fillFocusedSelector = selector;
    }
  }

  clearFillState(selector?: string): void {
    if (selector && this._fillFocusedSelector === selector) {
      this._fillFocusedSelector = '';
    }
    if (!selector) {
      this._fillFocusedSelector = '';
      this._lastFillSelector = '';
      this._lastFillValue = '';
    }
  }

  async blurElement(selector: string): Promise<void> {
    const page = this.getPage();
    if (!page) return;
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.blur();
    }, selector);
  }

  async pressKey(key: string): Promise<void> {
    const page = this.getPage();
    if (!page) return;
    await page.keyboard.press(key);
  }

  private focusListenerAttached = false;

  async injectFocusListener(
    onEvent: (data: { type: string; [key: string]: unknown }) => void
  ): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    if (this.focusListenerAttached) return;
    this.focusListenerAttached = true;

    // Secondary channel: console.log intercepted by Playwright
    page.on('console', (msg) => {
      const text = msg.text();
      if (typeof text === 'string' && text.startsWith('__AB_INPUT__')) {
        try {
          const data = JSON.parse(text.slice('__AB_INPUT__'.length));
          onEvent(data);
        } catch {
          // Non-fatal: malformed JSON in console message
        }
      }
    });

    const cdp = await this.getCDPSession();
    const injectScript = this.focusInjectScript;

    // Enable Runtime to receive bindingCalled events
    await cdp.send('Runtime.enable');

    // Primary channel: CDP binding in the main world
    await cdp.send('Runtime.addBinding', { name: '__abInputEvent' });
    cdp.on('Runtime.bindingCalled', (params: Record<string, unknown>) => {
      if (params.name === '__abInputEvent') {
        try {
          const data = JSON.parse(params.payload as string);
          onEvent(data);
        } catch {
          // Non-fatal: malformed binding payload
        }
      }
    });

    // Inject into main world on every new navigation
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injectScript });

    // Inject into main world on the current page
    await cdp.send('Runtime.evaluate', { expression: injectScript });
  }

  private focusInjectScript = `
    (function() {
      if (window.__agentBrowserListenerInjected) return;
      window.__agentBrowserListenerInjected = true;
      var _abSend = function(data) {
        try { console.log('__AB_INPUT__' + JSON.stringify(data)); } catch(ex) {}
        try { if (typeof window.__abInputEvent === 'function') window.__abInputEvent(JSON.stringify(data)); } catch(ex) {}
      };
      var _abUserInteracting = false;
      document.addEventListener('mousedown', function() { _abUserInteracting = true; }, true);
      document.addEventListener('touchstart', function() { _abUserInteracting = true; }, true);
      document.addEventListener('keydown', function() { _abUserInteracting = true; }, true);
      document.addEventListener('focus', function(e) {
        var el = e.target;
        if (!el) return;
        var tag = el.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
        if (!_abUserInteracting) return;
        _abUserInteracting = false;
        var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        _abSend({
          type: 'input_focused',
          tag: tag,
          inputType: el.type || '',
          value: typeof el.value === 'string' ? el.value : '',
          placeholder: el.placeholder || '',
          id: el.id || '',
          rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
          selector: (function() {
            if (el.id) return '#' + el.id;
            if (el.name && el.name) return '[name="' + el.name + '"]';
            return el.tagName.toLowerCase();
          })()
        });
      }, true);
      document.addEventListener('input', function(e) {
        var el = e.target;
        if (!el) return;
        var tag = el.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
        _abSend({
          type: 'input_value',
          text: typeof el.value === 'string' ? el.value : ''
        });
      }, true);
      document.addEventListener('blur', function() {
        _abSend({ type: 'input_blur' });
      }, true);
    })();
  `;

  isRecording(): boolean {
    return this.recording.isRecording();
  }

  isRecordingSession(): boolean {
    return this.recorder.isRecordingSession();
  }

  async injectRecorderIfNeeded(): Promise<void> {
    return this.recorder.injectRecorderIfNeeded();
  }

  get recorderPaused(): boolean {
    return this.recorder.recorderPaused;
  }

  set recorderPaused(val: boolean) {
    this.recorder.recorderPaused = val;
  }

  pauseRecording(): void {
    this.recorder.pauseRecording();
  }

  resumeRecording(): void {
    this.recorder.resumeRecording();
  }

  recordStep(step: {
    action: string;
    index?: number;
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    selector?: string;
    value?: string;
  }): void {
    this.recorder.recordStep(step);
  }

  async startRecording(outputPath: string, url?: string): Promise<void> {
    return this.recording.startRecording(outputPath, url);
  }

  async stopRecording(): Promise<{ path: string; frames: number; error?: string }> {
    return this.recording.stopRecording();
  }

  async restartRecording(
    outputPath: string,
    url?: string
  ): Promise<{ previousPath?: string; stopped: boolean }> {
    return this.recording.restartRecording(outputPath, url);
  }

  async startRecorder(
    url?: string,
    hide: boolean = false
  ): Promise<{ started: boolean; sessionId: string }> {
    return this.recorder.startRecorder(url, hide);
  }

  async stopRecorder(): Promise<{ yaml: string; steps: number; wasRecording?: boolean }> {
    return this.recorder.stopRecorder();
  }

  getRecorderStatus(): { isRecording: boolean; sessionId?: string; steps: number } {
    return this.recorder.getRecorderStatus();
  }

  async close(): Promise<void> {
    if (this.recording.isRecording()) {
      await this.recording.stopRecording();
    }

    if (this.screencast.active) {
      await this.screencast.stopScreencast();
    }

    const page = this.pages.length > 0 ? this.getPage() : null;
    this.recorder.cleanup(page);

    this.network.cleanup(page);
    this.routes.clear();

    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {});
      this.cdpSession = null;
    }

    const closePages = async () => {
      for (const page of this.pages) {
        await page.close().catch(() => {});
      }
    };

    const closeBrowser = async () => {
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    };

    if (this.browserbaseSessionId && this.browserbaseApiKey) {
      await closeBrowserbaseSession(this.browserbaseSessionId, this.browserbaseApiKey).catch(
        (error) => {
          console.error('Failed to close Browserbase session:', error);
        }
      );
      this.browser = null;
    } else if (this.browserUseSessionId && this.browserUseApiKey) {
      await closeBrowserUseSession(this.browserUseSessionId, this.browserUseApiKey).catch(
        (error) => {
          console.error('Failed to close Browser Use session:', error);
        }
      );
      this.browser = null;
    } else if (this.kernelSessionId && this.kernelApiKey) {
      await closeKernelSession(this.kernelSessionId, this.kernelApiKey).catch((error) => {
        console.error('Failed to close Kernel session:', error);
      });
      this.browser = null;
    } else if (this.cdpEndpoint !== null) {
      if (this.browser) {
        try {
          const allPages = this.browser.contexts().flatMap((ctx) => ctx.pages());
          for (const p of allPages) {
            await p.close().catch(() => {});
          }
          await this.browser.close();
        } catch {
          /* ignored */
        } finally {
          this.browser = null;
        }
      }
    } else {
      await closePages();
      for (const context of this.contexts) {
        await context.close().catch(() => {});
      }
      await closeBrowser();
    }

    this.pages = [];
    this.contexts = [];
    this.cdpEndpoint = null;
    this.browserbaseSessionId = null;
    this.browserbaseApiKey = null;
    this.browserUseSessionId = null;
    this.browserUseApiKey = null;
    this.kernelSessionId = null;
    this.kernelApiKey = null;
    this.isPersistentContext = false;
    this.activePageIndex = 0;
    this.refMap = {};
    this.lastSnapshot = '';

    this.screencast.cleanup();
    this.recording.cleanup();
  }
}
