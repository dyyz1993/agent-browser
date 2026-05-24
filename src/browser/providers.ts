import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

export interface ProviderSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
  apiKey: string;
}

export async function closeBrowserbaseSession(sessionId: string, apiKey: string): Promise<void> {
  await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'X-BB-API-Key': apiKey,
    },
  });
}

export async function closeBrowserUseSession(sessionId: string, apiKey: string): Promise<void> {
  const response = await fetch(`https://api.browser-use.com/api/v2/browsers/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': apiKey,
    },
    body: JSON.stringify({ action: 'stop' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to close Browser Use session: ${response.statusText}`);
  }
}

export async function closeKernelSession(sessionId: string, apiKey: string): Promise<void> {
  const response = await fetch(`https://api.onkernel.com/browsers/${sessionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to close Kernel session: ${response.statusText}`);
  }
}

export async function connectToBrowserbase(): Promise<ProviderSession> {
  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!browserbaseApiKey || !browserbaseProjectId) {
    throw new Error(
      'BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required when using browserbase as a provider'
    );
  }

  const response = await fetch('https://api.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': browserbaseApiKey,
    },
    body: JSON.stringify({
      projectId: browserbaseProjectId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Browserbase session: ${response.statusText}`);
  }

  const session = (await response.json()) as { id: string; connectUrl: string };

  const browser = await chromium.connectOverCDP(session.connectUrl).catch(() => {
    throw new Error('Failed to connect to Browserbase session via CDP');
  });

  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser context found in Browserbase session');
    }

    const context = contexts[0];
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());

    return {
      browser,
      context,
      page,
      sessionId: session.id,
      apiKey: browserbaseApiKey,
    };
  } catch (error) {
    await closeBrowserbaseSession(session.id, browserbaseApiKey).catch((sessionError) => {
      console.error('Failed to close Browserbase session during cleanup:', sessionError);
    });
    throw error;
  }
}

export async function findOrCreateKernelProfile(
  profileName: string,
  apiKey: string
): Promise<{ name: string }> {
  const getResponse = await fetch(
    `https://api.onkernel.com/profiles/${encodeURIComponent(profileName)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (getResponse.ok) {
    return { name: profileName };
  }

  if (getResponse.status !== 404) {
    throw new Error(`Failed to check Kernel profile: ${getResponse.statusText}`);
  }

  const createResponse = await fetch('https://api.onkernel.com/profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ name: profileName }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create Kernel profile: ${createResponse.statusText}`);
  }

  return { name: profileName };
}

