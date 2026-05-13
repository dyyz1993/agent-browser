export interface ClientState {
  selector?: string;
  elementBox?: { x: number; y: number; width: number; height: number };
  degraded?: boolean;
  lastElementCheckTime?: number;
  elementCheckTimer?: ReturnType<typeof setInterval>;
}
