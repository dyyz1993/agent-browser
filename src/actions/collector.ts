import type { BrowserManager } from '../browser/index.js';
import type { Response } from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleCollectStart(
  command: { action: 'collect_start'; id: string },
  browser: BrowserManager
): Promise<Response> {
  const result = await browser.collector.start();
  return successResponse(command.id, result);
}

export async function handleCollectStop(
  command: { action: 'collect_stop'; id: string },
  browser: BrowserManager
): Promise<Response> {
  const result = await browser.collector.stop();
  return successResponse(command.id, result);
}
