import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';

const CLI = 'node dist/cli.js';
const CHROMIUM = process.env.AGENT_BROWSER_EXECUTABLE_PATH || '';

function run(cmd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`${CLI} ${cmd}`, {
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: CHROMIUM },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

function runJSON(cmd: string): any {
  const result = run(`${cmd} --json`);
  if (result.exitCode !== 0) throw new Error(`CLI failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

beforeAll(() => {
  run('close');
}, 10000);

afterAll(() => {
  run('close');
}, 10000);

describe('Scrape', () => {
  it('should scrape example.com and return markdown content', () => {
    const data = runJSON('scrape https://example.com --timeout 15');

    expect(data.success).toBe(true);
    expect(data.data.url).toBe('https://example.com/');
    expect(data.data.title).toBe('Example Domain');
    expect(data.data.content).toContain('# Example Domain');
    expect(data.data.content).toContain(
      'This domain is for use in documentation examples without needing permission'
    );
    expect(data.data.format).toBe('markdown');
    expect(data.data.content.length).toBeGreaterThan(50);
  });

  it('should scrape with --format html', () => {
    const data = runJSON('scrape https://example.com --format html');

    expect(data.success).toBe(true);
    expect(data.data.content).toContain('<h1>Example Domain</h1>');
    expect(data.data.format).toBe('html');
  });

  it('should scrape with --format text', () => {
    const data = runJSON('scrape https://example.com --format text');

    expect(data.success).toBe(true);
    expect(data.data.format).toBe('text');
    expect(data.data.content).not.toContain('<');
    expect(data.data.content).toContain('Example Domain');
  });

  it('should fail gracefully for invalid URL', () => {
    const result = run('scrape not-a-url --json');
    const data = JSON.parse(result.stdout);

    expect(data.success).toBe(false);
    expect(data.error).toContain('invalid URL');
  });
});

describe('Map', () => {
  it('should map example.com and return url/total fields', () => {
    const data = runJSON('map https://example.com --timeout 15');

    expect(data.success).toBe(true);
    expect(data.data.url).toBe('https://example.com');
    expect(data.data.urls).toBeInstanceOf(Array);
    expect(typeof data.data.total).toBe('number');
  });
});

describe('Crawl', () => {
  it('should crawl example.com with depth 0 (single page)', () => {
    const data = runJSON('crawl https://example.com --depth 0 --limit 1 --timeout 15');

    expect(data.success).toBe(true);
    expect(data.data.pages).toBeInstanceOf(Array);
    expect(data.data.pages.length).toBe(1);
    expect(data.data.pages[0].url).toBe('https://example.com/');
    expect(data.data.pages[0].title).toBe('Example Domain');
    expect(data.data.pages[0].content.length).toBeGreaterThan(50);
    expect(data.data.crawled).toBe(1);
    expect(data.data.failed).toBe(0);
  });

  it('should crawl with depth 1 and return at least 1 page', () => {
    const data = runJSON('crawl https://example.com --depth 1 --limit 5 --timeout 15');

    expect(data.success).toBe(true);
    expect(data.data.pages.length).toBeGreaterThanOrEqual(1);
    expect(data.data.total).toBeGreaterThanOrEqual(1);
  });

  it('should respect --limit parameter', () => {
    const data = runJSON('crawl https://example.com --depth 1 --limit 2 --timeout 15');

    expect(data.success).toBe(true);
    expect(data.data.pages.length).toBeLessThanOrEqual(2);
  });
});

describe('Interact', () => {
  it('should execute navigate step', () => {
    const data = runJSON('interact navigate https://example.com');

    expect(data.success).toBe(true);
    expect(data.data.steps).toBeInstanceOf(Array);
    expect(data.data.steps.length).toBe(1);
    expect(data.data.steps[0].action).toBe('navigate');
    expect(data.data.steps[0].success).toBe(true);
    expect(data.data.finalUrl).toBe('https://example.com/');
    expect(data.data.finalTitle).toBe('Example Domain');
  });
});

describe('Search', () => {
  it('should search with bing engine and return results', () => {
    const data = runJSON('search "example website" --engine bing --limit 3 --timeout 20');

    expect(data.success).toBe(true);
    expect(data.data.query).toBe('example website');
    expect(data.data.engine).toBe('bing');
    expect(data.data.results).toBeInstanceOf(Array);
    expect(data.data.results.length).toBeGreaterThanOrEqual(1);

    const result = data.data.results[0];
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.url).toContain('http');
  });
});
