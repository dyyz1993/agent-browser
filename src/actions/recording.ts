import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
  RecordingStartCommand,
  RecordingStartData,
  RecordingStopCommand,
  RecordingStopData,
  RecordingRestartCommand,
  RecordingRestartData,
} from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleRecordingStart(
  command: RecordingStartCommand,
  browser: BrowserManager
): Promise<Response<RecordingStartData>> {
  await browser.startRecording(command.path, command.url);
  return successResponse(command.id, {
    started: true,
    path: command.path,
  });
}

export async function handleRecordingStop(
  command: RecordingStopCommand,
  browser: BrowserManager
): Promise<Response<RecordingStopData>> {
  const result = await browser.stopRecording();
  return successResponse(command.id, result);
}

export async function handleRecordingRestart(
  command: RecordingRestartCommand,
  browser: BrowserManager
): Promise<Response<RecordingRestartData>> {
  const result = await browser.restartRecording(command.path, command.url);
  return successResponse(command.id, {
    started: true,
    path: command.path,
    previousPath: result.previousPath,
    stopped: result.stopped,
  });
}
