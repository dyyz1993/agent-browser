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
  type Request,
  type Response,
  type Route,
  type Locator,
  type CDPSession,
  type Video,
  type FrameLocator,
} from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { LaunchCommand } from './types.js';
import { type RefMap, type EnhancedSnapshot, getEnhancedSnapshot, parseRef } from './snapshot.js';
import { getEventCallbacks } from './actions.js';

// Screencast frame data from CDP
export interface ScreencastFrame {
  data: string; // base64 encoded image
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  sessionId: number;
}

// Screencast options
export interface ScreencastOptions {
  format?: 'jpeg' | 'png';
  quality?: number; // 0-100, only for jpeg
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

interface TrackedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  timestamp: number;
  resourceType: string;
  // Response data (captured when captureResponse is enabled)
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string | object;
  contentType?: string;
}

interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
}

interface PageError {
  message: string;
  timestamp: number;
}

/**
 * Manages the Playwright browser lifecycle with multiple tabs/windows
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private cdpEndpoint: string | null = null; // stores port number or full URL
  private isPersistentContext: boolean = false;
  private browserbaseSessionId: string | null = null;
  private browserbaseApiKey: string | null = null;
  private browserUseSessionId: string | null = null;
  private browserUseApiKey: string | null = null;
  private kernelSessionId: string | null = null;
  private kernelApiKey: string | null = null;
  private contexts: BrowserContext[] = [];
  private pages: Page[] = [];
  private activePageIndex: number = 0;
  private dialogHandler: ((dialog: Dialog) => Promise<void>) | null = null;
  private trackedRequests: TrackedRequest[] = [];
  private isRequestTrackingEnabled: boolean = false;
  private isResponseCaptureEnabled: boolean = false;
  get trackingEnabled(): boolean {
    return this.isRequestTrackingEnabled;
  }
  // Map to track requests for response matching (instance variable for cross-listener access)
  private pendingRequests: Map<string, TrackedRequest> = new Map();
  // Store request listener references for proper cleanup
  private requestListener: ((request: Request) => void) | null = null;
  private responseListener: ((response: Response) => Promise<void>) | null = null;
  private routes: Map<string, (route: Route) => Promise<void>> = new Map();
  private consoleMessages: ConsoleMessage[] = [];
  private pageErrors: PageError[] = [];
  private isRecordingHar: boolean = false;
  private refMap: RefMap = {};
  private lastSnapshot: string = '';
  private scopedHeaderRoutes: Map<string, (route: Route) => Promise<void>> = new Map();

  // CDP session for screencast and input injection
  private cdpSession: CDPSession | null = null;
  private screencastActive: boolean = false;
  private screencastShouldBeActive: boolean = false;
  private screencastSessionId: number = 0;
  private frameCallback: ((frame: ScreencastFrame) => void) | null = null;
  private screencastFrameHandler: ((params: any) => void) | null = null;
  private lastScreencastOptions: ScreencastOptions | null = null;

  // Video recording (Playwright native)
  private recordingContext: BrowserContext | null = null;
  private recordingPage: Page | null = null;
  private recordingOutputPath: string = '';
  private recordingTempDir: string = '';

  // User interaction recorder
  private recorderSessionId: string | null = null;
  private recorderBindingName: string | null = null; // 唯一绑定名称，避免 Playwright 绑定冲突
  private recorderStartTime: number = 0;
  private recorderSteps: any[] = [];
  private recorderPages: any[] = [];
  private recorderPageHandler: ((newPage: Page) => Promise<void>) | null = null;
  private navigationHistory: string[] = [];
  private navigationHistoryIndex: number = -1;
  private lastNavigationUrl: string = '';
  private lastNavigationTime: number = 0;
  private recorderNavigatedHandler: ((frame: Frame) => Promise<void>) | null = null;
  private recorderFrameAttachedHandler: ((frame: Frame) => Promise<void>) | null = null;

  /**
   * Check if browser is launched and still connected
   */
  isLaunched(): boolean {
    if (this.isPersistentContext) return true;
    if (!this.browser) return false;
    // Also check if the browser is still connected (user might have closed it manually)
    return this.browser.isConnected();
  }

  /**
   * Get enhanced snapshot with refs and cache the ref map
   */
  async getSnapshot(options?: {
    interactive?: boolean;
    cursor?: boolean;
    maxDepth?: number;
    compact?: boolean;
    selector?: string;
    framePath?: string;
    path?: boolean;
    attrs?: boolean;
  }): Promise<EnhancedSnapshot> {
    const frame = options?.framePath ? this.getFrame(options.framePath) : this.getFrame();
    const snapshot = await getEnhancedSnapshot(frame as any, options);
    this.refMap = snapshot.refs;
    this.lastSnapshot = snapshot.tree;
    return snapshot;
  }

  /**
   * Get the cached ref map from last snapshot
   */
  getRefMap(): RefMap {
    return this.refMap;
  }

  /**
   * Get a locator from a ref (e.g., "e1", "@e1", "ref=e1")
   * Returns null if ref doesn't exist or is invalid
   * @param refArg - The ref string (e.g., "e1", "@e1", "ref=e1")
   * @param framePath - Optional path to iframe where the ref was captured
   */
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
      locator = frame.getByRole(refData.role as any, { name: refData.name, exact: true });
    } else {
      locator = frame.getByRole(refData.role as any);
    }

    if (refData.nth !== undefined) {
      locator = locator.nth(refData.nth);
    }

    return locator;
  }

  /**
   * Check if a selector looks like a ref
   */
  isRef(selector: string): boolean {
    return parseRef(selector) !== null;
  }

  /**
   * Get locator - supports both refs and regular selectors
   */
  getLocator(selectorOrRef: string, framePath?: string): Locator {
    const locator = this.getLocatorFromRef(selectorOrRef, framePath);
    if (locator) return locator;

    const frame = framePath ? this.getFrame(framePath) : this.getFrame();
    return frame.locator(selectorOrRef);
  }

  /**
   * Get the current active page, throws if not launched
   */
  getPage(): Page {
    if (this.pages.length === 0) {
      throw new Error('Browser not launched. Call launch first.');
    }
    return this.pages[this.activePageIndex];
  }

  /**
   * Get frame by optional path
   * @param framePath - Optional path to iframe (e.g., "#frame1/#frame2/#frame3")
   *   - If not provided, returns the main frame of current page
   *   - Path is absolute from main frame, using "/" as separator
   *   - Supports multiple matching strategies:
   *     - Index: "0", "1", "2" - match by position
   *     - Name/ID: "#my-frame", "my-frame" - match by name or id attribute
   *     - URL: partial URL match like "httpbin.org"
   * @returns Frame for the target iframe
   */
  getFrame(framePath?: string): Frame {
    if (!framePath) {
      return this.getPage().mainFrame();
    }
    return this.getFrameByPath(framePath);
  }

  /**
   * Internal method to get frame by path
   * Path is absolute from main frame, using "/" as separator
   */
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
        throw new Error(
          `Frame not found for selector "${selector}" at path position ${i + 1}. ` +
            `Path: "${framePath}". ` +
            `Available child frames: ${JSON.stringify(availableInfo, null, 2)}`
        );
      }

      current = matchedFrame;
    }

    return current;
  }

  /**
   * Find a matching frame from a list of child frames
   * Supports matching by:
   * - Index: "0", "1", "2"
   * - Name/ID: "#my-frame", "my-frame"
   * - URL: partial URL match
   */
  private findMatchingFrame(frames: Frame[], selector: string): Frame | undefined {
    // 1. Try index matching (e.g., "0", "1", "2")
    const indexMatch = selector.match(/^(\d+)$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10);
      return frames[index];
    }

    // 2. Try name/ID matching
    const cleanSelector = selector.replace('#', '');
    const nameMatch = frames.find((f) => f.name() === selector || f.name() === cleanSelector);
    if (nameMatch) return nameMatch;

    // 3. Try URL path matching (e.g., "outer-iframe" matches URL containing "/outer-iframe")
    const urlPathMatch = frames.find((f) => {
      const url = f.url();
      // Match by path segment in URL (e.g., "outer-iframe" matches "/.../outer-iframe")
      return url.includes(`/${cleanSelector}`) || url.endsWith(`/${cleanSelector}`);
    });
    if (urlPathMatch) return urlPathMatch;

    return undefined;
  }

  /**
   * Set up dialog handler
   */
  setDialogHandler(response: 'accept' | 'dismiss', promptText?: string): void {
    const page = this.getPage();

    // Remove existing handler if any
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

  /**
   * Clear dialog handler
   */
  clearDialogHandler(): void {
    if (this.dialogHandler) {
      const page = this.getPage();
      page.removeListener('dialog', this.dialogHandler);
      this.dialogHandler = null;
    }
  }

  /**
   * Start tracking requests
   * @param captureResponse - Whether to capture response body (default: false for backward compatibility)
   */
  startRequestTracking(captureResponse = false): void {
    const page = this.getPage();

    // If already tracking with the same captureResponse setting, do nothing
    if (this.isRequestTrackingEnabled && this.isResponseCaptureEnabled === captureResponse) {
      return;
    }

    // Remove existing listeners if any
    if (this.requestListener) {
      page.off('request', this.requestListener);
    }
    if (this.responseListener) {
      page.off('response', this.responseListener);
    }

    // Update flags
    this.isRequestTrackingEnabled = true;
    this.isResponseCaptureEnabled = captureResponse;

    // Create request listener
    this.requestListener = (request: Request) => {
      const trackedRequest: TrackedRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        resourceType: request.resourceType(),
      };

      // Store the request
      this.trackedRequests.push(trackedRequest);

      // Store for response matching
      const key = `${request.url()}:${trackedRequest.timestamp}`;
      this.pendingRequests.set(key, trackedRequest);
    };

    page.on('request', this.requestListener);

    // Listen for response event (more reliable than request.response())
    if (captureResponse) {
      this.responseListener = async (response: Response) => {
        const request = response.request();
        const url = request.url();

        // Find the matching tracked request
        for (const [key, trackedRequest] of this.pendingRequests.entries()) {
          if (key.startsWith(url + ':')) {
            trackedRequest.status = response.status();
            trackedRequest.statusText = response.statusText();
            trackedRequest.responseHeaders = response.headers();
            trackedRequest.contentType = response.headers()['content-type'] || '';

            // Try to get response body
            try {
              const body = await response.text();
              // Try to parse as JSON if content-type indicates JSON
              if (
                trackedRequest.contentType.includes('application/json') ||
                trackedRequest.contentType.includes('text/json')
              ) {
                try {
                  trackedRequest.responseBody = JSON.parse(body);
                } catch {
                  trackedRequest.responseBody = body;
                }
              } else {
                trackedRequest.responseBody = body;
              }
            } catch {
              // Response body not available (e.g., for binary data or failed requests)
              trackedRequest.responseBody = undefined;
            }

            // Remove from pending after processing
            this.pendingRequests.delete(key);
            break;
          }
        }
      };

      page.on('response', this.responseListener);
    } else {
      this.responseListener = null;
    }
  }

  /**
   * Get tracked requests
   * @param filter - URL pattern to filter
   * @param type - Filter by response type (e.g., 'json')
   */
  getRequests(filter?: string, type?: 'json'): TrackedRequest[] {
    let requests = this.trackedRequests;

    // Filter by URL pattern
    if (filter) {
      requests = requests.filter((r) => r.url.includes(filter));
    }

    // Filter by response type
    if (type === 'json') {
      requests = requests.filter((r) => {
        const contentType = r.contentType || '';
        return contentType.includes('application/json') || contentType.includes('text/json');
      });
    }

    return requests;
  }

  /**
   * Clear tracked requests
   */
  clearRequests(): void {
    this.trackedRequests = [];
  }

  /**
   * Save tracked requests to a directory
   * @param outputDir - Directory path to save requests
   * @param filter - URL pattern to filter
   * @param type - Filter by response type (e.g., 'json')
   * @returns Object with saved count and output path
   */
  saveRequestsToDir(
    outputDir: string,
    filter?: string,
    type?: 'json'
  ): { savedCount: number; outputPath: string; indexPath: string } {
    // Get filtered requests
    const requests = this.getRequests(filter, type);

    // Resolve to absolute path
    const absolutePath = path.resolve(outputDir);

    // Check if path looks like a file (has extension and not already a directory)
    const hasExtension = path.extname(absolutePath) !== '';
    const isExistingDirectory = existsSync(absolutePath) && statSync(absolutePath).isDirectory();

    // If path looks like a file and doesn't exist as directory, use parent directory
    let targetPath = absolutePath;
    let warningMessage: string | undefined;

    if (hasExtension && !isExistingDirectory) {
      // User specified a file path, use parent directory instead
      targetPath = path.dirname(absolutePath);
      warningMessage = `Warning: "${outputDir}" looks like a file path. Using directory: "${targetPath}"`;
      console.warn(warningMessage);
    }

    // Create output directory if not exists
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

    // Build index data
    const indexData = {
      capturedAt: new Date().toISOString(),
      totalRequests: requests.length,
      requests: [] as Array<{
        index: number;
        file: string;
        url: string;
        method: string;
        status?: number;
        contentType?: string;
        timestamp: number;
      }>,
    };

    // Save each request to a separate file
    requests.forEach((request, index) => {
      const fileIndex = String(index + 1).padStart(3, '0');
      // Generate filename from URL or use index
      const urlObj = new URL(request.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const baseName = pathParts.length > 0 ? pathParts.join('_').substring(0, 50) : 'request';
      const fileName = `${fileIndex}_${baseName}.json`;
      const filePath = path.join(targetPath, fileName);

      // Save individual request file
      const requestData = {
        url: request.url,
        method: request.method,
        status: request.status,
        contentType: request.contentType,
        timestamp: request.timestamp,
        body: request.responseBody,
      };
      writeFileSync(filePath, JSON.stringify(requestData, null, 2), 'utf-8');

      // Add to index
      indexData.requests.push({
        index: index + 1,
        file: fileName,
        url: request.url,
        method: request.method,
        status: request.status,
        contentType: request.contentType,
        timestamp: request.timestamp,
      });
    });

    // Save index file
    const indexPath = path.join(targetPath, 'index.json');
    writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');

    return {
      savedCount: requests.length,
      outputPath: targetPath,
      indexPath,
    };
  }

  /**
   * Add a route to intercept requests
   */
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

  /**
   * Remove a route
   */
  async removeRoute(url?: string): Promise<void> {
    const page = this.getPage();

    if (url) {
      const handler = this.routes.get(url);
      if (handler) {
        await page.unroute(url, handler);
        this.routes.delete(url);
      }
    } else {
      // Remove all routes
      for (const [routeUrl, handler] of this.routes) {
        await page.unroute(routeUrl, handler);
      }
      this.routes.clear();
    }
  }

  /**
   * Set geolocation
   */
  async setGeolocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setGeolocation({ latitude, longitude, accuracy });
    }
  }

  /**
   * Set permissions
   */
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

  /**
   * Set viewport
   */
  async setViewport(width: number, height: number): Promise<void> {
    const page = this.getPage();
    await page.setViewportSize({ width, height });
  }

  /**
   * Set device scale factor (devicePixelRatio) via CDP
   * This sets window.devicePixelRatio which affects how the page renders and responds to media queries
   *
   * Note: When using CDP to set deviceScaleFactor, screenshots will be at logical pixel dimensions
   * (viewport size), not physical pixel dimensions (viewport × scale). This is a Playwright limitation
   * when using CDP emulation on existing contexts. For true HiDPI screenshots with physical pixels,
   * deviceScaleFactor must be set at context creation time.
   *
   * Must be called after setViewport to work correctly
   */
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

  /**
   * Clear device metrics override to restore default devicePixelRatio
   */
  async clearDeviceMetricsOverride(): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }

  /**
   * Get device descriptor
   */
  getDevice(deviceName: string): (typeof devices)[keyof typeof devices] | undefined {
    return devices[deviceName as keyof typeof devices];
  }

  /**
   * List available devices
   */
  listDevices(): string[] {
    return Object.keys(devices);
  }

  /**
   * Start console message tracking
   */
  startConsoleTracking(): void {
    const page = this.getPage();
    page.on('console', (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get console messages
   */
  getConsoleMessages(): ConsoleMessage[] {
    return this.consoleMessages;
  }

  /**
   * Clear console messages
   */
  clearConsoleMessages(): void {
    this.consoleMessages = [];
  }

  /**
   * Start error tracking
   */
  startErrorTracking(): void {
    const page = this.getPage();
    page.on('pageerror', (error) => {
      this.pageErrors.push({
        message: error.message,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get page errors
   */
  getPageErrors(): PageError[] {
    return this.pageErrors;
  }

  /**
   * Clear page errors
   */
  clearPageErrors(): void {
    this.pageErrors = [];
  }

  /**
   * Start HAR recording
   */
  async startHarRecording(): Promise<void> {
    // HAR is started at context level, flag for tracking
    this.isRecordingHar = true;
  }

  /**
   * Check if HAR recording
   */
  isHarRecording(): boolean {
    return this.isRecordingHar;
  }

  /**
   * Set offline mode
   */
  async setOffline(offline: boolean): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setOffline(offline);
    }
  }

  /**
   * Set extra HTTP headers (global - all requests)
   */
  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.setExtraHTTPHeaders(headers);
    }
  }

  /**
   * Set scoped HTTP headers (only for requests matching the origin)
   * Uses route interception to add headers only to matching requests
   */
  async setScopedHeaders(origin: string, headers: Record<string, string>): Promise<void> {
    const page = this.getPage();

    // Build URL pattern from origin (e.g., "api.example.com" -> "**://api.example.com/**")
    // Handle both full URLs and just hostnames
    let urlPattern: string;
    try {
      const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`);
      // Match any protocol, the host, and any path
      urlPattern = `**://${url.host}/**`;
    } catch {
      // If parsing fails, treat as hostname pattern
      urlPattern = `**://${origin}/**`;
    }

    // Remove existing route for this origin if any
    const existingHandler = this.scopedHeaderRoutes.get(urlPattern);
    if (existingHandler) {
      await page.unroute(urlPattern, existingHandler);
    }

    // Create handler that adds headers to matching requests
    const handler = async (route: Route) => {
      const requestHeaders = route.request().headers();
      await route.continue({
        headers: {
          ...requestHeaders,
          ...headers,
        },
      });
    };

    // Store and register the route
    this.scopedHeaderRoutes.set(urlPattern, handler);
    await page.route(urlPattern, handler);
  }

  /**
   * Clear scoped headers for an origin (or all if no origin specified)
   */
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
      // Clear all scoped header routes
      for (const [pattern, handler] of this.scopedHeaderRoutes) {
        await page.unroute(pattern, handler);
      }
      this.scopedHeaderRoutes.clear();
    }
  }

  /**
   * Start tracing
   */
  async startTracing(options: { screenshots?: boolean; snapshots?: boolean }): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.start({
        screenshots: options.screenshots ?? true,
        snapshots: options.snapshots ?? true,
      });
    }
  }

  /**
   * Stop tracing and save
   */
  async stopTracing(path: string): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.stop({ path });
    }
  }

  /**
   * Save storage state (cookies, localStorage, etc.)
   */
  async saveStorageState(path: string): Promise<void> {
    const context = this.contexts[0];
    if (context) {
      await context.storageState({ path });
    }
  }

  /**
   * Get all pages
   */
  getPages(): Page[] {
    return this.pages;
  }

  /**
   * Get current page index
   */
  getActiveIndex(): number {
    return this.activePageIndex;
  }

  /**
   * Get the current browser instance
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * Check if an existing CDP connection is still alive
   * by verifying we can access browser contexts and that at least one has pages
   */
  private isCdpConnectionAlive(): boolean {
    if (!this.browser) return false;
    try {
      const contexts = this.browser.contexts();
      if (contexts.length === 0) {
        return false;
      }
      return contexts.some((context) => context.pages().length > 0);
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check if CDP connection needs to be re-established
   */
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

  /**
   * Close a Browserbase session via API
   */
  private async closeBrowserbaseSession(sessionId: string, apiKey: string): Promise<void> {
    await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'X-BB-API-Key': apiKey,
      },
    });
  }

  /**
   * Close a Browser Use session via API
   */
  private async closeBrowserUseSession(sessionId: string, apiKey: string): Promise<void> {
    const response = await fetch(`https://api.browser-use.com/api/v2/browsers/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Use-API-Key': apiKey,
      },
      body: JSON.stringify({ action: 'stop' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to close Browser Use session: ${response.statusText}`);
    }
  }

  /**
   * Close a Kernel session via API
   */
  private async closeKernelSession(sessionId: string, apiKey: string): Promise<void> {
    const response = await fetch(`https://api.onkernel.com/browsers/${sessionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to close Kernel session: ${response.statusText}`);
    }
  }

  /**
   * Connect to Browserbase remote browser via CDP.
   * Requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables.
   */
  private async connectToBrowserbase(): Promise<void> {
    const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
    const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;

    if (!browserbaseApiKey || !browserbaseProjectId) {
      throw new Error(
        'BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required when using browserbase as a provider'
      );
    }

    const response = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': browserbaseApiKey,
      },
      body: JSON.stringify({
        projectId: browserbaseProjectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Browserbase session: ${response.statusText}`);
    }

    const session = (await response.json()) as { id: string; connectUrl: string };

    const browser = await chromium.connectOverCDP(session.connectUrl).catch(() => {
      throw new Error('Failed to connect to Browserbase session via CDP');
    });

    try {
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser context found in Browserbase session');
      }

      const context = contexts[0];
      const pages = context.pages();
      const page = pages[0] ?? (await context.newPage());

      this.browserbaseSessionId = session.id;
      this.browserbaseApiKey = browserbaseApiKey;
      this.browser = browser;
      context.setDefaultTimeout(10000);
      this.contexts.push(context);
      this.setupContextTracking(context);
      this.pages.push(page);
      this.activePageIndex = 0;
      this.setupPageTracking(page);
      this.setupContextTracking(context);
    } catch (error) {
      await this.closeBrowserbaseSession(session.id, browserbaseApiKey).catch((sessionError) => {
        console.error('Failed to close Browserbase session during cleanup:', sessionError);
      });
      throw error;
    }
  }

  /**
   * Find or create a Kernel profile by name.
   * Returns the profile object if successful.
   */
  private async findOrCreateKernelProfile(
    profileName: string,
    apiKey: string
  ): Promise<{ name: string }> {
    // First, try to get the existing profile
    const getResponse = await fetch(
      `https://api.onkernel.com/profiles/${encodeURIComponent(profileName)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (getResponse.ok) {
      // Profile exists, return it
      return { name: profileName };
    }

    if (getResponse.status !== 404) {
      throw new Error(`Failed to check Kernel profile: ${getResponse.statusText}`);
    }

    // Profile doesn't exist, create it
    const createResponse = await fetch('https://api.onkernel.com/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ name: profileName }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create Kernel profile: ${createResponse.statusText}`);
    }

    return { name: profileName };
  }

  /**
   * Connect to Kernel remote browser via CDP.
   * Requires KERNEL_API_KEY environment variable.
   */
  private async connectToKernel(): Promise<void> {
    const kernelApiKey = process.env.KERNEL_API_KEY;
    if (!kernelApiKey) {
      throw new Error('KERNEL_API_KEY is required when using kernel as a provider');
    }

    // Find or create profile if KERNEL_PROFILE_NAME is set
    const profileName = process.env.KERNEL_PROFILE_NAME;
    let profileConfig: { profile: { name: string; save_changes: boolean } } | undefined;

    if (profileName) {
      await this.findOrCreateKernelProfile(profileName, kernelApiKey);
      profileConfig = {
        profile: {
          name: profileName,
          save_changes: true, // Save cookies/state back to the profile when session ends
        },
      };
    }

    const response = await fetch('https://api.onkernel.com/browsers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kernelApiKey}`,
      },
      body: JSON.stringify({
        // Kernel browsers are headful by default with stealth mode available
        // The user can configure these via environment variables if needed
        headless: process.env.KERNEL_HEADLESS?.toLowerCase() === 'true',
        stealth: process.env.KERNEL_STEALTH?.toLowerCase() !== 'false', // Default to stealth mode
        timeout_seconds: parseInt(process.env.KERNEL_TIMEOUT_SECONDS || '300', 10),
        // Load and save to a profile if specified
        ...profileConfig,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Kernel session: ${response.statusText}`);
    }

    let session: { session_id: string; cdp_ws_url: string };
    try {
      session = (await response.json()) as { session_id: string; cdp_ws_url: string };
    } catch (error) {
      throw new Error(
        `Failed to parse Kernel session response: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!session.session_id || !session.cdp_ws_url) {
      throw new Error(
        `Invalid Kernel session response: missing ${!session.session_id ? 'session_id' : 'cdp_ws_url'}`
      );
    }

    const browser = await chromium.connectOverCDP(session.cdp_ws_url).catch(() => {
      throw new Error('Failed to connect to Kernel session via CDP');
    });

    try {
      const contexts = browser.contexts();
      let context: BrowserContext;
      let page: Page;

      // Kernel browsers launch with a default context and page
      if (contexts.length === 0) {
        context = await browser.newContext();
        page = await context.newPage();
      } else {
        context = contexts[0];
        const pages = context.pages();
        page = pages[0] ?? (await context.newPage());
      }

      this.kernelSessionId = session.session_id;
      this.kernelApiKey = kernelApiKey;
      this.browser = browser;
      context.setDefaultTimeout(60000);
      this.contexts.push(context);
      this.pages.push(page);
      this.activePageIndex = 0;
      this.setupPageTracking(page);
      this.setupContextTracking(context);
    } catch (error) {
      await this.closeKernelSession(session.session_id, kernelApiKey).catch((sessionError) => {
        console.error('Failed to close Kernel session during cleanup:', sessionError);
      });
      throw error;
    }
  }

  /**
   * Connect to Browser Use remote browser via CDP.
   * Requires BROWSER_USE_API_KEY environment variable.
   */
  private async connectToBrowserUse(): Promise<void> {
    const browserUseApiKey = process.env.BROWSER_USE_API_KEY;
    if (!browserUseApiKey) {
      throw new Error('BROWSER_USE_API_KEY is required when using browseruse as a provider');
    }

    const response = await fetch('https://api.browser-use.com/api/v2/browsers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Use-API-Key': browserUseApiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Browser Use session: ${response.statusText}`);
    }

    let session: { id: string; cdpUrl: string };
    try {
      session = (await response.json()) as { id: string; cdpUrl: string };
    } catch (error) {
      throw new Error(
        `Failed to parse Browser Use session response: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!session.id || !session.cdpUrl) {
      throw new Error(
        `Invalid Browser Use session response: missing ${!session.id ? 'id' : 'cdpUrl'}`
      );
    }

    const browser = await chromium.connectOverCDP(session.cdpUrl).catch(() => {
      throw new Error('Failed to connect to Browser Use session via CDP');
    });

    try {
      const contexts = browser.contexts();
      let context: BrowserContext;
      let page: Page;

      if (contexts.length === 0) {
        context = await browser.newContext();
        page = await context.newPage();
      } else {
        context = contexts[0];
        const pages = context.pages();
        page = pages[0] ?? (await context.newPage());
      }

      this.browserUseSessionId = session.id;
      this.browserUseApiKey = browserUseApiKey;
      this.browser = browser;
      context.setDefaultTimeout(60000);
      this.contexts.push(context);
      this.pages.push(page);
      this.activePageIndex = 0;
      this.setupPageTracking(page);
      this.setupContextTracking(context);
    } catch (error) {
      await this.closeBrowserUseSession(session.id, browserUseApiKey).catch((sessionError) => {
        console.error('Failed to close Browser Use session during cleanup:', sessionError);
      });
      throw error;
    }
  }

  /**
   * Launch the browser with the specified options
   * If already launched, this is a no-op (browser stays open)
   */
  async launch(options: LaunchCommand): Promise<void> {
    // Determine CDP endpoint: prefer cdpUrl over cdpPort for flexibility
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

    // Clean up stale browser state if exists but not connected
    // This handles the case where user manually closed the headed browser
    if (this.browser && !this.browser.isConnected()) {
      await this.close();
    }

    if (this.isLaunched()) {
      // Check if we need to reconnect to a different CDP endpoint
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
      await this.connectViaCDP(cdpEndpoint);
      return;
    }

    // Cloud browser providers require explicit opt-in via -p flag or AGENT_BROWSER_PROVIDER env var
    // -p flag takes precedence over env var
    const provider = options.provider ?? process.env.AGENT_BROWSER_PROVIDER;
    if (provider === 'browserbase') {
      await this.connectToBrowserbase();
      return;
    }
    if (provider === 'browseruse') {
      await this.connectToBrowserUse();
      return;
    }

    // Kernel: requires explicit opt-in via -p kernel flag or AGENT_BROWSER_PROVIDER=kernel
    if (provider === 'kernel') {
      await this.connectToKernel();
      return;
    }

    const browserType = options.browser ?? 'chromium';
    if (hasExtensions && browserType !== 'chromium') {
      throw new Error('Extensions are only supported in Chromium');
    }

    // allowFileAccess is only supported in Chromium
    if (options.allowFileAccess && browserType !== 'chromium') {
      throw new Error('allowFileAccess is only supported in Chromium');
    }

    const launcher =
      browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;
    const viewport = options.viewport ?? { width: 1280, height: 720 };

    // Build base args array with file access flags if enabled
    // --allow-file-access-from-files: allows file:// URLs to read other file:// URLs via XHR/fetch
    // --allow-file-access: allows the browser to access local files in general
    const fileAccessArgs = options.allowFileAccess
      ? ['--allow-file-access-from-files', '--allow-file-access']
      : [];

    // Add anti-detection args
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
      // Extensions require persistent context in a temp directory
      const extPaths = options.extensions!.join(',');
      const session = process.env.AGENT_BROWSER_SESSION || 'default';
      // Combine extension args with custom args and file access args
      const extArgs = [`--disable-extensions-except=${extPaths}`, `--load-extension=${extPaths}`];
      const allArgs = baseArgs ? [...extArgs, ...baseArgs] : extArgs;
      context = await launcher.launchPersistentContext(
        path.join(os.tmpdir(), `agent-browser-ext-${session}`),
        {
          headless: false,
          executablePath: options.executablePath,
          args: allArgs,
          viewport,
          extraHTTPHeaders: options.headers,
          userAgent: options.userAgent,
          ...(options.proxy && { proxy: options.proxy }),
          ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        }
      );
      this.isPersistentContext = true;
    } else if (hasProfile) {
      // Profile uses persistent context for durable cookies/storage
      // Expand ~ to home directory since it won't be shell-expanded
      const profilePath = options.profile!.replace(/^~\//, os.homedir() + '/');
      context = await launcher.launchPersistentContext(profilePath, {
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        args: baseArgs,
        viewport,
        extraHTTPHeaders: options.headers,
        userAgent: options.userAgent,
        ...(options.proxy && { proxy: options.proxy }),
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
      });
      this.isPersistentContext = true;
    } else {
      // Regular ephemeral browser
      this.browser = await launcher.launch({
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        args: baseArgs,
      });
      this.cdpEndpoint = null;
      context = await this.browser.newContext({
        viewport,
        extraHTTPHeaders: options.headers,
        userAgent: options.userAgent,
        ...(options.proxy && { proxy: options.proxy }),
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        ...(options.storageState && { storageState: options.storageState }),
      });
    }

    // Add anti-bot detection evasion script
    await context.addInitScript(() => {
      // 1. Simulate window.chrome object
      if (!(window as any).chrome) {
        (window as any).chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        };
      }

      // 2. Simulate navigator.plugins
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

      // 3. Simulate navigator.mimeTypes
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
    // Only add if not already tracked (setupContextTracking may have already added it via 'page' event)
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length > 0 ? this.pages.length - 1 : 0;
  }

  /**
   * Connect to a running browser via CDP (Chrome DevTools Protocol)
   * @param cdpEndpoint Either a port number (as string) or a full WebSocket URL (ws:// or wss://)
   */
  private async connectViaCDP(cdpEndpoint: string | undefined): Promise<void> {
    if (!cdpEndpoint) {
      throw new Error('CDP endpoint is required for CDP connection');
    }

    // Determine the connection URL:
    // - If it starts with ws://, wss://, http://, or https://, use it directly
    // - If it's a numeric string (e.g., "9222"), treat as port for localhost
    // - Otherwise, treat it as a port number for localhost
    let cdpUrl: string;
    if (
      cdpEndpoint.startsWith('ws://') ||
      cdpEndpoint.startsWith('wss://') ||
      cdpEndpoint.startsWith('http://') ||
      cdpEndpoint.startsWith('https://')
    ) {
      cdpUrl = cdpEndpoint;
    } else if (/^\d+$/.test(cdpEndpoint)) {
      // Numeric string - treat as port number (handles JSON serialization quirks)
      cdpUrl = `http://localhost:${cdpEndpoint}`;
    } else {
      // Unknown format - still try as port for backward compatibility
      cdpUrl = `http://localhost:${cdpEndpoint}`;
    }

    const CDP_CONNECT_TIMEOUT_MS = 15000;

    function withTimeout<T>(promise: Promise<T>, msg: string): Promise<T> {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(msg)), CDP_CONNECT_TIMEOUT_MS);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    const browser = await withTimeout(
      chromium.connectOverCDP(cdpUrl),
      `CDP connection timed out after ${CDP_CONNECT_TIMEOUT_MS}ms. Remote endpoint at ${cdpUrl} did not respond.`
    ).catch(() => {
      throw new Error(
        `Failed to connect via CDP to ${cdpUrl}. ` +
          (cdpUrl.includes('localhost')
            ? `Make sure the app is running with --remote-debugging-port=${cdpEndpoint}`
            : 'Make sure the remote browser is accessible and the URL is correct.')
      );
    });

    // Validate and set up state, cleaning up browser connection if anything fails
    try {
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser context found. Make sure the app has an open window.');
      }

      // Filter out pages with empty URLs, which can cause Playwright to hang
      let allPages = contexts.flatMap((context) => context.pages()).filter((page) => page.url());

      // If no pages exist, create one in the first context
      if (allPages.length === 0) {
        const newPage = await contexts[0].newPage();
        allPages = [newPage];
      }

      // All validation passed - commit state
      this.browser = browser;
      this.cdpEndpoint = cdpEndpoint;

      for (const context of contexts) {
        context.setDefaultTimeout(30000);
        this.contexts.push(context);
        this.setupContextTracking(context);
      }

      for (const page of allPages) {
        this.pages.push(page);
        this.setupPageTracking(page);
      }

      this.activePageIndex = 0;
    } catch (error) {
      // Clean up browser connection if validation or setup failed
      await browser.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Set up console, error, and close tracking for a page
   */
  private setupPageTracking(page: Page): void {
    page.on('console', (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on('pageerror', (error) => {
      this.pageErrors.push({
        message: error.message,
        timestamp: Date.now(),
      });
    });

    page.on('load', async () => {
      // Trigger navigation event callback
      const callbacks = getEventCallbacks();
      callbacks.onNavigation?.({
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    });

    page.on('close', () => {
      const index = this.pages.indexOf(page);
      if (index !== -1) {
        const url = page.url();
        this.pages.splice(index, 1);
        if (this.activePageIndex >= this.pages.length) {
          this.activePageIndex = Math.max(0, this.pages.length - 1);
        }

        // Trigger tab closed event callback
        const callbacks = getEventCallbacks();
        callbacks.onTabClosed?.({
          index,
          remainingTabs: this.pages.length,
        });
      }
    });
  }

  /**
   * Set up tracking for new pages in a context (for CDP connections and popups/new tabs)
   * This handles pages created externally (e.g., via target="_blank" links, window.open)
   */
  private async setupContextTracking(context: BrowserContext): Promise<void> {
    context.on('page', async (page) => {
      // Only add if not already tracked (avoids duplicates when newTab() creates pages)
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

      // Auto-switch to the newly opened tab so subsequent commands target it.
      // For tabs created via newTab()/newWindow(), this is redundant (they set activePageIndex after),
      // but for externally opened tabs (window.open, target="_blank"), this ensures the active tab
      // stays in sync with the browser.
      const newIndex = this.pages.indexOf(page);
      if (newIndex !== -1 && newIndex !== this.activePageIndex) {
        this.activePageIndex = newIndex;
        // Invalidate CDP session since the active page changed
        this.invalidateCDPSession().catch(() => {});
      }
    });
  }

  /**
   * Create a new tab in the current context
   */
  async newTab(): Promise<{ index: number; total: number }> {
    if (!this.browser || this.contexts.length === 0) {
      throw new Error('Browser not launched');
    }

    // Invalidate CDP session since we're switching to a new page
    await this.invalidateCDPSession();

    const context = this.contexts[0]; // Use first context for tabs
    const page = await context.newPage();
    // Only add if not already tracked (setupContextTracking may have already added it via 'page' event)
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length - 1;

    // Trigger tab created event callback
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

  /**
   * Create a new window (new context)
   */
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
    // Only add if not already tracked (setupContextTracking may have already added it via 'page' event)
    if (!this.pages.includes(page)) {
      this.pages.push(page);
      this.setupPageTracking(page);
    }
    this.activePageIndex = this.pages.length - 1;

    // Trigger tab created event callback
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

  /**
   * Invalidate the current CDP session (must be called before switching pages)
   * This ensures screencast and input injection work correctly after tab switch
   */
  private async invalidateCDPSession(): Promise<void> {
    const shouldRestart = this.screencastShouldBeActive;
    const savedCallback = this.frameCallback;
    const savedOptions = this.lastScreencastOptions;

    if (this.screencastActive) {
      await this.stopScreencastInternal();
    }

    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {});
      this.cdpSession = null;
    }

    if (shouldRestart && savedCallback) {
      try {
        await this.startScreencast(savedCallback, savedOptions ?? undefined);
      } catch {
        // Ignore errors when restarting screencast on new page
      }
    }
  }

  /**
   * Switch to a specific tab/page by index
   */
  async switchTo(index: number): Promise<{ index: number; url: string; title: string }> {
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Invalid tab index: ${index}. Available: 0-${this.pages.length - 1}`);
    }

    // Invalidate CDP session before switching (it's page-specific)
    if (index !== this.activePageIndex) {
      await this.invalidateCDPSession();
    }

    const previousIndex = this.activePageIndex;
    this.activePageIndex = index;
    const page = this.pages[index];

    // Record tab_switch if recording
    if (this.recorderSessionId && previousIndex !== index) {
      this.recorderSteps.push({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: 'tab_switch',
        index: index,
      });
    }

    // Trigger tab switched event callback
    const callbacks = getEventCallbacks();
    callbacks.onTabSwitched?.({
      fromIndex: previousIndex,
      toIndex: index,
    });

    return {
      index: this.activePageIndex,
      url: page.url(),
      title: '', // Title requires async, will be fetched separately
    };
  }

  /**
   * Close a specific tab/page
   */
  async closeTab(index?: number): Promise<{ closed: number; remaining: number }> {
    const targetIndex = index ?? this.activePageIndex;

    if (targetIndex < 0 || targetIndex >= this.pages.length) {
      throw new Error(`Invalid tab index: ${targetIndex}`);
    }

    if (this.pages.length === 1) {
      throw new Error('Cannot close the last tab. Use "close" to close the browser.');
    }

    // Record tab_close if recording
    if (this.recorderSessionId) {
      this.recorderSteps.push({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: 'tab_close',
        index: targetIndex,
      });
    }

    // If closing the active tab, invalidate CDP session first
    if (targetIndex === this.activePageIndex) {
      await this.invalidateCDPSession();
    }

    const page = this.pages[targetIndex];
    await page.close();
    this.pages.splice(targetIndex, 1);

    // Adjust active index if needed
    if (this.activePageIndex >= this.pages.length) {
      this.activePageIndex = this.pages.length - 1;
    } else if (this.activePageIndex > targetIndex) {
      this.activePageIndex--;
    }

    return { closed: targetIndex, remaining: this.pages.length };
  }

  /**
   * List all tabs with their info
   */
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

  /**
   * Get or create a CDP session for the current page
   * Only works with Chromium-based browsers
   */
  async getCDPSession(): Promise<CDPSession> {
    if (this.cdpSession) {
      return this.cdpSession;
    }

    const page = this.getPage();
    const context = page.context();

    // Create a new CDP session attached to the page
    this.cdpSession = await context.newCDPSession(page);
    return this.cdpSession;
  }

  /**
   * Check if screencast is currently active
   */
  isScreencasting(): boolean {
    return this.screencastActive;
  }

  /**
   * Start screencast - streams viewport frames via CDP
   * @param callback Function called for each frame
   * @param options Screencast options
   */
  async startScreencast(
    callback: (frame: ScreencastFrame) => void,
    options?: ScreencastOptions
  ): Promise<void> {
    if (this.screencastActive) {
      throw new Error('Screencast already active');
    }

    const cdp = await this.getCDPSession();
    this.frameCallback = callback;
    this.screencastActive = true;
    this.screencastShouldBeActive = true;
    this.lastScreencastOptions = options ?? null;

    this.screencastFrameHandler = async (params: any) => {
      const frame: ScreencastFrame = {
        data: params.data,
        metadata: params.metadata,
        sessionId: params.sessionId,
      };

      await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });

      if (this.frameCallback) {
        this.frameCallback(frame);
      }
    };

    cdp.on('Page.screencastFrame', this.screencastFrameHandler);

    await cdp.send('Page.startScreencast', {
      format: options?.format ?? 'jpeg',
      quality: options?.quality ?? 80,
      maxWidth: options?.maxWidth ?? 1280,
      maxHeight: options?.maxHeight ?? 720,
      everyNthFrame: options?.everyNthFrame ?? 1,
    });
  }

  /**
   * Stop screencast (user initiated - will not auto-restart)
   */
  async stopScreencast(): Promise<void> {
    this.screencastShouldBeActive = false;
    await this.stopScreencastInternal();
  }

  /**
   * Internal method to stop screencast without changing the shouldBeActive flag
   */
  private async stopScreencastInternal(): Promise<void> {
    if (!this.screencastActive) {
      return;
    }

    try {
      const cdp = await this.getCDPSession();
      await cdp.send('Page.stopScreencast');

      if (this.screencastFrameHandler) {
        cdp.off('Page.screencastFrame', this.screencastFrameHandler);
      }
    } catch {
      // Ignore errors when stopping
    }

    this.screencastActive = false;
    this.frameCallback = null;
    this.screencastFrameHandler = null;
  }

  /**
   * Inject a mouse event via CDP
   */
  async injectMouseEvent(params: {
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle' | 'none';
    clickCount?: number;
    deltaX?: number;
    deltaY?: number;
    modifiers?: number; // 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
  }): Promise<void> {
    const cdp = await this.getCDPSession();

    const cdpButton =
      params.button === 'left'
        ? 'left'
        : params.button === 'right'
          ? 'right'
          : params.button === 'middle'
            ? 'middle'
            : 'none';

    await cdp.send('Input.dispatchMouseEvent', {
      type: params.type,
      x: params.x,
      y: params.y,
      button: cdpButton,
      clickCount: params.clickCount ?? 1,
      deltaX: params.deltaX ?? 0,
      deltaY: params.deltaY ?? 0,
      modifiers: params.modifiers ?? 0,
    });
  }

  /**
   * Inject a keyboard event via CDP
   */
  async injectKeyboardEvent(params: {
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
    key?: string;
    code?: string;
    text?: string;
    modifiers?: number; // 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
  }): Promise<void> {
    const cdp = await this.getCDPSession();

    await cdp.send('Input.dispatchKeyEvent', {
      type: params.type,
      key: params.key,
      code: params.code,
      text: params.text,
      modifiers: params.modifiers ?? 0,
    });
  }

  /**
   * Inject touch event via CDP (for mobile emulation)
   */
  async injectTouchEvent(params: {
    type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
    touchPoints: Array<{ x: number; y: number; id?: number }>;
    modifiers?: number;
  }): Promise<void> {
    const cdp = await this.getCDPSession();

    await cdp.send('Input.dispatchTouchEvent', {
      type: params.type,
      touchPoints: params.touchPoints.map((tp, i) => ({
        x: tp.x,
        y: tp.y,
        id: tp.id ?? i,
      })),
      modifiers: params.modifiers ?? 0,
    });
  }

  /**
   * Insert text directly via CDP (for IME input, paste, etc.)
   */
  async insertText(text: string): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Input.insertText', { text });
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

  /**
   * Press a key on the page via Playwright.
   */
  async pressKey(key: string): Promise<void> {
    const page = this.getPage();
    if (!page) return;
    await page.keyboard.press(key);
  }

  /**
   * Inject focus/input/blur event listeners into the remote page.
   * Uses Playwright exposeFunction + addInitScript so the
   * injected script can call back to Node.js when input elements are focused.
   */
  async injectFocusListener(
    onEvent: (data: { type: string; [key: string]: unknown }) => void
  ): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    try {
      await page.exposeFunction('__agentBrowserInputEvent', (data: unknown) => {
        onEvent(data as { type: string; [key: string]: unknown });
      });
    } catch {
      // Already registered from previous injection - safe to continue
    }

    const injectScript = `
      (function() {
        if (window.__agentBrowserListenerInjected) return;
        window.__agentBrowserListenerInjected = true;

        document.addEventListener('focus', function(e) {
          var el = e.target;
          if (!el) return;
          var tag = el.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
          try {
            window.__agentBrowserInputEvent({
              type: 'input_focused',
              tag: tag,
              inputType: el.type || '',
              value: typeof el.value === 'string' ? el.value : '',
              placeholder: el.placeholder || '',
              id: el.id || '',
              selector: (function() {
                if (el.id) return '#' + el.id;
                if (el.name && el.name) return '[name="' + el.name + '"]';
                return el.tagName.toLowerCase();
              })()
            });
          } catch(ex) {}
        }, true);

        document.addEventListener('input', function(e) {
          var el = e.target;
          if (!el) return;
          var tag = el.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
          try {
            window.__agentBrowserInputEvent({
              type: 'input_value',
              text: typeof el.value === 'string' ? el.value : ''
            });
          } catch(ex) {}
        }, true);

        document.addEventListener('blur', function() {
          try {
            window.__agentBrowserInputEvent({ type: 'input_blur' });
          } catch(ex) {}
        }, true);
      })();
    `;

    // Inject into future navigations
    await page.addInitScript(injectScript);

    // Also inject into current page (already loaded)
    await page.evaluate(injectScript);
  }

  /**
   * Check if video recording is currently active
   */
  isRecording(): boolean {
    return this.recordingContext !== null;
  }

  isRecordingSession(): boolean {
    return this.recorderSessionId !== null;
  }

  async injectRecorderIfNeeded(): Promise<void> {
    if (!this.recorderSessionId) return;

    const page = this.getPage();
    if (!page) return;

    try {
      // 先重置状态标志
      await page.evaluate(() => {
        (window as any).xyzActive = true;
        (window as any).xyzStopped = false;
        (window as any).xyzInited = false;
      });

      const injectScript = this.getRecorderInjectScript(
        false,
        this.recorderBindingName || 'xyzTrack',
        this.recorderSessionId
      );
      // 使用 page.evaluate 执行字符串脚本
      await page.evaluate(injectScript);
    } catch (e) {}
  }

  /**
   * Whether recording is temporarily paused (e.g., during replay)
   */
  recorderPaused: boolean = false;

  /**
   * Pause recording temporarily
   */
  pauseRecording(): void {
    this.recorderPaused = true;
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    this.recorderPaused = false;
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
    if (this.recorderSessionId && !this.recorderPaused) {
      this.recorderSteps.push({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: step.action as any,
        index: step.index,
        key: step.key,
        code: step.code,
        ctrlKey: step.ctrlKey,
        metaKey: step.metaKey,
        altKey: step.altKey,
        shiftKey: step.shiftKey,
        selector: step.selector,
        value: step.value,
      });
    }
  }

  /**
   * Start recording to a video file using Playwright's native video recording.
   * Creates a fresh browser context with video recording enabled.
   * Automatically captures current URL and transfers cookies/storage if no URL provided.
   *
   * @param outputPath - Path to the output video file (will be .webm)
   * @param url - Optional URL to navigate to (defaults to current page URL)
   */
  async startRecording(outputPath: string, url?: string): Promise<void> {
    if (this.recordingContext) {
      throw new Error(
        "Recording already in progress. Run 'record stop' first, or use 'record restart' to stop and start a new recording."
      );
    }

    if (!this.browser) {
      throw new Error('Browser not launched. Call launch first.');
    }

    // Check if output file already exists
    if (existsSync(outputPath)) {
      throw new Error(`Output file already exists: ${outputPath}`);
    }

    // Validate output path is .webm (Playwright native format)
    if (!outputPath.endsWith('.webm')) {
      throw new Error(
        'Playwright native recording only supports WebM format. Please use a .webm extension.'
      );
    }

    // Auto-capture current URL if none provided
    const currentPage = this.pages.length > 0 ? this.pages[this.activePageIndex] : null;
    const currentContext = this.contexts.length > 0 ? this.contexts[0] : null;
    if (!url && currentPage) {
      const currentUrl = currentPage.url();
      if (currentUrl && currentUrl !== 'about:blank') {
        url = currentUrl;
      }
    }

    // Capture state from current context (cookies + storage)
    let storageState:
      | {
          cookies: Array<{
            name: string;
            value: string;
            domain: string;
            path: string;
            expires: number;
            httpOnly: boolean;
            secure: boolean;
            sameSite: 'Strict' | 'Lax' | 'None';
          }>;
          origins: Array<{
            origin: string;
            localStorage: Array<{ name: string; value: string }>;
          }>;
        }
      | undefined;

    if (currentContext) {
      try {
        storageState = await currentContext.storageState();
      } catch {
        // Ignore errors - context might be closed or invalid
      }
    }

    // Create a temp directory for video recording
    const session = process.env.AGENT_BROWSER_SESSION || 'default';
    this.recordingTempDir = path.join(
      os.tmpdir(),
      `agent-browser-recording-${session}-${Date.now()}`
    );
    mkdirSync(this.recordingTempDir, { recursive: true });

    this.recordingOutputPath = outputPath;

    // Create a new context with video recording enabled and restored state
    const viewport = { width: 1280, height: 720 };
    this.recordingContext = await this.browser.newContext({
      viewport,
      recordVideo: {
        dir: this.recordingTempDir,
        size: viewport,
      },
      storageState,
    });
    this.recordingContext.setDefaultTimeout(10000);

    // Create a page in the recording context
    this.recordingPage = await this.recordingContext.newPage();

    // Add the recording context and page to our managed lists
    this.contexts.push(this.recordingContext);
    this.pages.push(this.recordingPage);
    this.activePageIndex = this.pages.length - 1;

    // Set up page tracking
    this.setupPageTracking(this.recordingPage);

    // Invalidate CDP session since we switched pages
    await this.invalidateCDPSession();

    // Navigate to URL if provided or captured
    if (url) {
      await this.recordingPage.goto(url, { waitUntil: 'load' });
    }
  }

  /**
   * Stop recording and save the video file
   * @returns Recording result with path
   */
  async stopRecording(): Promise<{ path: string; frames: number; error?: string }> {
    if (!this.recordingContext || !this.recordingPage) {
      return { path: '', frames: 0, error: 'No recording in progress' };
    }

    const outputPath = this.recordingOutputPath;

    try {
      // Get the video object before closing the page
      const video = this.recordingPage.video();

      // Remove recording page/context from our managed lists before closing
      const pageIndex = this.pages.indexOf(this.recordingPage);
      if (pageIndex !== -1) {
        this.pages.splice(pageIndex, 1);
      }
      const contextIndex = this.contexts.indexOf(this.recordingContext);
      if (contextIndex !== -1) {
        this.contexts.splice(contextIndex, 1);
      }

      // Close the page to finalize the video
      await this.recordingPage.close();

      // Save the video to the desired output path
      if (video) {
        await video.saveAs(outputPath);
      }

      // Clean up temp directory
      if (this.recordingTempDir) {
        rmSync(this.recordingTempDir, { recursive: true, force: true });
      }

      // Close the recording context
      await this.recordingContext.close();

      // Reset recording state
      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = '';
      this.recordingTempDir = '';

      // Adjust active page index
      if (this.pages.length > 0) {
        this.activePageIndex = Math.min(this.activePageIndex, this.pages.length - 1);
      } else {
        this.activePageIndex = 0;
      }

      // Invalidate CDP session since we may have switched pages
      await this.invalidateCDPSession();

      return { path: outputPath, frames: 0 }; // Playwright doesn't expose frame count
    } catch (error) {
      // Clean up temp directory on error
      if (this.recordingTempDir) {
        rmSync(this.recordingTempDir, { recursive: true, force: true });
      }

      // Reset state on error
      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = '';
      this.recordingTempDir = '';

      const message = error instanceof Error ? error.message : String(error);
      return { path: outputPath, frames: 0, error: message };
    }
  }

  /**
   * Restart recording - stops current recording (if any) and starts a new one.
   * Convenience method that combines stopRecording and startRecording.
   *
   * @param outputPath - Path to the output video file (must be .webm)
   * @param url - Optional URL to navigate to (defaults to current page URL)
   * @returns Result from stopping the previous recording (if any)
   */
  async restartRecording(
    outputPath: string,
    url?: string
  ): Promise<{ previousPath?: string; stopped: boolean }> {
    let previousPath: string | undefined;
    let stopped = false;

    // Stop current recording if active
    if (this.recordingContext) {
      const result = await this.stopRecording();
      previousPath = result.path;
      stopped = true;
    }

    // Start new recording
    await this.startRecording(outputPath, url);

    return { previousPath, stopped };
  }

  // ========== User Interaction Recorder ==========

  private getPageIndex(page: Page): number {
    return this.pages.indexOf(page);
  }

  private getRecorderInjectScript(
    hide: boolean = false,
    bindingName: string = 'xyzTrack',
    sessionId?: string
  ): string {
    const injectScriptPath = path.join(__dirname, 'recorder', 'inject.js');
    let script = readFileSync(injectScriptPath, 'utf-8');
    // 在脚本开头注入配置（使用 xyz 前缀）
    // 注意：xyzInjectedSessionId 必须在脚本开头设置，以便 inject.js 可以读取它
    // 使用 window.xyzInjectedSessionId = 'xxx' 的形式，让 inject.js 可以读取
    const config = `window.xyzHide = ${hide}; window.xyzBindingName = '${bindingName}'; window.xyzInjectedSessionId = '${sessionId || ''}';`;
    const fullScript = config + '\n' + script;
    return fullScript;
  }

  async startRecorder(
    url?: string,
    hide: boolean = false
  ): Promise<{ started: boolean; sessionId: string }> {
    console.log('[BrowserManager] startRecorder called, url:', url, 'hide:', hide);
    // 检查是否已经在录制中
    if (this.recorderSessionId) {
      throw new Error(
        `Recording already in progress (session: ${this.recorderSessionId}). Use 'recorder stop' to stop current recording first.`
      );
    }

    const page = this.getPage();
    if (!page) {
      throw new Error('No page available. Launch browser first.');
    }

    this.recorderSessionId = 'recorder-' + Date.now();
    this.recorderStartTime = Date.now();
    this.recorderSteps = [];
    this.recorderPages = [];
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;

    const context = page.context();

    // 使用 Playwright 的 exposeBinding，自动处理所有导航和新标签页
    // 使用唯一的绑定名称，避免绑定冲突问题
    const bindingName = `xyzTrack_${this.recorderSessionId}`;
    this.recorderBindingName = bindingName;

    // 传递 hide 参数和绑定名称给注入脚本
    // 同时传递会话 ID 用于验证录制会话是否仍然活跃
    const injectScript = this.getRecorderInjectScript(hide, bindingName, this.recorderSessionId);

    // For CDP connections, we need to ensure the debugger is attached to the page
    // before calling exposeBinding. Creating a CDP session will attach the debugger.
    if (this.cdpEndpoint !== null) {
      await this.getCDPSession();
    }

    try {
      await context.exposeBinding(bindingName, async (source, payload: string) => {
        // 如果录制会话已停止，返回 false 表示无效
        if (!this.recorderSessionId) {
          return false;
        }

        if (!payload) return true;

        const targetPage = source.page;

        try {
          const step = JSON.parse(payload);
          if (step && step.action) {
            if (step.action === 'xyzPoll') {
              await targetPage
                ?.evaluate((steps) => {
                  (window as any).xyzQueue = steps;
                  window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                }, this.recorderSteps)
                .catch(() => {});
            } else if (step.action === 'xyzClear') {
              this.recorderSteps = [];
            } else if (step.action === 'xyzUpdate') {
              // Handle update operations (e.g., adding annotations)
              if (step.id && step.data) {
                const updateIndex = this.recorderSteps.findIndex((s) => s.id === step.id);
                if (updateIndex >= 0) {
                  // Merge the update data into the existing step
                  this.recorderSteps[updateIndex] = {
                    ...this.recorderSteps[updateIndex],
                    ...step.data,
                  };

                  // Sync the updated steps back to the frontend
                  await targetPage
                    ?.evaluate((steps) => {
                      (window as any).xyzQueue = steps;
                      window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                    }, this.recorderSteps)
                    .catch(() => {});
                }
              }
            } else {
              // Regular step addition
              this.recorderSteps.push(step);
              await targetPage
                ?.evaluate((steps) => {
                  (window as any).xyzQueue = steps;
                  window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                }, this.recorderSteps)
                .catch(() => {});
            }
          }
        } catch (e) {}
        return true;
      });
    } catch (e) {
      // Binding 已存在，忽略错误继续使用
    }

    // 在当前页面设置录制会话激活标志
    // 使用 xyz 前缀
    try {
      await page.evaluate((sessionId) => {
        (window as any).xyzActive = true;
        // 清除停止标志（允许重新开始录制）
        (window as any).xyzStopped = false;
        // 清除已初始化标志（允许重新注入脚本）
        (window as any).xyzInited = false;
        // 设置当前会话 ID
        (window as any).xyzSessionId = sessionId;
      }, this.recorderSessionId);
    } catch (e) {}

    // 设置录制会话激活标志（用于新页面）
    // 注意：addInitScript 执行顺序是后添加的先执行
    // 所以我们先添加 injectScript，再添加状态设置脚本
    // 这样状态设置脚本会先执行

    // 注入录制器脚本到所有新页面
    // 注意：这个会第二个执行（后添加的先执行）
    await context.addInitScript(injectScript);

    // 设置录制会话激活标志（用于新页面）
    // 这个会第一个执行（后添加的先执行）
    // 注意：必须设置 xyzSessionId，否则 inject.js 会跳过初始化
    // 使用时间戳来确保只有最新的会话 ID 被设置
    const sessionIdTimestamp =
      parseInt(this.recorderSessionId.replace('recorder-', '')) || Date.now();
    await context.addInitScript({
      content: `
        // 只有当新的会话 ID 更新时才设置
        const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
        const newTimestamp = ${sessionIdTimestamp};
        if (newTimestamp > currentTimestamp) {
          window.xyzActive = true;
          window.xyzStopped = false;
          window.xyzInited = false;
          window.xyzSessionId = '${this.recorderSessionId}';
        }
      `,
    });

    // 在当前页面设置状态，再注入脚本
    try {
      await page.evaluate(`
        // 只有当新的会话 ID 更新时才设置
        const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
        const newTimestamp = ${sessionIdTimestamp};
        if (newTimestamp > currentTimestamp) {
          window.xyzActive = true;
          window.xyzStopped = false;
          window.xyzInited = false;
          window.xyzSessionId = '${this.recorderSessionId}';
          // 清空旧的录制队列，避免状态干扰
          window.xyzQueue = [];
        }
      `);
    } catch (e) {}

    // 在当前页面注入录制器脚本
    // 注意：这里需要手动注入，因为 addInitScript 只对新页面生效
    try {
      await page.addScriptTag({ content: injectScript, type: 'text/javascript' });
    } catch (e) {
      try {
        await page.evaluate((scriptContent) => {
          const script = document.createElement('script');
          script.textContent = scriptContent;
          script.type = 'text/javascript';
          (document.head || document.documentElement).appendChild(script);
        }, injectScript);
      } catch (e2) {}
    }

    // 处理导航事件（用于记录 back/forward）
    this.recorderNavigatedHandler = async (frame: Frame) => {
      if (!this.recorderSessionId) return;
      if (frame !== page.mainFrame()) return;

      const currentUrl = frame.url();
      const now = Date.now();

      if (currentUrl === this.lastNavigationUrl) return;

      const timeSinceLastNav = now - this.lastNavigationTime;

      if (timeSinceLastNav < 300 && currentUrl === this.lastNavigationUrl) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'reload',
        });
        return;
      }

      const existingIndex = this.navigationHistory.indexOf(currentUrl);

      if (existingIndex !== -1 && existingIndex < this.navigationHistoryIndex) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'back',
          from: this.navigationHistory[this.navigationHistoryIndex],
          to: currentUrl,
        });
        this.navigationHistoryIndex = existingIndex;
      } else if (existingIndex !== -1 && existingIndex > this.navigationHistoryIndex) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'forward',
          from: this.navigationHistory[this.navigationHistoryIndex],
          to: currentUrl,
        });
        this.navigationHistoryIndex = existingIndex;
      } else {
        if (
          this.navigationHistoryIndex >= 0 &&
          this.navigationHistoryIndex < this.navigationHistory.length - 1
        ) {
          this.navigationHistory = this.navigationHistory.slice(0, this.navigationHistoryIndex + 1);
        }
        this.navigationHistory.push(currentUrl);
        this.navigationHistoryIndex = this.navigationHistory.length - 1;
      }

      this.lastNavigationUrl = currentUrl;
      this.lastNavigationTime = now;
    };
    page.on('framenavigated', this.recorderNavigatedHandler);

    // 处理 iframe 附加和导航事件 - 向 iframe 注入录制器脚本
    const injectScriptToFrame = async (frame: Frame) => {
      if (!this.recorderSessionId) return;
      // 跳过主框架
      if (frame === page.mainFrame()) return;

      try {
        // 检查是否已经注入过
        const alreadyInjected = await frame
          .evaluate(() => {
            return !!(window as any).xyzInjectedSessionId;
          })
          .catch(() => false);

        if (alreadyInjected) return;

        // 向 iframe 注入录制器脚本
        const injectScript = this.getRecorderInjectScript(
          false,
          this.recorderBindingName || 'xyzTrack',
          this.recorderSessionId
        );

        // 使用 evaluate 在 iframe 上下文中执行脚本
        await frame.evaluate(injectScript).catch((e) => {
          // 可能是跨域 iframe，忽略错误
        });
      } catch (e) {
        // 忽略错误，可能是跨域 iframe
      }
    };

    // 向所有现有 iframe 注入脚本
    const injectToAllFrames = async () => {
      const frames = page.frames();
      for (const frame of frames) {
        await injectScriptToFrame(frame);
      }
    };

    // 立即向现有 iframe 注入
    await injectToAllFrames();

    // 监听 frameattached 事件
    this.recorderFrameAttachedHandler = async (frame: Frame) => {
      // 等待一小段时间让 iframe 初始化
      await new Promise((resolve) => setTimeout(resolve, 100));
      await injectScriptToFrame(frame);
    };
    page.on('frameattached', this.recorderFrameAttachedHandler);

    // 处理新标签页
    this.recorderPageHandler = async (newPage: Page) => {
      if (this.recorderSessionId) {
        const previousActiveIndex = this.activePageIndex;

        const pageIndex = this.getPageIndex(newPage);
        const newTabIndex = pageIndex >= 0 ? pageIndex : this.pages.length;
        this.recorderSteps.push({
          id: this.recorderSteps.length + 1,
          timestamp: Date.now(),
          action: 'tab_new',
          url: newPage.url(),
          index: newTabIndex,
        });

        setTimeout(() => {
          if (this.recorderSessionId && this.activePageIndex !== previousActiveIndex) {
            this.recorderSteps.push({
              id: this.recorderSteps.length + 1,
              timestamp: Date.now(),
              action: 'tab_switch',
              index: this.activePageIndex,
            });
          }
        }, 100);

        newPage.on('close', () => {
          if (this.recorderSessionId) {
            const closeIndex = this.getPageIndex(newPage);
            this.recorderSteps.push({
              id: this.recorderSteps.length + 1,
              timestamp: Date.now(),
              action: 'tab_close',
              index: closeIndex >= 0 ? closeIndex : -1,
            });
          }
        });

        await newPage.waitForLoadState('domcontentloaded').catch(() => {});

        // 注入录制器脚本到新页面
        try {
          const injectScript = this.getRecorderInjectScript(
            false,
            'xyzTrack',
            this.recorderSessionId
          );
          await newPage.evaluate(injectScript);
        } catch (e) {
          console.log('[recorderPageHandler] Error injecting script:', e);
        }

        await newPage
          .evaluate((steps) => {
            (window as any).__recorderSteps = steps;
            window.dispatchEvent(new CustomEvent('recorder:steps', { detail: steps }));
          }, this.recorderSteps)
          .catch(() => {});

        this.recorderPages.push({
          url: newPage.url(),
          title: await newPage.title().catch(() => ''),
          firstVisitTime: Date.now(),
        });
      }
    };
    context.on('page', this.recorderPageHandler);

    if (url) {
      await page.goto(url, { waitUntil: 'load' });
    }

    this.recorderPages.push({
      url: page.url(),
      title: await page.title(),
      firstVisitTime: Date.now(),
    });

    return { started: true, sessionId: this.recorderSessionId };
  }

  async stopRecorder(): Promise<{ yaml: string; steps: number; wasRecording?: boolean }> {
    // 检查是否在录制中
    if (!this.recorderSessionId) {
      console.log('[stopRecorder] No active recording session');
      return { yaml: '', steps: 0, wasRecording: false };
    }

    const page = this.getPage();

    if (page) {
      try {
        const result = await page.evaluate(() => {
          const win = window as any;
          // 先检查是否有待处理的 fill，在设置 xyzStopped 之前调用
          const hasPanel = !!document.getElementById('xyzPnl');
          const hasCloseFunc = typeof win.xyzClose === 'function';
          const hasFlushFunc = typeof win.xyzFlushPending === 'function';
          console.log(
            '[stopRecorder] hasFlushFunc:',
            hasFlushFunc,
            'hasCloseFunc:',
            hasCloseFunc,
            'hasPanel:',
            hasPanel
          );

          // 重要：先调用 xyzFlushPending，再设置 xyzStopped
          // 因为 recordStep 会检查 xyzStopped，如果为 true 就不记录
          if (hasFlushFunc) {
            console.log('[stopRecorder] Calling xyzFlushPending');
            win.xyzFlushPending();
          } else {
            console.log('[stopRecorder] xyzFlushPending not found');
          }

          // 然后再设置停止标志
          win.xyzActive = false;
          win.xyzStopped = true;
          // 重置初始化标志，允许新的录制会话重新初始化
          win.xyzInited = false;
          win.xyzInitializedSessionId = undefined;
          // 注意：不要清除 xyzSessionId，因为旧的监听器需要用它来检查是否应该跳过
          // 新的录制会话会设置新的 xyzSessionId，旧的监听器会检测到时间戳更新并跳过
          // win.xyzSessionId = undefined;

          if (hasCloseFunc) {
            win.xyzClose();
          }

          return {
            hadPanel: hasPanel,
            hadCloseFunc: hasCloseFunc,
            stillHasPanel: !!document.getElementById('xyzPnl'),
          };
        });
        console.log('[stopRecorder] Result:', result);
      } catch (e) {
        console.error('[stopRecorder] Error:', e);
      }

      if (this.recorderNavigatedHandler) {
        page.off('framenavigated', this.recorderNavigatedHandler);
        this.recorderNavigatedHandler = null;
      }
      if (this.recorderFrameAttachedHandler) {
        page.off('frameattached', this.recorderFrameAttachedHandler);
        this.recorderFrameAttachedHandler = null;
      }
      if (this.recorderPageHandler) {
        page.context().off('page', this.recorderPageHandler);
        this.recorderPageHandler = null;
      }

      // 移除 xyzTrack binding（覆盖为空函数）
      try {
        await page.context().exposeBinding(this.recorderBindingName || 'xyzTrack', () => {});
      } catch (e) {
        // 忽略错误，可能 binding 已经被移除或其他问题
      }
    }

    // 等待一下，确保所有步骤都被处理
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 在 xyzFlushPending 之后生成 YAML
    const yaml = this.generateRecorderYaml();
    const steps = this.recorderSteps.length;

    this.recorderSessionId = null;
    this.recorderSteps = [];
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;

    return { yaml, steps };
  }

  getRecorderStatus(): { isRecording: boolean; sessionId?: string; steps: number } {
    return {
      isRecording: this.recorderSessionId !== null,
      sessionId: this.recorderSessionId || undefined,
      steps: this.recorderSteps.length,
    };
  }

  private generateRecorderYaml(): string {
    const lines: string[] = [];

    // 格式化时间为 HH:MM:SS
    const formatTime = (ts: number | undefined): string => {
      if (!ts) return 'unknown';
      const d = new Date(ts);
      return d.toTimeString().split(' ')[0]; // HH:MM:SS
    };

    lines.push('session:');
    lines.push(`  id: ${this.recorderSessionId || 'unknown'}`);
    lines.push(`  startTime: ${formatTime(this.recorderStartTime)}`);
    lines.push(`  endTime: ${formatTime(Date.now())}`);
    lines.push(`  steps: ${this.recorderSteps.length}`);
    lines.push('');

    if (this.recorderPages.length > 0) {
      lines.push('pages:');
      for (const page of this.recorderPages) {
        lines.push(`  - url: ${page.url}`);
        lines.push(`    title: ${page.title || 'N/A'}`);
        lines.push(`    firstVisitTime: ${formatTime(page.firstVisitTime)}`);
      }
      lines.push('');
    }

    // 需要携带 URL 的操作类型
    const urlRequiredActions = [
      'open',
      'goto',
      'back',
      'forward',
      'reload',
      'tab_new',
      'tab_switch',
      'link_click',
    ];

    lines.push('steps:');
    for (const step of this.recorderSteps) {
      lines.push(`  - id: ${step.id}`);
      lines.push(`    time: ${formatTime(step.timestamp)}`);
      lines.push(`    action: ${step.action}`);
      if (step.selector) lines.push(`    selector: "${step.selector}"`);
      if (step.xpath) lines.push(`    xpath: "${step.xpath}"`);
      if (step.value) lines.push(`    value: "${step.value}"`);

      // 轨迹点 - 同时生成可执行的 CLI 命令
      if (step.points && Array.isArray(step.points) && step.points.length > 0) {
        lines.push(`    points: ${JSON.stringify(step.points)}`);
        // 生成可执行的 CLI 命令
        const trajectoryCmd = this.generateStepCliCommand(step);
        if (trajectoryCmd) {
          lines.push(`    # Replay: ${trajectoryCmd}`);
        }
      }

      if (step.x !== undefined) lines.push(`    x: ${step.x}`);
      if (step.y !== undefined) lines.push(`    y: ${step.y}`);
      if (step.from && typeof step.from === 'string') {
        lines.push(`    from: "${step.from}"`);
      } else if (step.from) {
        lines.push(`    from: { width: ${step.from.width}, height: ${step.from.height} }`);
      }
      if (step.to && typeof step.to === 'string') {
        lines.push(`    to: "${step.to}"`);
      } else if (step.to) {
        lines.push(`    to: { width: ${step.to.width}, height: ${step.to.height} }`);
      }

      // 备注信息 - 添加重点提示
      if (step.annotation) {
        lines.push(`    annotation:`);
        lines.push(`      type: ${step.annotation.type}`);
        lines.push(`      label: "${step.annotation.label}"`);

        // 完整属性生成
        if (step.annotation.selector) {
          lines.push(`      selector: "${step.annotation.selector}"`);
        }
        if (step.annotation.itemSelector) {
          lines.push(`      itemSelector: "${step.annotation.itemSelector}"`);
        }
        if (step.annotation.nextSelector) {
          lines.push(`      nextSelector: "${step.annotation.nextSelector}"`);
        }
        if (step.annotation.fields && step.annotation.fields.length > 0) {
          lines.push(
            `      fields: [${step.annotation.fields.map((f: string) => `"${f}"`).join(', ')}]`
          );
        }
        if (step.annotation.waitTimeout !== undefined) {
          lines.push(`      waitTimeout: ${step.annotation.waitTimeout}`);
        }
        if (step.annotation.customNote) {
          lines.push(`      customNote: "${step.annotation.customNote}"`);
        }

        lines.push(`      # ⚠️ IMPORTANT: This step requires special attention`);
        lines.push(`      # User marked this as: "${step.annotation.label}"`);
      }

      // 只在特定操作类型时携带 URL
      if (step.url && urlRequiredActions.includes(step.action)) {
        lines.push(`    url: "${step.url}"`);
      }

      if (step.index !== undefined) lines.push(`    index: ${step.index}`);
      if (step.key) lines.push(`    key: "${step.key}"`);
      if (step.code) lines.push(`    code: "${step.code}"`);
      if (step.ctrlKey) lines.push(`    ctrlKey: true`);
      if (step.metaKey) lines.push(`    metaKey: true`);
      if (step.altKey) lines.push(`    altKey: true`);
      if (step.shiftKey) lines.push(`    shiftKey: true`);
      lines.push('');
    }

    // ═══════════════════════════════════════════════════════════
    // CLI Commands Section - 生成可执行的 CLI 命令
    // ═══════════════════════════════════════════════════════════
    lines.push('# ═══════════════════════════════════════════════════════════');
    lines.push('# CLI Commands (Copy & Execute)');
    lines.push('# ═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('# 启用模拟人类鼠标移动（推荐）');
    lines.push('# Enable human-like mouse movement (recommended)');
    lines.push('export AGENT_BROWSER_HUMAN=bezier');
    lines.push('');

    for (const step of this.recorderSteps) {
      const cmd = this.generateStepCliCommand(step);
      if (cmd) {
        lines.push(`# ${step.id}: ${step.action}`);
        lines.push(cmd);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate CLI command for a single recorder step
   */
  private generateStepCliCommand(step: any): string | null {
    const escapeShell = (str: string): string => {
      return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    };

    const formatKeyCombo = (s: any): string => {
      const parts: string[] = [];
      if (s.ctrlKey) parts.push('Control');
      if (s.metaKey) parts.push('Meta');
      if (s.altKey) parts.push('Alt');
      if (
        s.shiftKey &&
        !['Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(s.key)
      ) {
        parts.push('Shift');
      }
      if (s.key) parts.push(s.key);
      return parts.join('+');
    };

    switch (step.action) {
      case 'click':
      case 'link_click':
        if (step.selector) {
          return `agent-browser click "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser click "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'check':
        if (step.selector) {
          return `agent-browser check "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser check "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'uncheck':
        if (step.selector) {
          return `agent-browser uncheck "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser uncheck "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'fill':
        if (step.value !== undefined) {
          if (step.selector) {
            return `agent-browser fill "${escapeShell(step.selector)}" "${escapeShell(String(step.value))}"`;
          }
          if (step.xpath) {
            return `agent-browser fill "xpath=${escapeShell(step.xpath)}" "${escapeShell(String(step.value))}"`;
          }
        }
        return null;

      case 'select':
        if (step.value !== undefined) {
          if (step.selector) {
            return `agent-browser select "${escapeShell(step.selector)}" "${escapeShell(String(step.value))}"`;
          }
          if (step.xpath) {
            return `agent-browser select "xpath=${escapeShell(step.xpath)}" "${escapeShell(String(step.value))}"`;
          }
        }
        return null;

      case 'keyboard':
        const key = formatKeyCombo(step);
        if (key) {
          return `agent-browser press "${key}"`;
        }
        return null;

      case 'scroll':
        if (step.x !== undefined && step.y !== undefined) {
          return `agent-browser mouse wheel ${step.y} ${step.x}`;
        }
        return null;

      case 'trajectory':
        if (step.points && Array.isArray(step.points) && step.points.length > 0) {
          // 简化轨迹点，最多5个
          const maxPoints = 5;
          let sampled: any[];
          if (step.points.length <= maxPoints) {
            sampled = step.points;
          } else {
            // 均匀采样
            sampled = [];
            const step_size = (step.points.length - 1) / (maxPoints - 1);
            for (let i = 0; i < maxPoints; i++) {
              const idx = Math.round(i * step_size);
              sampled.push(step.points[idx]);
            }
          }

          // 格式化为 x:y:delay 字符串
          const segments = sampled.map((p: any, i: number) => {
            const x = Math.round(p.x);
            const y = Math.round(p.y);
            const delay = i === 0 ? 0 : Math.round(p.t - sampled[i - 1].t);
            return `${x}:${y}:${delay}`;
          });

          return `AGENT_BROWSER_HUMAN=bezier agent-browser mouse trajectory "${segments.join(';')}"`;
        }
        return null;

      case 'open':
      case 'goto':
        if (step.url) {
          return `agent-browser open "${step.url}"`;
        }
        return null;

      case 'back':
        return 'agent-browser back';

      case 'forward':
        return 'agent-browser forward';

      case 'reload':
        return 'agent-browser reload';

      case 'tab_new':
        if (step.url) {
          return `agent-browser tab new "${step.url}"`;
        }
        return 'agent-browser tab new';

      case 'tab_switch':
        if (step.index !== undefined) {
          return `agent-browser tab ${step.index}`;
        }
        return null;

      case 'resize':
        if (step.to && typeof step.to === 'object') {
          return `agent-browser set viewport ${step.to.width} ${step.to.height}`;
        }
        return null;

      case 'hover':
        if (step.xpath) {
          return `agent-browser hover "xpath=${escapeShell(step.xpath)}"`;
        }
        if (step.selector) {
          return `agent-browser hover "${escapeShell(step.selector)}"`;
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Close the browser and clean up
   */
  async close(): Promise<void> {
    // Stop recording if active (saves video)
    if (this.recordingContext) {
      await this.stopRecording();
    }

    // Stop screencast if active
    if (this.screencastActive) {
      await this.stopScreencast();
    }

    // Remove recorder event listeners
    const page = this.pages.length > 0 ? this.getPage() : null;
    if (page) {
      if (this.recorderNavigatedHandler) {
        page.off('framenavigated', this.recorderNavigatedHandler);
        this.recorderNavigatedHandler = null;
      }
      if (this.recorderFrameAttachedHandler) {
        page.off('frameattached', this.recorderFrameAttachedHandler);
        this.recorderFrameAttachedHandler = null;
      }
      if (this.recorderPageHandler) {
        page.context().off('page', this.recorderPageHandler);
        this.recorderPageHandler = null;
      }
    }

    // Clean up network tracking state and listeners
    if (page) {
      if (this.requestListener) {
        page.off('request', this.requestListener);
        this.requestListener = null;
      }
      if (this.responseListener) {
        page.off('response', this.responseListener);
        this.responseListener = null;
      }
    }
    this.trackedRequests = [];
    this.pendingRequests.clear();
    this.isRequestTrackingEnabled = false;
    this.isResponseCaptureEnabled = false;
    this.routes.clear();
    this.consoleMessages = [];
    this.pageErrors = [];

    // Clean up navigation state
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;

    // Clean up CDP session
    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {});
      this.cdpSession = null;
    }

    // Helper function to close pages
    const closePages = async () => {
      for (const page of this.pages) {
        await page.close().catch(() => {});
      }
    };

    // Helper function to close browser
    const closeBrowser = async () => {
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    };

    if (this.browserbaseSessionId && this.browserbaseApiKey) {
      await this.closeBrowserbaseSession(this.browserbaseSessionId, this.browserbaseApiKey).catch(
        (error) => {
          console.error('Failed to close Browserbase session:', error);
        }
      );
      this.browser = null;
    } else if (this.browserUseSessionId && this.browserUseApiKey) {
      await this.closeBrowserUseSession(this.browserUseSessionId, this.browserUseApiKey).catch(
        (error) => {
          console.error('Failed to close Browser Use session:', error);
        }
      );
      this.browser = null;
    } else if (this.kernelSessionId && this.kernelApiKey) {
      await this.closeKernelSession(this.kernelSessionId, this.kernelApiKey).catch((error) => {
        console.error('Failed to close Kernel session:', error);
      });
      this.browser = null;
    } else if (this.cdpEndpoint !== null) {
      console.log('[DEBUG close] CDP endpoint detected:', this.cdpEndpoint);
      console.log('[DEBUG close] browser exists:', !!this.browser);
      if (this.browser) {
        try {
          // CDP 连接：只关闭我们打开的页面，然后断开连接
          // 注意：browser.close() 对于 CDP 连接只会断开连接，不会关闭远程浏览器
          console.log('[DEBUG close] CDP connection - closing pages and disconnecting');
          await closePages();
          await this.browser.close();
          console.log('[DEBUG close] CDP connection closed');
        } catch (e) {
          console.log('[DEBUG close] CDP disconnect failed:', e);
        } finally {
          this.browser = null;
        }
      }
    } else {
      // Regular browser: close everything
      await closePages();
      for (const context of this.contexts) {
        await context.close().catch(() => {});
      }
      await closeBrowser();
    }

    // Clean up all references
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
    this.frameCallback = null;
  }
}
