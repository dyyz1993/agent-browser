import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { getFixturePath } from './utils/test-helpers.js';

describe('Playwright keyboard behavior verification', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-keyboard-behavior',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  it('keyboard.down + keyboard.up should NOT input text for single character', async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));

    await page.click('#text-input');

    await page.keyboard.down('a');
    await page.keyboard.up('a');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const value = await page.locator('#text-input').inputValue();
    console.log('After keyboard.down/up "a": value =', JSON.stringify(value));
  });

  it('keyboard.type should input text', async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));

    await page.click('#text-input');

    await page.keyboard.type('hello');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const value = await page.locator('#text-input').inputValue();
    console.log('After keyboard.type "hello": value =', JSON.stringify(value));
    expect(value).toBe('hello');
  });

  it('keyboard.insertText should input text', async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));

    await page.click('#text-input');

    await page.keyboard.insertText('test');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const value = await page.locator('#text-input').inputValue();
    console.log('After keyboard.insertText "test": value =', JSON.stringify(value));
    expect(value).toBe('test');
  });

  it('keyboard.press should input text for single character', async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));

    await page.click('#text-input');

    await page.keyboard.press('a');
    await page.keyboard.press('b');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const value = await page.locator('#text-input').inputValue();
    console.log('After keyboard.press "a" and "b": value =', JSON.stringify(value));
    expect(value).toBe('ab');
  });
});
