import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { BrowserManager } from '../src/browser.js';
import type { LaunchCommand } from '../src/types.js';

describe('Anti-Bot Detection Tests', () => {
  let browser: BrowserManager;

  afterEach(async () => {
    if (browser?.isLaunched()) {
      await browser.close();
    }
  });

  describe('webdriver property detection', () => {
    it('should detect webdriver=false with default anti-detection settings', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const webdriver = await page.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
    });
  });

  describe('plugins and mimeTypes detection', () => {
    it('should have plugins with default anti-detection settings', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const pluginsCount = await page.evaluate(() => navigator.plugins.length);
      const mimeTypesCount = await page.evaluate(() => navigator.mimeTypes.length);

      expect(pluginsCount).toBeGreaterThan(0);
      expect(mimeTypesCount).toBeGreaterThan(0);
    });
  });

  describe('chrome object detection', () => {
    it('should have chrome object with default anti-detection settings', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const hasChrome = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');
      expect(hasChrome).toBe(true);
    });
  });

  describe('permissions detection', () => {
    it('should have permissions API available', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const hasPermissions = await page.evaluate(
        () => typeof navigator.permissions !== 'undefined'
      );
      expect(hasPermissions).toBe(true);
    });
  });

  describe('navigator properties', () => {
    it('should have standard navigator properties', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const navigatorProps = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        vendor: navigator.vendor,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
      }));

      expect(navigatorProps.userAgent).toContain('Chrome');
      expect(navigatorProps.vendor).toBe('Google Inc.');
      expect(navigatorProps.platform).toBeTruthy();
      expect(navigatorProps.language).toBeTruthy();
      expect(navigatorProps.hardwareConcurrency).toBeGreaterThan(0);
      if (navigatorProps.deviceMemory !== undefined) {
        expect(navigatorProps.deviceMemory).toBeGreaterThan(0);
      }
    });
  });

  describe('combined anti-detection configuration', () => {
    it('should hide webdriver and set custom user-agent together', async () => {
      const customUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        userAgent: customUA,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      const webdriver = await page.evaluate(() => navigator.webdriver);
      const userAgent = await page.evaluate(() => navigator.userAgent);

      expect(webdriver).toBe(false);
      expect(userAgent).toBe(customUA);
    });
  });
});
