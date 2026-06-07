import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildViewerScript } from './viewer-script.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getViewerHtml(): string {
  const viewerDir = path.join(__dirname, 'viewer');
  const template = fs.readFileSync(path.join(viewerDir, 'index.html'), 'utf-8');
  const styles = fs.readFileSync(path.join(viewerDir, 'styles.css'), 'utf-8');
  const script = buildViewerScript();

  return template
    .replace('{{STYLES}}', styles.trimEnd())
    .replace('{{SCRIPT}}', script);
}
