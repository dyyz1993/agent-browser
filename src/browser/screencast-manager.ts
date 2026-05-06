import type { CDPSession } from 'playwright-core';
import type { ScreencastFrame, ScreencastOptions } from './types.js';

export class ScreencastManager {
  private screencastActive = false;
  private screencastShouldBeActive = false;
  private screencastSessionId = 0;
  private frameCallback: ((frame: ScreencastFrame) => void) | null = null;
  private screencastFrameHandler: ((params: Record<string, unknown>) => void) | null = null;
  private lastScreencastOptions: ScreencastOptions | null = null;

  private getCDPSession: () => Promise<CDPSession>;

  constructor(getCDPSession: () => Promise<CDPSession>) {
    this.getCDPSession = getCDPSession;
  }

  get active(): boolean {
    return this.screencastActive;
  }

  get shouldBeActive(): boolean {
    return this.screencastShouldBeActive;
  }

  get savedCallback(): ((frame: ScreencastFrame) => void) | null {
    return this.frameCallback;
  }

  get savedOptions(): ScreencastOptions | null {
    return this.lastScreencastOptions;
  }

  isScreencasting(): boolean {
    return this.screencastActive;
  }

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

    this.screencastFrameHandler = async (params: Record<string, unknown>) => {
      const frame: ScreencastFrame = {
        data: params.data as string,
        metadata: params.metadata as ScreencastFrame['metadata'],
        sessionId: params.sessionId as number,
      };

      await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId as number });

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

  async stopScreencast(): Promise<void> {
    this.screencastShouldBeActive = false;
    await this.stopScreencastInternal();
  }

  async stopScreencastInternal(): Promise<void> {
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

  async injectKeyboardEvent(params: {
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
    key?: string;
    code?: string;
    text?: string;
    modifiers?: number;
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

  async insertText(text: string): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Input.insertText', { text });
  }

  cleanup(): void {
    this.screencastActive = false;
    this.screencastShouldBeActive = false;
    this.frameCallback = null;
    this.screencastFrameHandler = null;
  }
}