export async function connectToKernel(): Promise<ProviderSession> {
  const kernelApiKey = process.env.KERNEL_API_KEY;
  if (!kernelApiKey) {
    throw new Error('KERNEL_API_KEY is required when using kernel as a provider');
  }

  const profileName = process.env.KERNEL_PROFILE_NAME;
  let profileConfig: { profile: { name: string; save_changes: boolean } } | undefined;

  if (profileName) {
    await findOrCreateKernelProfile(profileName, kernelApiKey);
    profileConfig = {
      profile: {
        name: profileName,
        save_changes: true,
      },
    };
  }

  const response = await fetch('https://api.onkernel.com/browsers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${kernelApiKey}`,
    },
    body: JSON.stringify({
      headless: process.env.KERNEL_HEADLESS?.toLowerCase() === 'true',
      stealth: process.env.KERNEL_STEALTH?.toLowerCase() !== 'false',
      timeout_seconds: parseInt(process.env.KERNEL_TIMEOUT_SECONDS || '300', 10),
      ...profileConfig,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Kernel session: ${response.statusText}`);
  }

  let session: { session_id: string; cdp_ws_url: string };
  try {
    session = (await response.json()) as { session_id: string; cdp_ws_url: string };
  } catch (error) {
    throw new Error(
      `Failed to parse Kernel session response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!session.session_id || !session.cdp_ws_url) {
    throw new Error(
      `Invalid Kernel session response: missing ${!session.session_id ? 'session_id' : 'cdp_ws_url'}`
    );
  }

  const browser = await chromium.connectOverCDP(session.cdp_ws_url).catch(() => {
    throw new Error('Failed to connect to Kernel session via CDP');
  });

  try {
    const contexts = browser.contexts();
    let context: BrowserContext;
    let page: Page;

    if (contexts.length === 0) {
      context = await browser.newContext();
      page = await context.newPage();
    } else {
      context = contexts[0];
      const pages = context.pages();
      page = pages[0] ?? (await context.newPage());
    }

    return {
      browser,
      context,
      page,
      sessionId: session.session_id,
      apiKey: kernelApiKey,
    };
  } catch (error) {
    await closeKernelSession(session.session_id, kernelApiKey).catch((sessionError) => {
      console.error('Failed to close Kernel session during cleanup:', sessionError);
    });
    throw error;
  }
}

export async function connectToBrowserUse(): Promise<ProviderSession> {
  const browserUseApiKey = process.env.BROWSER_USE_API_KEY;
  if (!browserUseApiKey) {
    throw new Error('BROWSER_USE_API_KEY is required when using browseruse as a provider');
  }

  const response = await fetch('https://api.browser-use.com/api/v2/browsers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': browserUseApiKey,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Browser Use session: ${response.statusText}`);
  }

  let session: { id: string; cdpUrl: string };
  try {
    session = (await response.json()) as { id: string; cdpUrl: string };
  } catch (error) {
    throw new Error(
      `Failed to parse Browser Use session response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!session.id || !session.cdpUrl) {
    throw new Error(
      `Invalid Browser Use session response: missing ${!session.id ? 'id' : 'cdpUrl'}`
    );
  }

  const browser = await chromium.connectOverCDP(session.cdpUrl).catch(() => {
    throw new Error('Failed to connect to Browser Use session via CDP');
  });

  try {
    const contexts = browser.contexts();
    let context: BrowserContext;
    let page: Page;

    if (contexts.length === 0) {
      context = await browser.newContext();
      page = await context.newPage();
    } else {
      context = contexts[0];
      const pages = context.pages();
      page = pages[0] ?? (await context.newPage());
    }

    return {
      browser,
      context,
      page,
      sessionId: session.id,
      apiKey: browserUseApiKey,
    };
  } catch (error) {
    await closeBrowserUseSession(session.id, browserUseApiKey).catch((sessionError) => {
      console.error('Failed to close Browser Use session during cleanup:', sessionError);
    });
    throw error;
  }
}

export async function connectViaCDP(
  cdpEndpoint: string | undefined,
  callbacks: {
    addContext: (context: BrowserContext) => void;
    addPage: (page: Page) => void;
    setupContextTracking: (context: BrowserContext) => Promise<void>;
    setupPageTracking: (page: Page) => void;
  }
): Promise<{ browser: Browser; cdpEndpoint: string }> {
  if (!cdpEndpoint) {
    throw new Error('CDP endpoint is required for CDP connection');
  }

  let cdpUrl: string;
  if (
    cdpEndpoint.startsWith('ws://') ||
    cdpEndpoint.startsWith('wss://') ||
    cdpEndpoint.startsWith('http://') ||
    cdpEndpoint.startsWith('https://')
  ) {
    cdpUrl = cdpEndpoint;
  } else if (/^\d+$/.test(cdpEndpoint)) {
    cdpUrl = `http://localhost:${cdpEndpoint}`;
  } else if (cdpEndpoint.includes(':')) {
    cdpUrl = `http://${cdpEndpoint}`;
  } else {
    cdpUrl = `http://localhost:${cdpEndpoint}`;
  }

  const CDP_CONNECT_TIMEOUT_MS = 15000;

  function withTimeout<T>(promise: Promise<T>, msg: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(msg)), CDP_CONNECT_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  const browser = await withTimeout(
    chromium.connectOverCDP(cdpUrl),
    `CDP connection timed out after ${CDP_CONNECT_TIMEOUT_MS}ms. Remote endpoint at ${cdpUrl} did not respond.`
  ).catch(() => {
    throw new Error(
      `Failed to connect via CDP to ${cdpUrl}. ` +
        (cdpUrl.includes('localhost')
          ? `Make sure the app is running with --remote-debugging-port=${cdpEndpoint}`
          : 'Make sure the remote browser is accessible and the URL is correct.')
    );
  });

  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser context found. Make sure the app has an open window.');
    }

    let allPages = contexts.flatMap((context) => context.pages()).filter((page) => page.url());

    if (allPages.length === 0) {
      const newPage = await contexts[0].newPage();
      allPages = [newPage];
    }

    for (const context of contexts) {
      context.setDefaultTimeout(30000);
      callbacks.addContext(context);
      await callbacks.setupContextTracking(context);
    }

    for (const page of allPages) {
      callbacks.addPage(page);
      callbacks.setupPageTracking(page);
    }

    return { browser, cdpEndpoint };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
