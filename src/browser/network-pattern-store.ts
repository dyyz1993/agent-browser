import * as fs from 'fs';
import * as path from 'path';
import type { ClassificationResult } from './network-analysis.js';

export interface StoredPattern {
  pathPattern: string;
  method: string;
  classification: string;
  indicators: string[];
  hitCount: number;
  lastSeen: number;
}

interface PatternStoreData {
  version: number;
  patterns: StoredPattern[];
}

const MAX_PATTERNS = 100;
const FLUSH_DEBOUNCE_MS = 5000;

export class NetworkPatternStore {
  private data: PatternStoreData;
  private readonly filePath: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(appDir: string) {
    this.filePath = path.join(appDir, 'network-patterns.json');
    this.data = this.load();
  }

  record(url: string, method: string, classification: ClassificationResult): void {
    const pathPattern = this.extractPath(url);
    const upperMethod = method.toUpperCase();

    const existing = this.data.patterns.find(
      (p) => p.pathPattern === pathPattern && p.method === upperMethod
    );

    if (existing) {
      existing.classification = classification.type;
      existing.indicators = classification.indicators;
      existing.hitCount += 1;
      existing.lastSeen = Date.now();
    } else {
      this.data.patterns.push({
        pathPattern,
        method: upperMethod,
        classification: classification.type,
        indicators: classification.indicators,
        hitCount: 1,
        lastSeen: Date.now(),
      });
    }

    this.evictOldPatterns();
    this.dirty = true;
    this.debouncedFlush();
  }

  lookup(url: string, method: string): StoredPattern | null {
    const pathPattern = this.extractPath(url);
    const upperMethod = method.toUpperCase();
    return (
      this.data.patterns.find((p) => p.pathPattern === pathPattern && p.method === upperMethod) ??
      null
    );
  }

  flush(): void {
    if (!this.dirty) return;
    this.writeToDisk();
  }

  save(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) {
      this.writeToDisk();
    }
  }

  private load(): PatternStoreData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { version: 1, patterns: [] };
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        'patterns' in parsed &&
        Array.isArray((parsed as PatternStoreData).patterns)
      ) {
        return parsed as PatternStoreData;
      }
      return { version: 1, patterns: [] };
    } catch {
      return { version: 1, patterns: [] };
    }
  }

  private writeToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
      this.dirty = false;
    } catch {
      // Graceful: don't crash on write failure
    }
  }

  private debouncedFlush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private evictOldPatterns(): void {
    if (this.data.patterns.length <= MAX_PATTERNS) return;
    this.data.patterns.sort((a, b) => b.lastSeen - a.lastSeen);
    this.data.patterns = this.data.patterns.slice(0, MAX_PATTERNS);
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
}
