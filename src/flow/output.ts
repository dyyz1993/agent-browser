import { writeFileSync } from 'fs';
import { resolve } from 'path';

export type OutputFormat = 'json' | 'csv' | 'jsonl' | 'yaml';

export interface OutputConfig {
  format: OutputFormat;
  filePath?: string;
  pretty?: boolean;
  fields?: string[];
  dedupField?: string;
}

export function formatOutput(data: unknown, config: OutputConfig): string {
  const items = Array.isArray(data) ? data : [data];

  const deduped = config.dedupField ? deduplicate(items, config.dedupField) : items;

  const filtered = config.fields
    ? deduped.map((item) => pickFields(item, config.fields!))
    : deduped;

  switch (config.format) {
    case 'json':
      return JSON.stringify(filtered, null, config.pretty ? 2 : 0);
    case 'jsonl':
      return filtered.map((item) => JSON.stringify(item)).join('\n');
    case 'csv':
      return toCSV(filtered, config.fields);
    case 'yaml':
      return toYaml(filtered);
    default:
      return JSON.stringify(filtered, null, 2);
  }
}

export function writeOutput(data: unknown, config: OutputConfig): string {
  const content = formatOutput(data, config);

  if (config.filePath) {
    const filePath = resolve(config.filePath);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  return content;
}

function deduplicate(items: any[], field: string): any[] {
  const seen = new Set();
  return items.filter((item) => {
    const key = item[field];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickFields(item: any, fields: string[]): any {
  const result: any = {};
  for (const field of fields) {
    if (item[field] !== undefined) result[field] = item[field];
  }
  return result;
}

function toCSV(items: any[], fields?: string[]): string {
  if (items.length === 0) return '';

  const headers = fields || Object.keys(items[0]);
  const lines: string[] = [headers.join(',')];

  for (const item of items) {
    const row = headers.map((h) => {
      const val = String(item[h] ?? '');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

function toYaml(items: any[]): string {
  if (items.length === 0) return '[]\n';
  return items
    .map((item) => {
      const entries = Object.entries(item).map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
        if (typeof v === 'number' || typeof v === 'boolean') return `${k}: ${v}`;
        if (v === null || v === undefined) return `${k}: null`;
        return `${k}: ${JSON.stringify(v)}`;
      });
      return '- ' + entries.join('\n  ');
    })
    .join('\n');
}
