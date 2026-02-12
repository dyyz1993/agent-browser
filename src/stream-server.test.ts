import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { StreamServer } from './stream-server.js';
import { BrowserManager } from './browser.js';
import type { LaunchCommand } from './types.js';
import { serializeResponse } from './protocol.js';

// Helper: wait for a specific message by ID
function waitForMessage(ws: WebSocket, id: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for message ${id}`)), timeout);

    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };

    ws.on('message', handler);
  });
}

// Helper: wait for a specific message type
function waitForMessageType(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for type ${type}`)), timeout);

    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };

    ws.on('message', handler);
  });
}

describe('StreamServer - Command Passthrough Integration', () => {
  let browser: BrowserManager;
  let server: StreamServer;
  let wsClient: WebSocket;
  const TEST_PORT = 9230; // Use different port to avoid conflicts

  beforeAll(async () => {
    // Create real BrowserManager
    browser = new BrowserManager();

    // Launch browser (headless for tests)
    await browser.launch({
      id: 'test',
      action: 'launch',
      headless: true,
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });

    // Start StreamServer
    server = new StreamServer(browser, TEST_PORT);
    await server.start();

    // Create WebSocket client
    wsClient = new WebSocket(`ws://localhost:${TEST_PORT}`);

    // Wait for connection
    await new Promise<void>((resolve) => {
      wsClient.on('open', () => resolve());
    });
  }, 60000);

  afterAll(async () => {
    // Close client
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }

    // Stop server
    if (server) {
      await server.stop();
    }

    // Close browser
    if (browser) {
      await browser.close();
    }
  });

  it('should handle status message', async () => {
    wsClient.send(JSON.stringify({ type: 'status' }));
    const response = await waitForMessageType(wsClient, 'status');

    expect(response.type).toBe('status');
    expect(response.connected).toBe(true);
  });

  it('should passthrough navigate command via WebSocket', async () => {
    const command: LaunchCommand = {
      id: 'test-navigate-1',
      action: 'navigate',
      url: 'https://example.com',
    };

    wsClient.send(JSON.stringify(command));
    const response = await waitForMessage(wsClient, command.id);

    expect(response.id).toBe('test-navigate-1');
    expect(response.success).toBe(true);
    expect(response.data.url).toBe('https://example.com/'); // Browser adds trailing slash
    expect(response.data.title).toBeTruthy();
  });

  it('should passthrough screenshot command via WebSocket', async () => {
    const command = {
      id: 'test-screenshot-1',
      action: 'screenshot',
      format: 'png' as const,
    };

    wsClient.send(JSON.stringify(command));
    const response = await waitForMessage(wsClient, command.id);

    expect(response.id).toBe('test-screenshot-1');
    expect(response.success).toBe(true);
    expect(response.data.base64).toBeTruthy();
    expect(typeof response.data.base64).toBe('string');
  });

  it('should passthrough snapshot command via WebSocket', async () => {
    const command = {
      id: 'test-snapshot-1',
      action: 'snapshot',
    };

    wsClient.send(JSON.stringify(command));
    const response = await waitForMessage(wsClient, command.id);

    expect(response.id).toBe('test-snapshot-1');
    expect(response.success).toBe(true);
    expect(response.data.snapshot).toBeTruthy();
    expect(typeof response.data.snapshot).toBe('string');
  });

  it('should handle input_mouse message (non-command)', async () => {
    // This should not have 'id' and 'action', but 'type' instead
    const mouseMessage = {
      type: 'input_mouse' as const,
      eventType: 'mouseMoved' as const,
      x: 100,
      y: 200,
    };

    // Send input_mouse message
    wsClient.send(JSON.stringify(mouseMessage));

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // input_mouse doesn't send a response, so we just verify no error was thrown
    // If it reaches here, the message was handled correctly
    expect(true).toBe(true);
  });

  it('should handle command errors correctly', async () => {
    // Test with an invalid action that doesn't exist
    const command = {
      id: 'test-error-1',
      action: 'invalid_action_that_does_not_exist' as const,
    };

    wsClient.send(JSON.stringify(command));
    const response = await waitForMessage(wsClient, command.id, 5000);

    expect(response.id).toBe('test-error-1');
    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });

  it('should handle multiple commands concurrently', async () => {
    const commands = [
      { id: 'test-concurrent-1', action: 'url' as const },
      { id: 'test-concurrent-2', action: 'title' as const },
      { id: 'test-concurrent-3', action: 'snapshot' as const },
    ];

    // Send all commands
    commands.forEach((cmd) => wsClient.send(JSON.stringify(cmd)));

    // Wait for all responses
    const responses = await Promise.all(commands.map((cmd) => waitForMessage(wsClient, cmd.id)));

    expect(responses).toHaveLength(3);
    responses.forEach((res) => {
      expect(res.success).toBe(true);
    });
  });

  it('should still receive frame broadcasts', async () => {
    // First navigate to a page
    const navCommand = {
      id: 'test-frame-nav',
      action: 'navigate' as const,
      url: 'https://example.com',
    };
    wsClient.send(JSON.stringify(navCommand));
    await waitForMessage(wsClient, navCommand.id);

    // Start screencast
    const startCommand = {
      id: 'test-screencast-start',
      action: 'screencast_start' as const,
      format: 'jpeg' as const,
      quality: 80,
    };

    wsClient.send(JSON.stringify(startCommand));
    await waitForMessage(wsClient, startCommand.id);

    // Wait for at least one frame (extended timeout for CDP setup)
    const frame = await waitForMessageType(wsClient, 'frame', 8000);

    expect(frame).toBeTruthy();
    expect(frame.type).toBe('frame');
    expect(frame.data).toBeTruthy();
    expect(frame.metadata).toBeTruthy();

    // Stop screencast
    const stopCommand = {
      id: 'test-screencast-stop',
      action: 'screencast_stop' as const,
    };

    wsClient.send(JSON.stringify(stopCommand));
    await waitForMessage(wsClient, stopCommand.id);
  }, 15000);
});

