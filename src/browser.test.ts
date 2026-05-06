import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { BrowserManager } from './browser.js';
import { chromium, Browser } from 'playwright-core';

// 模拟浏览器的存储
const mockLocalStorage: Record<string, string> = {};
const mockSessionStorage: Record<string, string> = {};
let mockCookies: Array<{
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
}> = [];

// Track viewport size
let mockViewportSize = { width: 1280, height: 720 };

// Track page content set via setContent
let mockPageContent = '';

// Track click result (for testing cursor-interactive element clicks)
let mockClickResult = '';

// Track routes for scoped headers
const mockRoutes: Map<string, Function> = new Map();

// Track CDP session per page (using WeakMap to associate with page objects)
let mockCDPSession: Record<string, unknown> | null = null;

// Track if we should simulate invalid executablePath error
let shouldThrowInvalidPath = false;

// Track screencast state
let screencastActive = false;
let screencastFrames: Record<string, unknown>[] = [];

// Create mock CDP session
const createMockCDPSession = () => {
  const session: Record<string, unknown> = {
    _handlers: {} as Record<string, Function>,
    send: vi.fn((method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.startScreencast') {
        screencastActive = true;
        // Simulate a frame after a short delay
        setTimeout(() => {
          if (screencastActive && session) {
            screencastFrames.push({ data: 'base64encoded', metadata: {}, sessionId: 1 });
            const handler = session._handlers?.['Page.screencastFrame'];
            if (handler) {
              handler({ data: 'base64encoded', metadata: {}, sessionId: 1 });
            }
          }
        }, 100);
      }
      if (method === 'Page.stopScreencast') {
        screencastActive = false;
      }
      if (method === 'Emulation.setDeviceMetricsOverride') {
        return Promise.resolve();
      }
      if (method === 'Emulation.clearDeviceMetricsOverride') {
        return Promise.resolve();
      }
      // Input events
      if (method.startsWith('Input.')) {
        return Promise.resolve();
      }
      return Promise.resolve();
    }),
    on: vi.fn((event: string, handler: Function) => {
      session._handlers = session._handlers || {};
      session._handlers[event] = handler;
    }),
    off: vi.fn((event: string, handler: Function) => {
      if (session._handlers) {
        delete session._handlers[event];
      }
    }),
    detach: vi.fn(() => Promise.resolve()),
  };
  return session;
};

