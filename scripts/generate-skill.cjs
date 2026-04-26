#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', 'skills', 'agent-browser');
const REFS_DIR = path.join(SKILL_DIR, 'references');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function getSections(helpText) {
  if (!helpText) return {};
  const sections = {};
  let current = null;
  for (const line of helpText.split('\n')) {
    const headerMatch = line.match(/^([A-Z][A-Za-z &/\-]+):\s*$/);
    if (headerMatch) {
      current = headerMatch[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}

function extractCommands(sections) {
  const cmds = [];
  for (const [name, lines] of Object.entries(sections)) {
    for (const line of lines) {
      const m = line.match(/^\s{2}(\S+)\s+(.*)/);
      if (m) cmds.push({ group: name, name: m[1], desc: m[2].trim() });
    }
  }
  return cmds;
}

console.log('Scanning agent-browser CLI...');

const helpText = run('agent-browser --help 2>&1');
if (!helpText) {
  console.error('ERROR: agent-browser not found or failed.');
  process.exit(1);
}

const sections = getSections(helpText);
const commands = extractCommands(sections);

console.log(`Found ${Object.keys(sections).length} sections, ${commands.length} commands`);

const existingRefs = fs.readdirSync(REFS_DIR)
  .filter(f => f.endsWith('.md'))
  .map(f => f.replace('.md', ''));

console.log(`Existing reference docs: ${existingRefs.join(', ')}`);

const subSkills = [
  {
    title: 'Page Navigation & Interaction',
    match: c => ['Core Commands', 'Navigation'].includes(c.group) &&
      !['screenshot', 'pdf', 'snapshot', 'eval', 'connect', 'close'].includes(c.name),
    summary: 'open, click, fill, type, press, hover, drag, scroll, check/uncheck, select',
    ref: null,
  },
  {
    title: 'Snapshot & Element Inspection',
    match: c => c.name === 'snapshot' || c.group === 'Get Info' || c.group === 'Check State',
    summary: 'snapshot -i (refs), get text/url/title/box/styles, is visible/enabled/checked',
    ref: 'snapshot-refs',
  },
  {
    title: 'Finding Elements',
    match: c => c.group === 'Find Elements',
    summary: 'find by role, text, label, placeholder, testid, nth',
    ref: 'commands',
  },
  {
    title: 'Data Extraction',
    match: c => c.name === 'eval',
    summary: 'JS evaluation, DOM scraping, API interception, infinite scroll',
    ref: 'data-extraction',
  },
  {
    title: 'Network Control',
    match: c => c.group === 'Network',
    summary: 'request monitoring, API mocking, URL blocking',
    ref: 'network-monitoring',
  },
  {
    title: 'Session & State',
    match: c => ['Sessions', 'Storage', 'Tabs'].includes(c.group) ||
      ['connect', 'close'].includes(c.name),
    summary: 'named sessions, state save/load, cookies, tabs, parallel sessions',
    ref: 'session-management',
  },
  {
    title: 'Authentication',
    match: () => false,
    summary: 'login flows, OAuth, 2FA, state reuse, cookie persistence',
    ref: 'authentication',
  },
  {
    title: 'Recording & Replay',
    match: c => c.group === 'Debug' && (c.name.startsWith('record') || c.name.startsWith('recorder')),
    summary: 'step recorder (YAML), video recording (WebM), trace',
    ref: 'recorder',
  },
  {
    title: 'Visual Remote Control (Viewer)',
    match: c => c.group === 'Remote' && c.name === 'viewer',
    summary: 'real-time frame streaming, element crop mode, WebSocket viewer',
    ref: 'viewer-mode',
  },
  {
    title: 'Mobile Remote Control',
    match: () => false,
    summary: 'touchpad gestures, input panel, IME/CJK, DeviceMode auto-switch',
    ref: 'mobile-viewer',
  },
  {
    title: 'iOS Simulator (Appium)',
    match: () => false,
    summary: 'native iOS automation via Xcode + Appium',
    ref: null,
  },
  {
    title: 'Cloud Browser Providers',
    match: () => false,
    summary: 'browserbase, kernel, browseruse',
    ref: null,
  },
  {
    title: 'Proxy & Network Config',
    match: c => c.name === 'install',
    summary: 'HTTP/SOCKS5 proxy, geo-testing, rotating proxies',
    ref: 'proxy-support',
  },
];

for (const sk of subSkills) {
  const seen = new Set();
  sk.matched = commands.filter(sk.match).filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

const envSection = sections['Environment'] || [];
const envVars = envSection
  .map(l => l.match(/^\s+(\S+)\s+(.*)/))
  .filter(Boolean)
  .map(m => ({ name: m[1], desc: m[2].trim() }));

const optSection = sections['Options'] || [];
const opts = optSection
  .map(l => {
    const m = l.match(/^\s+(-{1,2}[\w-]+(?:,\s*-{1,2}[\w-]+)?)\s+<([^>]+)>\s+(.*)/);
    if (m) return { flag: `${m[1]} <${m[2]}>`, desc: m[3].trim() };
    const m2 = l.match(/^\s+(-{1,2}[\w-]+(?:,\s*-{1,2}[\w-]+)?)\s+(.*)/);
    if (m2) return { flag: m2[1], desc: m2[2].trim() };
    return null;
  })
  .filter(Boolean);

console.log(`Parsed ${envVars.length} env vars, ${opts.length} flags`);

const refTableRows = [
  { file: 'commands.md', label: 'Complete Command Reference', desc: 'All commands with options and examples' },
  { file: 'snapshot-refs.md', label: 'Snapshot & Refs', desc: 'Ref lifecycle, invalidation rules, shell scripts' },
  { file: 'data-extraction.md', label: 'Data Extraction', desc: 'DOM scraping, JS eval, API interception, infinite scroll' },
  { file: 'session-management.md', label: 'Session & State', desc: 'Parallel sessions, state persistence, concurrent scraping' },
  { file: 'authentication.md', label: 'Authentication', desc: 'Login flows, OAuth, 2FA, state reuse' },
  { file: 'network-monitoring.md', label: 'Network Control', desc: 'Request monitoring, API mocking, URL blocking' },
  { file: 'recorder.md', label: 'Recording & Replay', desc: 'Step recorder, video recording, trace' },
  { file: 'proxy-support.md', label: 'Proxy Config', desc: 'HTTP/SOCKS5 proxy, geo-testing, rotating proxies' },
  { file: 'viewer-mode.md', label: 'Viewer / Streaming', desc: 'Frame streaming, element crop, architecture' },
  { file: 'mobile-viewer.md', label: 'Mobile Remote Control', desc: 'Touchpad, input panel, IME/CJK, DeviceMode' },
  { file: 'video-recording.md', label: 'Video Recording', desc: 'WebM video capture for debugging' },
];

const output = [];
const w = (s = '') => output.push(s);

w('---');
w('name: agent-browser');
w('description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, viewer/streaming mode, mobile remote control, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", "view remote browser", "mobile browsing", or any task requiring programmatic web interaction.');
w('allowed-tools: Bash(agent-browser:*)');
w('---');
w();
w('# Browser Automation with agent-browser');
w();
w('Fast CLI for browser automation. Works headlessly by default, supports named sessions, proxy, and remote streaming.');
w();
w('## Browser Setup (macOS)');
w();
w('Set the browser path to avoid Playwright downloading Chromium:');
w();
w('```bash');
w('export AGENT_BROWSER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium');
w('```');
w();
w('Or per-command: `agent-browser --executable-path /Applications/Chromium.app/Contents/MacOS/Chromium open <url>`');
w();
w('Verify: `agent-browser config`');
w();
w('## Quick Start');
w();
w('```bash');
w('agent-browser open https://example.com');
w('agent-browser snapshot -i                        # Get refs: @e1, @e2, ...');
w('agent-browser fill @e1 "user@example.com"        # Interact via refs');
w('agent-browser click @e2');
w('agent-browser snapshot -i                        # Re-snapshot after page change');
w('```');
w();
w('## Discovering Commands');
w();
w('```bash');
w('agent-browser --help                             # All commands & options');
w('agent-browser snapshot --help                    # Command-specific help');
w('agent-browser config                             # Current config & env vars');
w('```');
w();
w('The CLI is self-documenting. When unsure about a command, run `--help` first.');
w();
w('## Capabilities');
w();
w('| Area | Key Commands | Deep Dive |');
w('|------|-------------|-----------|');

for (const sk of subSkills) {
  const cmdList = sk.matched.length > 0
    ? sk.matched.slice(0, 5).map(c => `\`${c.name}\``).join(', ')
    : sk.summary.split(',').slice(0, 3).map(s => `\`${s.trim()}\``).join(', ');
  const refLink = sk.ref
    ? `[${sk.ref}](references/${sk.ref}.md)`
    : sk.title;
  w(`| ${sk.title} | ${cmdList} | ${refLink} |`);
}

w();
w('### Core Workflow Pattern');
w();
w('1. `open <url>` → navigate');
w('2. `snapshot -i` → get element refs (`@e1`, `@e2`, ...)');
w('3. `fill` / `click` / `select` → interact using refs');
w('4. Re-`snapshot` after any page change (refs are invalidated)');
w();
w('### Refs');
w();
w('Refs (`@e1`, `@e2`) are **short-lived** — invalidated by any page change. Always re-snapshot after navigation or DOM mutations. See [snapshot-refs.md](references/snapshot-refs.md).');
w();
w('### Iframes');
w();
w('```bash');
w('agent-browser snapshot --in-frame "#my-iframe"           # Single iframe');
w('agent-browser click @e1 --in-frame "#outer/inner"        # Nested');
w('```');
w();
w('### Semantic Locators (No Refs Needed)');
w();
w('```bash');
w('agent-browser find text "Sign In" click');
w('agent-browser find label "Email" fill "user@test.com"');
w('agent-browser find role button click --name "Submit"');
w('```');
w();
w('## Key Flags');
w();
for (const opt of opts) {
  w(`- \`${opt.flag}\` — ${opt.desc}`);
}
w();
w('## Environment Variables');
w();
for (const ev of envVars) {
  w(`- \`${ev.name}\` — ${ev.desc}`);
}
w();
w('## Reference Docs');
w();
w('| Doc | Content |');
w('|-----|---------|');
for (const r of refTableRows) {
  w(`| [${r.label}](references/${r.file}) | ${r.desc} |`);
}
w();

const outPath = path.join(SKILL_DIR, 'SKILL.md');
fs.writeFileSync(outPath, output.join('\n'));
console.log(`\nGenerated: ${outPath} (${output.length} lines)`);
console.log('\nSummary:');
for (const sk of subSkills) {
  console.log(`  ${sk.title}: ${sk.matched.length} commands -> ${sk.ref || '(inline)'}`);
}