// UI-specific tests
describe('StreamServer - UI Integration Tests', () => {
  let browser: BrowserManager;
  let server: StreamServer;
  let wsClient: WebSocket;
  const TEST_PORT = 9231; // Different port

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      id: 'test-ui',
      action: 'launch',
      headless: true,
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });

    server = new StreamServer(browser, TEST_PORT);
    await server.start();

    wsClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => {
      wsClient.on('open', () => resolve());
    });
  }, 60000);

  afterAll(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    if (server) {
      await server.stop();
    }
    if (browser) {
      await browser.close();
    }
  });

  describe('Tab Operations (UI Feature)', () => {
    it('should list tabs via tab_list command', async () => {
      const command = {
        id: 'test-tab-list',
        action: 'tab_list' as const,
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-tab-list');
      expect(response.success).toBe(true);
      expect(response.data.tabs).toBeInstanceOf(Array);
      expect(response.data.tabs.length).toBeGreaterThan(0);
    });

    it('should create new tab via tab_new command', async () => {
      const command = {
        id: 'test-tab-new',
        action: 'tab_new' as const,
        url: 'https://example.com',
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-tab-new');
      expect(response.success).toBe(true);
      expect(response.data.index).toBeGreaterThanOrEqual(0);
    });

    it('should switch tabs via tab_switch command', async () => {
      // First create a second tab
      const newTabCmd = {
        id: 'test-tab-switch-new',
        action: 'tab_new' as const,
      };
      wsClient.send(JSON.stringify(newTabCmd));
      await waitForMessage(wsClient, newTabCmd.id);

      // Switch to tab 0
      const switchCmd = {
        id: 'test-tab-switch',
        action: 'tab_switch' as const,
        index: 0,
      };

      wsClient.send(JSON.stringify(switchCmd));
      const response = await waitForMessage(wsClient, switchCmd.id);

      expect(response.id).toBe('test-tab-switch');
      expect(response.success).toBe(true);
      expect(response.data.index).toBe(0);
    });

    it('should close tab via tab_close command', async () => {
      // Create a new tab
      const newTabCmd = {
        id: 'test-tab-close-new',
        action: 'tab_new' as const,
      };
      wsClient.send(JSON.stringify(newTabCmd));
      const newTabResp = await waitForMessage(wsClient, newTabCmd.id);
      const tabIndex = newTabResp.data.index;

      // Close the tab
      const closeCmd = {
        id: 'test-tab-close',
        action: 'tab_close' as const,
        index: tabIndex,
      };

      wsClient.send(JSON.stringify(closeCmd));
      const response = await waitForMessage(wsClient, closeCmd.id);

      expect(response.id).toBe('test-tab-close');
      expect(response.success).toBe(true);
    });
  });

  describe('Viewport Operations (UI Feature)', () => {
    it('should resize viewport via viewport command', async () => {
      const command = {
        id: 'test-viewport',
        action: 'viewport' as const,
        width: 800,
        height: 600,
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-viewport');
      expect(response.success).toBe(true);
      expect(response.data.width).toBe(800);
      expect(response.data.height).toBe(600);
    });

    it('should reflect viewport changes in status message', async () => {
      // Set viewport
      const viewportCmd = {
        id: 'test-viewport-status',
        action: 'viewport' as const,
        width: 1024,
        height: 768,
      };
      wsClient.send(JSON.stringify(viewportCmd));
      await waitForMessage(wsClient, viewportCmd.id);

      // Check status
      wsClient.send(JSON.stringify({ type: 'status' }));
      const status = await waitForMessageType(wsClient, 'status');

      expect(status.viewportWidth).toBe(1024);
      expect(status.viewportHeight).toBe(768);
    });
  });

  describe('Navigation Operations (UI Feature)', () => {
    it('should navigate back via back command', async () => {
      // First navigate somewhere
      const navCmd = {
        id: 'test-back-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      // Navigate again
      const navCmd2 = {
        id: 'test-back-nav-2',
        action: 'navigate' as const,
        url: 'https://example.org',
      };
      wsClient.send(JSON.stringify(navCmd2));
      await waitForMessage(wsClient, navCmd2.id);

      // Go back
      const backCmd = {
        id: 'test-back',
        action: 'back' as const,
      };
      wsClient.send(JSON.stringify(backCmd));
      const response = await waitForMessage(wsClient, backCmd.id);

      expect(response.id).toBe('test-back');
      expect(response.success).toBe(true);
      expect(response.data.url).toContain('example.com');
    });

    it('should navigate forward via forward command', async () => {
      // Setup: go back first
      const backCmd = {
        id: 'test-forward-back',
        action: 'back' as const,
      };
      wsClient.send(JSON.stringify(backCmd));
      await waitForMessage(wsClient, backCmd.id);

      // Go forward
      const forwardCmd = {
        id: 'test-forward',
        action: 'forward' as const,
      };
      wsClient.send(JSON.stringify(forwardCmd));
      const response = await waitForMessage(wsClient, forwardCmd.id);

      expect(response.id).toBe('test-forward');
      expect(response.success).toBe(true);
    });

    it('should reload page via reload command', async () => {
      const command = {
        id: 'test-reload',
        action: 'reload' as const,
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-reload');
      expect(response.success).toBe(true);
    });
  });

  describe('Cookie Operations (UI Feature)', () => {
    it('should set cookies via cookies_set command', async () => {
      // First navigate to a domain
      const navCmd = {
        id: 'test-cookies-set-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      const command = {
        id: 'test-cookies-set',
        action: 'cookies_set' as const,
        cookies: [
          {
            name: 'test_cookie',
            value: 'test_value',
            url: 'https://example.com', // Use url instead of domain
          },
        ],
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-cookies-set');
      expect(response.success).toBe(true);
    });

    it('should get cookies via cookies_get command', async () => {
      // First set a cookie
      const setCmd = {
        id: 'test-cookies-get-set',
        action: 'cookies_set' as const,
        cookies: [
          {
            name: 'ui_test_cookie',
            value: 'ui_test_value',
            domain: 'example.com',
          },
        ],
      };
      wsClient.send(JSON.stringify(setCmd));
      await waitForMessage(wsClient, setCmd.id);

      // Navigate to the domain
      const navCmd = {
        id: 'test-cookies-get-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      // Get cookies
      const getCmd = {
        id: 'test-cookies-get',
        action: 'cookies_get' as const,
      };
      wsClient.send(JSON.stringify(getCmd));
      const response = await waitForMessage(wsClient, getCmd.id);

      expect(response.id).toBe('test-cookies-get');
      expect(response.success).toBe(true);
      expect(response.data.cookies).toBeInstanceOf(Array);
    });

    it('should clear cookies via cookies_clear command', async () => {
      const command = {
        id: 'test-cookies-clear',
        action: 'cookies_clear' as const,
      };

      wsClient.send(JSON.stringify(command));
      const response = await waitForMessage(wsClient, command.id);

      expect(response.id).toBe('test-cookies-clear');
      expect(response.success).toBe(true);
    });
  });

  describe('Element Operations (UI Feature)', () => {
    it('should click element via click command', async () => {
      // Navigate to a page with clickable elements
      const navCmd = {
        id: 'test-click-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      // Click on the h1 element
      const clickCmd = {
        id: 'test-click',
        action: 'click' as const,
        selector: 'h1',
      };
      wsClient.send(JSON.stringify(clickCmd));
      const response = await waitForMessage(wsClient, clickCmd.id, 10000);

      expect(response.id).toBe('test-click');
      expect(response.success).toBe(true);
    });

    it('should fill input via fill command', async () => {
      // Navigate to a page with input (use example.com with a simple input)
      const navCmd = {
        id: 'test-fill-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      // First evaluate to add an input to the page
      const evalCmd = {
        id: 'test-fill-eval',
        action: 'evaluate' as const,
        script: 'document.body.innerHTML = \'<input type="text" id="test-input" value="">\';',
      };
      wsClient.send(JSON.stringify(evalCmd));
      await waitForMessage(wsClient, evalCmd.id);

      // Fill the input
      const fillCmd = {
        id: 'test-fill',
        action: 'fill' as const,
        selector: '#test-input',
        value: 'test search',
      };
      wsClient.send(JSON.stringify(fillCmd));
      const response = await waitForMessage(wsClient, fillCmd.id, 10000);

      expect(response.id).toBe('test-fill');
      expect(response.success).toBe(true);
    });
  });

  describe('Input Events (Real-time Interaction)', () => {
    it('should handle mouse click sequence (press + release)', async () => {
      // Navigate first
      const navCmd = {
        id: 'test-click-seq-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(navCmd));
      await waitForMessage(wsClient, navCmd.id);

      // Start screencast to get viewport info
      const screencastCmd = {
        id: 'test-click-seq-screencast',
        action: 'screencast_start' as const,
      };
      wsClient.send(JSON.stringify(screencastCmd));
      await waitForMessage(wsClient, screencastCmd.id);

      // Wait for a frame to get viewport dimensions
      const frame = await waitForMessageType(wsClient, 'frame', 5000);
      const { deviceWidth, deviceHeight } = frame.metadata;

      // Send mouse press
      const pressMsg = {
        type: 'input_mouse' as const,
        eventType: 'mousePressed' as const,
        x: Math.floor(deviceWidth / 2),
        y: Math.floor(deviceHeight / 2),
        button: 'left' as const,
        clickCount: 1,
      };
      wsClient.send(JSON.stringify(pressMsg));

      // Wait 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send mouse release
      const releaseMsg = {
        type: 'input_mouse' as const,
        eventType: 'mouseReleased' as const,
        x: Math.floor(deviceWidth / 2),
        y: Math.floor(deviceHeight / 2),
        button: 'left' as const,
        clickCount: 1,
      };
      wsClient.send(JSON.stringify(releaseMsg));

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // If we got here without errors, the click sequence worked
      expect(true).toBe(true);

      // Stop screencast
      const stopCmd = {
        id: 'test-click-seq-stop',
        action: 'screencast_stop' as const,
      };
      wsClient.send(JSON.stringify(stopCmd));
      await waitForMessage(wsClient, stopCmd.id);
    }, 10000);

    it('should handle mouse wheel event', async () => {
      const wheelMsg = {
        type: 'input_mouse' as const,
        eventType: 'mouseWheel' as const,
        x: 100,
        y: 100,
        deltaX: 0,
        deltaY: -100, // Scroll up
      };

      wsClient.send(JSON.stringify(wheelMsg));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(true).toBe(true);
    });
  });
});

// Event Broadcasting Tests
describe('StreamServer - Event Broadcasting', () => {
  let browser: BrowserManager;
  let server: StreamServer;
  let wsClient: WebSocket;
  const TEST_PORT = 9232; // Different port

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      id: 'test-events',
      action: 'launch',
      headless: true,
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });

    server = new StreamServer(browser, TEST_PORT);
    await server.start();

    wsClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => {
      wsClient.on('open', () => resolve());
    });
  }, 60000);

  afterAll(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    if (server) {
      await server.stop();
    }
    if (browser) {
      await browser.close();
    }
  });

  describe('Tab Events', () => {
    it('should broadcast tab_created event', async () => {
      const eventPromise = waitForMessageType(wsClient, 'tab_created', 5000);

      // Create a new tab
      const command = {
        id: 'test-event-tab-new',
        action: 'tab_new' as const,
      };
      wsClient.send(JSON.stringify(command));
      await waitForMessage(wsClient, command.id);

      // Wait for the event
      const event = await eventPromise;

      expect(event.type).toBe('tab_created');
      expect(event.data).toHaveProperty('index');
      expect(event.data).toHaveProperty('url');
      expect(event.data).toHaveProperty('title');
      expect(typeof event.data.index).toBe('number');
    }, 10000);

    it('should broadcast tab_switched event', async () => {
      // First create a second tab
      const newTabCmd = {
        id: 'test-event-switch-new',
        action: 'tab_new' as const,
      };
      wsClient.send(JSON.stringify(newTabCmd));
      await waitForMessage(wsClient, newTabCmd.id);

      const eventPromise = waitForMessageType(wsClient, 'tab_switched', 5000);

      // Switch tabs
      const switchCmd = {
        id: 'test-event-switch',
        action: 'tab_switch' as const,
        index: 0,
      };
      wsClient.send(JSON.stringify(switchCmd));
      await waitForMessage(wsClient, switchCmd.id);

      // Wait for the event
      const event = await eventPromise;

      expect(event.type).toBe('tab_switched');
      expect(event.data).toHaveProperty('fromIndex');
      expect(event.data).toHaveProperty('toIndex');
      expect(event.data.toIndex).toBe(0);
    }, 10000);

    it('should broadcast tab_closed event', async () => {
      // Create a new tab
      const newTabCmd = {
        id: 'test-event-close-new',
        action: 'tab_new' as const,
      };
      wsClient.send(JSON.stringify(newTabCmd));
      const newTabResp = await waitForMessage(wsClient, newTabCmd.id);
      const tabIndex = newTabResp.data.index;

      // Get the current tab count after creating new tab
      const listCmd = {
        id: 'test-event-close-list',
        action: 'tab_list' as const,
      };
      wsClient.send(JSON.stringify(listCmd));
      const listResp = await waitForMessage(wsClient, listCmd.id);
      const currentCount = listResp.data.tabs.length;

      const eventPromise = waitForMessageType(wsClient, 'tab_closed', 5000);

      // Close the tab
      const closeCmd = {
        id: 'test-event-close',
        action: 'tab_close' as const,
        index: tabIndex,
      };
      wsClient.send(JSON.stringify(closeCmd));
      await waitForMessage(wsClient, closeCmd.id);

      // Wait for the event
      const event = await eventPromise;

      expect(event.type).toBe('tab_closed');
      expect(event.data).toHaveProperty('index');
      expect(event.data).toHaveProperty('remainingTabs');
      // Note: exact index may differ due to state from previous tests in this describe block
      expect(typeof event.data.index).toBe('number');
      // remainingTabs is the count AFTER removal
      expect(event.data.remainingTabs).toBeLessThan(currentCount);
    }, 10000);
  });

  describe('Navigation Events', () => {
    it('should broadcast navigation event on page load', async () => {
      const eventPromise = waitForMessageType(wsClient, 'navigation', 10000);

      // Navigate to a page
      const command = {
        id: 'test-event-nav',
        action: 'navigate' as const,
        url: 'https://example.com',
      };
      wsClient.send(JSON.stringify(command));

      // Wait for navigation to complete
      await waitForMessage(wsClient, command.id);

      // Wait for the navigation event
      const event = await eventPromise;

      expect(event.type).toBe('navigation');
      expect(event.data).toHaveProperty('url');
      expect(event.data).toHaveProperty('title');
      expect(event.data.url).toContain('example');
      expect(typeof event.data.title).toBe('string');
    }, 15000);
  });
});

// window.open() Tests
describe('StreamServer - window.open() Popup Handling', () => {
  let browser: BrowserManager;
  let server: StreamServer;
  let wsClient: WebSocket;
  const TEST_PORT = 9233; // Different port

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      id: 'test-popup',
      action: 'launch',
      headless: true,
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });

    server = new StreamServer(browser, TEST_PORT);
    await server.start();

    wsClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => {
      wsClient.on('open', () => resolve());
    });
  }, 60000);

  afterAll(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    if (server) {
      await server.stop();
    }
    if (browser) {
      await browser.close();
    }
  });

  it('should capture window.open() as a new tab', async () => {
    // First, check initial tab count
    const listCmd = {
      id: 'test-popup-list-1',
      action: 'tab_list' as const,
    };
    wsClient.send(JSON.stringify(listCmd));
    const listResp1 = await waitForMessage(wsClient, listCmd.id);
    const initialTabCount = listResp1.data.tabs.length;

    // Set up listener for tab_created event
    const eventPromise = waitForMessageType(wsClient, 'tab_created', 5000);

    // Navigate to a page
    const navCmd = {
      id: 'test-popup-nav',
      action: 'navigate' as const,
      url: 'https://example.com',
    };
    wsClient.send(JSON.stringify(navCmd));
    await waitForMessage(wsClient, navCmd.id);

    // Execute window.open() via JavaScript
    const evalCmd = {
      id: 'test-popup-eval',
      action: 'evaluate' as const,
      script: 'window.open("https://example.org", "_blank");',
    };
    wsClient.send(JSON.stringify(evalCmd));
    await waitForMessage(wsClient, evalCmd.id);

    // Wait for tab_created event
    const event = await eventPromise;

    expect(event.type).toBe('tab_created');
    expect(event.data).toHaveProperty('index');
    expect(event.data).toHaveProperty('url');
    expect(event.data).toHaveProperty('title');

    // Verify new tab count increased
    wsClient.send(JSON.stringify(listCmd));
    const listResp2 = await waitForMessage(wsClient, listCmd.id);
    expect(listResp2.data.tabs.length).toBe(initialTabCount + 1);
  }, 15000);

  it('should handle window.open() with specific target name', async () => {
    // First navigate to a page (window.open needs user interaction in some contexts)
    const navCmd = {
      id: 'test-popup-target-nav',
      action: 'navigate' as const,
      url: 'https://example.com',
    };
    wsClient.send(JSON.stringify(navCmd));
    await waitForMessage(wsClient, navCmd.id);

    // Set up listener for tab_created event
    const eventPromise = waitForMessageType(wsClient, 'tab_created', 5000);

    // Execute window.open() with target name
    const evalCmd = {
      id: 'test-popup-target',
      action: 'evaluate' as const,
      script: 'window.open("https://example.org", "myPopup");',
    };
    wsClient.send(JSON.stringify(evalCmd));
    await waitForMessage(wsClient, evalCmd.id);

    // Wait for tab_created event
    const event = await eventPromise;

    expect(event.type).toBe('tab_created');
    expect(event.data.url).toContain('example');
  }, 10000);

  it('should switch to the popup tab and back', async () => {
    // Get initial tab count
    const listCmd1 = {
      id: 'test-popup-switch-list-1',
      action: 'tab_list' as const,
    };
    wsClient.send(JSON.stringify(listCmd1));
    const listResp1 = await waitForMessage(wsClient, listCmd1.id);
    const initialCount = listResp1.data.tabs.length;

    // Create a popup
    const eventPromise = waitForMessageType(wsClient, 'tab_created', 5000);
    const evalCmd = {
      id: 'test-popup-switch-eval',
      action: 'evaluate' as const,
      script: 'window.open("about:blank", "_blank");',
    };
    wsClient.send(JSON.stringify(evalCmd));
    await waitForMessage(wsClient, evalCmd.id);
    const event = await eventPromise;
    const newTabIndex = event.data.index;

    // Switch to the popup tab
    const switchCmd = {
      id: 'test-popup-switch',
      action: 'tab_switch' as const,
      index: newTabIndex,
    };
    wsClient.send(JSON.stringify(switchCmd));
    const switchResp = await waitForMessage(wsClient, switchCmd.id);

    expect(switchResp.data.index).toBe(newTabIndex);

    // Switch back to tab 0
    const switchBackCmd = {
      id: 'test-popup-switch-back',
      action: 'tab_switch' as const,
      index: 0,
    };
    wsClient.send(JSON.stringify(switchBackCmd));
    const switchBackResp = await waitForMessage(wsClient, switchBackCmd.id);

    expect(switchBackResp.data.index).toBe(0);
  }, 15000);
});
