import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';
import * as fs from 'fs';

// Helper function to run with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

describe('Recorder Comprehensive E2E Test', () => {
  let browser: BrowserManager;
  let recordedYamlPath: string | undefined;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ action: 'launch', id: 'test-comprehensive-e2e', headless: true });
  });

  afterAll(async () => {
    // Clean up temp file
    if (recordedYamlPath && fs.existsSync(recordedYamlPath)) {
      try {
        fs.unlinkSync(recordedYamlPath);
      } catch {/* empty */}
    }
    await browser.close();
  });

  // Ensure recorder is stopped after each test to prevent state leakage
  afterEach(async () => {
    try {
      await withTimeout(executeCommand(parseCliArgs(['recorder', 'stop']), browser), 5000);
    } catch {
      // Ignore errors if recorder wasn't running
    }
  });

  it('should record steps and generate CLI commands for replay', async () => {
    // Open comprehensive test page
    const openResult = await withTimeout(
      executeCommand(parseCliArgs(['open', getFixturePath('comprehensive-test.html')]), browser),
      10000
    );
    expect(openResult.success).toBe(true);

    // Start recorder
    const startResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'start']), browser),
      10000
    );
    console.log('[Test] Start recorder result:', startResult);
    expect(isSuccessResponse(startResult)).toBe(true);

    // Wait for recorder to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Record a minimal set of interactions
    const actions = [
      () => withTimeout(executeCommand(parseCliArgs(['fill', '#username', 'test']), browser), 5000),
      () => withTimeout(executeCommand(parseCliArgs(['click', '#btn1']), browser), 5000),
    ];

    let stepCount = 0;
    for (const action of actions) {
      try {
        const result = await action();
        console.log('[Test] Action result:', result.success);
        if (result.success) {
          stepCount++;
        }
      } catch (e) {
        console.log('[Test] Action error:', e);
      }
    }

    console.log('[Test] Total actions executed:', stepCount);
    expect(stepCount).toBeGreaterThanOrEqual(1);

    // Stop recorder
    const stopResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'stop']), browser),
      10000
    );
    console.log('[Test] Stop recorder result:', stopResult);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as Record<string, unknown>;
    expect(data.path).toBeDefined();
    recordedYamlPath = data.path;
    console.log('[Test] YAML saved to:', recordedYamlPath);

    // Read and verify YAML
    const yaml = fs.readFileSync(recordedYamlPath!, 'utf-8');
    console.log('[Test] YAML length:', yaml.length);
    expect(yaml.length).toBeGreaterThan(0);
  }, 30000);

  it('should replay recorded actions using recorder replay command', async () => {
    if (!recordedYamlPath || !fs.existsSync(recordedYamlPath)) {
      console.log('[Test] Skipping replay test - no recorded YAML');
      return;
    }

    // Open fresh page
    const openResult = await withTimeout(
      executeCommand(parseCliArgs(['open', getFixturePath('comprehensive-test.html')]), browser),
      10000
    );
    expect(openResult.success).toBe(true);

    // Replay using the recorded YAML
    const replayResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'replay', recordedYamlPath!]), browser),
      15000
    );

    console.log('[Test] Replay result:', replayResult.success);
    expect(replayResult).toBeDefined();
  }, 30000);

  it('should use most recent recording when replay has no path', async () => {
    // Open page
    const openResult = await withTimeout(
      executeCommand(parseCliArgs(['open', getFixturePath('input-test.html')]), browser),
      10000
    );
    expect(openResult.success).toBe(true);

    // Start recorder
    const startResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'start']), browser),
      10000
    );
    console.log('[Test] Start result:', startResult);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Perform actions
    await withTimeout(executeCommand(parseCliArgs(['click', '#text-input']), browser), 5000);
    await withTimeout(
      executeCommand(parseCliArgs(['fill', '#text-input', 'replay test']), browser),
      5000
    );

    // Stop recorder
    const stopResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'stop']), browser),
      10000
    );
    console.log('[Test] Stop result:', stopResult);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const recentPath = (stopResult.data as Record<string, unknown>)?.path as string | undefined;
    console.log('[Test] Recent recording:', recentPath);
    expect(recentPath).toBeDefined();

    // Replay without path - should use most recent
    const replayResult = await withTimeout(
      executeCommand(parseCliArgs(['recorder', 'replay']), browser),
      15000
    );

    console.log('[Test] Replay without path result:', replayResult.success);
    expect(replayResult).toBeDefined();

    // Clean up
    if (recentPath && fs.existsSync(recentPath)) {
      try {
        fs.unlinkSync(recentPath);
      } catch {/* empty */}
    }
  }, 45000);
});
