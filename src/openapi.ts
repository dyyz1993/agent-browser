/**
 * OpenAPI 3.0 specification for agent-browser HTTP API
 */

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
  };
}

export const openApiSpec: OpenApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'agent-browser API',
    version: '0.11.0',
    description:
      'Browser automation HTTP API for AI agents. Execute browser commands via REST API.',
  },
  servers: [{ url: 'http://localhost:5005', description: 'Local development server' }],
  paths: {
    '/api/command': {
      post: {
        summary: 'Execute a browser command',
        description:
          'Execute a single browser automation command. All commands require an id and action field.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Command' },
              examples: {
                navigate: {
                  summary: 'Navigate to URL',
                  value: { id: '1', action: 'navigate', url: 'https://example.com' },
                },
                click: {
                  summary: 'Click element',
                  value: { id: '2', action: 'click', selector: '@e1' },
                },
                snapshot: {
                  summary: 'Take snapshot',
                  value: { id: '3', action: 'snapshot', interactive: true },
                },
                fill: {
                  summary: 'Fill form field',
                  value: { id: '4', action: 'fill', selector: '@e2', value: 'hello@example.com' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Command executed successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Response' },
              },
            },
          },
          '400': {
            description: 'Invalid command format',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Returns server status and active sessions',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    sessions: { type: 'array', items: { type: 'string' } },
                    clients: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/sessions': {
      get: {
        summary: 'List active sessions',
        responses: {
          '200': {
            description: 'List of active sessions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessions: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/openapi.json': {
      get: {
        summary: 'OpenAPI specification',
        description: 'Returns the OpenAPI 3.0 specification for this API',
        responses: {
          '200': {
            description: 'OpenAPI JSON specification',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/api/docs': {
      get: {
        summary: 'Swagger UI',
        description: 'Interactive API documentation (Swagger UI)',
        responses: {
          '200': {
            description: 'Swagger UI HTML page',
            content: {
              'text/html': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/api/help': {
      get: {
        summary: 'API Help',
        description: 'Returns available endpoints, actions, and quick reference for the HTTP API',
        responses: {
          '200': {
            description: 'API help information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    version: { type: 'string' },
                    endpoints: { type: 'object' },
                    availableActions: { type: 'array', items: { type: 'object' } },
                    docs: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Command: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: {
            type: 'string',
            description: 'Unique request identifier',
          },
          action: {
            type: 'string',
            description: 'Command action type',
            enum: [
              'launch',
              'navigate',
              'click',
              'type',
              'fill',
              'check',
              'uncheck',
              'upload',
              'dblclick',
              'focus',
              'drag',
              'frame',
              'mainframe',
              'press',
              'screenshot',
              'snapshot',
              'evaluate',
              'wait',
              'scroll',
              'select',
              'hover',
              'content',
              'close',
              'back',
              'forward',
              'reload',
              'url',
              'title',
              'cookies_get',
              'cookies_set',
              'cookies_clear',
              'storage_get',
              'storage_set',
              'storage_clear',
              'dialog',
              'pdf',
              'route',
              'unroute',
              'requests',
              'download',
              'geolocation',
              'permissions',
              'viewport',
              'useragent',
              'device',
              'recording_start',
              'recording_stop',
              'recording_restart',
              'recorder_start',
              'recorder_stop',
              'recorder_status',
              'recorder_replay',
              'trace_start',
              'trace_stop',
              'state_save',
              'state_load',
              'console',
              'errors',
              'keyboard',
              'wheel',
              'tap',
              'clipboard',
              'highlight',
              'clear',
              'selectall',
              'tab_new',
              'tab_list',
              'tab_switch',
              'tab_close',
              'window_new',
            ],
          },
        },
        oneOf: [
          { $ref: '#/components/schemas/NavigateCommand' },
          { $ref: '#/components/schemas/ClickCommand' },
          { $ref: '#/components/schemas/FillCommand' },
          { $ref: '#/components/schemas/SnapshotCommand' },
          { $ref: '#/components/schemas/EvaluateCommand' },
          { $ref: '#/components/schemas/WaitCommand' },
          { $ref: '#/components/schemas/ScreenshotCommand' },
        ],
      },
      NavigateCommand: {
        type: 'object',
        required: ['id', 'action', 'url'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['navigate'] },
          url: { type: 'string', description: 'URL to navigate to' },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'Wait condition',
          },
        },
      },
      ClickCommand: {
        type: 'object',
        required: ['id', 'action', 'selector'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['click'] },
          selector: { type: 'string', description: 'Element selector (@ref or CSS)' },
          button: { type: 'string', enum: ['left', 'right', 'middle'] },
          clickCount: { type: 'integer', description: 'Number of clicks' },
          delay: { type: 'number', description: 'Delay between mousedown and mouseup' },
          inFrame: { type: 'string', description: 'Frame path for iframe operations' },
        },
      },
      FillCommand: {
        type: 'object',
        required: ['id', 'action', 'selector', 'value'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['fill'] },
          selector: { type: 'string', description: 'Element selector' },
          value: { type: 'string', description: 'Value to fill' },
          inFrame: { type: 'string', description: 'Frame path for iframe operations' },
        },
      },
      SnapshotCommand: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['snapshot'] },
          interactive: { type: 'boolean', description: 'Only interactive elements' },
          maxDepth: { type: 'integer', description: 'Maximum tree depth' },
          compact: { type: 'boolean', description: 'Compact output' },
          selector: { type: 'string', description: 'Scope to CSS selector' },
          cursor: { type: 'boolean', description: 'Include cursor-interactive elements' },
          path: { type: 'boolean', description: 'Include xpath and cssPath' },
          attrs: { type: 'boolean', description: 'Include element attributes' },
        },
      },
      EvaluateCommand: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['evaluate'] },
          script: { type: 'string', description: 'JavaScript to execute' },
          file: { type: 'string', description: 'Path to script file' },
        },
      },
      WaitCommand: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['wait'] },
          selector: { type: 'string', description: 'Element to wait for' },
          timeout: { type: 'integer', description: 'Timeout in ms' },
          state: { type: 'string', enum: ['attached', 'detached', 'visible', 'hidden'] },
        },
      },
      ScreenshotCommand: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['screenshot'] },
          path: { type: 'string', description: 'Output file path' },
          fullPage: { type: 'boolean', description: 'Capture full page' },
          selector: { type: 'string', description: 'Element to capture' },
          format: { type: 'string', enum: ['png', 'jpeg'] },
          quality: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      Response: {
        type: 'object',
        required: ['id', 'success'],
        properties: {
          id: { type: 'string', description: 'Request ID' },
          success: { type: 'boolean', description: 'Whether command succeeded' },
          data: { type: 'object', description: 'Response data' },
          tips: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            description: 'Optional tips',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['id', 'success', 'error'],
        properties: {
          id: { type: 'string' },
          success: { type: 'boolean', example: false },
          error: { type: 'string', description: 'Error message' },
        },
      },
    },
  },
};

export default openApiSpec;
