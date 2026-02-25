import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { getFixturePath } from './utils/test-helpers.js';

describe('keyboard input via Playwright API (E2E)', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ 
      action: 'launch', 
      id: 'test-launch', 
      headless: true 
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));
  });

  describe('basic keyboard input', () => {
    it('should type letters into input field', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.down('h');
      await page.keyboard.up('h');
      await page.keyboard.down('i');
      await page.keyboard.up('i');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('hi');
    });

    it('should type multiple letters', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      const text = 'hello';
      for (const char of text) {
        await page.keyboard.down(char);
        await page.keyboard.up(char);
      }
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe(text);
    });

    it('should type numbers', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.down('1');
      await page.keyboard.up('1');
      await page.keyboard.down('2');
      await page.keyboard.up('2');
      await page.keyboard.down('3');
      await page.keyboard.up('3');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('123');
    });

    it('should type special characters', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.down('Shift');
      await page.keyboard.down('@');
      await page.keyboard.up('@');
      await page.keyboard.up('Shift');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('@');
    });
  });

  describe('special keys', () => {
    it('should handle Backspace', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.down('a');
      await page.keyboard.up('a');
      await page.keyboard.down('b');
      await page.keyboard.up('b');
      
      let value = await page.locator('#text-input').inputValue();
      expect(value).toBe('ab');
      
      await page.keyboard.press('Backspace');
      
      value = await page.locator('#text-input').inputValue();
      expect(value).toBe('a');
    });

    it('should handle Enter in textarea', async () => {
      const page = browser.getPage();
      
      await page.click('#textarea');
      
      await page.keyboard.down('a');
      await page.keyboard.up('a');
      await page.keyboard.press('Enter');
      await page.keyboard.down('b');
      await page.keyboard.up('b');
      
      const value = await page.locator('#textarea').inputValue();
      expect(value).toBe('a\nb');
    });

    it('should handle Tab key', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.press('Tab');
      
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('password-input');
    });
  });

  describe('modifier keys', () => {
    it('should handle Ctrl+A select all', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.type('test');
      
      let value = await page.locator('#text-input').inputValue();
      expect(value).toBe('test');
      
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Backspace');
      
      value = await page.locator('#text-input').inputValue();
      expect(value).toBe('');
    });
  });

  describe('insertText for IME/paste', () => {
    it('should insert text via insertText', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.insertText('你好世界');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('你好世界');
    });

    it('should insert text at cursor position', async () => {
      const page = browser.getPage();
      
      await page.click('#text-input');
      
      await page.keyboard.type('ab');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.insertText('X');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('aXb');
    });
  });

  describe('mouse and keyboard combination', () => {
    it('should click and type', async () => {
      const page = browser.getPage();
      
      const inputBox = await page.locator('#text-input').boundingBox();
      if (!inputBox) throw new Error('Input not found');
      
      const x = inputBox.x + inputBox.width / 2;
      const y = inputBox.y + inputBox.height / 2;
      
      await page.mouse.click(x, y);
      
      await page.keyboard.type('x');
      
      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('x');
    });
  });
});
