export interface InputEntry {
  selector: string;
  value: string;
  timestamp: number;
}

export interface ScoredRequest {
  url: string;
  method: string;
  score: number;
  breakdown: {
    methodScore: number;
    resourceTypeScore: number;
    inputMatchScore: number;
    recencyScore: number;
    apiScore: number;
  };
  inputMatches: string[];
  status?: number;
  classification?: ClassificationResult;
  timestamp: number;
}

export interface ClassificationResult {
  type: 'direct' | 'signed' | 'csrf_protected' | 'session_required';
  indicators: string[];
}

interface InputMemoryConfig {
  ttlMs: number;
  maxEntries: number;
}

interface AttentionFilterConfig {
  maxTips: number;
  minScore: number;
  deduplicateWindowMs: number;
}

const DEFAULT_INPUT_MEMORY_CONFIG: InputMemoryConfig = {
  ttlMs: 5 * 60 * 1000,
  maxEntries: 50,
};

const DEFAULT_ATTENTION_CONFIG: AttentionFilterConfig = {
  maxTips: 3,
  minScore: 50,
  deduplicateWindowMs: 5000,
};

const PRIVATE_SELECTOR_PATTERN = /pass|pwd|secret|token/i;

const METHOD_SCORES: Record<string, number> = {
  POST: 40,
  PUT: 30,
  DELETE: 20,
  PATCH: 25,
  GET: 10,
};

const RESOURCE_TYPE_SCORES: Record<string, number> = {
  xhr: 30,
  fetch: 30,
  document: 20,
  websocket: 15,
};

const NOISE_RESOURCE_TYPES = new Set([
  'image',
  'stylesheet',
  'font',
  'media',
  'manifest',
  'texttrack',
  'eventsource',
]);

const STATIC_FILE_PATTERN =
  /\.js(\?|$)|\.css(\?|$)|\.woff|\.ttf|\.eot|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.webp|\.mp4|\.webm/i;

const ANALYTICS_PATTERN = /analytics|tracking|telemetry|beacon|collect\?/i;

const THIRD_PARTY_PATTERN =
  /google-analytics|googletagmanager|facebook\.net|doubleclick|hotjar|clarity\.ms|sentry\.io|newrelic|datadog/i;

const SIGNED_HEADERS = [
  'sign',
  'signature',
  'x-signature',
  'x-timestamp',
  'timestamp',
  'nonce',
  'csrf',
  'xsrf',
  'x-csrf-token',
];

const SIGNED_PARAMS = ['sign', 'signature', 'timestamp', 'nonce', 'token'];

const SCORE_PER_INPUT_MATCH = 15;
const MAX_INPUT_MATCH_SCORE = 50;

const RECENCY_WINDOWS = [
  { maxMs: 30_000, score: 20 },
  { maxMs: 120_000, score: 10 },
];

const API_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\/api\//, score: 20 },
  { pattern: /graphql/, score: 25 },
  { pattern: /\/v\d+\//, score: 15 },
];

class InputMemory {
  private entries: InputEntry[] = [];
  private readonly config: InputMemoryConfig;

  constructor(config: InputMemoryConfig = DEFAULT_INPUT_MEMORY_CONFIG) {
    this.config = config;
  }

  rememberInput(entry: { selector: string; value: string; timestamp: number }): void {
    const masked = PRIVATE_SELECTOR_PATTERN.test(entry.selector) ? '***masked***' : entry.value;

    this.entries.push({
      selector: entry.selector,
      value: masked,
      timestamp: entry.timestamp,
    });

    if (this.entries.length > this.config.maxEntries) {
      this.entries.splice(0, this.entries.length - this.config.maxEntries);
    }
  }

  getRecentInputs(): InputEntry[] {
    const cutoff = Date.now() - this.config.ttlMs;
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}

class RequestScorer {
  constructor(private readonly inputMemory: InputMemory) {}

  score(
    request: {
      url: string;
      method: string;
      resourceType: string;
      timestamp: number;
      postData?: string;
    },
    now: number = Date.now()
  ): Omit<ScoredRequest, 'status' | 'classification'> {
    const methodScore = METHOD_SCORES[request.method.toUpperCase()] ?? 5;
    const resourceTypeScore = RESOURCE_TYPE_SCORES[request.resourceType] ?? 5;

    const { score: inputMatchScore, matches: inputMatches } = this.computeInputMatch(
      request.url,
      request.postData
    );

    const recencyScore = this.computeRecency(request.timestamp, now);
    const apiScore = this.computeApi(request.url);

    const total = methodScore + resourceTypeScore + inputMatchScore + recencyScore + apiScore;

    return {
      url: request.url,
      method: request.method,
      score: total,
      breakdown: {
        methodScore,
        resourceTypeScore,
        inputMatchScore,
        recencyScore,
        apiScore,
      },
      inputMatches: inputMatches,
      timestamp: request.timestamp,
    };
  }

