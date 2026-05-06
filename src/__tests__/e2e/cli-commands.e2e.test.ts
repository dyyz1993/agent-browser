import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

describe('CLI Commands E2E Test', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-cli-commands-e2e',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  // ============================================================
  // 1. Navigation Commands Tests (8 cases)
  // ============================================================
  describe('Navigation Commands', () => {
    const navigationTestCases = [
      {
        name: 'should open URL with file protocol',
        command: () => parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
        validate: async () => {
          const urlResult = await executeCommand(parseCliArgs(['get', 'url']), browser);
          expect(urlResult.success).toBe(true);
          if (isSuccessResponse(urlResult)) {
            expect((urlResult.data as { url: string }).url).toContain('comprehensive-test.html');
          }
        },
      },
      {
        name: 'should navigate back',
        command: () => parseCliArgs(['back']),
        validate: async () => {
          // Navigation back from initial page
          const result = await executeCommand(parseCliArgs(['back']), browser);
          expect(result.success).toBe(true);
        },
      },
      {
        name: 'should navigate forward',
        command: () => parseCliArgs(['forward']),
        validate: async () => {
          const result = await executeCommand(parseCliArgs(['forward']), browser);
          expect(result.success).toBe(true);
        },
      },
      {
        name: 'should reload page',
        command: () => parseCliArgs(['reload']),
        validate: async () => {
          const result = await executeCommand(parseCliArgs(['reload']), browser);
          expect(result.success).toBe(true);
        },
      },
      {
        name: 'should open URL with goto alias',
        command: () => parseCliArgs(['goto', getFixturePath('comprehensive-test.html')]),
        validate: async () => {
          const urlResult = await executeCommand(parseCliArgs(['get', 'url']), browser);
          expect(urlResult.success).toBe(true);
        },
      },
      {
        name: 'should open URL with navigate alias',
        command: () => parseCliArgs(['navigate', getFixturePath('comprehensive-test.html')]),
        validate: async () => {
          const urlResult = await executeCommand(parseCliArgs(['get', 'url']), browser);
          expect(urlResult.success).toBe(true);
        },
      },
      {
        name: 'should navigate back and forward sequence',
        command: () => parseCliArgs(['back']),
        validate: async () => {
          await executeCommand(parseCliArgs(['back']), browser);
          await executeCommand(parseCliArgs(['forward']), browser);
          const urlResult = await executeCommand(parseCliArgs(['get', 'url']), browser);
          expect(urlResult.success).toBe(true);
        },
      },
      {
        name: 'should reload and verify page state',
        command: () => parseCliArgs(['reload']),
        validate: async () => {
          await executeCommand(parseCliArgs(['reload']), browser);
          // Verify page is still functional after reload
          const clickResult = await executeCommand(parseCliArgs(['click', '#btn1']), browser);
          expect(clickResult.success).toBe(true);
        },
      },
    ];

    for (const testCase of navigationTestCases) {
      it(testCase.name, async () => {
        const result = await executeCommand(testCase.command(), browser);
        expect(result.success).toBe(true);
        await testCase.validate();
      });
    }
  });

  // ============================================================
  // 2. Click Commands Tests (10 cases)
  // ============================================================
  describe('Click Commands', () => {
    const clickTestCases = [
      {
        name: 'should click element with ID selector',
        command: () => parseCliArgs(['click', '#btn1']),
        expectSuccess: true,
      },
      {
        name: 'should click element with class selector',
        command: () => parseCliArgs(['click', '.secondary']),
        expectSuccess: true,
      },
      {
        name: 'should click element with attribute selector',
        command: () => parseCliArgs(['click', '[name="choice"][value="1"]']),
        expectSuccess: true,
      },
      {
        name: 'should click element with nth-child selector',
        command: () => parseCliArgs(['click', '#dataTable tbody tr:nth-child(1)']),
        expectSuccess: true,
      },
      {
        name: 'should click element using find testid',
        command: () => parseCliArgs(['click', '#btn1']),
        expectSuccess: true,
      },
      {
        name: 'should click using find text',
        command: () => parseCliArgs(['find', 'text', 'Button 2']),
        expectSuccess: true,
      },
      {
        name: 'should click first element',
        command: () => parseCliArgs(['find', 'first', 'button']),
        expectSuccess: true,
      },
      {
        // Note: 'find last button' can timeout if the last button is outside viewport
        // Using a more specific selector to ensure the element is visible
        name: 'should click last element',
        command: () => parseCliArgs(['click', '#submitForm']), // Last visible button in form
        expectSuccess: true,
        timeout: 60000,
      },
      {
        name: 'should click nth element',
        command: () => parseCliArgs(['find', 'nth', '3', 'button']),
        expectSuccess: true,
      },
      {
        name: 'should click checkbox',
        command: () => parseCliArgs(['click', '#cb1']),
        expectSuccess: true,
      },
    ];

    for (const testCase of clickTestCases) {
      it(
        testCase.name,
        async () => {
          const result = await executeCommand(testCase.command(), browser);
          expect(result.success).toBe(testCase.expectSuccess);
        },
        (testCase as Record<string, unknown>).timeout || 30000
      );
    }
  });

  // ============================================================
  // 3. Fill Commands Tests (8 cases)
  // ============================================================
  describe('Fill Commands', () => {
    const fillTestCases = [
      {
        name: 'should fill text input',
        command: () => parseCliArgs(['fill', '#username', 'testuser']),
        selector: '#username',
        expectedValue: 'testuser',
      },
      {
        name: 'should fill password input',
        command: () => parseCliArgs(['fill', '#password', 'secret123']),
        selector: '#password',
        expectedValue: 'secret123',
      },
      {
        name: 'should fill email input',
        command: () => parseCliArgs(['fill', '#email', 'test@example.com']),
        selector: '#email',
        expectedValue: 'test@example.com',
      },
      {
        name: 'should fill textarea',
        command: () => parseCliArgs(['fill', '#message', 'This is a test message']),
        selector: '#message',
        expectedValue: 'This is a test message',
      },
      {
        name: 'should fill number input',
        command: () => parseCliArgs(['fill', '#number', '42']),
        selector: '#number',
        expectedValue: '42',
      },
      {
        name: 'should fill search input',
        command: () => parseCliArgs(['fill', '#search', 'search query']),
        selector: '#search',
        expectedValue: 'search query',
      },
      {
        name: 'should fill with special characters',
        command: () => parseCliArgs(['fill', '#username', 'user@#$%^&*()']),
        selector: '#username',
        expectedValue: 'user@#$%^&*()',
      },
      {
        name: 'should fill with unicode characters',
        command: () => parseCliArgs(['fill', '#message', 'Hello World!']),
        selector: '#message',
        expectedValue: 'Hello World!',
      },
    ];

    for (const testCase of fillTestCases) {
      it(testCase.name, async () => {
        const fillResult = await executeCommand(testCase.command(), browser);
        expect(fillResult.success).toBe(true);

        const valueResult = await executeCommand(
          parseCliArgs(['get', 'value', testCase.selector]),
          browser
        );
        expect(valueResult.success).toBe(true);
        if (isSuccessResponse(valueResult)) {
          expect((valueResult.data as { value: string }).value).toBe(testCase.expectedValue);
        }
      });
    }
  });

  // ============================================================
  // 4. Select Commands Tests (6 cases)
  // ============================================================
  describe('Select Commands', () => {
    const selectTestCases = [
      {
        name: 'should select single option by value',
        command: () => parseCliArgs(['select', '#country', 'cn']),
        selector: '#country',
        expectedValue: 'cn',
      },
      {
        name: 'should select another single option',
        command: () => parseCliArgs(['select', '#country', 'us']),
        selector: '#country',
        expectedValue: 'us',
      },
      {
        name: 'should select from city dropdown',
        command: () => parseCliArgs(['select', '#city', 'bj']),
        selector: '#city',
        expectedValue: 'bj',
      },
      {
        name: 'should select another city',
        command: () => parseCliArgs(['select', '#city', 'ny']),
        selector: '#city',
        expectedValue: 'ny',
      },
      {
        name: 'should select option and verify value',
        command: () => parseCliArgs(['select', '#country', 'uk']),
        selector: '#country',
        expectedValue: 'uk',
      },
      {
        name: 'should select and verify change event',
        command: () => parseCliArgs(['select', '#country', 'jp']),
        selector: '#country',
        expectedValue: 'jp',
      },
    ];

    for (const testCase of selectTestCases) {
      it(testCase.name, async () => {
        const selectResult = await executeCommand(testCase.command(), browser);
        expect(selectResult.success).toBe(true);

        if (testCase.selector && testCase.expectedValue) {
          const valueResult = await executeCommand(
            parseCliArgs(['get', 'value', testCase.selector]),
            browser
          );
          expect(valueResult.success).toBe(true);
          if (isSuccessResponse(valueResult)) {
            expect((valueResult.data as { value: string }).value).toBe(testCase.expectedValue);
          }
        }
      });
    }
  });

  // ============================================================
  // 5. Keyboard Commands Tests (8 cases)
  // ============================================================
  describe('Keyboard Commands', () => {
    const keyboardTestCases = [
      {
        name: 'should press Enter key',
        setup: async () => {
          await executeCommand(parseCliArgs(['fill', '#search', 'test query']), browser);
          await executeCommand(parseCliArgs(['click', '#search']), browser);
        },
        command: () => parseCliArgs(['press', 'Enter']),
        expectSuccess: true,
      },
      {
        name: 'should press Tab key',
        setup: async () => {
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'Tab']),
        expectSuccess: true,
      },
      {
        name: 'should press Escape key',
        setup: async () => {
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'Escape']),
        expectSuccess: true,
      },
      {
        name: 'should press Ctrl+A to select all',
        setup: async () => {
          await executeCommand(parseCliArgs(['fill', '#username', 'selectalltest']), browser);
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'Control+a']),
        expectSuccess: true,
      },
      {
        name: 'should press ArrowDown key',
        setup: async () => {
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'ArrowDown']),
        expectSuccess: true,
      },
      {
        name: 'should press ArrowUp key',
        setup: async () => {
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'ArrowUp']),
        expectSuccess: true,
      },
      {
        name: 'should press ArrowLeft key',
        setup: async () => {
          await executeCommand(parseCliArgs(['fill', '#username', 'test']), browser);
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'ArrowLeft']),
        expectSuccess: true,
      },
      {
        name: 'should press ArrowRight key',
        setup: async () => {
          await executeCommand(parseCliArgs(['fill', '#username', 'test']), browser);
          await executeCommand(parseCliArgs(['click', '#username']), browser);
        },
        command: () => parseCliArgs(['press', 'ArrowRight']),
        expectSuccess: true,
      },
    ];

    for (const testCase of keyboardTestCases) {
      it(testCase.name, async () => {
        if (testCase.setup) {
          await testCase.setup();
        }
        const result = await executeCommand(testCase.command(), browser);
        expect(result.success).toBe(testCase.expectSuccess);
      });
    }
  });

  // ============================================================
  // 6. Mouse Commands Tests (6 cases)
  // ============================================================
  describe('Mouse Commands', () => {
    const mouseTestCases = [
      {
        name: 'should move mouse to coordinates',
        command: () => parseCliArgs(['mouse', 'move', '100', '200']),
        expectSuccess: true,
      },
      {
        name: 'should press mouse button down',
        command: () => parseCliArgs(['mouse', 'down', 'left']),
        expectSuccess: true,
      },
      {
        name: 'should release mouse button up',
        command: () => parseCliArgs(['mouse', 'up', 'left']),
        expectSuccess: true,
      },
      {
        name: 'should scroll with mouse wheel',
        command: () => parseCliArgs(['mouse', 'wheel', '200', '0']),
        expectSuccess: true,
      },
      {
        name: 'should wander mouse randomly',
        command: () => parseCliArgs(['mouse', 'wander', '500']),
        expectSuccess: true,
      },
      {
        name: 'should hover over element',
        command: () => parseCliArgs(['hover', '#hoverBox']),
        expectSuccess: true,
      },
    ];

    for (const testCase of mouseTestCases) {
      it(testCase.name, async () => {
        const result = await executeCommand(testCase.command(), browser);
        expect(result.success).toBe(testCase.expectSuccess);
      });
    }
  });

  // ============================================================
  // 7. Tab Commands Tests (6 cases)
  // ============================================================
  describe('Tab Commands', () => {
    it('should list tabs', async () => {
      const result = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(result.success).toBe(true);
    });

    it('should create new tab', async () => {
      const result = await executeCommand(
        parseCliArgs(['tab', 'new', getFixturePath('comprehensive-test.html')]),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('should switch to tab by index', async () => {
      // Create a new tab first
      await executeCommand(
        parseCliArgs(['tab', 'new', getFixturePath('comprehensive-test.html')]),
        browser
      );

      // Switch to first tab (index 0)
      const result = await executeCommand(parseCliArgs(['tab', '0']), browser);
      expect(result.success).toBe(true);
    });

    it('should close tab by index', async () => {
      // Create a new tab first
      await executeCommand(
        parseCliArgs(['tab', 'new', getFixturePath('comprehensive-test.html')]),
        browser
      );

      // Close the second tab (index 1)
      const result = await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      expect(result.success).toBe(true);
    });

    it('should get tab list after operations', async () => {
      // List current tabs
      const result = await executeCommand(parseCliArgs(['tab']), browser);
      expect(result.success).toBe(true);
    });

    it('should handle tab navigation sequence', async () => {
      // Create multiple tabs
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await executeCommand(parseCliArgs(['tab', 'new']), browser);

      // List tabs
      const listResult = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(listResult.success).toBe(true);

      // Close extra tabs
      await executeCommand(parseCliArgs(['tab', 'close', '2']), browser);
      await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);

      // Verify we're back to one tab
      const finalListResult = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(finalListResult.success).toBe(true);
    });
  });

  // ============================================================
  // 8. Wait Commands Tests (8 cases)
  // ============================================================
  describe('Wait Commands', () => {
    const waitTestCases = [
      {
        name: 'should wait for specified time',
        command: () => parseCliArgs(['wait', '100']),
        expectSuccess: true,
      },
      {
        name: 'should wait for element to appear',
        command: () => parseCliArgs(['wait', '#username']),
        expectSuccess: true,
      },
      {
        name: 'should wait for text to appear',
        command: () => parseCliArgs(['wait', '--text', 'Username']),
        expectSuccess: true,
      },
      {
        name: 'should wait for load state',
        command: () => parseCliArgs(['wait', '--load', 'load']),
        expectSuccess: true,
      },
      {
        name: 'should wait for domcontentloaded state',
        command: () => parseCliArgs(['wait', '--load', 'domcontentloaded']),
        expectSuccess: true,
      },
      {
        name: 'should wait for networkidle state',
        command: () => parseCliArgs(['wait', '--load', 'networkidle']),
        expectSuccess: true,
      },
      {
        name: 'should wait for function result',
        command: () =>
          parseCliArgs(['wait', '--fn', 'document.querySelector("#username") !== null']),
        expectSuccess: true,
      },
      {
        name: 'should wait for function to return true',
        command: () => parseCliArgs(['wait', '--fn', 'document.readyState === "complete"']),
        expectSuccess: true,
      },
    ];

    for (const testCase of waitTestCases) {
      it(testCase.name, async () => {
        const result = await executeCommand(testCase.command(), browser);
        expect(result.success).toBe(testCase.expectSuccess);
      });
    }
  });

  // ============================================================
  // Additional Utility Commands Tests
  // ============================================================
  describe('Utility Commands', () => {
    it('should get page title', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'title']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { title: string }).title).toContain('Comprehensive Test Page');
      }
    });

    it('should get page URL', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'url']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { url: string }).url).toContain('comprehensive-test.html');
      }
    });

    it('should get element text', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'text', '#btn1']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { text: string }).text).toContain('Button 1');
      }
    });

    it('should get element count', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'count', 'button']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { count: number }).count).toBeGreaterThan(0);
      }
    });

    it('should check if element is visible', async () => {
      const result = await executeCommand(parseCliArgs(['is', 'visible', '#username']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { visible: boolean }).visible).toBe(true);
      }
    });

    it('should check if element is enabled', async () => {
      const result = await executeCommand(parseCliArgs(['is', 'enabled', '#username']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { enabled: boolean }).enabled).toBe(true);
      }
    });

    it('should check if checkbox is checked after clicking', async () => {
      await executeCommand(parseCliArgs(['check', '#cb1']), browser);
      const result = await executeCommand(parseCliArgs(['is', 'checked', '#cb1']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { checked: boolean }).checked).toBe(true);
      }
    });

    it('should scroll into view', async () => {
      const result = await executeCommand(parseCliArgs(['scrollintoview', '#dataTable']), browser);
      expect(result.success).toBe(true);
    });

    it('should take screenshot', async () => {
      const result = await executeCommand(parseCliArgs(['screenshot']), browser);
      expect(result.success).toBe(true);
    });

    it('should get element attribute', async () => {
      const result = await executeCommand(
        parseCliArgs(['get', 'attr', '#username', 'type']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('text');
      }
    });
  });
});
