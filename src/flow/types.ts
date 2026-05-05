export type StepAction =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'press'
  | 'scroll'
  | 'snapshot'
  | 'screenshot'
  | 'eval'
  | 'wait'
  | 'extract'
  | 'paginate'
  | 'forEach'
  | 'condition'
  | 'scrollUntil'
  | 'clickPaginate'
  | 'forEachItem'
  | 'repeatWhile'
  | 'collectAll'
  | 'detectBlocking'
  | 'humanHelp'
  | 'waitForHuman'
  | 'autoRecover'
  | 'captureScript'
  | 'readCapture'
  | 'captureAPI'
  | 'readAPI'
  | 'interceptRoute'
  | 'removeRoute'
  | 'smartExtract'
  | 'formatOutput'
  | 'deduplicate';

export interface BlockingCondition {
  selector?: string;
  jsExpression?: string;
  hasDialog?: boolean;
  urlPattern?: string;
  textContains?: string;
}

export interface HumanIntervention {
  message: string;
  openViewer?: boolean;
  screenshot?: boolean;
  timeout?: number;
  resolvedCondition?: BlockingCondition;
  mode?: 'ask' | 'wait' | 'askAndWait';
}

export interface FlowParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string[]';
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface ExtractField {
  selector: string;
  attribute?: string;
}

export interface LoopTermination {
  maxIterations?: number;
  noNewItemsCount?: number;
  elementDisappears?: string;
  elementDisabled?: string;
  jsExpression?: string;
}

export interface FlowStep {
  id: string;
  action: StepAction;
  selector?: string;
  value?: string;
  url?: string;
  waitAfter?: string;
  timeout?: number;
  container?: string;
  fields?: Record<string, string | ExtractField>;
  outputVar?: string;
  maxPages?: number | string;
  nextSelector?: string;
  strategy?: 'click' | 'url';
  onEachPage?: FlowStep[];
  sourceVar?: string;
  subSteps?: FlowStep[];
  condition?: string;
  thenSteps?: FlowStep[];
  elseSteps?: FlowStep[];
  inFrame?: string;
  termination?: LoopTermination;
  scrollDirection?: 'down' | 'up';
  scrollAmount?: number;
  scrollContainer?: string;
  extractOnEachScroll?: FlowStep;
  waitForNavigation?: 'load' | 'networkidle' | 'domcontentloaded';
  extractBeforeClick?: FlowStep;
  itemSelector?: string;
  itemSteps?: FlowStep[];
  conditionJs?: string;
  loopSteps?: FlowStep[];
  dedupField?: string;
  collectSteps?: FlowStep[];

  blockingConditions?: BlockingCondition[];
  intervention?: HumanIntervention;
  checkInterval?: number;
  resolveTimeout?: number;
  onResolved?: FlowStep[];
  onTimeout?: FlowStep[];

  file?: string;
  captureFilter?: string;
  apiUrl?: string;
  mockResponse?: string;
  mockStatus?: number;
  abortRequests?: boolean;
  preset?: string;
  outputFormat?: string;
  pretty?: boolean;
  smartExtractConfig?: {
    container?: string;
    fields?: Record<string, string | { selector: string; attribute?: string }>;
    apiUrl?: string;
    apiFilter?: string;
    scriptFilter?: string;
    preferLayer?: 'api' | 'script' | 'dom';
    minResults?: number;
  };

  fallbackSelectors?: string[];
  elementIdentity?: {
    tagName: string;
    textContent: string;
    attributes: Record<string, string>;
    classes: string[];
    boundingRect: { x: number; y: number; width: number; height: number };
    parentSignature: string;
  };
  waitCondition?: 'url_change' | 'dom_stable';
  waitUrlPattern?: string;
  waitDomStableTimeout?: number;

  retry?: {
    maxAttempts: number;
    delayMs: number;
    strategy: 'fixed' | 'exponential';
  };

  checkpoint?: StateCheckpoint;
  environment?: {
    urlPattern?: string;
    pageTitle?: string;
    waitDomStable?: boolean;
    domStableTimeout?: number;
  };
}

export interface FlowDefinition {
  id: string;
  description?: string;
  params?: FlowParam[];
  steps: FlowStep[];
  output?: string[];
}

export interface SiteDefinition {
  name: string;
  description?: string;
  baseUrl?: string;
  flows: Record<string, FlowDefinition>;
}

export interface FlowContext {
  variables: Record<string, unknown>;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
  pageCount: number;
  currentPage: number;
}

export interface StateCheckpointElementCheck {
  selector: string;
  exists: boolean;
  visible?: boolean;
  textContent?: string;
}

export interface StateCheckpoint {
  urlPattern?: string;
  elementChecks?: StateCheckpointElementCheck[];
  contentHash?: string;
}

export interface CheckpointResult {
  stepId: string;
  passed: boolean;
  failures: string[];
}

export interface HealingLogEntry {
  stepId: string;
  originalSelector: string;
  healedSelector: string;
  strategy: string;
}

export interface FlowResult {
  success: boolean;
  site: string;
  flow: string;
  data: Record<string, unknown>;
  errors: Array<{ step: string; error: string }>;
  duration: number;
  healingLog?: HealingLogEntry[];
  checkpointResults?: CheckpointResult[];
}
