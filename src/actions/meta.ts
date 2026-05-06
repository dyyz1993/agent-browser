import type { BrowserManager } from '../browser/index.js';
import type { Command, Response } from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';
import { getViewerUrl, getViewerWsUrl, getViewerPort, getMessageBridgeUrl } from '../rc-config.js';
import { getInstanceId, getSession } from '../daemon.js';
import { MessageBridge } from '../message-bridge.js';
import { loadConfig, getEffectiveValue, getExecutablePath } from '../rc-config.js';
import { getHumanConfigFromEnv } from '../human-mouse.js';
import type { HumanConfig } from '../human-mouse.js';
import type {
  ViewerData,
  AskData,
  SelectorForCommand,
  SelectorsOfCommand,
  ValidateCommand,
} from '../types.js';

export async function handleViewer(
  command: Command & { action: 'viewer' },
  _browser: BrowserManager
): Promise<Response<ViewerData>> {
  const instanceId = getInstanceId();

  return successResponse(command.id, {
    url: getViewerUrl(instanceId),
    wsUrl: getViewerWsUrl(instanceId),
    streamPort: getViewerPort(),
  });
}

export async function handleAsk(
  command: Command & { action: 'ask'; question: string },
  _browser: BrowserManager
): Promise<Response<AskData>> {
  const session = getSession();
  const bridge = new MessageBridge(getMessageBridgeUrl());

  try {
    const answer = await bridge.ask(command.question, session);
    return successResponse(command.id, { answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command.id, `Failed to ask question: ${message}`) as Response<AskData>;
  }
}

interface ConfigData {
  config: {
    session: string;
    executablePath: string | null;
    extensions: string | null;
    profile: string | null;
    state: string | null;
    proxy: string | null;
    proxyBypass: string | null;
    args: string | null;
    userAgent: string | null;
    provider: string | null;
    allowFileAccess: boolean;
    streamPort: number;
    headed: boolean;
    human: HumanConfig;
  };
  output?: string;
}

export function handleConfig(
  command: Command & { action: 'config'; json?: boolean }
): Response<ConfigData> {
  const humanConfig = getHumanConfigFromEnv();
  const rcConfig = loadConfig();

  const config = {
    session: process.env.AGENT_BROWSER_SESSION || 'default',
    executablePath: getExecutablePath() || null,
    extensions: process.env.AGENT_BROWSER_EXTENSIONS || null,
    profile: process.env.AGENT_BROWSER_PROFILE || null,
    state: process.env.AGENT_BROWSER_STATE || null,
    proxy: process.env.AGENT_BROWSER_PROXY || null,
    proxyBypass: process.env.AGENT_BROWSER_PROXY_BYPASS || null,
    args: process.env.AGENT_BROWSER_ARGS || null,
    userAgent: process.env.AGENT_BROWSER_USER_AGENT || null,
    provider: process.env.AGENT_BROWSER_PROVIDER || null,
    allowFileAccess: process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1',
    streamPort: getViewerPort(),
    headed: process.env.AGENT_BROWSER_HEADED === '1',
    human: humanConfig,
  };

  if (command.json) {
    return successResponse(command.id, { config, rc: rcConfig });
  }

  const viewerHost = getEffectiveValue('viewer.host');
  const bridgeUrl = getEffectiveValue('messageBridge.url');
  const msgProxy = getEffectiveValue('messageProxy.url');

  const lines: string[] = [
    'Agent Browser Configuration',
    '===========================',
    '',
    'Session & Browser:',
    `  executablePath                 ${config.executablePath || '(not set)'}`,
    `  AGENT_BROWSER_PROVIDER         ${config.provider || '(not set)'}`,
    `  AGENT_BROWSER_HEADED           ${config.headed ? 'true' : 'false (default)'}`,
    '',
    'Viewer & Stream:',
    `  viewer.host                    ${viewerHost || '(not set, using http://localhost)'}`,
    `  viewer.port                    ${config.streamPort}`,
    '',
    'Message Bridge (ask command):',
    `  messageBridge.url              ${bridgeUrl || '(not set, using default)'}`,
    `  messageProxy.url               ${msgProxy || '(not set)'}`,
    '',
    'Browser Options:',
    `  AGENT_BROWSER_PROFILE          ${config.profile || '(not set)'}`,
    `  AGENT_BROWSER_EXTENSIONS       ${config.extensions || '(not set)'}`,
    `  AGENT_BROWSER_ARGS             ${config.args || '(not set)'}`,
    `  AGENT_BROWSER_USER_AGENT       ${config.userAgent || '(not set)'}`,
    `  AGENT_BROWSER_PROXY            ${config.proxy || '(not set)'}`,
    `  AGENT_BROWSER_ALLOW_FILE_ACCESS ${config.allowFileAccess ? 'true' : 'false (default)'}`,
    '',
    'Human Mode (runtime):',
    `  AGENT_BROWSER_HUMAN            ${
      humanConfig.enabled ? humanConfig.pathType + ' \u2713' : '(disabled)'
    }`,
    '',
    `Persistent config: ~/.agent-browser/config.json`,
    'Run "agent-browser config set <key> <value>" to persist settings.',
    'Run "agent-browser config list" to see configurable keys.',
  ];

  return successResponse(command.id, { config, output: lines.join('\n') });
}

export async function handleHistory(
  command: Command & { action: 'history'; clear?: boolean; filter?: string },
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearHistory();
    return successResponse(command.id, { cleared: true });
  }
  const history = browser.getHistory(command.filter);
  return successResponse(command.id, { history });
}