  private computeInputMatch(url: string, postData?: string): { score: number; matches: string[] } {
    const inputs = this.inputMemory.getRecentInputs();
    if (inputs.length === 0) {
      return { score: 0, matches: [] };
    }

    const matches: string[] = [];
    let score = 0;

    const searchSpace = postData ? url + '\n' + postData : url;

    for (const input of inputs) {
      if (input.value === '***masked***') continue;
      if (input.value.length === 0) continue;

      const needle = input.value;
      if (searchSpace.includes(encodeURIComponent(needle)) || searchSpace.includes(needle)) {
        matches.push(input.selector);
        score += SCORE_PER_INPUT_MATCH;
        if (score >= MAX_INPUT_MATCH_SCORE) break;
      }
    }

    return {
      score: Math.min(score, MAX_INPUT_MATCH_SCORE),
      matches,
    };
  }

  private computeRecency(requestTime: number, now: number): number {
    const elapsed = now - requestTime;
    for (const window of RECENCY_WINDOWS) {
      if (elapsed <= window.maxMs) return window.score;
    }
    return 0;
  }

  private computeApi(url: string): number {
    for (const { pattern, score } of API_PATTERNS) {
      if (pattern.test(url)) return score;
    }
    return 0;
  }
}

class NoiseFilter {
  isNoise(request: { url: string; method: string; resourceType: string }): boolean {
    if (NOISE_RESOURCE_TYPES.has(request.resourceType)) return true;
    if (STATIC_FILE_PATTERN.test(request.url)) return true;
    if (ANALYTICS_PATTERN.test(request.url)) return true;
    if (THIRD_PARTY_PATTERN.test(request.url)) return true;
    return false;
  }
}

class AttentionFilter {
  private readonly config: AttentionFilterConfig;

  constructor(config: AttentionFilterConfig = DEFAULT_ATTENTION_CONFIG) {
    this.config = config;
  }

  selectTopRequests(scoredRequests: ScoredRequest[], now: number = Date.now()): ScoredRequest[] {
    const qualified = scoredRequests.filter((r) => r.score >= this.config.minScore);

    const deduped = this.deduplicate(qualified, now);

    deduped.sort((a, b) => b.score - a.score);

    return deduped.slice(0, this.config.maxTips);
  }

