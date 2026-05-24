import type { MarketplacePlugin, MarketplaceIndex, SearchResult } from './types.js';

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/dyyz1993/agent-browser-plugins/main/registry.json';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

export class MarketplaceRegistry {
  private registryUrl: string;
  private ttlMs: number;
  private cachedIndex: MarketplaceIndex | null = null;
  private cachedAt = 0;

  constructor(options?: { registryUrl?: string; ttlMs?: number }) {
    this.registryUrl =
      options?.registryUrl ?? process.env.AGENT_BROWSER_PLUGIN_REGISTRY ?? DEFAULT_REGISTRY_URL;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  async getIndex(): Promise<MarketplaceIndex> {
    const now = Date.now();
    if (this.cachedIndex && now - this.cachedAt < this.ttlMs) {
      return this.cachedIndex;
    }

    const res = await fetch(this.registryUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Failed to fetch marketplace registry: ${res.status} ${res.statusText}`);
    }

    const index = (await res.json()) as MarketplaceIndex;
    this.cachedIndex = index;
    this.cachedAt = now;
    return index;
  }

  async search(query: string): Promise<SearchResult> {
    const index = await this.getIndex();
    const lower = query.toLowerCase();

    const results = index.plugins.filter((p) => {
      const haystack = `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
      return haystack.includes(lower);
    });

    return { query, total: results.length, results };
  }

  async getPlugin(name: string): Promise<MarketplacePlugin | null> {
    const index = await this.getIndex();
    return index.plugins.find((p) => p.name === name) ?? null;
  }

  async list(options?: {
    tag?: string;
    sort?: 'downloads' | 'stars' | 'updated';
  }): Promise<MarketplacePlugin[]> {
    const index = await this.getIndex();
    let plugins = [...index.plugins];

    if (options?.tag) {
      const tag = options.tag.toLowerCase();
      plugins = plugins.filter((p) => p.tags.some((t) => t.toLowerCase() === tag));
    }

    if (options?.sort === 'downloads') {
      plugins.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    } else if (options?.sort === 'stars') {
      plugins.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    } else if (options?.sort === 'updated') {
      plugins.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return plugins;
  }

  clearCache(): void {
    this.cachedIndex = null;
    this.cachedAt = 0;
  }
}
