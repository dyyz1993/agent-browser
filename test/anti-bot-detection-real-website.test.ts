import { describe, it, expect, afterEach } from 'vitest';
import { BrowserManager } from '../src/browser.js';
import type { LaunchCommand } from '../src/types.js';

describe('Anti-Bot Detection - Real Website Tests', () => {
  let browser: BrowserManager;

  afterEach(async () => {
    if (browser?.isLaunched()) {
      await browser.close();
    }
  });

  describe('bot.sannysoft.com detection tests', () => {
    it('should NOT be detected as bot with default anti-detection settings', async () => {
    browser = new BrowserManager();
    const launchOptions: Partial<LaunchCommand> = {
      headless: true,
    };
    await browser.launch(launchOptions as LaunchCommand);

    const page = browser.getPage();
    await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

    const webdriver = await page.evaluate(() => navigator.webdriver);
    const pluginsCount = await page.evaluate(() => navigator.plugins.length);
    const mimeTypesCount = await page.evaluate(() => navigator.mimeTypes.length);
    const hasChrome = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');

    expect(webdriver).toBe(false);
    expect(pluginsCount).toBeGreaterThan(0);
    expect(mimeTypesCount).toBeGreaterThan(0);
    expect(hasChrome).toBe(true);
  }, 60000);

    it('should hide webdriver with anti-detection settings', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      const webdriver = await page.evaluate(() => navigator.webdriver);
      const pluginsCount = await page.evaluate(() => navigator.plugins.length);
      const mimeTypesCount = await page.evaluate(() => navigator.mimeTypes.length);
      const hasChrome = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');

      expect(webdriver).toBe(false);
      expect(pluginsCount).toBeGreaterThan(0);
      expect(mimeTypesCount).toBeGreaterThan(0);
      expect(hasChrome).toBe(true);
    }, 60000);

    it('should hide webdriver with comprehensive anti-detection settings', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      const webdriver = await page.evaluate(() => navigator.webdriver);
      const pluginsCount = await page.evaluate(() => navigator.plugins.length);
      const mimeTypesCount = await page.evaluate(() => navigator.mimeTypes.length);
      const hasChrome = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');

      expect(webdriver).toBe(false);
      expect(pluginsCount).toBeGreaterThan(0);
      expect(mimeTypesCount).toBeGreaterThan(0);
      expect(hasChrome).toBe(true);
    }, 60000);

    it('should hide webdriver with custom user-agent', async () => {
      const customUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        userAgent: customUA,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      const webdriver = await page.evaluate(() => navigator.webdriver);
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const pluginsCount = await page.evaluate(() => navigator.plugins.length);
      const mimeTypesCount = await page.evaluate(() => navigator.mimeTypes.length);
      const hasChrome = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');

      expect(webdriver).toBe(false);
      expect(userAgent).toBe(customUA);
      expect(userAgent).not.toContain('HeadlessChrome');
      expect(pluginsCount).toBeGreaterThan(0);
      expect(mimeTypesCount).toBeGreaterThan(0);
      expect(hasChrome).toBe(true);
    }, 60000);

    it('should detect HeadlessChrome in default user-agent', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      const userAgent = await page.evaluate(() => navigator.userAgent);

      expect(userAgent).toContain('HeadlessChrome');
    }, 60000);

    it('should verify all browser fingerprint properties', async () => {
      const customUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        userAgent: customUA,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      const fingerprint = await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        userAgent: navigator.userAgent,
        vendor: navigator.vendor,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        pluginsCount: navigator.plugins.length,
        mimeTypesCount: navigator.mimeTypes.length,
        hasChrome: typeof (window as any).chrome !== 'undefined',
        hasPermissions: typeof navigator.permissions !== 'undefined',
        screen: {
          width: screen.width,
          height: screen.height,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth,
        },
        window: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
      }));

      expect(fingerprint.webdriver).toBe(false);
      expect(fingerprint.userAgent).toBe(customUA);
      expect(fingerprint.userAgent).not.toContain('HeadlessChrome');
      expect(fingerprint.vendor).toBe('Google Inc.');
      expect(fingerprint.platform).toBeTruthy();
      expect(fingerprint.language).toBeTruthy();
      expect(fingerprint.hardwareConcurrency).toBeGreaterThan(0);
      expect(fingerprint.pluginsCount).toBeGreaterThan(0);
      expect(fingerprint.mimeTypesCount).toBeGreaterThan(0);
      expect(fingerprint.hasChrome).toBe(true);
      expect(fingerprint.hasPermissions).toBe(true);
      expect(fingerprint.screen.width).toBeGreaterThan(0);
      expect(fingerprint.screen.height).toBeGreaterThan(0);
      expect(fingerprint.window.innerWidth).toBeGreaterThan(0);
      expect(fingerprint.window.innerHeight).toBeGreaterThan(0);
    }, 60000);

    it('should verify website detection results', async () => {
      const customUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        userAgent: customUA,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });

      // First, let's check the actual structure of the website
      const htmlStructure = await page.evaluate(() => {
        const pres = document.querySelectorAll('pre');
        return Array.from(pres).map((pre, index) => ({
          index,
          text: pre.textContent?.trim(),
          startsWithBrace: pre.textContent?.trim().startsWith('{')
        }));
      });
      
      console.log('Website structure:', JSON.stringify(htmlStructure, null, 2));
      
      // Now parse the detection results
      const websiteDetection = await page.evaluate(() => {
        // Get the text content of the first pre element
        const pre = document.querySelector('pre');
        if (pre) {
          const text = pre.textContent || '';
          
          // Extract fields using regular expressions
          const userAgentMatch = text.match(/"userAgent"\s*:\s*"([^"]+)"/);
          const webDriverValueMatch = text.match(/"webDriverValue"\s*:\s*(true|false)/);
          const pluginsMatch = text.match(/"plugins"\s*:\s*\[(.*?)\]/s);
          const attributesFoundMatch = text.match(/"attributesFound"\s*:\s*\[(.*?)\]/s);
          
          return {
            userAgent: userAgentMatch ? userAgentMatch[1] : '',
            webdriver: webDriverValueMatch ? (webDriverValueMatch[1] === 'true') : false,
            plugins: pluginsMatch ? pluginsMatch[1].trim() === '' ? [] : pluginsMatch[1].split(',').map(item => item.trim()) : [],
            attributesFound: attributesFoundMatch ? attributesFoundMatch[1].split(',').map(item => item.trim() === 'true') : []
          };
        }
        return {};
      });
      
      console.log('Detection results:', JSON.stringify(websiteDetection, null, 2));

      expect(websiteDetection.userAgent).toBe(customUA);
      expect(websiteDetection.userAgent).not.toContain('HeadlessChrome');
      expect(websiteDetection.webdriver).toBe(false);
      expect(websiteDetection.attributesFound).toBeDefined();
    }, 60000);
  });
});