// 创建 mock frame 对象
const createMockFrame = () => ({
  url: () => 'http://example.com',
  name: () => 'mock-frame',
  locator: vi.fn((selector: string) => ({
    textContent: vi.fn(() => {
      // Return click result for #result selector if it was set
      if (selector === '#result' && mockClickResult) {
        return Promise.resolve(mockClickResult);
      }
      return Promise.resolve('Example Domain');
    }),
    isVisible: vi.fn(() => Promise.resolve(true)),
    count: vi.fn(() => Promise.resolve(1)),
    click: vi.fn(() => {
      // When clicking on a cursor-interactive element, simulate the onclick handler
      if (selector === '#clickable' || selector.includes('clickable')) {
        mockClickResult = 'clicked';
      }
      return Promise.resolve();
    }),
    ariaSnapshot: vi.fn(() => {
      // Return different snapshots based on content
      if (mockPageContent.includes('Standard Button')) {
        return Promise.resolve('- button "Standard Button"');
      }
      if (mockPageContent.includes('Click Me')) {
        return Promise.resolve('- heading "Example Domain" [level=1]\n- paragraph');
      }
      return Promise.resolve(
        '- heading "Example Domain" [level=1]\n- paragraph\n- button "Standard Button"'
      );
    }),
    nth: vi.fn(() => ({
      textContent: vi.fn(() => Promise.resolve('Example Domain')),
      isVisible: vi.fn(() => Promise.resolve(true)),
      click: vi.fn(() => Promise.resolve()),
    })),
  })),
  evaluate: vi.fn((fn: Function | string, ...args: unknown[]) => {
    if (typeof fn === 'string') {
      return Promise.resolve(undefined);
    }
    const fnStr = fn.toString();

    // Detect cursor interactive elements function
    const isCursorFunction =
      (fnStr.includes('interactiveRoles') ||
        fnStr.includes('interactiveTags') ||
        fnStr.includes('querySelectorAll') ||
        fnStr.includes('getBoundingClientRect') ||
        fnStr.includes('hasCursorPointer') ||
        fnStr.includes('hasOnClick') ||
        fnStr.includes('clickableClassPatterns') ||
        fnStr.includes('hasClickableClassName') ||
        fnStr.includes('looksClickable') ||
        fnStr.includes('results.push') ||
        fnStr.includes('buildSelector')) &&
      !fnStr.includes('localStorage') &&
      !fnStr.includes('sessionStorage');

    if (isCursorFunction) {
      // Return cursor interactive elements based on mockPageContent
      // Check for multiple elements first (more specific case)
      if (mockPageContent.includes('Onclick Span')) {
        return Promise.resolve([
          {
            selector: '#clickable-div',
            text: 'Clickable Div',
            tagName: 'div',
            hasOnClick: true,
            hasCursorPointer: true,
            hasTabIndex: false,
          },
          {
            selector: 'span',
            text: 'Onclick Span',
            tagName: 'span',
            hasOnClick: true,
            hasCursorPointer: true,
            hasTabIndex: false,
          },
        ]);
      }
      if (mockPageContent.includes('onclick="document.getElementById')) {
        return Promise.resolve([
          {
            selector: '#clickable',
            text: 'Click Me',
            tagName: 'div',
            hasOnClick: true,
            hasCursorPointer: true,
            hasTabIndex: false,
          },
        ]);
      }
      if (
        mockPageContent.includes('Clickable Div') &&
        mockPageContent.includes('cursor: pointer')
      ) {
        return Promise.resolve([
          {
            selector: '#clickable-div',
            text: 'Clickable Div',
            tagName: 'div',
            hasOnClick: true,
            hasCursorPointer: true,
            hasTabIndex: false,
          },
        ]);
      }
      return Promise.resolve([]);
    }

    if (fnStr.includes('localStorage')) {
      if (fnStr.includes('setItem')) {
        const keyMatch = fnStr.match(/setItem\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)/);
        if (keyMatch) {
          mockLocalStorage[keyMatch[1]] = keyMatch[2];
        }
        return Promise.resolve(undefined);
      }
      if (fnStr.includes('getItem')) {
        const keyMatch = fnStr.match(/getItem\s*\(\s*['"](\w+)['"]\s*\)/);
        if (keyMatch) {
          return Promise.resolve(mockLocalStorage[keyMatch[1]] || null);
        }
      }
      if (fnStr.includes('clear()')) {
        Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
        return Promise.resolve(undefined);
      }
    }
    return Promise.resolve({});
  }),
  childFrames: vi.fn(() => []),
  page: vi.fn(() => createMockPage()),
  getByRole: vi.fn(() => ({
    textContent: vi.fn(() => Promise.resolve('Example Domain')),
    isVisible: vi.fn(() => Promise.resolve(true)),
    click: vi.fn(() => Promise.resolve()),
    nth: vi.fn(() => ({
      textContent: vi.fn(() => Promise.resolve('Example Domain')),
      click: vi.fn(() => Promise.resolve()),
    })),
  })),
});

// 创建 mock page 对象
const createMockPage = (sharedContext?: Record<string, unknown>) => {
  const pageListeners: Map<string, Function[]> = new Map();
  // Each page has its own CDP session
  const pageCDPSession = createMockCDPSession();
  // Use provided shared context or create a new one
  const pageContext = sharedContext || createMockContext();

  return {
    url: () => 'https://example.com/',
    on: vi.fn((event: string, handler: Function) => {
      const handlers = pageListeners.get(event) || [];
      handlers.push(handler);
      pageListeners.set(event, handlers);
    }),
    off: vi.fn((event: string, handler: Function) => {
      const handlers = pageListeners.get(event) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }),
    removeListener: vi.fn((event: string, handler: Function) => {
      const handlers = pageListeners.get(event) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }),
    emit: vi.fn((event: string, data: unknown) => {
      const handlers = pageListeners.get(event) || [];
      handlers.forEach((h) => h(data));
    }),
    goto: vi.fn(() => Promise.resolve()),
    title: vi.fn(() => Promise.resolve('Example Domain')),
    locator: vi.fn((selector: string) => ({
      textContent: vi.fn(() => {
        // Return click result for #result selector if it was set
        if (selector === '#result' && mockClickResult) {
          return Promise.resolve(mockClickResult);
        }
        return Promise.resolve('Example Domain');
      }),
      isVisible: vi.fn(() => Promise.resolve(true)),
      count: vi.fn(() => Promise.resolve(1)),
      click: vi.fn(() => {
        // When clicking on a cursor-interactive element (selector starts with #clickable or is a clickable ref)
        // simulate the onclick handler by setting the result
        if (selector === '#clickable' || selector.includes('clickable')) {
          mockClickResult = 'clicked';
        }
        return Promise.resolve();
      }),
      ariaSnapshot: vi.fn(() => {
        // Return different snapshots based on content
        if (selector === '#result') {
          return Promise.resolve('clicked');
        }
        // If setContent was called with custom HTML, return appropriate aria snapshot
        if (mockPageContent.includes('Standard Button')) {
          return Promise.resolve('- button "Standard Button"');
        }
        if (mockPageContent.includes('Click Me')) {
          return Promise.resolve('- heading "Example Domain" [level=1]\n- paragraph');
        }
        // Default snapshot for :root or any other selector
        return Promise.resolve(
          '- heading "Example Domain" [level=1]\n- paragraph\n- button "Standard Button"'
        );
      }),
      nth: vi.fn(() => ({
        textContent: vi.fn(() => Promise.resolve('Example Domain')),
        click: vi.fn(() => Promise.resolve()),
      })),
    })),
    screenshot: vi.fn(() => Promise.resolve(Buffer.from('test'))),
    evaluate: vi.fn((fn: Function | string, ...args: unknown[]) => {
      // 处理字符串形式的脚本
      if (typeof fn === 'string') {
        // Handle window.__AGENT_BROWSER_REFS__ injection
        if (fn.includes('__AGENT_BROWSER_REFS__')) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(undefined);
      }
      // 检测函数类型并返回模拟值
      const fnStr = fn.toString();

      // Detect findCursorInteractiveElements function - return array for cursor elements
      // The function is created via new Function(), and takes rootSel as parameter
      // Check for characteristic patterns in the function body
      const isCursorFunction =
        (fnStr.includes('interactiveRoles') ||
          fnStr.includes('interactiveTags') ||
          fnStr.includes('querySelectorAll') ||
          fnStr.includes('getBoundingClientRect') ||
          fnStr.includes('hasCursorPointer') ||
          fnStr.includes('hasOnClick') ||
          fnStr.includes('clickableClassPatterns') ||
          fnStr.includes('hasClickableClassName') ||
          fnStr.includes('looksClickable') ||
          fnStr.includes('results.push') ||
          fnStr.includes('buildSelector')) &&
        !fnStr.includes('localStorage') &&
        !fnStr.includes('sessionStorage');

      if (isCursorFunction) {
        // Return cursor interactive elements based on mockPageContent
        // Check for multiple elements first (more specific case)
        if (mockPageContent.includes('Onclick Span')) {
          return Promise.resolve([
            {
              selector: '#clickable-div',
              text: 'Clickable Div',
              tagName: 'div',
              hasOnClick: true,
              hasCursorPointer: true,
              hasTabIndex: false,
            },
            {
              selector: 'span',
              text: 'Onclick Span',
              tagName: 'span',
              hasOnClick: true,
              hasCursorPointer: true,
              hasTabIndex: false,
            },
          ]);
        }
        if (mockPageContent.includes('onclick="document.getElementById')) {
          return Promise.resolve([
            {
              selector: '#clickable',
              text: 'Click Me',
              tagName: 'div',
              hasOnClick: true,
              hasCursorPointer: true,
              hasTabIndex: false,
            },
          ]);
        }
        if (
          mockPageContent.includes('Clickable Div') &&
          mockPageContent.includes('cursor: pointer')
        ) {
          return Promise.resolve([
            {
              selector: '#clickable-div',
              text: 'Clickable Div',
              tagName: 'div',
              hasOnClick: true,
              hasCursorPointer: true,
              hasTabIndex: false,
            },
          ]);
        }
        return Promise.resolve([]);
      }

      // Handle window.__AGENT_BROWSER_REFS__ related evaluations
      if (fnStr.includes('__AGENT_BROWSER_REFS__')) {
        return Promise.resolve({});
      }

      // Create mock localStorage/sessionStorage for executing functions
      const mockLocalStorageObj = {
        setItem: (key: string, value: string) => {
          mockLocalStorage[key] = value;
        },
        getItem: (key: string) => mockLocalStorage[key] || null,
        removeItem: (key: string) => {
          delete mockLocalStorage[key];
        },
        clear: () => {
          Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
        },
        get length() {
          return Object.keys(mockLocalStorage).length;
        },
        key: (index: number) => Object.keys(mockLocalStorage)[index] || null,
      };

      const mockSessionStorageObj = {
        setItem: (key: string, value: string) => {
          mockSessionStorage[key] = value;
        },
        getItem: (key: string) => mockSessionStorage[key] || null,
        removeItem: (key: string) => {
          delete mockSessionStorage[key];
        },
        clear: () => {
          Object.keys(mockSessionStorage).forEach((k) => delete mockSessionStorage[k]);
        },
        get length() {
          return Object.keys(mockSessionStorage).length;
        },
        key: (index: number) => Object.keys(mockSessionStorage)[index] || null,
      };

      // Try to execute the function with mock storage objects
      if (fnStr.includes('localStorage') || fnStr.includes('sessionStorage')) {
        try {
          // Create a function that executes with mock storage
          const mockWindow = {
            localStorage: mockLocalStorageObj,
            sessionStorage: mockSessionStorageObj,
          };
          // Use Function constructor to create a function with localStorage/sessionStorage in scope
          const wrappedFn = new Function(
            'localStorage',
            'sessionStorage',
            'window',
            `return (${fnStr})()`
          );
          const result = wrappedFn(mockLocalStorageObj, mockSessionStorageObj, mockWindow);
          return Promise.resolve(result);
        } catch {
          // Fallback to simple pattern matching if execution fails
          if (
            fnStr.includes('localStorage.length') ||
            (fnStr.includes('for') && fnStr.includes('localStorage'))
          ) {
            const items: Record<string, string> = {};
            for (const key of Object.keys(mockLocalStorage)) {
              items[key] = mockLocalStorage[key];
            }
            return Promise.resolve(items);
          }
          if (
            fnStr.includes('sessionStorage.length') ||
            (fnStr.includes('for') && fnStr.includes('sessionStorage'))
          ) {
            const items: Record<string, string> = {};
            for (const key of Object.keys(mockSessionStorage)) {
              items[key] = mockSessionStorage[key];
            }
            return Promise.resolve(items);
          }
        }
      }

      if (fnStr.includes('document.title')) {
        return Promise.resolve('Example Domain');
      }
      if (fnStr.includes('window.open')) {
        // Simulate creating a new page and emitting 'page' event on the context
        const newPage = createMockPage(pageContext);
        pageContext._pages.push(newPage);
        // Emit 'page' event asynchronously to simulate real browser behavior
        setTimeout(() => {
          const handlers = pageContext._listeners?.get('page') || [];
          handlers.forEach((h) => h(newPage));
        }, 10);
        return Promise.resolve(undefined);
      }
      // Handle functions with arguments (like (x) => x * 2)
      if (args.length > 0) {
        try {
          // Try to execute the function with the provided arguments
          return Promise.resolve(fn(...args));
        } catch {
          return Promise.resolve('Example Domain');
        }
      }
      return Promise.resolve('Example Domain');
    }),
    context: vi.fn(() => {
      // Return the shared context, but override newCDPSession to create a new session each time
      return {
        ...pageContext,
        newCDPSession: vi.fn(() => {
          // Create a new CDP session each time
          return Promise.resolve(createMockCDPSession());
        }),
      };
    }),
    setContent: vi.fn((content: string) => {
      mockPageContent = content;
      mockClickResult = ''; // Reset click result when content changes
      return Promise.resolve();
    }),
    viewportSize: vi.fn(() => ({ ...mockViewportSize })),
    setViewportSize: vi.fn((size: { width: number; height: number }) => {
      mockViewportSize = { ...size };
      return Promise.resolve();
    }),
    mainFrame: vi.fn(() => createMockFrame()),
    close: vi.fn(() => Promise.resolve()),
    frameLocator: vi.fn(() => createMockFrame()),
    route: vi.fn((pattern: string, handler: Function) => {
      mockRoutes.set(pattern, handler);
      return Promise.resolve();
    }),
    unroute: vi.fn((pattern: string, handler?: Function) => {
      mockRoutes.delete(pattern);
      return Promise.resolve();
    }),
    video: vi.fn(() => ({
      saveAs: vi.fn(() => Promise.resolve()),
    })),
    _pageListeners: pageListeners,
    _cdpSession: pageCDPSession,
  };
};

// 创建 mock browser context 对象
const createMockContext = () => {
  const contextListeners: Map<string, Function[]> = new Map();
  const pages: Record<string, unknown>[] = [];

  const context = {
    pages: vi.fn(() => pages),
    on: vi.fn((event: string, handler: Function) => {
      const handlers = contextListeners.get(event) || [];
      handlers.push(handler);
      contextListeners.set(event, handlers);
    }),
    setDefaultTimeout: vi.fn(),
    newPage: vi.fn(async () => {
      const newPage = createMockPage(context);
      pages.push(newPage);
      // Emit 'page' event for context tracking
      const handlers = contextListeners.get('page') || [];
      handlers.forEach((h) => h(newPage));
      return newPage;
    }),
    cookies: vi.fn(() => Promise.resolve([...mockCookies])),
    addCookies: vi.fn((cookies: Record<string, unknown>[]) => {
      mockCookies.push(...cookies);
      return Promise.resolve();
    }),
    clearCookies: vi.fn(() => {
      mockCookies = [];
      return Promise.resolve();
    }),
    setGeolocation: vi.fn(() => Promise.resolve()),
    grantPermissions: vi.fn(() => Promise.resolve()),
    clearPermissions: vi.fn(() => Promise.resolve()),
    setOffline: vi.fn(() => Promise.resolve()),
    setExtraHTTPHeaders: vi.fn(() => Promise.resolve()),
    storageState: vi.fn(() => Promise.resolve({ cookies: [], origins: [] })),
    newCDPSession: vi.fn(() => {
      if (!mockCDPSession) {
        mockCDPSession = createMockCDPSession();
      }
      return Promise.resolve(mockCDPSession);
    }),
    exposeBinding: vi.fn(() => Promise.resolve()),
    addInitScript: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    tracing: {
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
    },
    route: vi.fn(() => Promise.resolve()),
    unroute: vi.fn(() => Promise.resolve()),
    _pages: pages,
    _listeners: contextListeners,
  };

  // Create the first page with this context as shared
  const firstPage = createMockPage(context);
  pages.push(firstPage);

  return context;
};

// 创建 mock browser 对象
const createMockBrowser = () => {
  const browserListeners: Map<string, Function[]> = new Map();
  const contexts = [createMockContext()];

  return {
    contexts: vi.fn(() => contexts),
    close: vi.fn(() => Promise.resolve()),
    removeAllListeners: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      const handlers = browserListeners.get(event) || [];
      handlers.push(handler);
      browserListeners.set(event, handlers);
    }),
    once: vi.fn(),
    addListener: vi.fn(),
    isConnected: vi.fn(() => true),
    newContext: vi.fn(async () => {
      const newContext = createMockContext();
      contexts.push(newContext);
      return newContext;
    }),
    newPage: vi.fn(async () => {
      const page = createMockPage();
      return page;
    }),
    _contexts: contexts,
    _listeners: browserListeners,
  };
};

