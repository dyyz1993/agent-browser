import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const requests: any[] = [];
  const responses: any[] = [];
  const consoleMessages: string[] = [];
  const errors: string[] = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`Console: [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    errors.push(error.message);
    console.log(`Page Error: ${error.message}`);
  });

  page.on('request', (request) => {
    const req = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      resourceType: request.resourceType(),
      postData: request.postData(),
    };
    requests.push(req);
    
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      console.log(`\n[XHR/${request.method()}] ${request.url()}`);
      if (request.postData()) {
        console.log(`  PostData: ${request.postData()}`);
      }
    }
  });

  page.on('response', async (response) => {
    const request = response.request();
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      try {
        const body = await response.text();
        responses.push({
          url: request.url(),
          method: request.method(),
          status: response.status(),
          headers: response.headers(),
          body: body,
        });
        console.log(`\n=== Response [${response.status()}] ===`);
        console.log(`URL: ${request.url()}`);
        console.log(`Body: ${body.substring(0, 1000)}`);
        console.log(`=== End ===\n`);
      } catch (e) {}
    }
  });

  console.log('Navigating to chatjimmy.ai...');
  try {
    await page.goto('https://chatjimmy.ai/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
  } catch (e) {
    console.log('Navigation timeout, continuing...');
  }

  console.log('\n=== Waiting for page to fully load ===');
  await page.waitForTimeout(5000);

  console.log('\n=== Taking screenshot ===');
  await page.screenshot({ path: '/tmp/chatjimmy-page2.png', fullPage: true });

  console.log('\n=== Page info ===');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  const html = await page.content();
  console.log('\nHTML length:', html.length);
  console.log('HTML preview:', html.substring(0, 2000));

  console.log('\n=== Checking for iframes ===');
  const frames = page.frames();
  console.log(`Found ${frames.length} frames`);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`Frame ${i}: ${frame.url()}`);
  }

  console.log('\n=== Looking for chat input with more selectors ===');
  
  const allElements = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    return Array.from(all).slice(0, 100).map(el => ({
      tag: el.tagName,
      id: el.id,
      className: el.className?.toString?.().substring(0, 50),
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
    }));
  });
  console.log('First 100 elements:', JSON.stringify(allElements.filter(e => e.tag === 'INPUT' || e.tag === 'TEXTAREA' || e.tag === 'BUTTON' || e.role === 'textbox'), null, 2));

  console.log('\n=== Console Messages ===');
  consoleMessages.forEach(m => console.log(m));

  console.log('\n=== Page Errors ===');
  errors.forEach(e => console.log(e));

  console.log('\n\n=== All XHR/Fetch Requests ===');
  const apiRequests = requests.filter(r => r.resourceType === 'xhr' || r.resourceType === 'fetch');

  for (const req of apiRequests) {
    console.log(`\n[${req.method}] ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    if (req.postData) {
      console.log(`PostData: ${req.postData}`);
    }
  }

  console.log('\n\n=== Generating curl commands for API requests ===');
  for (const req of apiRequests) {
    let curl = `curl -X ${req.method} '${req.url}'`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.startsWith(':') || key === 'host' || key === 'content-length') continue;
      curl += ` \\\n  -H '${key}: ${value}'`;
    }
    if (req.postData) {
      curl += ` \\\n  -d '${req.postData}'`;
    }
    console.log(`\n${curl}\n`);
  }

  console.log('\n\nPress Ctrl+C to close browser...');
  await page.waitForTimeout(60000);

  await browser.close();
}

main().catch(console.error);
