import type { BaseCommand } from './base.js';

export interface InteractCommand extends BaseCommand {
  action: 'interact';
  steps?: InteractStep[];
  file?: string;
  headless?: boolean;
  timeout?: number;
}

export type InteractStep =
  | NavigateStep
  | ClickStep
  | FillStep
  | TypeStep
  | PressStep
  | GetStep
  | WaitStep
  | ScreenshotStep;

export interface NavigateStep {
  action: 'navigate';
  url: string;
}

export interface ClickStep {
  action: 'click';
  selector: string;
}

export interface FillStep {
  action: 'fill';
  selector: string;
  value: string;
}

export interface TypeStep {
  action: 'type';
  selector: string;
  text: string;
}

export interface PressStep {
  action: 'press';
  key: string;
}

export interface GetStep {
  action: 'get';
  type: 'text' | 'html' | 'value' | 'url' | 'title';
  selector?: string;
}

export interface WaitStep {
  action: 'wait';
  selector?: string;
  timeout?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

export interface ScreenshotStep {
  action: 'screenshot';
  path?: string;
  fullPage?: boolean;
}

export interface InteractResult {
  success: boolean;
  steps: StepResult[];
  finalUrl?: string;
  finalTitle?: string;
  output?: unknown;
}

export interface StepResult {
  action: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
