import type { PluginCommandHandler } from '../types.js';

export const waitForNetworkHandler: PluginCommandHandler = async (ctx, _args, flags) => {
  const timeout = typeof flags.timeout === 'number' ? flags.timeout : 30000;
  await ctx.page.waitForLoadState('networkidle', { timeout });
  return { ok: true, state: 'networkidle' };
};
