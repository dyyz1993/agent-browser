export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  xpath?: string;
  css?: string;
  text?: string;
  attributes?: Record<string, string>;
}

export interface Annotation {
  type: 'login' | 'data' | 'pagination' | 'custom';
  label: string;
  description?: string;
}

export interface RecordedStep {
  id: string;
  timestamp: number;
  url: string;
  action: 'click' | 'fill' | 'navigate' | 'annotate' | 'scroll' | 'select';
  selector: string;
  ref?: string;
  value?: string;
  elementInfo?: ElementInfo;
  annotation?: Annotation;
  trajectory: TrajectoryPoint[];
  viewport: ViewportInfo;
}

export interface PageInfo {
  url: string;
  title: string;
  firstVisitTime: number;
}

export interface RecordingSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  pages: PageInfo[];
  steps: RecordedStep[];
}

export interface RecorderConfig {
  sessionId?: string;
  name?: string;
  persistPath?: string;
  trajectoryInterval?: number;
  maxTrajectoryPoints?: number;
}

export const DEFAULT_CONFIG: Required<Omit<RecorderConfig, 'sessionId' | 'name' | 'persistPath'>> = {
  trajectoryInterval: 50,
  maxTrajectoryPoints: 10
};