// 模拟 playwright-core
vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn((cdpUrl?: string) => {
      // Simulate connection failure for non-standard ports (for testing CDP reconnect error handling)
      if (cdpUrl && cdpUrl.includes('59999')) {
        return Promise.reject(new Error('Failed to connect via CDP'));
      }
      return Promise.resolve(createMockBrowser());
    }),
    launch: vi.fn((options?: Record<string, unknown>) => {
      // Simulate error for invalid executablePath
      if (options?.executablePath && options.executablePath.includes('nonexistent')) {
        return Promise.reject(
          new Error("Executable doesn't exist at /nonexistent/path/to/chromium")
        );
      }
      return Promise.resolve(createMockBrowser());
    }),
    launchPersistentContext: vi.fn(() =>
      Promise.resolve({
        pages: vi.fn(() => [createMockPage()]),
        on: vi.fn(),
        setDefaultTimeout: vi.fn(),
        newPage: vi.fn(() => Promise.resolve(createMockPage())),
        cookies: vi.fn(() => Promise.resolve([])),
        addCookies: vi.fn(() => Promise.resolve()),
        clearCookies: vi.fn(() => Promise.resolve()),
      })
    ),
  },
  firefox: {
    launch: vi.fn(() => Promise.resolve(createMockBrowser())),
    launchPersistentContext: vi.fn(() =>
      Promise.resolve({
        pages: vi.fn(() => [createMockPage()]),
        on: vi.fn(),
        setDefaultTimeout: vi.fn(),
      })
    ),
  },
  webkit: {
    launch: vi.fn(() => Promise.resolve(createMockBrowser())),
    launchPersistentContext: vi.fn(() =>
      Promise.resolve({
        pages: vi.fn(() => [createMockPage()]),
        on: vi.fn(),
        setDefaultTimeout: vi.fn(),
      })
    ),
  },
  devices: {},
}));

