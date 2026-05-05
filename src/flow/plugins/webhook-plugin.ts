import type { FlowPlugin } from '../plugin-system.js';

export function createWebhookPlugin(options: {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}): FlowPlugin {
  return {
    name: 'webhook',
    version: '1.0.0',
    description: 'Sends extracted data to a webhook endpoint',

    dataHandlers: [
      async (data) => {
        const { fetch } = await import('undici');
        const method = options.method || 'POST';
        const headers = {
          'Content-Type': 'application/json',
          ...options.headers,
        };

        await fetch(options.url, {
          method,
          headers,
          body: JSON.stringify(data),
        });
        console.log(`[webhook] Sent data to ${options.url}`);
      },
    ],
  };
}
