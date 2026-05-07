import type { FlowPlugin } from '../plugin-system.js';

export function createLoggingPlugin(options?: {
  logSteps?: boolean;
  logData?: boolean;
  logTiming?: boolean;
}): FlowPlugin {
  const logSteps = options?.logSteps !== false;
  const logData = options?.logData !== false;
  const logTiming = options?.logTiming !== false;

  const startTimes = new Map<string, number>();

  return {
    name: 'logging',
    version: '1.0.0',
    description: 'Logs flow execution events',

    hooks: {
      onFlowStart: async (_ctx, _step) => {
        console.log(`[Flow] Starting flow...`);
      },
      onStepStart: async (_ctx, step) => {
        if (logSteps) {
          console.log(`[Step] ${step.id} (${step.action}) starting...`);
          startTimes.set(step.id, Date.now());
        }
      },
      onStepEnd: async (_ctx, step, result) => {
        if (logSteps) {
          const elapsed = startTimes.has(step.id) ? Date.now() - (startTimes.get(step.id) ?? 0) : 0;
          console.log(
            `[Step] ${step.id} (${step.action}) completed${logTiming ? ` in ${elapsed}ms` : ''}`
          );
        }
        if (logData && step.outputVar && result) {
          console.log(`[Data] ${step.outputVar}: ${JSON.stringify(result).substring(0, 200)}...`);
        }
      },
      onStepError: async (_ctx, step) => {
        console.error(`[Step] ${step.id} (${step.action}) failed`);
      },
      onFlowEnd: async (_ctx) => {
        if (logTiming) {
          console.log(`[Flow] Completed in ${Date.now()}ms`);
        }
      },
    },
  };
}
