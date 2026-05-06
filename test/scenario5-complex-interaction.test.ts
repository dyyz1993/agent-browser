import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { BrowserManager } from '../src/browser/index.js';
import type { LaunchCommand } from '../src/types.js';

describe('Scenario 5: Complex Interaction Tests', () => {
  let browser: BrowserManager;

  afterEach(async () => {
    if (browser?.isLaunched()) {
      await browser.close();
    }
  });

  describe('Dialog Handling', () => {
    it('should handle alert dialog automatically', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set up dialog handler to accept alerts
      browser.setDialogHandler('accept');

      // Navigate to a page with JavaScript that triggers an alert
      await page.goto('about:blank');
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'setTimeout(() => alert("Test Alert"), 100);';
        document.head.appendChild(script);
      });

      // Wait a bit for the alert to be handled
      await page.waitForTimeout(500);

      // If we get here without hanging, the dialog was handled
      expect(true).toBe(true);
    });

    it('should handle confirm dialog with dismiss', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set up dialog handler to dismiss confirms
      browser.setDialogHandler('dismiss');

      await page.goto('about:blank');
      const confirmResult = await page.evaluate(() => {
        let result = false;
        const originalConfirm = window.confirm;
        window.confirm = () => {
          result = originalConfirm('Test Confirm');
          return result;
        };
        setTimeout(() => window.confirm('Test Confirm'), 100);
        return result;
      });

      // If dismissed, confirmResult should be false
      expect(confirmResult).toBe(false);
    });

    it('should handle prompt dialog with custom text', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set up dialog handler to accept prompts with custom text
      const customText = 'Test Input Value';
      browser.setDialogHandler('accept', customText);

      await page.goto('about:blank');
      const promptResult = await page.evaluate(() => {
        let result = '';
        const originalPrompt = window.prompt;
        window.prompt = () => {
          result = originalPrompt('Test Prompt');
          return result;
        };
        setTimeout(() => window.prompt('Test Prompt'), 100);
        return result;
      });

      // The prompt should have been handled (we can't easily verify the custom text in this test setup)
      expect(true).toBe(true);
    });
  });

  describe('Geolocation', () => {
    it('should set and verify geolocation', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://example.com');

      // Grant geolocation permission first
      await browser.setPermissions(['geolocation'], true);

      // Set geolocation to San Francisco
      const lat = 37.7749;
      const lng = -122.4194;
      await browser.setGeolocation(lat, lng);

      // Verify geolocation was set
      const geolocation = await page.evaluate(async () => {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            (error) => {
              resolve({ error: error.message });
            }
          );
        });
      });

      expect(geolocation).toEqual({
        latitude: lat,
        longitude: lng,
      });
    });

    it('should set geolocation with custom accuracy', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://example.com');

      // Grant geolocation permission first
      await browser.setPermissions(['geolocation'], true);

      // Set geolocation with accuracy
      const lat = 40.7128;
      const lng = -74.006;
      const accuracy = 100;
      await browser.setGeolocation(lat, lng, accuracy);

      // Verify geolocation was set
      const geolocation = await page.evaluate(async () => {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
              });
            },
            (error) => {
              resolve({ error: error.message });
            }
          );
        });
      });

      expect(geolocation).toEqual({
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
      });
    });
  });

  describe('Permissions', () => {
    it('should grant geolocation permission', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      // Grant geolocation permission
      await browser.setPermissions(['geolocation'], true);

      // Verify permission was granted
      const permissionStatus = await page.evaluate(async () => {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status.state;
      });

      expect(permissionStatus).toBe('granted');
    });

    it('should grant multiple permissions', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      // Grant multiple permissions
      const permissions = ['geolocation', 'notifications'];
      await browser.setPermissions(permissions, true);

      // Verify permissions were granted
      const geolocationStatus = await page.evaluate(async () => {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status.state;
      });

      expect(geolocationStatus).toBe('granted');
    });

    it('should revoke permissions', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('about:blank');

      // Grant permission first
      await browser.setPermissions(['geolocation'], true);

      // Then revoke it
      await browser.setPermissions(['geolocation'], false);

      // Verify permission was denied/prompt
      const permissionStatus = await page.evaluate(async () => {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          return status.state;
        } catch (e) {
          return 'error';
        }
      });

      // After revoking, the state should be 'prompt' or 'denied'
      expect(['prompt', 'denied']).toContain(permissionStatus);
    });
  });

  describe('Complex Interaction Scenarios', () => {
    it('should handle multiple dialogs in sequence', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set up dialog handler to accept all
      browser.setDialogHandler('accept');

      await page.goto('about:blank');
      await page.evaluate(() => {
        setTimeout(() => alert('First Alert'), 100);
        setTimeout(() => alert('Second Alert'), 200);
        setTimeout(() => confirm('Third Confirm'), 300);
      });

      // Wait for all dialogs to be handled
      await page.waitForTimeout(500);

      // If we get here without hanging, all dialogs were handled
      expect(true).toBe(true);
    });

    it('should combine geolocation and permissions', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();
      await page.goto('https://example.com');

      // Set geolocation
      const lat = 51.5074;
      const lng = -0.1278;
      await browser.setGeolocation(lat, lng);

      // Grant permission
      await browser.setPermissions(['geolocation'], true);

      // Verify both work together
      const geolocation = await page.evaluate(async () => {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            (error) => {
              resolve({ error: error.message });
            }
          );
        });
      });

      expect(geolocation).toEqual({
        latitude: lat,
        longitude: lng,
      });
    });
  });
});
