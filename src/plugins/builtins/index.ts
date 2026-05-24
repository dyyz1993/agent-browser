import type { AgentBrowserPlugin } from '../types.js';
import { builtinInstaller } from '../installers/builtin-installer.js';
import { waitForNetworkHandler } from './wait-for-network.js';
import { screenshotDiffHandler } from './screenshot-diff.js';

const utilsPlugin: AgentBrowserPlugin = {
  meta: {
    name: 'utils',
    version: '1.0.0',
    description: 'Built-in utility commands for browser automation',
    commands: {
      'wait-for-network': {
        description: 'Wait for network to become idle',
        usage: 'wait-for-network [--timeout <ms>]',
        options: {
          '--timeout': 'Maximum wait time in milliseconds (default: 30000)',
        },
      },
      'screenshot-diff': {
        description: 'Take a screenshot and compare with a baseline image',
        usage: 'screenshot-diff --baseline <path> [--output <path>] [--threshold <number>]',
        options: {
          '--baseline': 'Path to baseline image file',
          '--output': 'Path to write diff screenshot (default: diff-result.png)',
          '--threshold': 'Pixel difference threshold (default: 0.1)',
        },
      },
    },
  },
  handlers: {
    'wait-for-network': waitForNetworkHandler,
    'screenshot-diff': screenshotDiffHandler,
  },
};

export function registerBuiltins(): void {
  builtinInstaller.register('utils', async () => utilsPlugin);
}

registerBuiltins();
