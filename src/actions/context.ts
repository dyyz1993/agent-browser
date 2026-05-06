import type { BrowserManager } from '../browser.js';
import type {
  Command,
  Response,
  DialogCommand,
  PdfCommand,
  RouteCommand,
  RequestsCommand,
  WebSocketsCommand,
  DownloadCommand,
  GeolocationCommand,
  PermissionsCommand,
  ViewportCommand,
  DeviceCommand,
} from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleDialog(
  command: DialogCommand,
  browser: BrowserManager
): Promise<Response> {
  browser.setDialogHandler(command.response, command.promptText);
  return successResponse(command.id, { handler: 'set', response: command.response });
}

export async function handlePdf(command: PdfCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.pdf({
    path: command.path,
    format: command.format ?? 'Letter',
  });
  return successResponse(command.id, { path: command.path });
}

export async function handleRoute(
  command: RouteCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.addRoute(command.url, {
    response: command.response,
    abort: command.abort,
  });
  return successResponse(command.id, { routed: command.url });
}

export async function handleUnroute(
  command: Command & { action: 'unroute'; url?: string },
  browser: BrowserManager
): Promise<Response> {
  await browser.removeRoute(command.url);
  return successResponse(command.id, { unrouted: command.url ?? 'all' });
}

export async function handleRequests(
  command: RequestsCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearRequests();
    return successResponse(command.id, { cleared: true });
  }

  const wasTracking = browser.trackingEnabled;
  browser.startRequestTracking(command.captureResponse);

  if (command.output) {
    const result = browser.saveRequestsToDir(command.output, command.filter, command.type);
    return successResponse(command.id, {
      saved: true,
      savedCount: result.savedCount,
      outputPath: result.outputPath,
      indexPath: result.indexPath,
    });
  }

  const requests = browser.getRequests(command.filter, command.type);
  const result: Record<string, unknown> = { requests };
  if (requests.length === 0 && !wasTracking) {
    result.hint = 'Request tracking just activated. Reload or navigate to capture requests.';
  }
  return successResponse(command.id, result);
}

export async function handleWebSockets(
  command: WebSocketsCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearWebSockets();
    return successResponse(command.id, { cleared: true });
  }

  const wasTracking = browser.wsTrackingEnabled;
  browser.startWebSocketTracking();

  const sockets = browser.getWebSockets(command.filter);
  const result: Record<string, unknown> = { websockets: sockets };
  if (sockets.length === 0 && !wasTracking) {
    result.hint = 'WebSocket tracking just activated. Reload or navigate to capture connections.';
  }
  return successResponse(command.id, result);
}

export async function handleDownload(
  command: DownloadCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = browser.getLocator(command.selector, command.inFrame);

  const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);

  await download.saveAs(command.path);
  return successResponse(command.id, {
    path: command.path,
    suggestedFilename: download.suggestedFilename(),
  });
}

export async function handleGeolocation(
  command: GeolocationCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setGeolocation(command.latitude, command.longitude, command.accuracy);
  return successResponse(command.id, {
    latitude: command.latitude,
    longitude: command.longitude,
  });
}

export async function handlePermissions(
  command: PermissionsCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setPermissions(command.permissions, command.grant);
  return successResponse(command.id, {
    permissions: command.permissions,
    granted: command.grant,
  });
}

export async function handleViewport(
  command: ViewportCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setViewport(command.width, command.height);
  return successResponse(command.id, {
    width: command.width,
    height: command.height,
  });
}

export async function handleUserAgent(
  command: Command & { action: 'useragent'; userAgent: string },
  browser: BrowserManager
): Promise<Response> {
  return successResponse(command.id, {
    note: 'User agent can only be set at launch time. Use device command instead.',
  });
}

export async function handleDevice(
  command: DeviceCommand,
  browser: BrowserManager
): Promise<Response> {
  const device = browser.getDevice(command.device);
  if (!device) {
    const available = browser.listDevices().slice(0, 10).join(', ');
    throw new Error(`Unknown device: ${command.device}. Available: ${available}...`);
  }

  await browser.setViewport(device.viewport.width, device.viewport.height);

  if (device.deviceScaleFactor && device.deviceScaleFactor !== 1) {
    await browser.setDeviceScaleFactor(
      device.deviceScaleFactor,
      device.viewport.width,
      device.viewport.height,
      device.isMobile ?? false
    );
  } else {
    try {
      await browser.clearDeviceMetricsOverride();
    } catch {
      // Ignore error if override was never set
    }
  }

  return successResponse(command.id, {
    device: command.device,
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
  });
}

export async function handleBack(
  command: Command & { action: 'back' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'back' });
  const page = browser.getPage();
  await page.goBack();
  return successResponse(command.id, { url: page.url() });
}

export async function handleForward(
  command: Command & { action: 'forward' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'forward' });
  const page = browser.getPage();
  await page.goForward();
  return successResponse(command.id, { url: page.url() });
}

export async function handleReload(
  command: Command & { action: 'reload' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'reload' });
  const page = browser.getPage();
  await page.reload();
  return successResponse(command.id, { url: page.url() });
}

export async function handleUrl(
  command: Command & { action: 'url' },
  browser: BrowserManager
): Promise<Response> {
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    const url = await frameLocator.locator(':root').evaluate(() => window.location.href);
    return successResponse(command.id, { url });
  } else {
    const page = browser.getPage();
    return successResponse(command.id, { url: page.url() });
  }
}

export async function handleTitle(
  command: Command & { action: 'title' },
  browser: BrowserManager
): Promise<Response> {
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    const title = await frameLocator.locator(':root').evaluate(() => document.title);
    return successResponse(command.id, { title });
  } else {
    const page = browser.getPage();
    const title = await page.title();
    return successResponse(command.id, { title });
  }
}
