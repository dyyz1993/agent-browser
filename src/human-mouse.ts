import type { Page } from 'playwright-core';

export type HumanPathType = 'bezier' | 'arc' | 'random' | 'linear';

export interface HumanConfig {
  enabled: boolean;
  pathType: HumanPathType;
}

export interface Point {
  x: number;
  y: number;
}

const PRESETS = {
  arc: { speed: 300, overshoot: false },
  bezier: { speed: 350, overshoot: true },
  random: { speed: 280, overshoot: true },
  linear: { speed: 250, overshoot: false },
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastPos: Point | null = null;

function generateArcPath(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 10) return [start, end];

  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const perpX = dist > 0 ? -dy / dist : 0;
  const perpY = dist > 0 ? dx / dist : 0;
  const arcHeight = dist * 0.25 * (Math.random() > 0.5 ? 1 : -1);

  return [start, { x: mx + perpX * arcHeight, y: my + perpY * arcHeight }, end];
}

function generateBezierPath(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 10) return [start, end];

  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  const offset = rand(-dist * 0.3, dist * 0.3);

  return [
    start,
    {
      x: start.x + dx * 0.3 + Math.cos(angle) * offset,
      y: start.y + dy * 0.3 + Math.sin(angle) * offset,
    },
    {
      x: start.x + dx * 0.7 + Math.cos(angle) * offset * 0.5,
      y: start.y + dy * 0.7 + Math.sin(angle) * offset * 0.5,
    },
    end,
  ];
}

function generateRandomPath(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 10) return [start, end];

  const n = Math.max(3, Math.floor(dist / 80));
  const pts = [start];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({
      x: start.x + dx * t + rand(-dist * 0.15, dist * 0.15),
      y: start.y + dy * t + rand(-dist * 0.15, dist * 0.15),
    });
  }
  pts.push(end);
  return pts;
}

function generatePath(start: Point, end: Point, type: HumanPathType): Point[] {
  switch (type) {
    case 'arc':
      return generateArcPath(start, end);
    case 'bezier':
      return generateBezierPath(start, end);
    case 'random':
      return generateRandomPath(start, end);
    default:
      return [start, end];
  }
}

function interp(pts: Point[], t: number): Point {
  if (pts.length === 2) {
    return { x: pts[0].x + (pts[1].x - pts[0].x) * t, y: pts[0].y + (pts[1].y - pts[0].y) * t };
  }
  if (pts.length === 3) {
    const m = 1 - t;
    return {
      x: m * m * pts[0].x + 2 * m * t * pts[1].x + t * t * pts[2].x,
      y: m * m * pts[0].y + 2 * m * t * pts[1].y + t * t * pts[2].y,
    };
  }
  const [p0, p1, p2, p3] = pts;
  const t2 = t * t,
    t3 = t2 * t,
    m = 1 - t,
    m2 = m * m,
    m3 = m2 * m;
  return {
    x: m3 * p0.x + 3 * m2 * t * p1.x + 3 * m * t2 * p2.x + t3 * p3.x,
    y: m3 * p0.y + 3 * m2 * t * p1.y + 3 * m * t2 * p2.y + t3 * p3.y,
  };
}

async function moveAlongPath(
  page: Page,
  pts: Point[],
  steps: number,
  _preset: (typeof PRESETS)[HumanPathType]
) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const p = interp(pts, ease);
    await page.mouse.move(p.x, p.y);
    await sleep(rand(3, 8));
  }
}

async function moveTo(page: Page, to: Point, config: HumanConfig) {
  const area = page.viewportSize() ?? { width: 1280, height: 800 };

  if (!lastPos) {
    lastPos = { x: rand(200, area.width - 200), y: rand(200, area.height - 200) };
    await page.mouse.move(lastPos.x, lastPos.y);
  }

  const preset = PRESETS[config.pathType];
  const dist = Math.sqrt((to.x - lastPos.x) ** 2 + (to.y - lastPos.y) ** 2);
  const steps = Math.max(10, Math.floor((dist / preset.speed) * 40));
  const path = generatePath(lastPos, to, config.pathType);

  await sleep(rand(20, 50));
  await moveAlongPath(page, path, steps, preset);

  if (preset.overshoot && dist > 50 && Math.random() > 0.6) {
    const over = { x: to.x + (to.x - lastPos.x) * 0.08, y: to.y + (to.y - lastPos.y) * 0.08 };
    await moveAlongPath(page, [to, over, to], 4, preset);
  }

  lastPos = to;
}

export async function humanMoveTo(page: Page, to: Point, config: HumanConfig): Promise<void> {
  await moveTo(page, to, config);
}

export async function humanClick(
  page: Page,
  targetX: number,
  targetY: number,
  config: HumanConfig,
  options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }
): Promise<void> {
  const area = page.viewportSize() ?? { width: 1280, height: 800 };

  if (!lastPos) {
    lastPos = { x: rand(200, area.width - 200), y: rand(200, area.height - 200) };
    await page.mouse.move(lastPos.x, lastPos.y);
  }

  // 直接移动到目标
  await moveTo(page, { x: targetX, y: targetY }, config);

  // 点击
  await sleep(rand(20, 50));
  await page.mouse.down({
    button: options?.button ?? 'left',
    clickCount: options?.clickCount ?? 1,
  });
  await sleep(rand(20, 50));
  await page.mouse.up({ button: options?.button ?? 'left', clickCount: options?.clickCount ?? 1 });
}

export async function humanType(page: Page, text: string, _config: HumanConfig): Promise<void> {
  for (const char of text) {
    await sleep(rand(50, 150));
    await page.keyboard.type(char);
  }
}

export async function humanWander(
  page: Page,
  config: HumanConfig,
  options?: { duration?: number; area?: { width: number; height: number } }
): Promise<void> {
  const duration = options?.duration ?? 2000;
  const area = options?.area ?? page.viewportSize() ?? { width: 1280, height: 800 };

  if (!lastPos) {
    lastPos = { x: rand(200, area.width - 200), y: rand(200, area.height - 200) };
    await page.mouse.move(lastPos.x, lastPos.y);
  }

  const start = Date.now();
  while (Date.now() - start < duration) {
    const target = { x: rand(100, area.width - 100), y: rand(100, area.height - 100) };
    await moveTo(page, target, config);
    await sleep(rand(50, 150));
  }
}

export function getLastMousePosition(): Point {
  return lastPos ? { ...lastPos } : { x: 0, y: 0 };
}

const VALID_PATH_TYPES: HumanPathType[] = ['bezier', 'arc', 'random', 'linear'];

/**
 * Get human config from environment variable AGENT_BROWSER_HUMAN
 * Values: 1, bezier, arc, random, linear
 * When set to "1", uses default path type "arc"
 */
export function getHumanConfigFromEnv(): HumanConfig {
  const env = process.env.AGENT_BROWSER_HUMAN;
  if (!env) {
    return { enabled: false, pathType: 'arc' };
  }

  // Check if it's a valid path type
  if (VALID_PATH_TYPES.includes(env as HumanPathType)) {
    return { enabled: true, pathType: env as HumanPathType };
  }

  // Any truthy value (like "1", "true", etc.) enables with default path type
  return { enabled: true, pathType: 'arc' };
}
