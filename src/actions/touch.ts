import type { BrowserManager } from '../browser/index.js';
import type { BaseCommand, Response } from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';

interface TouchCommand extends BaseCommand {
  action: 'touch';
  subcommand: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  duration?: number;
  distance?: number;
  points?: Array<{ x: number; y: number }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TouchResult {
  injected: boolean;
  subcommand: string;
}

export async function handleTouch(
  command: TouchCommand,
  browser: BrowserManager
): Promise<Response<TouchResult>> {
  switch (command.subcommand) {
    case 'tap': {
      const x = command.x!;
      const y = command.y!;
      await browser.injectTouchEvent({
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      await sleep(50);
      await browser.injectTouchEvent({
        type: 'touchEnd',
        touchPoints: [{ x, y }],
      });
      break;
    }

    case 'long-press': {
      const x = command.x!;
      const y = command.y!;
      const duration = command.duration ?? 800;
      await browser.injectTouchEvent({
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      await sleep(duration);
      await browser.injectTouchEvent({
        type: 'touchEnd',
        touchPoints: [{ x, y }],
      });
      break;
    }

    case 'swipe': {
      const steps = 10;
      const duration = command.duration ?? 300;
      const x1 = command.x1!;
      const y1 = command.y1!;
      const x2 = command.x2!;
      const y2 = command.y2!;

      await browser.injectTouchEvent({
        type: 'touchStart',
        touchPoints: [{ x: x1, y: y1 }],
      });

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(x1 + (x2 - x1) * t);
        const y = Math.round(y1 + (y2 - y1) * t);
        await browser.injectTouchEvent({
          type: 'touchMove',
          touchPoints: [{ x, y }],
        });
        await sleep(duration / steps);
      }

      await browser.injectTouchEvent({
        type: 'touchEnd',
        touchPoints: [{ x: x2, y: y2 }],
      });
      break;
    }

    case 'pinch': {
      const duration = command.duration ?? 300;
      const cx = command.x!;
      const cy = command.y!;
      const distance = command.distance!;
      const steps = 10;
      const halfDist = distance / 2;

      await browser.injectTouchEvent({
        type: 'touchStart',
        touchPoints: [
          { x: cx - halfDist, y: cy, id: 0 },
          { x: cx + halfDist, y: cy, id: 1 },
        ],
      });

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const offset = halfDist * (1 - t);
        await browser.injectTouchEvent({
          type: 'touchMove',
          touchPoints: [
            { x: Math.round(cx - offset), y: cy, id: 0 },
            { x: Math.round(cx + offset), y: cy, id: 1 },
          ],
        });
        await sleep(duration / steps);
      }

      await browser.injectTouchEvent({
        type: 'touchEnd',
        touchPoints: [
          { x: cx, y: cy, id: 0 },
          { x: cx, y: cy, id: 1 },
        ],
      });
      break;
    }

    case 'multi': {
      const points = command.points ?? [];
      await browser.injectTouchEvent({
        type: 'touchStart',
        touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })),
      });
      await sleep(100);
      await browser.injectTouchEvent({
        type: 'touchEnd',
        touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })),
      });
      break;
    }

    default:
      return errorResponse(
        command.id,
        `Unknown touch subcommand: ${command.subcommand}`
      ) as Response<TouchResult>;
  }

  return successResponse(command.id, { injected: true, subcommand: command.subcommand });
}
