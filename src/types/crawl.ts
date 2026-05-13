import type { BaseCommand } from './base.js';

export interface ScrapeCommand extends BaseCommand {
  action: 'scrape';
  url: string;
  format?: 'text' | 'html' | 'markdown';
  selector?: string;
  timeout?: number;
  headless?: boolean;
  waitForSelector?: string;
  outputFile?: string;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  javaScriptEnabled?: boolean;
  includeMetadata?: boolean;
}

export interface CrawlCommand extends BaseCommand {
  action: 'crawl';
  url: string;
  depth?: number;
  limit?: number;
  format?: 'text' | 'html' | 'markdown';
  timeout?: number;
  selector?: string;
  headless?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
  allowExternal?: boolean;
  concurrency?: number;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  javaScriptEnabled?: boolean;
}

export interface CrawlPage {
  url: string;
  title: string;
  content: string;
  links?: string[];
}

export interface CrawlResult {
  url: string;
  pages: CrawlPage[];
  total: number;
  crawled: number;
  failed: number;
}

export interface SearchCommand extends BaseCommand {
  action: 'search';
  query: string;
  engine?: 'google' | 'bing' | 'duckduckgo';
  limit?: number;
  timeout?: number;
  headless?: boolean;
  outputFile?: string;
  stealth?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface SearchResponse {
  query: string;
  engine: string;
  results: SearchResult[];
  total: number;
}

export interface MapCommand extends BaseCommand {
  action: 'map';
  url: string;
  limit?: number;
  timeout?: number;
  headless?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
}

export interface MapResult {
  url: string;
  urls: string[];
  total: number;
}
