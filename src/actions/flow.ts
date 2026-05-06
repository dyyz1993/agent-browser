import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserManager } from '../browser/index.js';
import type { AnyCommand, Response } from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';
import {
  parseYamlSiteFile,
  loadSitesFromDirectory,
  loadAllSites,
  findFlow,
  validateYamlFile,
} from '../flow/yaml-parser.js';
import { recorderToFlowFromFile, siteToYamlString } from '../flow/recorder-to-flow.js';
import { FlowExecutor } from '../flow/flow-executor.js';
import {
  PlaywrightExporter,
  PythonExporter,
  CypressExporter,
  SeleniumExporter,
} from '../flow/exporters/index.js';
import type { ScriptExporter } from '../flow/exporters/types.js';

interface FlowSubCommand {
  id: string;
  subcommand?: string;
  sitesDir?: string;
  siteFlow?: string;
  filePath?: string;
  recorderFile?: string;
  flowId?: string;
  description?: string;
  baseUrl?: string;
  siteName?: string;
  maxPaginateIterations?: number;
  outputFile?: string;
  params?: Record<string, string>;
  format?: string;
  headless?: boolean;
}

export async function handleFlowAction(
  command: AnyCommand,
  browser: BrowserManager
): Promise<Response> {
  const cmd = command as FlowSubCommand;
  const subcommand = cmd.subcommand as string | undefined;

  switch (subcommand) {
    case 'run':
      return await handleFlowRun(cmd, browser);
    case 'list':
      return handleFlowList(cmd);
    case 'show':
      return handleFlowShow(cmd);
    case 'validate':
      return handleFlowValidate(cmd);
    case 'from-recorder':
      return handleFlowFromRecorder(cmd);
    case 'export':
      return handleFlowExport(cmd);
    default:
      return errorResponse(command.id, `Unknown flow subcommand: ${subcommand}`);
  }
}

function handleFlowList(command: FlowSubCommand): Response {
  const sites = command.sitesDir ? loadSitesFromDirectory(command.sitesDir) : loadAllSites();

  const siteList: Array<{ name: string; description?: string; flows: string[] }> = [];
  for (const [name, site] of sites) {
    siteList.push({
      name,
      description: site.description,
      flows: Object.keys(site.flows),
    });
  }

  return successResponse(command.id, { sites: siteList });
}

function handleFlowShow(command: FlowSubCommand): Response {
  const sites = command.sitesDir ? loadSitesFromDirectory(command.sitesDir) : loadAllSites();

  const ref = command.siteFlow || '';
  const result = findFlow(sites, ref);
  if (!result) {
    return errorResponse(command.id, `Flow "${ref}" not found`);
  }

  return successResponse(command.id, {
    site: {
      name: result.site.name,
      description: result.site.description,
      baseUrl: result.site.baseUrl,
    },
    flow: result.flow,
  });
}

function handleFlowValidate(command: FlowSubCommand): Response {
  const filePath = command.filePath || '';
  if (!filePath) {
    return errorResponse(command.id, 'Missing file path for validate');
  }

  const result = validateYamlFile(filePath);
  return successResponse(command.id, result);
}

function handleFlowFromRecorder(command: FlowSubCommand): Response {
  const recorderFile = command.recorderFile;
  if (!recorderFile) {
    return errorResponse(command.id, 'Missing recorder YAML file path');
  }

  try {
    const result = recorderToFlowFromFile(recorderFile, {
      flowId: command.flowId,
      description: command.description,
      baseUrl: command.baseUrl,
      siteName: command.siteName,
      maxPaginateIterations: command.maxPaginateIterations,
    });

    const yamlString = siteToYamlString(result.site);

    if (command.outputFile) {
      writeFileSync(path.resolve(command.outputFile), yamlString, 'utf-8');
      return successResponse(command.id, {
        siteName: result.site.name,
        flowId: Object.keys(result.site.flows)[0],
        outputFile: command.outputFile,
        warnings: result.warnings,
      });
    }

    return successResponse(command.id, {
      siteName: result.site.name,
      flowId: Object.keys(result.site.flows)[0],
      yaml: yamlString,
      warnings: result.warnings,
    });
  } catch (e) {
    return errorResponse(
      command.id,
      `Failed to convert recorder YAML: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function handleFlowRun(command: FlowSubCommand, browser: BrowserManager): Promise<Response> {
  const ref = command.siteFlow || '';
  const sites = command.sitesDir ? loadSitesFromDirectory(command.sitesDir) : loadAllSites();

  const result = findFlow(sites, ref);
  if (!result) {
    return errorResponse(
      command.id,
      `Flow "${ref}" not found. Available sites: ${[...sites.keys()].join(', ')}`
    );
  }

  const typedParams: Record<string, unknown> = {};
  if (result.flow.params) {
    for (const param of result.flow.params) {
      const raw = command.params?.[param.name];
      if (raw !== undefined) {
        switch (param.type) {
          case 'number':
            typedParams[param.name] = Number(raw);
            break;
          case 'boolean':
            typedParams[param.name] = raw === 'true' || raw === '1';
            break;
          default:
            typedParams[param.name] = raw;
        }
      }
    }
  }

  const executor = new FlowExecutor(browser);
  const flowResult = await executor.execute(result.site, result.flowName, typedParams);

  return successResponse(command.id, flowResult);
}

function handleFlowExport(command: FlowSubCommand): Response {
  const filePath = command.filePath;
  if (!filePath) {
    return errorResponse(command.id, 'Missing file path for export');
  }

  let site: import('../flow/types.js').SiteDefinition;
  try {
    site = parseYamlSiteFile(filePath);
  } catch (e) {
    return errorResponse(
      command.id,
      `Failed to parse YAML file: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const flowEntries = Object.entries(site.flows);
  if (flowEntries.length === 0) {
    return errorResponse(command.id, 'No flows found in YAML file');
  }

  const flow = flowEntries[0][1];
  const format = (command.format as string) || 'playwright';

  const exporterMap: Record<string, ScriptExporter> = {
    playwright: new PlaywrightExporter(),
    python: new PythonExporter(),
    cypress: new CypressExporter(),
    selenium: new SeleniumExporter(),
  };

  const exporter = exporterMap[format];
  if (!exporter) {
    return errorResponse(
      command.id,
      `Unknown export format: "${format}". Available: ${Object.keys(exporterMap).join(', ')}`
    );
  }

  try {
    const script = exporter.export(flow.steps, {
      baseUrl: command.baseUrl || site.baseUrl,
      headless: command.headless,
    });

    return successResponse(command.id, {
      format: exporter.format,
      extension: exporter.extension,
      script,
    });
  } catch (e) {
    return errorResponse(
      command.id,
      `Export failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