export async function handleSelectorFor(
  command: SelectorForCommand,
  browser: BrowserManager
): Promise<Response> {
  const store = browser.getSnapshotStore();
  const colonIndex = command.target.indexOf(':');
  if (colonIndex === -1) {
    return errorResponse(
      command.id,
      `Invalid target format: "${command.target}". Expected "snapshotId:refOrIndex" (e.g., "snap_3:@e1" or "snap_3:1").`
    );
  }
  const snapshotId = command.target.substring(0, colonIndex);
  const refOrIndex = command.target.substring(colonIndex + 1);

  await browser.ensureSelectorsGenerated(snapshotId);

  const element = store.getElement(snapshotId, refOrIndex);
  if (!element) {
    return errorResponse(
      command.id,
      `Element not found: "${refOrIndex}" in snapshot "${snapshotId}". Run 'snapshot' to get fresh snapshot data.`
    );
  }

  return successResponse(command.id, {
    snapshotId,
    ref: element.ref,
    index: element.index,
    role: element.role,
    name: element.name,
    cssSelector: element.cssSelector,
    xpath: element.xpath,
  });
}

export async function handleSelectorsOf(
  command: SelectorsOfCommand,
  browser: BrowserManager
): Promise<Response> {
  const store = browser.getSnapshotStore();

  await browser.ensureSelectorsGenerated(command.target);

  const elements = store.getElements(command.target);
  if (!elements) {
    return errorResponse(
      command.id,
      `Snapshot "${command.target}" not found. Run 'snapshot' to create a new snapshot.`
    );
  }

  return successResponse(command.id, {
    snapshotId: command.target,
    elements: elements.map((el) => ({
      ref: el.ref,
      index: el.index,
      role: el.role,
      name: el.name,
      cssSelector: el.cssSelector,
      xpath: el.xpath,
    })),
  });
}

export async function handleValidate(
  command: ValidateCommand,
  browser: BrowserManager
): Promise<Response> {
  const store = browser.getSnapshotStore();

  await browser.ensureSelectorsGenerated(command.target);

  const elements = store.getElements(command.target);
  if (!elements) {
    return errorResponse(
      command.id,
      `Snapshot "${command.target}" not found. Run 'snapshot' to create a new snapshot.`
    );
  }

  const page = browser.getPage();
  const selectors = elements.map((el) => el.cssSelector);
  const matchCounts = await page.evaluate((sels: string[]) => {
    return sels.map((sel) => {
      try {
        return document.querySelectorAll(sel).length;
      } catch {
        return -1;
      }
    });
  }, selectors);

  const results = elements.map((el, i) => {
    const matchCount = matchCounts[i];
    let status: string;
    if (matchCount === -1) {
      status = 'invalid_selector';
    } else if (matchCount === 0) {
      status = 'not_found';
    } else if (matchCount === 1) {
      status = 'valid';
    } else {
      status = 'ambiguous';
    }
    return {
      ref: el.ref,
      index: el.index,
      cssSelector: el.cssSelector,
      status,
      matchCount,
    };
  });

  const failedCount = results.filter(
    (r) => r.status === 'not_found' || r.status === 'invalid_selector'
  ).length;

  let newSnapshotId: string | undefined;
  if (failedCount > 0) {
    const newSnapshot = await browser.getSnapshot({ interactive: true });
    newSnapshotId = newSnapshot.snapshotId;
  }

  return successResponse(command.id, {
    snapshotId: command.target,
    results,
    newSnapshotId,
  });
}
