#!/usr/bin/env node

/**
 * Cross-platform CLI wrapper for agent-browser
 * 
 * This wrapper automatically selects the best CLI implementation:
 * 1. Native Rust CLI (if available) - faster, more robust
 * 2. TypeScript CLI (fallback) - full feature parity
 * 
 * You can force a specific CLI using:
 * - AGENT_BROWSER_CLI=native - Force native Rust CLI
 * - AGENT_BROWSER_CLI=typescript - Force TypeScript CLI
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { platform, arch } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function getNativeBinaryPath() {
  const platformKey = platform() + '-' + arch();
  const ext = platform() === 'win32' ? '.exe' : '';
  
  const candidates = [
    join(projectRoot, 'bin', 'agent-browser-' + platformKey + ext),
    join(projectRoot, 'bin', 'agent-browser' + ext),
  ];
  
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(candidates[i])) {
      return candidates[i];
    }
  }
  
  return null;
}

function getTypeScriptCliPath() {
  return join(projectRoot, 'dist', 'cli.js');
}

function runCli(cliPath, isNative) {
  const args = process.argv.slice(2);
  
  if (isNative) {
    const child = spawn(cliPath, args, {
      stdio: 'inherit',
      windowsHide: false,
    });

    child.on('error', function(err) {
      console.error('Error executing native CLI: ' + err.message);
      console.error('Falling back to TypeScript CLI...');
      runCli(getTypeScriptCliPath(), false);
    });

    child.on('close', function(code) {
      process.exit(code || 0);
    });
  } else {
    const child = spawn('node', [cliPath].concat(args), {
      stdio: 'inherit',
      windowsHide: false,
    });

    child.on('error', function(err) {
      console.error('Error executing CLI: ' + err.message);
      process.exit(1);
    });

    child.on('close', function(code) {
      process.exit(code || 0);
    });
  }
}

function main() {
  const cliPreference = (process.env.AGENT_BROWSER_CLI || '').toLowerCase();
  const nativePath = getNativeBinaryPath();
  const tsPath = getTypeScriptCliPath();

  if (cliPreference === 'typescript' || cliPreference === 'ts') {
    if (!existsSync(tsPath)) {
      console.error('Error: TypeScript CLI not found. Run "npm run build" first.');
      process.exit(1);
    }
    runCli(tsPath, false);
    return;
  }

  if (cliPreference === 'native' || cliPreference === 'rust') {
    if (!nativePath) {
      console.error('Error: Native CLI not found. Run "npm run build:native" first.');
      process.exit(1);
    }
    runCli(nativePath, true);
    return;
  }

  if (nativePath) {
    runCli(nativePath, true);
    return;
  }

  if (!existsSync(tsPath)) {
    console.error('Error: No CLI found.');
    console.error('');
    console.error('To use TypeScript CLI: Run "npm run build"');
    console.error('To use Native CLI: Run "npm run build:native"');
    process.exit(1);
  }

  runCli(tsPath, false);
}

main();
