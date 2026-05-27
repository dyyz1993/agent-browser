import { existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserManager } from '../browser/index.js';
import type {
  Response,
  RecorderStartCommand,
  RecorderStopCommand,
  RecorderStatusCommand,
  RecorderReplayCommand,
} from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';

export async function handleRecorderStart(
  command: RecorderStartCommand,
  browser: BrowserManager
): Promise<Response<{ started: boolean; sessionId: string }>> {
  const result = await browser.startRecorder(command.url, command.hide);
  return successResponse(command.id, result);
}

export async function handleRecorderStop(
  command: RecorderStopCommand,
  browser: BrowserManager
): Promise<Response<{ yaml?: string; steps: number; path?: string; tip?: string }>> {
  const result = await browser.stopRecorder();

  if (result.wasRecording === false) {
    const recorderDir = path.join(os.tmpdir(), 'agent-browser', 'recordings');
    if (existsSync(recorderDir)) {
      const files = readdirSync(recorderDir)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map((f) => ({
          name: f,
          time: statSync(path.join(recorderDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        const recentPath = path.join(recorderDir, files[0].name);
        return successResponse(command.id, {
          yaml: '',
          steps: 0,
          path: recentPath,
          note: 'No active recording session. Returning most recent recording file.',
        });
      }
    }

    return successResponse(command.id, {
      yaml: '',
      steps: 0,
      note: 'No active recording session. Use "recorder start" to begin recording.',
    });
  }

  let outputPath: string;
  let isDefaultPath = false;
  if (command.output) {
    outputPath = path.resolve(command.output);
  } else {
    const recorderDir = path.join(os.tmpdir(), 'agent-browser', 'recordings');
    if (!existsSync(recorderDir)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(recorderDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = path.join(recorderDir, `session-${timestamp}.yaml`);
    isDefaultPath = true;
  }

  writeFileSync(outputPath, result.yaml, 'utf-8');

  return successResponse(command.id, {
    yaml: result.yaml,
    steps: result.steps,
    path: outputPath,
    tip: isDefaultPath ? `Full YAML saved to: ${outputPath}` : undefined,
  });
}

export async function handleRecorderStatus(
  command: RecorderStatusCommand,
  browser: BrowserManager
): Promise<Response<{ isRecording: boolean; steps: number; sessionId?: string }>> {
  const result = browser.getRecorderStatus();
  return successResponse(command.id, result);
}

async function handleRecorderReplay(
  command: RecorderReplayCommand,
  browser: BrowserManager
): Promise<Response> {
  const fs = await import('node:fs');
  const pathModule = await import('node:path');

  let yamlPath = command.path;
  if (!yamlPath) {
    const recorderDir = pathModule.join(os.tmpdir(), 'agent-browser', 'recordings');
    if (!fs.existsSync(recorderDir)) {
      return errorResponse(command.id, 'No recordings found. Please record first.');
    }
    const files = fs
      .readdirSync(recorderDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => ({
        name: f,
        time: fs.statSync(pathModule.join(recorderDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      return errorResponse(command.id, 'No recordings found. Please record first.');
    }
    yamlPath = pathModule.join(recorderDir, files[0].name);
  }

  if (!fs.existsSync(yamlPath)) {
    return errorResponse(command.id, `Recording file not found: ${yamlPath}`);
  }
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');

  const cliCommands: string[] = [];

  const lines = yamlContent.split('\n');
  let inSteps = false;
  const parsedSteps: Record<string, string> = {};

  for (const line of lines) {
    if (/^steps:/.test(line.trim())) {
      inSteps = true;
      continue;
    }
    if (inSteps && /^-\s+id:/.test(line.trim())) {
      const idMatch = line.match(/id:\s*(.+)/);
      if (idMatch) parsedSteps.currentId = idMatch[1].trim();
    }
    if (inSteps && /^\s+action:\s*(.+)/.test(line)) {
      // End of steps section when we hit a non-step line
    }
    if (inSteps && !/^\s/.test(line) && !/^$/.test(line) && !/^steps:/.test(line.trim())) {
      inSteps = false;
    }
  }

  let inCliSection = false;
  for (const line of lines) {
    if (line.includes('# CLI Commands')) {
      inCliSection = true;
      continue;
    }
    if (inCliSection && (line.startsWith('agent-browser ') || line.startsWith('AGENT_BROWSER_'))) {
      cliCommands.push(line.trim());
    }
  }

  if (cliCommands.length === 0) {
    return errorResponse(
      command.id,
      'No CLI commands found in recording. Please re-record with the new version.'
    );
  }

  const envLines = cliCommands.filter((l) => l.startsWith('AGENT_BROWSER_'));
  const cmdLines = cliCommands.filter((l) => l.startsWith('agent-browser '));

  const originalEnv: Record<string, string | undefined> = {};
  for (const envLine of envLines) {
    const eqIdx = envLine.indexOf('=');
    if (eqIdx > 0) {
      const key = envLine.substring(0, eqIdx);
      let value = envLine.substring(eqIdx + 1);
      const spaceIdx = value.indexOf(' ');
      if (spaceIdx > 0) {
        value = value.substring(0, spaceIdx);
      }
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
  }

  function parseCommandLine(line: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) {
      parts.push(current);
    }
    return parts;
  }

  const currentSession = process.env.AGENT_BROWSER_SESSION || 'default';

  const results: Array<{ command: string; success: boolean; error?: string }> = [];

  for (const cmdLine of cmdLines) {
    try {
      let parts = parseCommandLine(cmdLine);

      if (parts.length > 0 && parts[0] === 'agent-browser') {
        parts = parts.slice(1);
      }

      if (parts.length === 0) {
        results.push({ command: cmdLine, success: true });
        continue;
      }

      const { parseCommand } = await import('../cli/commands.js');
      const { parseFlags } = await import('../cli/flags.js');

      const flags = parseFlags([]);
      if (currentSession !== 'default') {
        flags.session = currentSession;
      }
      const parsedCmd = parseCommand(parts, flags);

      const wasRecording = browser.isRecordingSession();
      if (wasRecording) {
        browser.pauseRecording();
      }

      const COMMAND_TIMEOUT_MS = 5000;
      const { executeCommand } = await import('./index.js');
      const result = (await Promise.race([
        executeCommand(parsedCmd, browser),
        new Promise<Response>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS}ms`)),
            COMMAND_TIMEOUT_MS
          )
        ),
      ])) as Response;

      if (wasRecording) {
        browser.resumeRecording();
      }

      results.push({ command: cmdLine, success: result.success });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      results.push({ command: cmdLine, success: false, error: errorMessage });
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return successResponse(command.id, {
    replayed: true,
    file: yamlPath,
    totalCommands: cmdLines.length,
    successCount,
    failCount,
    results: results.slice(0, 20),
  });
}

export { handleRecorderReplay };
