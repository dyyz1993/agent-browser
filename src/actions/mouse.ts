import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
  MouseMoveCommand,
  MouseDownCommand,
  MouseUpCommand,
  WanderCommand,
  MouseTrajectoryCommand,
} from '../types.js';
import { successResponse } from '../protocol.js';
import { humanMoveTo, humanWander } from '../human-mouse.js';
import type { HumanConfig } from '../human-mouse.js';

export async function handleMouseMove(
  command: MouseMoveCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.move(command.x, command.y);
  return successResponse(command.id, { moved: true, x: command.x, y: command.y });
}

export async function handleMouseDown(
  command: MouseDownCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.down({ button: command.button ?? 'left' });
  return successResponse(command.id, { down: true });
}

export async function handleMouseUp(
  command: MouseUpCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.up({ button: command.button ?? 'left' });
  return successResponse(command.id, { up: true });
}

export async function handleWander(
  command: WanderCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };

  const config = command.human ?? { enabled: true, pathType: 'bezier' };

  await humanWander(page, config, {
    duration: command.duration ?? 2000,
    area: viewport,
  });

  return successResponse(command.id, { wandered: true, duration: command.duration ?? 2000 });
}

function parseTrajectoryData(data: string): Array<{ x: number; y: number; delay: number }> {
  return data.split(';').map((segment) => {
    const parts = segment.split(':').map(Number);
    return { x: parts[0] || 0, y: parts[1] || 0, delay: parts[2] || 0 };
  });
}

export async function handleMouseTrajectory(
  command: MouseTrajectoryCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const points = parseTrajectoryData(command.data);
  const config = command.human ?? { enabled: true, pathType: 'bezier' };

  for (let i = 0; i < points.length; i++) {
    const { x, y, delay } = points[i];

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    if (config.enabled) {
      await humanMoveTo(page, { x, y }, config);
    } else {
      await page.mouse.move(x, y);
    }
  }

  return successResponse(command.id, { moved: true, points: points.length });
}
