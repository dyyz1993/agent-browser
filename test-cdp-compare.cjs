const { chromium } = require('playwright-core');

async function testCDP(name, cdpUrl) {
  console.log(`\n=== Testing ${name}: ${cdpUrl} ===\n`);
  
  try {
    console.log('Connecting...');
    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 10000 });
    console.log('Connected!');
    
    console.log('Getting contexts...');
    const contexts = browser.contexts();
    console.log('Contexts count:', contexts.length);
    
    if (contexts.length === 0) {
      console.log('ERROR: No contexts found');
      await browser.close().catch(() => {});
      return;
    }
    
    const context = contexts[0];
    console.log('Getting pages...');
    const pages = context.pages();
    console.log('Pages count:', pages.length);
    
    let page;
    if (pages.length === 0) {
      console.log('No pages found, creating new page...');
      page = await context.newPage();
      console.log('New page created, URL:', page.url());
    } else {
      page = pages[0];
      console.log('Using existing page, URL:', page.url());
    }
    
    console.log('Navigating to example.com...');
    const startTime = Date.now();
    await page.goto('https://example.com', { timeout: 30000, waitUntil: 'load' });
    console.log(`Navigation completed in ${Date.now() - startTime}ms`);
    console.log('Page URL:', page.url());
    
    console.log('Navigating to douyin.com...');
    const startTime2 = Date.now();
    await page.goto('https://douyin.com', { timeout: 30000, waitUntil: 'load' });
    console.log(`Navigation completed in ${Date.now() - startTime2}ms`);
    console.log('Page URL:', page.url());
    
    console.log('\n✓ All tests passed!\n');
    
    // Don't close browser for CDP connections
    // await browser.close();
  } catch (e) {
    console.log('\n✗ Test failed:', e.message);
    console.log(e.stack);
  }
}

async function main() {
  // Test native Chrome CDP
  await testCDP('Native Chrome CDP', 'http://localhost:9222');
  
  // Test user's custom CDP
  await testCDP('Custom CDP', 'ws://127.0.0.1:8080/client');
}

main().catch(console.error);
