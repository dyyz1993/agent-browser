import type { Browser, BrowserContext, Page } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

export class RecordingManager {
  private recordingContext: BrowserContext | null = null;
  private recordingPage: Page | null = null;
  private recordingOutputPath = '';
  private recordingTempDir = '';

  private getBrowser: () => Browser | null;
  private getPage: () => Page;
  private getContexts: () => BrowserContext[];
  private getPages: () => Page[];
  private getActivePageIndex: () => number;
  private setActivePageIndex: (index: number) => void;
  private addPage: (page: Page) => void;
  private addContext: (context: BrowserContext) => void;
  private removePage: (page: Page) => void;
  private removeContext: (context: BrowserContext) => void;
  private setupPageTracking: (page: Page) => void;
  private invalidateCDPSession: () => Promise<void>;

  constructor(deps: {
    getBrowser: () => Browser | null;
    getPage: () => Page;
    getContexts: () => BrowserContext[];
    getPages: () => Page[];
    getActivePageIndex: () => number;
    setActivePageIndex: (index: number) => void;
    addPage: (page: Page) => void;
    addContext: (context: BrowserContext) => void;
    removePage: (page: Page) => void;
    removeContext: (context: BrowserContext) => void;
    setupPageTracking: (page: Page) => void;
    invalidateCDPSession: () => Promise<void>;
  }) {
    this.getBrowser = deps.getBrowser;
    this.getPage = deps.getPage;
    this.getContexts = deps.getContexts;
    this.getPages = deps.getPages;
    this.getActivePageIndex = deps.getActivePageIndex;
    this.setActivePageIndex = deps.setActivePageIndex;
    this.addPage = deps.addPage;
    this.addContext = deps.addContext;
    this.removePage = deps.removePage;
    this.removeContext = deps.removeContext;
    this.setupPageTracking = deps.setupPageTracking;
    this.invalidateCDPSession = deps.invalidateCDPSession;
  }

  isRecording(): boolean {
    return this.recordingContext !== null;
  }

  async startRecording(outputPath: string, url?: string): Promise<void> {
    if (this.recordingContext) {
      throw new Error(
        "Recording already in progress. Run 'record stop' first, or use 'record restart' to stop and start a new recording."
      );
    }

    const browser = this.getBrowser();
    if (!browser) {
      throw new Error('Browser not launched. Call launch first.');
    }

    if (existsSync(outputPath)) {
      throw new Error(`Output file already exists: ${outputPath}`);
    }

    if (!outputPath.endsWith('.webm')) {
      throw new Error(
        'Playwright native recording only supports WebM format. Please use a .webm extension.'
      );
    }

    const pages = this.getPages();
    const contexts = this.getContexts();
    const currentPage = pages.length > 0 ? pages[this.getActivePageIndex()] : null;
    const currentContext = contexts.length > 0 ? contexts[0] : null;
    if (!url && currentPage) {
      const currentUrl = currentPage.url();
      if (currentUrl && currentUrl !== 'about:blank') {
        url = currentUrl;
      }
    }

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

    const session = process.env.AGENT_BROWSER_SESSION || 'default';
    this.recordingTempDir = path.join(
      os.tmpdir(),
      `agent-browser-recording-${session}-${Date.now()}`
    );
    mkdirSync(this.recordingTempDir, { recursive: true });

    this.recordingOutputPath = outputPath;

    const viewport = { width: 1280, height: 720 };
    this.recordingContext = await browser.newContext({
      viewport,
      recordVideo: {
        dir: this.recordingTempDir,
        size: viewport,
      },
      storageState,
    });
    this.recordingContext.setDefaultTimeout(10000);

    this.recordingPage = await this.recordingContext.newPage();

    this.addContext(this.recordingContext);
    this.addPage(this.recordingPage);
    this.setActivePageIndex(pages.length - 1 + 1);

    this.setupPageTracking(this.recordingPage);

    await this.invalidateCDPSession();

    if (url) {
      await this.recordingPage.goto(url, { waitUntil: 'load' });
    }
  }

  async stopRecording(): Promise<{ path: string; frames: number; error?: string }> {
    if (!this.recordingContext || !this.recordingPage) {
      return { path: '', frames: 0, error: 'No recording in progress' };
    }

    const outputPath = this.recordingOutputPath;

    try {
      const video = this.recordingPage.video();

      this.removePage(this.recordingPage);
      this.removeContext(this.recordingContext);

      await this.recordingPage.close();

      if (video) {
        await video.saveAs(outputPath);
      }

      if (this.recordingTempDir) {
        rmSync(this.recordingTempDir, { recursive: true, force: true });
      }

      await this.recordingContext.close();

      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = '';
      this.recordingTempDir = '';

      const pages = this.getPages();
      if (pages.length > 0) {
        this.setActivePageIndex(Math.min(this.getActivePageIndex(), pages.length - 1));
      } else {
        this.setActivePageIndex(0);
      }

      await this.invalidateCDPSession();

      return { path: outputPath, frames: 0 };
    } catch (error) {
      if (this.recordingTempDir) {
        rmSync(this.recordingTempDir, { recursive: true, force: true });
      }

      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = '';
      this.recordingTempDir = '';

      const message = error instanceof Error ? error.message : String(error);
      return { path: outputPath, frames: 0, error: message };
    }
  }

  async restartRecording(
    outputPath: string,
    url?: string
  ): Promise<{ previousPath?: string; stopped: boolean }> {
    let previousPath: string | undefined;
    let stopped = false;

    if (this.recordingContext) {
      const result = await this.stopRecording();
      previousPath = result.path;
      stopped = true;
    }

    await this.startRecording(outputPath, url);

    return { previousPath, stopped };
  }

  cleanup(): void {
    this.recordingContext = null;
    this.recordingPage = null;
    this.recordingOutputPath = '';
    this.recordingTempDir = '';
  }
}
