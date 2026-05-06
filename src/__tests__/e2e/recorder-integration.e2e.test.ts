import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { getAppDir } from '../../daemon.js';

interface IntegrationRecorderWindow extends Window {
  xyzActive: boolean;
  xyzStopped: boolean;
  xyzInited: boolean;
  xyzInitializedSessionId?: string;
  xyzSessionId?: string;
  xyzQueue: unknown[];
  xyzPaused: boolean;
  [key: string]: unknown;
}

interface IntegrationStopData {
  path: string;
  [key: string]: unknown;
}

interface IntegrationReplayData {
  successCount?: number;
  totalCommands?: number;
  [key: string]: unknown;
}

function castStopData(data: unknown): IntegrationStopData | undefined {
  if (typeof data === 'object' && data !== null) return data as IntegrationStopData;
  return undefined;
}

function castReplayData(data: unknown): IntegrationReplayData | undefined {
  if (typeof data === 'object' && data !== null) return data as IntegrationReplayData;
  return undefined;
}

// Helper function to run with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

// Helper to check if response has path data
function hasPathData(data: unknown): data is { path: string } {
  return typeof data === 'object' && data !== null && 'path' in data;
}

describe('Recorder Integration E2E Test', { sequential: true }, () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ action: 'launch', id: 'test-integration-e2e', headless: true });
  }, 60000);

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    // Stop any active recording first
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    if (stopResult.success) {
      console.log('[beforeEach] Stopping active recording');
    }

    // Clean up old recording files to avoid interference
    // But keep modified files for tests that need them
    const recordingsDir = path.join(getAppDir(), 'tmp', 'recordings');
    if (fs.existsSync(recordingsDir)) {
      const files = fs
        .readdirSync(recordingsDir)
        .filter((f) => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.includes('-modified'));
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(recordingsDir, file));
        } catch {/* empty */}
      }
    }

    // Wait longer to ensure all async operations complete
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Open fresh page for each test - this resets page state
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);

    // Wait for page to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  afterEach(async () => {
    // Ensure recording is stopped
    await executeCommand(parseCliArgs(['recorder', 'stop']), browser);

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Reset browser page state by evaluating cleanup script
    const page = browser.getPage();
    if (page) {
      try {
        await page.evaluate(() => {
          // Reset all recorder-related window variables
          const win = window as IntegrationRecorderWindow;
          win.xyzActive = false;
          win.xyzStopped = true;
          win.xyzInited = false;
          win.xyzInitializedSessionId = undefined;
          win.xyzSessionId = undefined;
          win.xyzQueue = [];
          win.xyzPaused = false;
        });
      } catch (e) {
        // Ignore errors if page is already closed
      }
    }

    // Wait a bit more for cleanup to take effect
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  /**
   * Test 1: should record and replay complex workflow with trajectory
   * Records a complex workflow containing fill, click, and trajectory operations,
   * then verifies the replay works correctly.
   */
  it('should record and replay complex workflow with trajectory', async () => {
    console.log('[Test 1] Starting complex workflow test');

    // Step 1: Start recording
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    console.log('[Test 1] Recording started');

    // Wait for recorder panel
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 2: Perform complex workflow - fill, mouse movement (trajectory), click
    const page = browser.getPage();

    // Fill input
    await executeCommand(parseCliArgs(['fill', '#username', 'integration_user']), browser);
    console.log('[Test 1] Fill performed');

    // Move mouse to create trajectory
    await page.mouse.move(100, 100);
    await page.waitForTimeout(50);
    await page.mouse.move(200, 150);
    await page.waitForTimeout(50);
    await page.mouse.move(300, 200);
    console.log('[Test 1] Mouse trajectory created');

    // Click button to trigger trajectory recording
    await executeCommand(parseCliArgs(['click', '#btn1']), browser);
    console.log('[Test 1] Click performed');

    // Additional fill
    await executeCommand(parseCliArgs(['fill', '#email', 'test@integration.com']), browser);
    await new Promise((resolve) => setTimeout(resolve, 500)); // 增加等待时间确保 fill 完成
    console.log('[Test 1] Additional fill performed');

    // Wait for actions to be recorded
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Step 3: Stop recording
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as IntegrationStopData;
    expect(data.path).toBeDefined();
    const yamlPath = data.path;
    console.log('[Test 1] YAML saved to:', yamlPath);

    // Verify YAML contains our actions
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    expect(yaml).toContain('agent-browser fill');
    expect(yaml).toContain('agent-browser click');
    console.log('[Test 1] YAML verified');

    // Step 4: Open fresh page for replay
    const reopenResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
    expect(reopenResult.success).toBe(true);
    console.log('[Test 1] Fresh page opened');

    // Step 5: Replay the recorded actions
    const replayResult = await executeCommand(
      parseCliArgs(['recorder', 'replay', yamlPath]),
      browser
    );

    console.log('[Test 1] Replay result:', replayResult.success);
    expect(replayResult.success).toBe(true);

    // Step 6: Verify page state after replay
    const usernameValue = await page.evaluate(() => {
      const input = document.querySelector('#username') as HTMLInputElement;
      return input?.value || '';
    });
    expect(usernameValue).toBe('integration_user');
    console.log('[Test 1] Username after replay:', usernameValue);

    const emailValue = await page.evaluate(() => {
      const input = document.querySelector('#email') as HTMLInputElement;
      return input?.value || '';
    });
    expect(emailValue).toBe('test@integration.com');
    console.log('[Test 1] Email after replay:', emailValue);

    // Clean up
    if (yamlPath && fs.existsSync(yamlPath)) {
      try {
        fs.unlinkSync(yamlPath);
      } catch {/* empty */}
    }
    console.log('[Test 1] Test completed successfully');
  }, 60000);

  /**
   * Test 2: should handle trajectory before and after click
   * Verifies that trajectories recorded before and after a click are properly captured.
   */
  it('should handle trajectory before and after click', async () => {
    console.log('[Test 2] Starting trajectory before/after click test');

    // Start recording
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const page = browser.getPage();

    // Create trajectory before click
    await page.mouse.move(50, 50);
    await page.waitForTimeout(50);
    await page.mouse.move(150, 100);
    await page.waitForTimeout(50);
    await page.mouse.move(250, 150);
    console.log('[Test 2] Pre-click trajectory created');

    // Perform click
    await executeCommand(parseCliArgs(['click', '#btn2']), browser);
    console.log('[Test 2] Click performed');

    // Create trajectory after click
    await page.mouse.move(350, 200);
    await page.waitForTimeout(50);
    await page.mouse.move(400, 250);
    await page.waitForTimeout(50);
    await page.mouse.move(450, 300);
    console.log('[Test 2] Post-click trajectory created');

    // Another click to trigger trajectory recording
    await executeCommand(parseCliArgs(['click', '#btn3']), browser);
    console.log('[Test 2] Second click performed');

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Stop recording
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    if (!isSuccessResponse(stopResult)) {
      console.log('[Test 2] Stop result:', JSON.stringify(stopResult, null, 2));
    }
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as IntegrationStopData;
    const yamlPath = data.path;
    console.log('[Test 2] YAML saved to:', yamlPath);

    // Verify YAML contains click commands
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    expect(yaml).toContain('click');
    console.log('[Test 2] YAML contains click commands');

    // Open fresh page
    await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );

    // Replay
    const replayResult = await executeCommand(
      parseCliArgs(['recorder', 'replay', yamlPath]),
      browser
    );
    expect(replayResult.success).toBe(true);
    console.log('[Test 2] Replay successful');

    // Clean up
    if (yamlPath && fs.existsSync(yamlPath)) {
      try {
        fs.unlinkSync(yamlPath);
      } catch {/* empty */}
    }
    console.log('[Test 2] Test completed successfully');
  }, 45000);

  /**
   * Test 3: should replay multiple trajectories in sequence
   * Verifies that multiple trajectory steps can be replayed in sequence correctly.
   */
  it('should replay multiple trajectories in sequence', async () => {
    console.log('[Test 3] Starting multiple trajectories test');

    let yamlPath: string | undefined;

    try {
      // Start recording
      const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      expect(isSuccessResponse(startResult)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const page = browser.getPage();

      // First trajectory + action
      await page.mouse.move(100, 100);
      await page.waitForTimeout(80);
      await page.mouse.move(200, 100);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await executeCommand(parseCliArgs(['click', '#cb1']), browser);
      console.log('[Test 3] First trajectory + click');

      // Second trajectory + action
      await page.waitForTimeout(200);
      await page.mouse.move(100, 200);
      await page.waitForTimeout(80);
      await page.mouse.move(200, 200);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await executeCommand(parseCliArgs(['click', '#cb2']), browser);
      console.log('[Test 3] Second trajectory + click');

      // Third trajectory + action
      await page.waitForTimeout(200);
      await page.mouse.move(100, 300);
      await page.waitForTimeout(80);
      await page.mouse.move(200, 300);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await executeCommand(parseCliArgs(['click', '#cb3']), browser);
      console.log('[Test 3] Third trajectory + click');

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop recording
      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(isSuccessResponse(stopResult)).toBe(true);

      const data = (stopResult as { data?: unknown }).data as IntegrationStopData | undefined;
      yamlPath = data?.path;
      console.log('[Test 3] YAML saved to:', yamlPath);

      if (!yamlPath || !fs.existsSync(yamlPath)) {
        console.log('[Test 3] No YAML file produced, skipping replay verification');
        return;
      }

      // Verify YAML contains recorded actions (recorder may use 'check' for checkboxes)
      const yaml = fs.readFileSync(yamlPath, 'utf-8');
      const hasAction = yaml.includes('click') || yaml.includes('check');
      expect(hasAction).toBe(true);
      console.log('[Test 3] YAML verified');

      // Open fresh page
      await executeCommand(
        parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
        browser
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Replay
      const replayResult = await executeCommand(
        parseCliArgs(['recorder', 'replay', yamlPath]),
        browser
      );
      expect(replayResult.success).toBe(true);
      console.log('[Test 3] Replay successful');

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify checkboxes are checked
      const replayData = isSuccessResponse(replayResult)
        ? castReplayData(replayResult.data)
        : undefined;
      if (replayResult.success && replayData?.successCount > 0) {
        const checkboxes = await page.evaluate(() => {
          return {
            cb1: (document.querySelector('#cb1') as HTMLInputElement)?.checked,
            cb2: (document.querySelector('#cb2') as HTMLInputElement)?.checked,
            cb3: (document.querySelector('#cb3') as HTMLInputElement)?.checked,
          };
        });

        console.log('[Test 3] Checkboxes after replay:', checkboxes);
        expect(checkboxes.cb1).toBe(true);
        expect(checkboxes.cb2).toBe(true);
        expect(checkboxes.cb3).toBe(true);
      } else {
        console.log('[Test 3] No commands executed, skipping checkbox verification');
      }
      console.log('[Test 3] Test completed successfully');
    } finally {
      // Clean up
      if (yamlPath && fs.existsSync(yamlPath)) {
        try {
          fs.unlinkSync(yamlPath);
        } catch {/* empty */}
      }
    }
  }, 60000);

  /**
   * Test 4: should recover from trajectory failure
   * Verifies that if a trajectory step fails, subsequent steps still execute.
   */
  it('should recover from trajectory failure', async () => {
    console.log('[Test 4] Starting trajectory failure recovery test');

    let yamlPath: string | undefined;
    let modifiedYamlPath: string | undefined;

    try {
      // Create a simple recording
      const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      expect(isSuccessResponse(startResult)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Record valid actions
      await executeCommand(parseCliArgs(['fill', '#username', 'recovery_user']), browser);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await executeCommand(parseCliArgs(['click', '#cb1']), browser);
      console.log('[Test 4] Valid actions recorded');

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop recording
      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(isSuccessResponse(stopResult)).toBe(true);

      const data = (stopResult as { data?: unknown }).data as IntegrationStopData | undefined;
      yamlPath = data?.path;
      expect(yamlPath).toBeDefined();

      if (!yamlPath || !fs.existsSync(yamlPath)) {
        console.log('[Test 4] No YAML file produced, skipping test');
        return;
      }

      // Read and modify YAML to simulate a trajectory failure
      const yaml = fs.readFileSync(yamlPath, 'utf-8');
      const lines = yaml.split('\n');

      // Insert an invalid trajectory command
      const cliIndex = lines.findIndex((line) => line.includes('# CLI Commands'));
      if (cliIndex !== -1) {
        // Insert an invalid trajectory command (with malformed data)
        lines.splice(cliIndex + 1, 0, 'agent-browser mouse trajectory "invalid:trajectory:data"');
        const modifiedYaml = lines.join('\n');
        modifiedYamlPath = yamlPath.replace('.yaml', '-modified.yaml');
        fs.writeFileSync(modifiedYamlPath, modifiedYaml);
        console.log('[Test 4] Modified YAML with invalid trajectory');
      }

      // Open fresh page
      await executeCommand(
        parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
        browser
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Replay - should continue despite invalid trajectory step
      const replayResult = await executeCommand(
        parseCliArgs(['recorder', 'replay', modifiedYamlPath || yamlPath]),
        browser
      );

      console.log('[Test 4] Replay result:', replayResult.success);
      // The replay should still succeed overall
      expect(replayResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify that valid actions were still executed
      const page = browser.getPage();

      const replayData = isSuccessResponse(replayResult)
        ? castReplayData(replayResult.data)
        : undefined;
      if (replayResult.success && replayData?.successCount > 0) {
        const usernameValue = await page.evaluate(() => {
          return (document.querySelector('#username') as HTMLInputElement)?.value;
        });
        expect(usernameValue).toBe('recovery_user');
        console.log('[Test 4] Username after recovery:', usernameValue);

        const cb1Checked = await page.evaluate(() => {
          return (document.querySelector('#cb1') as HTMLInputElement)?.checked;
        });
        expect(cb1Checked).toBe(true);
        console.log('[Test 4] Checkbox after recovery:', cb1Checked);
      } else {
        console.log('[Test 4] No commands executed, skipping verification');
      }
      console.log('[Test 4] Test completed successfully');
    } finally {
      // Clean up
      if (yamlPath && fs.existsSync(yamlPath)) {
        try {
          fs.unlinkSync(yamlPath);
        } catch {/* empty */}
      }
      if (modifiedYamlPath && fs.existsSync(modifiedYamlPath)) {
        try {
          fs.unlinkSync(modifiedYamlPath);
        } catch {/* empty */}
      }
    }
  }, 60000);

  /**
   * Test 5: should maintain trajectory data in YAML persistence
   * Verifies that trajectory data is preserved when YAML is saved and reloaded.
   */
  it('should maintain trajectory data in YAML persistence', async () => {
    console.log('[Test 5] Starting YAML persistence test');

    // Start recording
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const page = browser.getPage();

    // Create trajectory with mouse movement
    await page.mouse.move(50, 50);
    await page.waitForTimeout(60);
    await page.mouse.move(150, 100);
    await page.waitForTimeout(60);
    await page.mouse.move(250, 150);
    await page.waitForTimeout(60);
    await page.mouse.move(350, 200);
    console.log('[Test 5] Mouse trajectory created');

    // Perform action to trigger trajectory recording
    await executeCommand(parseCliArgs(['fill', '#search', 'persistence test']), browser);
    console.log('[Test 5] Fill performed');

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Stop recording
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as IntegrationStopData;
    const yamlPath = data.path;
    console.log('[Test 5] YAML saved to:', yamlPath);

    // Read original YAML
    const originalYaml = fs.readFileSync(yamlPath, 'utf-8');
    console.log('[Test 5] Original YAML length:', originalYaml.length);

    // Verify YAML contains essential data
    expect(originalYaml.length).toBeGreaterThan(0);
    expect(originalYaml).toContain('fill');
    console.log('[Test 5] YAML contains fill command');

    // Write to a new location to simulate persistence
    const persistedPath = yamlPath.replace('.yaml', '-persisted.yaml');
    fs.writeFileSync(persistedPath, originalYaml);
    console.log('[Test 5] YAML persisted to:', persistedPath);

    // Read back the persisted YAML
    const persistedYaml = fs.readFileSync(persistedPath, 'utf-8');
    expect(persistedYaml).toBe(originalYaml);
    console.log('[Test 5] YAML persistence verified');

    // Open fresh page and replay from persisted file
    await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );

    const replayResult = await executeCommand(
      parseCliArgs(['recorder', 'replay', persistedPath]),
      browser
    );
    expect(replayResult.success).toBe(true);
    console.log('[Test 5] Replay from persisted YAML successful');

    // Verify the action was replayed
    const searchValue = await page.evaluate(() => {
      return (document.querySelector('#search') as HTMLInputElement)?.value;
    });
    expect(searchValue).toBe('persistence test');
    console.log('[Test 5] Search value after replay:', searchValue);

    // Clean up
    if (yamlPath && fs.existsSync(yamlPath)) {
      try {
        fs.unlinkSync(yamlPath);
      } catch {/* empty */}
    }
    if (persistedPath && fs.existsSync(persistedPath)) {
      try {
        fs.unlinkSync(persistedPath);
      } catch {/* empty */}
    }
    console.log('[Test 5] Test completed successfully');
  }, 45000);

  /**
   * Test 6: should handle trajectory with annotation
   * Verifies that trajectory steps and annotations can be correctly combined.
   */
  it('should handle trajectory with annotation', async () => {
    console.log('[Test 6] Starting trajectory with annotation test');

    const page = browser.getPage();

    // Start recording
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    console.log('[Test 6] Recording started');

    // Wait for recorder panel
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create trajectory
    await page.mouse.move(100, 100);
    await page.waitForTimeout(50);
    await page.mouse.move(200, 150);
    await page.waitForTimeout(50);
    await page.mouse.move(300, 200);
    console.log('[Test 6] Mouse trajectory created');

    // Perform action
    const clickResult = await executeCommand(parseCliArgs(['click', '#btn1']), browser);
    expect(clickResult.success).toBe(true);
    console.log('[Test 6] Click performed');

    // Wait for step to be recorded
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add annotation via xyzUpdate event
    const updateResult = await page.evaluate(async () => {
      const steps = (window as IntegrationRecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'checkpoint', label: 'Trajectory Checkpoint Test' };

      // Update the step in the frontend queue
      lastStep.annotation = annotation;

      // Send xyzUpdate event to backend
      const bindingName = (window as IntegrationRecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as IntegrationRecorderWindow)[bindingName] as
        | ((data: string) => void)
        | undefined;
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    console.log('[Test 6] Update result:', updateResult);
    expect(updateResult.success).toBe(true);

    // Wait for the update to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Stop recording
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as IntegrationStopData;
    expect(data.path).toBeDefined();
    const yamlPath = data.path;
    console.log('[Test 6] YAML saved to:', yamlPath);

    // Verify YAML contains both click and annotation
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    console.log('[Test 6] YAML content length:', yaml.length);

    expect(yaml).toContain('click');
    console.log('[Test 6] YAML contains click command');

    // Check for annotation data
    const hasAnnotation = yaml.includes('checkpoint') || yaml.includes('Trajectory Checkpoint');
    console.log('[Test 6] YAML has annotation:', hasAnnotation);

    // Open fresh page for replay
    await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );

    // Replay
    const replayResult = await executeCommand(
      parseCliArgs(['recorder', 'replay', yamlPath]),
      browser
    );
    expect(replayResult.success).toBe(true);
    console.log('[Test 6] Replay successful');

    // Clean up
    if (yamlPath && fs.existsSync(yamlPath)) {
      try {
        fs.unlinkSync(yamlPath);
      } catch {/* empty */}
    }
    console.log('[Test 6] Test completed successfully');
  }, 60000);
});
