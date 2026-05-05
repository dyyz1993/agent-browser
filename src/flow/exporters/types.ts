import type { FlowStep } from '../types.js';

export interface ScriptExporter {
  format: string;
  extension: string;
  export(flow: FlowStep[], options?: ExportOptions): string;
}

export interface ExportOptions {
  baseUrl?: string;
  variables?: Record<string, string>;
  headless?: boolean;
  timeout?: number;
}
