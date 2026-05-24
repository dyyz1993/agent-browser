export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  installSource: string;
  tags: string[];
  stars?: number;
  downloads?: number;
  verified: boolean;
  permissions?: string[];
  commands: Record<string, { description: string; usage: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceIndex {
  version: number;
  updatedAt: string;
  plugins: MarketplacePlugin[];
}

export interface SearchResult {
  query: string;
  total: number;
  results: MarketplacePlugin[];
}