  private deduplicate(requests: ScoredRequest[], now: number): ScoredRequest[] {
    const seen = new Map<string, ScoredRequest>();

    for (const req of requests) {
      const key = `${req.method}:${this.toPath(req.url)}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, req);
        continue;
      }

      const existingAge = now - existing.timestamp;
      const reqAge = now - req.timestamp;

      if (Math.abs(existingAge - reqAge) < this.config.deduplicateWindowMs) {
        if (req.score > existing.score) {
          seen.set(key, req);
        }
      } else {
        seen.set(key, req);
      }
    }

    return Array.from(seen.values());
  }

  private toPath(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      return url;
    }
  }
}

class RequestClassifier {
  classify(request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | object;
  }): ClassificationResult {
    const indicators: string[] = [];
    let hasSign = false;
    let hasTimestamp = false;
    let hasCsrf = false;

    const headerKeys = Object.keys(request.headers).map((k) => k.toLowerCase());

    for (const marker of SIGNED_HEADERS) {
      const lower = marker.toLowerCase();
      if (headerKeys.includes(lower)) {
        indicators.push(`header:${marker}`);
        if (lower === 'sign' || lower === 'signature' || lower === 'x-signature') hasSign = true;
        if (lower === 'timestamp' || lower === 'x-timestamp') hasTimestamp = true;
        if (lower === 'csrf' || lower === 'xsrf' || lower === 'x-csrf-token') hasCsrf = true;
      }
    }

    try {
      const parsed = new URL(request.url);
      for (const param of SIGNED_PARAMS) {
        if (parsed.searchParams.has(param)) {
          indicators.push(`param:${param}`);
          if (param === 'sign' || param === 'signature') hasSign = true;
          if (param === 'timestamp') hasTimestamp = true;
        }
      }
    } catch {
      // invalid url, skip param check
    }

    if (hasCsrf) {
      return { type: 'csrf_protected', indicators };
    }

    if (hasSign && hasTimestamp) {
      return { type: 'signed', indicators };
    }

    if (hasSign) {
      return { type: 'signed', indicators };
    }

    const cookieHeader = request.headers['cookie'] ?? request.headers['Cookie'];
    if (cookieHeader && cookieHeader.length > 0) {
      return { type: 'session_required', indicators: ['cookie'] };
    }

    return { type: 'direct', indicators };
  }
}

const CLASSIFICATION_TIP_LABEL: Record<ClassificationResult['type'], string> = {
  direct: 'directly reusable',
  signed: 'has signature params',
  csrf_protected: 'needs CSRF token',
  session_required: 'requires session',
};

function extractPath(url: string, maxLen: number = 60): string {
  try {
    const parsed = new URL(url);
    let p = parsed.pathname;
    if (p.length > maxLen) {
      p = p.substring(0, maxLen - 1) + '\u2026';
    }
    return p;
  } catch {
    return url.length > maxLen ? url.substring(0, maxLen - 1) + '\u2026' : url;
  }
}

export interface AnalysisEngineOptions {
  inputMemoryConfig?: InputMemoryConfig;
  attentionConfig?: AttentionFilterConfig;
  patternStore?: import('./network-pattern-store.js').NetworkPatternStore;
}

export class AnalysisEngine {
  private readonly inputMemory: InputMemory;
  private readonly scorer: RequestScorer;
  private readonly noiseFilter: NoiseFilter;
  private readonly attentionFilter: AttentionFilter;
  private readonly classifier: RequestClassifier;
  private readonly patternStore?: import('./network-pattern-store.js').NetworkPatternStore;
  private pendingScored: ScoredRequest[] = [];

  constructor(inputMemoryConfig?: InputMemoryConfig, attentionConfig?: AttentionFilterConfig);
  constructor(options: AnalysisEngineOptions);
  constructor(
    inputMemoryConfigOrOptions?: InputMemoryConfig | AnalysisEngineOptions,
    attentionConfig?: AttentionFilterConfig
  ) {
    if (
      inputMemoryConfigOrOptions &&
      typeof inputMemoryConfigOrOptions === 'object' &&
      ('patternStore' in inputMemoryConfigOrOptions ||
        'inputMemoryConfig' in inputMemoryConfigOrOptions ||
        'attentionConfig' in inputMemoryConfigOrOptions)
    ) {
      const opts = inputMemoryConfigOrOptions as AnalysisEngineOptions;
      this.inputMemory = new InputMemory(opts.inputMemoryConfig);
      this.scorer = new RequestScorer(this.inputMemory);
      this.noiseFilter = new NoiseFilter();
      this.attentionFilter = new AttentionFilter(opts.attentionConfig);
      this.classifier = new RequestClassifier();
      this.patternStore = opts.patternStore;
    } else {
      this.inputMemory = new InputMemory(
        inputMemoryConfigOrOptions as InputMemoryConfig | undefined
      );
      this.scorer = new RequestScorer(this.inputMemory);
      this.noiseFilter = new NoiseFilter();
      this.attentionFilter = new AttentionFilter(attentionConfig);
      this.classifier = new RequestClassifier();
    }
  }

  onRequest(tracked: {
    url: string;
    method: string;
    headers: Record<string, string>;
    timestamp: number;
    resourceType: string;
    postData?: string;
  }): void {
    if (this.noiseFilter.isNoise(tracked)) return;

    const scored = this.scorer.score(tracked);
    const classification = this.classifier.classify(tracked);

    if (this.patternStore) {
      this.patternStore.record(tracked.url, tracked.method, classification);
    }

    this.pendingScored.push({
      ...scored,
      classification,
    });
  }

  onResponse(tracked: { url: string; timestamp?: number; status?: number }): void {
    if (tracked.status === undefined) return;

    if (tracked.timestamp !== undefined) {
      for (const scored of this.pendingScored) {
        if (scored.url === tracked.url && scored.timestamp === tracked.timestamp) {
          scored.status = tracked.status;
          return;
        }
      }
    }

    let latest: ScoredRequest | undefined;
    for (const scored of this.pendingScored) {
      if (scored.url === tracked.url && scored.status === undefined) {
        if (!latest || scored.timestamp > latest.timestamp) {
          latest = scored;
        }
      }
    }
    if (latest) {
      latest.status = tracked.status;
    }
  }

  rememberInput(entry: { selector: string; value: string; timestamp: number }): void {
    this.inputMemory.rememberInput(entry);
  }

  getTips(now: number = Date.now()): string[] {
    const top = this.attentionFilter.selectTopRequests(this.pendingScored, now);

    const tippedUrls = new Set<string>();
    for (const req of top) {
      tippedUrls.add(`${req.timestamp}:${req.url}`);
    }

    this.pendingScored = this.pendingScored.filter(
      (r) => !tippedUrls.has(`${r.timestamp}:${r.url}`)
    );

    return top.map((req) => {
      const path = extractPath(req.url);
      const status = req.status != null ? ` (${req.status})` : '';
      const inputPart =
        req.inputMatches.length > 0 ? ` - matched input: ${req.inputMatches[0]}` : '';
      let classLabel = '';
      if (req.classification != null) {
        classLabel = ` - ${CLASSIFICATION_TIP_LABEL[req.classification.type]}`;
      } else if (this.patternStore) {
        const stored = this.patternStore.lookup(req.url, req.method);
        if (stored) {
          classLabel = ` - ${CLASSIFICATION_TIP_LABEL[stored.classification as ClassificationResult['type']] ?? stored.classification}`;
        }
      }
      const tip = `${req.method} ${path}${status}${inputPart}${classLabel}`;
      return tip.length > 120 ? tip.substring(0, 119) + '\u2026' : tip;
    });
  }

  clear(): void {
    this.inputMemory.clear();
    this.pendingScored = [];
  }

  getPatternStore(): import('./network-pattern-store.js').NetworkPatternStore | undefined {
    return this.patternStore;
  }
}