describe('BrowserManager', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ action: 'launch', id: 'test', headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('launch and close', () => {
    it('should report as launched', () => {
      expect(browser.isLaunched()).toBe(true);
    });

    it('should have a page', () => {
      const page = browser.getPage();
      expect(page).toBeDefined();
    });

    it('should reject invalid executablePath', async () => {
      const testBrowser = new BrowserManager();
      await expect(
        testBrowser.launch({
          action: 'launch',
          id: 'test',
          headless: true,
          executablePath: '/nonexistent/path/to/chromium',
        })
      ).rejects.toThrow();
    });

    it('should be no-op when relaunching with same options', async () => {
      const browserInstance = browser.getBrowser();
      await browser.launch({ id: 'test', action: 'launch', headless: true });
      expect(browser.getBrowser()).toBe(browserInstance);
    });

    it('should reconnect when CDP port changes', async () => {
      const newBrowser = new BrowserManager();
      await newBrowser.launch({ action: 'launch', id: 'test', headless: true });
      expect(newBrowser.getBrowser()).not.toBeNull();

      await expect(
        newBrowser.launch({ action: 'launch', id: 'test', cdpPort: 59999 })
      ).rejects.toThrow();

      expect(newBrowser.getBrowser()).toBeNull();
      await newBrowser.close();
    });
  });

  describe('navigation', () => {
    it('should navigate to URL', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      expect(page.url()).toBe('https://example.com/');
    });

    it('should get page title', async () => {
      const page = browser.getPage();
      const title = await page.title();
      expect(title).toBe('Example Domain');
    });
  });

  describe('element interaction', () => {
    it('should find element by selector', async () => {
      const page = browser.getPage();
      const heading = await page.locator('h1').textContent();
      expect(heading).toBe('Example Domain');
    });

    it('should check element visibility', async () => {
      const page = browser.getPage();
      const isVisible = await page.locator('h1').isVisible();
      expect(isVisible).toBe(true);
    });

    it('should count elements', async () => {
      const page = browser.getPage();
      const count = await page.locator('p').count();
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('screenshots', () => {
    it('should take screenshot as buffer', async () => {
      const page = browser.getPage();
      const buffer = await page.screenshot();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('evaluate', () => {
    it('should evaluate JavaScript', async () => {
      const page = browser.getPage();
      const result = await page.evaluate(() => document.title);
      expect(result).toBe('Example Domain');
    });

    it('should evaluate with arguments', async () => {
      const page = browser.getPage();
      const result = await page.evaluate((x: number) => x * 2, 5);
      expect(result).toBe(10);
    });
  });

  describe('tabs', () => {
    it('should create new tab', async () => {
      const result = await browser.newTab();
      expect(result.index).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should list tabs', async () => {
      const tabs = await browser.listTabs();
      expect(tabs.length).toBe(2);
    });

    it('should close tab', async () => {
      // Switch to second tab and close it
      const page = browser.getPage();
      const tabs = await browser.listTabs();
      if (tabs.length > 1) {
        const result = await browser.closeTab(1);
        expect(result.remaining).toBe(1);
      }
    });

    it('should auto-switch to externally opened tab (window.open)', async () => {
      // Ensure we start on tab 0
      const initialIndex = browser.getActiveIndex();
      expect(initialIndex).toBe(0);

      const page = browser.getPage();

      // Use window.open to create a new tab externally (as a user/script would)
      await page.evaluate(() => {
        window.open('about:blank', '_blank');
      });

      // Wait for the new page event to be processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Active tab should now be the newly opened tab
      const newIndex = browser.getActiveIndex();
      expect(newIndex).toBe(1);

      const tabs = await browser.listTabs();
      expect(tabs.length).toBe(2);
      expect(tabs[1].active).toBe(true);

      // Clean up: close the new tab
      await browser.closeTab(1);
    });
  });

  describe('context operations', () => {
    it('should get cookies from context', async () => {
      const page = browser.getPage();
      const cookies = await page.context().cookies();
      expect(Array.isArray(cookies)).toBe(true);
    });

    it('should set and get cookies', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.addCookies([{ name: 'test', value: 'value', url: 'https://example.com' }]);
      const cookies = await context.cookies();
      const testCookie = cookies.find((c) => c.name === 'test');
      expect(testCookie?.value).toBe('value');
    });

    it('should set cookie with domain', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.addCookies([
        { name: 'domainCookie', value: 'domainValue', domain: 'example.com', path: '/' },
      ]);
      const cookies = await context.cookies();
      const testCookie = cookies.find((c) => c.name === 'domainCookie');
      expect(testCookie?.value).toBe('domainValue');
    });

    it('should set multiple cookies at once', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.clearCookies();
      await context.addCookies([
        { name: 'cookie1', value: 'value1', url: 'https://example.com' },
        { name: 'cookie2', value: 'value2', url: 'https://example.com' },
      ]);
      const cookies = await context.cookies();
      expect(cookies.find((c) => c.name === 'cookie1')?.value).toBe('value1');
      expect(cookies.find((c) => c.name === 'cookie2')?.value).toBe('value2');
    });

    it('should clear cookies', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.clearCookies();
      const cookies = await context.cookies();
      expect(cookies.length).toBe(0);
    });
  });

  describe('localStorage operations', () => {
    it('should set and get localStorage item', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      await page.evaluate(() => localStorage.setItem('testKey', 'testValue'));
      const value = await page.evaluate(() => localStorage.getItem('testKey'));
      expect(value).toBe('testValue');
    });

    it('should get all localStorage items', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('key1', 'value1');
        localStorage.setItem('key2', 'value2');
      });
      const storage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) items[key] = localStorage.getItem(key) || '';
        }
        return items;
      });
      expect(storage.key1).toBe('value1');
      expect(storage.key2).toBe('value2');
    });

    it('should clear localStorage', async () => {
      const page = browser.getPage();
      await page.evaluate(() => localStorage.clear());
      const value = await page.evaluate(() => localStorage.getItem('testKey'));
      expect(value).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const page = browser.getPage();
      await page.evaluate(() => localStorage.clear());
      const value = await page.evaluate(() => localStorage.getItem('nonexistent'));
      expect(value).toBeNull();
    });
  });

  describe('sessionStorage operations', () => {
    it('should set and get sessionStorage item', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      await page.evaluate(() => sessionStorage.setItem('sessionKey', 'sessionValue'));
      const value = await page.evaluate(() => sessionStorage.getItem('sessionKey'));
      expect(value).toBe('sessionValue');
    });

    it('should get all sessionStorage items', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        sessionStorage.clear();
        sessionStorage.setItem('skey1', 'svalue1');
        sessionStorage.setItem('skey2', 'svalue2');
      });
      const storage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) items[key] = sessionStorage.getItem(key) || '';
        }
        return items;
      });
      expect(storage.skey1).toBe('svalue1');
      expect(storage.skey2).toBe('svalue2');
    });

    it('should clear sessionStorage', async () => {
      const page = browser.getPage();
      await page.evaluate(() => sessionStorage.clear());
      const value = await page.evaluate(() => sessionStorage.getItem('sessionKey'));
      expect(value).toBeNull();
    });
  });

  describe('viewport', () => {
    it('should set viewport', async () => {
      await browser.setViewport(1920, 1080);
      const page = browser.getPage();
      const size = page.viewportSize();
      expect(size?.width).toBe(1920);
      expect(size?.height).toBe(1080);
    });
  });

  describe('snapshot', () => {
    it('should get snapshot with refs', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      const { tree, refs } = await browser.getSnapshot();
      expect(tree).toContain('heading');
      expect(tree).toContain('Example Domain');
      expect(typeof refs).toBe('object');
    });

    it('should get interactive-only snapshot', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: interactiveSnapshot } = await browser.getSnapshot({ interactive: true });
      // Interactive snapshot should be shorter (fewer elements)
      expect(interactiveSnapshot.length).toBeLessThanOrEqual(fullSnapshot.length);
    });

    it('should get snapshot with depth limit', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: limitedSnapshot } = await browser.getSnapshot({ maxDepth: 2 });
      // Limited depth should have fewer nested elements
      const fullLines = fullSnapshot.split('\n').length;
      const limitedLines = limitedSnapshot.split('\n').length;
      expect(limitedLines).toBeLessThanOrEqual(fullLines);
    });

    it('should get compact snapshot', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: compactSnapshot } = await browser.getSnapshot({ compact: true });
      // Compact should be equal or shorter
      expect(compactSnapshot.length).toBeLessThanOrEqual(fullSnapshot.length);
    });

    it('should not capture cursor-interactive elements without cursor flag', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <button id="standard-btn">Standard Button</button>
            <div id="clickable-div" style="cursor: pointer;" onclick="void(0)">Clickable Div</div>
          </body>
        </html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true });

      // Standard button should be captured via ARIA
      expect(tree).toContain('button "Standard Button"');

      // Cursor-interactive elements should NOT be captured without cursor flag
      expect(tree).not.toContain('Cursor-interactive elements');
      expect(tree).not.toContain('clickable "Clickable Div"');

      // Should only have refs for ARIA interactive elements
      const refValues = Object.values(refs);
      expect(refValues.some((r) => r.role === 'button')).toBe(true);
      expect(refValues.some((r) => r.role === 'clickable')).toBe(false);
    });

    it('should capture cursor-interactive elements with cursor flag', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <button id="standard-btn">Standard Button</button>
            <div id="clickable-div" style="cursor: pointer;" onclick="void(0)">Clickable Div</div>
            <span onclick="void(0)">Onclick Span</span>
          </body>
        </html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true, cursor: true });

      // Standard button should be captured via ARIA
      expect(tree).toContain('button "Standard Button"');

      // Cursor-interactive elements should be captured with cursor flag
      expect(tree).toContain('Cursor-interactive elements');
      expect(tree).toContain('clickable "Clickable Div"');
      expect(tree).toContain('clickable "Onclick Span"');

      // Should have refs for all interactive elements
      const refValues = Object.values(refs);
      expect(refValues.some((r) => r.role === 'button')).toBe(true);
      expect(refValues.some((r) => r.role === 'clickable')).toBe(true);
    });

    it('should click cursor-interactive elements via refs', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <div id="clickable" style="cursor: pointer;" onclick="document.getElementById('result').textContent = 'clicked'">Click Me</div>
            <div id="result">not clicked</div>
          </body>
        </html>
      `);

      const { refs } = await browser.getSnapshot({ cursor: true });

      // Find the ref for the clickable element
      const clickableRef = Object.keys(refs).find((k) => refs[k].name === 'Click Me');
      expect(clickableRef).toBeDefined();

      // Click using the ref
      const locator = browser.getLocator(`@${clickableRef}`);
      await locator.click();

      // Verify click worked
      const result = await page.locator('#result').textContent();
      expect(result).toBe('clicked');
    });
  });

  describe('locator resolution', () => {
    it('should resolve CSS selector', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      const locator = browser.getLocator('h1');
      const text = await locator.textContent();
      expect(text).toBe('Example Domain');
    });

    it('should resolve ref from snapshot', async () => {
      await browser.getSnapshot(); // Populates refs
      // After snapshot, refs like @e1 should be available
      // This tests the ref resolution mechanism
      const page = browser.getPage();
      const h1 = await page.locator('h1').textContent();
      expect(h1).toBe('Example Domain');
    });
  });

  describe('scoped headers', () => {
    it('should register route for scoped headers', async () => {
      // Test that setScopedHeaders doesn't throw and completes successfully
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('https://example.com', { 'X-Test': 'value' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle full URL origin', async () => {
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('https://api.example.com/path', { Authorization: 'Bearer token' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle hostname-only origin', async () => {
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('example.com', { 'X-Custom': 'value' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should clear scoped headers for specific origin', async () => {
      await browser.clearScopedHeaders();
      await browser.setScopedHeaders('https://example.com', { 'X-Test': 'value' });
      await expect(browser.clearScopedHeaders('https://example.com')).resolves.not.toThrow();
    });

    it('should clear all scoped headers', async () => {
      await browser.setScopedHeaders('https://example.com', { 'X-Test-1': 'value1' });
      await browser.setScopedHeaders('https://example.org', { 'X-Test-2': 'value2' });
      await expect(browser.clearScopedHeaders()).resolves.not.toThrow();
    });

    it('should replace headers when called twice for same origin', async () => {
      await browser.clearScopedHeaders();
      await browser.setScopedHeaders('https://example.com', { 'X-First': 'first' });
      // Second call should replace, not add
      await expect(
        browser.setScopedHeaders('https://example.com', { 'X-Second': 'second' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle clearing non-existent origin gracefully', async () => {
      await browser.clearScopedHeaders();
      // Should not throw when clearing headers that were never set
      await expect(browser.clearScopedHeaders('https://never-set.com')).resolves.not.toThrow();
    });
  });

  describe('CDP session', () => {
    it('should create CDP session on demand', async () => {
      const cdp = await browser.getCDPSession();
      expect(cdp).toBeDefined();
    });

    it('should reuse existing CDP session', async () => {
      const cdp1 = await browser.getCDPSession();
      const cdp2 = await browser.getCDPSession();
      expect(cdp1).toBe(cdp2);
    });

    it('should filter out pages with empty URLs during CDP connection', async () => {
      // 使用mockImplementation来覆盖默认的模拟实现
      // 由于我们只是在测试中模拟一个对象，而不是在实际代码中使用它，
      // 使用as any类型断言是一个合理的妥协
      const spy = vi.mocked(chromium.connectOverCDP).mockImplementation(() => {
        return Promise.resolve({
          contexts: () => [
            {
              pages: () => [
                { url: () => 'http://example.com', on: vi.fn() },
                { url: () => '', on: vi.fn() }, // This page should be filtered out
                { url: () => 'http://anothersite.com', on: vi.fn() },
              ],
              on: vi.fn(),
              setDefaultTimeout: vi.fn(),
            },
          ],
          close: vi.fn(),
        } as unknown as Browser);
      });

      const cdpBrowser = new BrowserManager();
      await cdpBrowser.launch({ action: 'launch', id: 'test', cdpPort: 9222 });

      // Should have 2 pages, not 3
      expect(cdpBrowser.getPages().length).toBe(2);

      // Verify that the empty URL page is not in the list
      const urls = cdpBrowser.getPages().map((p) => p.url());
      expect(urls).not.toContain('');
      expect(urls).toContain('http://example.com');
      spy.mockRestore();
    });
  });

  describe('screencast', () => {
    it('should report screencasting state correctly', () => {
      expect(browser.isScreencasting()).toBe(false);
    });

    it('should start screencast', async () => {
      const frames: Array<{ data: string }> = [];
      await browser.startScreencast((frame) => {
        frames.push(frame);
      });
      expect(browser.isScreencasting()).toBe(true);

      // Wait a bit for at least one frame
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await browser.stopScreencast();
      expect(browser.isScreencasting()).toBe(false);
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should start screencast with custom options', async () => {
      const frames: Array<{ data: string }> = [];
      await browser.startScreencast(
        (frame) => {
          frames.push(frame);
        },
        {
          format: 'png',
          quality: 100,
          maxWidth: 800,
          maxHeight: 600,
          everyNthFrame: 1,
        }
      );
      expect(browser.isScreencasting()).toBe(true);

      // Wait for a frame
      await new Promise((resolve) => setTimeout(resolve, 200));

      await browser.stopScreencast();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should throw when starting screencast twice', async () => {
      await browser.startScreencast(() => {});
      await expect(browser.startScreencast(() => {})).rejects.toThrow('Screencast already active');
      await browser.stopScreencast();
    });

    it('should handle stop when not screencasting', async () => {
      // Should not throw
      await expect(browser.stopScreencast()).resolves.not.toThrow();
    });
  });

  describe('tab switch invalidates CDP session', () => {
    // Clean up any extra tabs before each test
    beforeEach(async () => {
      // Close all tabs except the first one
      const tabs = await browser.listTabs();
      for (let i = tabs.length - 1; i > 0; i--) {
        await browser.closeTab(i);
      }
      // Ensure we're on tab 0
      await browser.switchTo(0);
      // Stop any active screencast
      if (browser.isScreencasting()) {
        await browser.stopScreencast();
      }
    });

    it('should not invalidate CDP when switching to same tab', async () => {
      // Get CDP session for current tab
      const cdp1 = await browser.getCDPSession();

      // Switch to same tab - should NOT invalidate
      await browser.switchTo(0);

      // Should be the same session
      const cdp2 = await browser.getCDPSession();
      expect(cdp2).toBe(cdp1);
    });

    it('should invalidate CDP session on tab switch', async () => {
      // Get CDP session for tab 0
      const cdp1 = await browser.getCDPSession();
      expect(cdp1).toBeDefined();

      // Create new tab - this switches to the new tab automatically
      await browser.newTab();

      // Get CDP session - should be different since we're on a new page
      const cdp2 = await browser.getCDPSession();
      expect(cdp2).toBeDefined();

      // Sessions should be different objects (different pages have different CDP sessions)
      expect(cdp2).not.toBe(cdp1);
    });

    it('should stop screencast on tab switch', async () => {
      // Start screencast on tab 0
      await browser.startScreencast(() => {});
      expect(browser.isScreencasting()).toBe(true);

      // Create new tab and switch
      await browser.newTab();
      await browser.switchTo(1);

      // Screencast should be stopped (it's page-specific)
      expect(browser.isScreencasting()).toBe(false);
    });
  });

  describe('input injection', () => {
    it('should inject mouse move event', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mouseMoved',
          x: 100,
          y: 100,
        })
      ).resolves.not.toThrow();
    });

    it('should inject mouse click events', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mousePressed',
          x: 100,
          y: 100,
          button: 'left',
          clickCount: 1,
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectMouseEvent({
          type: 'mouseReleased',
          x: 100,
          y: 100,
          button: 'left',
        })
      ).resolves.not.toThrow();
    });

    it('should inject mouse wheel event', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mouseWheel',
          x: 100,
          y: 100,
          deltaX: 0,
          deltaY: 100,
        })
      ).resolves.not.toThrow();
    });

    it('should inject keyboard events', async () => {
      await expect(
        browser.injectKeyboardEvent({
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectKeyboardEvent({
          type: 'keyUp',
          key: 'a',
          code: 'KeyA',
        })
      ).resolves.not.toThrow();
    });

    it('should inject char event', async () => {
      // CDP char events only accept single characters
      await expect(
        browser.injectKeyboardEvent({
          type: 'char',
          text: 'h',
        })
      ).resolves.not.toThrow();
    });

    it('should inject keyboard with modifiers', async () => {
      await expect(
        browser.injectKeyboardEvent({
          type: 'keyDown',
          key: 'c',
          code: 'KeyC',
          modifiers: 2, // Ctrl
        })
      ).resolves.not.toThrow();
    });

    it('should inject touch events', async () => {
      await expect(
        browser.injectTouchEvent({
          type: 'touchStart',
          touchPoints: [{ x: 100, y: 100 }],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchMove',
          touchPoints: [{ x: 150, y: 150 }],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchEnd',
          touchPoints: [],
        })
      ).resolves.not.toThrow();
    });

    it('should inject multi-touch events', async () => {
      await expect(
        browser.injectTouchEvent({
          type: 'touchStart',
          touchPoints: [
            { x: 100, y: 100, id: 0 },
            { x: 200, y: 200, id: 1 },
          ],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchEnd',
          touchPoints: [],
        })
      ).resolves.not.toThrow();
    });
  });
});
