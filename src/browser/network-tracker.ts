import type { Page, Request, Response } from 'playwright-core';
import path from 'node:path';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import type { TrackedRequest, ConsoleMessage, PageError, TrackedWebSocket } from './types.js';

export class NetworkTracker {
  private trackedRequests: TrackedRequest[] = [];
  private isRequestTrackingEnabled = false;
  private isResponseCaptureEnabled = false;
  private pendingRequests: Map<string, TrackedRequest> = new Map();
  private requestListener: ((request: Request) => void) | null = null;
  private responseListener: ((response: Response) => Promise<void>) | null = null;
  private consoleMessages: ConsoleMessage[] = [];
  private pageErrors: PageError[] = [];
  private trackedWebSockets: TrackedWebSocket[] = [];
  private isWebSocketTrackingEnabled = false;

  private getPage: () => Page;

  constructor(getPage: () => Page) {
    this.getPage = getPage;
  }

  get trackingEnabled(): boolean {
    return this.isRequestTrackingEnabled;
  }

  get wsTrackingEnabled(): boolean {
    return this.isWebSocketTrackingEnabled;
  }

  startRequestTracking(captureResponse = false): void {
    const page = this.getPage();

    if (this.isRequestTrackingEnabled && this.isResponseCaptureEnabled === captureResponse) {
      return;
    }

    if (this.requestListener) {
      page.off('request', this.requestListener);
    }
    if (this.responseListener) {
      page.off('response', this.responseListener);
    }

    this.isRequestTrackingEnabled = true;
    this.isResponseCaptureEnabled = captureResponse;

    this.requestListener = (request: Request) => {
      const trackedRequest: TrackedRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        resourceType: request.resourceType(),
      };

      this.trackedRequests.push(trackedRequest);

      const key = `${request.url()}:${trackedRequest.timestamp}`;
      this.pendingRequests.set(key, trackedRequest);
    };

    page.on('request', this.requestListener);

    if (captureResponse) {
      this.responseListener = async (response: Response) => {
        const request = response.request();
        const url = request.url();
        for (const [key, trackedRequest] of this.pendingRequests.entries()) {
          if (key.startsWith(url + ':')) {
            trackedRequest.status = response.status();
            trackedRequest.statusText = response.statusText();
            trackedRequest.responseHeaders = response.headers();
            trackedRequest.contentType = response.headers()['content-type'] || '';

            try {
              const body = await response.text();
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
              trackedRequest.responseBody = undefined;
            }

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

  getRequests(filter?: string, type?: 'json'): TrackedRequest[] {
    let requests = this.trackedRequests;

    if (filter) {
      requests = requests.filter((r) => r.url.includes(filter));
    }

    if (type === 'json') {
      requests = requests.filter((r) => {
        const contentType = r.contentType || '';
        return contentType.includes('application/json') || contentType.includes('text/json');
      });
    }

    return requests;
  }

  clearRequests(): void {
    this.trackedRequests = [];
  }

  startWebSocketTracking(): void {
    const page = this.getPage();
    if (this.isWebSocketTrackingEnabled) return;
    this.isWebSocketTrackingEnabled = true;

    this.wsListener = (ws: import('playwright-core').WebSocket) => {
      const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const tracked: TrackedWebSocket = {
        id,
        url: ws.url(),
        openedAt: Date.now(),
        frames: [],
      };
      this.trackedWebSockets.push(tracked);

      ws.on('framesent', (frame: { payload: string | Buffer }) => {
        tracked.frames.push({
          direction: 'send',
          data:
            typeof frame.payload === 'string'
              ? frame.payload
              : `[binary ${frame.payload.byteLength}B]`,
          timestamp: Date.now(),
        });
      });

      ws.on('framereceived', (frame: { payload: string | Buffer }) => {
        tracked.frames.push({
          direction: 'recv',
          data:
            typeof frame.payload === 'string'
              ? frame.payload
              : `[binary ${frame.payload.byteLength}B]`,
          timestamp: Date.now(),
        });
      });

      ws.on('socketerror', (err: string) => {
        tracked.error = err;
      });

      ws.on('close', () => {
        tracked.closedAt = Date.now();
      });
    };

    page.on('websocket', this.wsListener);
  }

  private wsListener: ((ws: import('playwright-core').WebSocket) => void) | null = null;

  getWebSockets(filter?: string): TrackedWebSocket[] {
    let sockets = this.trackedWebSockets;
    if (filter) {
      sockets = sockets.filter((ws) => ws.url.includes(filter));
    }
    return sockets;
  }

  clearWebSockets(): void {
    this.trackedWebSockets = [];
  }

  saveRequestsToDir(
    outputDir: string,
    filter?: string,
    type?: 'json'
  ): { savedCount: number; outputPath: string; indexPath: string } {
    const requests = this.getRequests(filter, type);

    const absolutePath = path.resolve(outputDir);

    const hasExtension = path.extname(absolutePath) !== '';
    const isExistingDirectory = existsSync(absolutePath) && statSync(absolutePath).isDirectory();

    let targetPath = absolutePath;
    let warningMessage: string | undefined;

    if (hasExtension && !isExistingDirectory) {
      targetPath = path.dirname(absolutePath);
      warningMessage = `Warning: "${outputDir}" looks like a file path. Using directory: "${targetPath}"`;
      console.warn(warningMessage);
    }

    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

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

    requests.forEach((request, index) => {
      const fileIndex = String(index + 1).padStart(3, '0');
      const urlObj = new URL(request.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const baseName = pathParts.length > 0 ? pathParts.join('_').substring(0, 50) : 'request';
      const fileName = `${fileIndex}_${baseName}.json`;
      const filePath = path.join(targetPath, fileName);

      const requestData = {
        url: request.url,
        method: request.method,
        status: request.status,
        contentType: request.contentType,
        timestamp: request.timestamp,
        body: request.responseBody,
      };
      writeFileSync(filePath, JSON.stringify(requestData, null, 2), 'utf-8');

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

    const indexPath = path.join(targetPath, 'index.json');
    writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');

    return {
      savedCount: requests.length,
      outputPath: targetPath,
      indexPath,
    };
  }

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

  getConsoleMessages(): ConsoleMessage[] {
    return this.consoleMessages;
  }

  clearConsoleMessages(): void {
    this.consoleMessages = [];
  }

  startErrorTracking(): void {
    const page = this.getPage();
    page.on('pageerror', (error) => {
      this.pageErrors.push({
        message: error.message,
        timestamp: Date.now(),
      });
    });
  }

  getPageErrors(): PageError[] {
    return this.pageErrors;
  }

  clearPageErrors(): void {
    this.pageErrors = [];
  }

  setupPageTracking(page: import('playwright-core').Page): void {
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
  }

  cleanup(page: import('playwright-core').Page | null): void {
    if (page) {
      if (this.requestListener) {
        page.off('request', this.requestListener);
        this.requestListener = null;
      }
      if (this.responseListener) {
        page.off('response', this.responseListener);
        this.responseListener = null;
      }
      if (this.wsListener) {
        try {
          page.off('websocket', this.wsListener);
        } catch {
          /* empty */
        }
        this.wsListener = null;
      }
    }
    this.trackedRequests = [];
    this.pendingRequests.clear();
    this.isRequestTrackingEnabled = false;
    this.isResponseCaptureEnabled = false;
    this.isWebSocketTrackingEnabled = false;
    this.trackedWebSockets = [];
    this.consoleMessages = [];
    this.pageErrors = [];
  }
}
