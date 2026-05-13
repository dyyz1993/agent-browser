import type { Page, Browser, BrowserContext } from 'playwright-core';

export interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
}

export type AnnotationType =
  | 'wait_element'
  | 'wait_timeout'
  | 'data_container'
  | 'data_item'
  | 'pagination'
  | 'login_check'
  | 'checkpoint'
  | 'custom';

export interface AnnotationConfig {
  type: AnnotationType;
  label: string;
  selector?: string;
  waitTimeout?: number;
  itemSelector?: string;
  fields?: string[];
  customNote?: string;
}

export interface AnnotateStep {
  id: string;
  timestamp: number;
  action: 'annotate';
  selector: string;
  xpath?: string;
  annotation: AnnotationConfig;
  url?: string;
}
