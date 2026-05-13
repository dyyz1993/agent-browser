export interface RefMap {
  [ref: string]: {
    selector: string;
    role: string;
    name?: string;
    nth?: number;
    xpath?: string;
    cssPath?: string;
    attributes?: Record<string, string>;
  };
}

export interface EnhancedSnapshot {
  tree: string;
  refs: RefMap;
}

export interface SnapshotOptions {
  interactive?: boolean;
  cursor?: boolean;
  maxDepth?: number;
  compact?: boolean;
  selector?: string;
  path?: boolean;
  attrs?: boolean;
  selectors?: boolean;
  all?: boolean;
}
