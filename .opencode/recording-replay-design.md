# Enhanced Recording + Replay System Design

## Current State Analysis

### What exists today

**Recording (`src/recorder/inject.js`):**
- Client-side inject.js captures click, fill, select, keyboard, link_click, scroll, resize, trajectory
- Each step has: `{ id, timestamp, action, selector, xpath, value, elementInfo, url, viewport, iframe }`
- Selector generation uses 8 strategies: ID, multi-attribute, attribute+class, best-class, sibling, composed, nth-child, path fallback
- XPath uses similar multi-strategy approach
- Steps sync to Node via Playwright `exposeBinding`

**Flow types (`src/flow/types.ts`):**
- 30+ step actions including navigate, click, fill, extract, paginate, forEach, condition, scrollUntil, smartExtract, etc.
- Rich FlowStep type with fields for selectors, conditions, termination, blocking conditions, sub-steps

**Conversion (`src/flow/recorder-to-flow.ts`):**
- Maps recorded actions to flow steps (click->click, fill->fill, keyboard->press, etc.)
- Handles annotations: pagination, data_container, data_item, login_check, checkpoint
- Generates clickPaginate and extract steps from annotations

**Execution (`src/flow/flow-executor.ts`):**
- Sequential step execution with plugin hooks (onStepStart, onStepEnd, onStepError)
- Error collection per step (non-fatal by default)
- Variable substitution via `${param}` syntax
- Blocking condition detection (selector visibility, URL pattern, JS expression, text content)
- Human intervention via autoRecover/waitForHuman

**Browser recorder (`src/browser.ts`):**
- `startRecorder()` sets up inject.js via `addInitScript`, exposeBinding for step sync
- Navigation history tracking (back/forward detection via framenavigated)
- iframe injection via frameattached handler
- New tab tracking

### Key gaps

1. **No environment signals** -- recording only captures user actions, not URL changes (SPA pushState), DOM mutations, or page load state
2. **Selector is ephemeral** -- inject.js generates selectors at recording time but stores only the single best one; no fallback chain or provenance
3. **No replay intelligence** -- flow-executor runs steps blindly, no pre-step verification, no self-healing when selectors break
4. **No state checkpoints** -- no mechanism to verify "the page looks like what we expect" at key moments
5. **No script export** -- recordings can only become YAML flows, not standalone scripts

---

## 1. Enhanced Step Data Structure

### 1.1 Recorded Step (enhanced)

```typescript
interface EnhancedRecordedStep {
  id: string;
  timestamp: number;
  action: StepActionType;

  // Element identity (stable selector as primary)
  selector: string;                    // Primary stable CSS selector
  fallbackSelectors: string[];         // Alternative selectors, ordered by reliability
  xpath: string;                       // XPath as cross-format fallback

  // Element metadata (for self-healing and debugging)
  elementIdentity: {
    tagName: string;
    textContent: string;               // First 100 chars
    attributes: Record<string, string>; // Semantic attrs: name, aria-label, data-testid, etc.
    classes: string[];                  // Useful classes (filtered per existing logic)
    boundingRect: { x: number; y: number; width: number; height: number };
    parentSignature: string;            // Selector of nearest identifiable ancestor
  };

  // Action-specific data
  value?: string;
  key?: string;
  code?: string;
  modifierKeys?: { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean };

  // Environment context at recording time
  environment: {
    url: string;                       // Full URL at step time
    urlPattern: string;                // Simplified URL pattern (strip query/hash)
    pageTitle: string;
    viewport: { width: number; height: number };
    scrollPosition: { x: number; y: number };
    iframe: boolean;
    iframePath?: string;               // e.g., "#frame1/#frame2"
  };

  // Annotation (user-labeled)
  annotation?: RecorderAnnotation;
}
```

### 1.2 Why these fields

| Field | Purpose |
|---|---|
| `fallbackSelectors[]` | Self-healing: try alternatives when primary fails |
| `elementIdentity` | Self-healing: re-find element by text/attrs/position when selectors fail |
| `parentSignature` | Narrow search scope when element itself is ambiguous |
| `urlPattern` | Replay verification: check we're on the right "page" without exact URL match |
| `scrollPosition` | Replay: restore scroll state before interacting with off-screen elements |

---

## 2. Environment Signal Capture

### 2.1 Signals to capture during recording

| Signal | When captured | Storage |
|---|---|---|
| **URL change** (SPA pushState/replaceState) | On popstate, pushState, replaceState | `EnvironmentSignal { type: 'url_change', from, to, timestamp }` |
| **Navigation** (full page load) | On framenavigated (already done) | Existing `navigate` step |
| **DOM mutations** (key containers) | On MutationObserver batch | `EnvironmentSignal { type: 'dom_mutation', targetSelector, mutationType, timestamp }` |
| **Page load state** | On load/DOMContentLoaded events | `EnvironmentSignal { type: 'page_load', state, url, timestamp }` |
| **Network idle** | On request tracking quiet period | `EnvironmentSignal { type: 'network_idle', duration, timestamp }` |

### 2.2 Implementation approach

Add a new section to `inject.js`:

```
// Environment Signal Monitor (appended to inject.js)
(function() {
  // URL change detection (SPA)
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function() {
    const from = window.location.href;
    origPushState.apply(this, arguments);
    pushEnvironmentSignal('url_change', { from, to: window.location.href });
  };
  history.replaceState = function() {
    const from = window.location.href;
    origReplaceState.apply(this, arguments);
    pushEnvironmentSignal('url_change', { from, to: window.location.href });
  };
  window.addEventListener('popstate', () => {
    pushEnvironmentSignal('url_change', { to: window.location.href });
  });

  // Page load state
  document.addEventListener('DOMContentLoaded', () => {
    pushEnvironmentSignal('page_load', { state: 'domcontentloaded' });
  });
  window.addEventListener('load', () => {
    pushEnvironmentSignal('page_load', { state: 'load' });
  });

  // DOM mutation observer (throttled)
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      pushEnvironmentSignal('dom_stable', { timestamp: Date.now() });
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
```

### 2.3 Signal storage

Environment signals are stored alongside steps but tagged differently:

```typescript
interface EnvironmentSignal {
  type: 'url_change' | 'dom_mutation' | 'page_load' | 'network_idle' | 'dom_stable';
  timestamp: number;
  data: Record<string, unknown>;
}
```

In `recorderSteps[]`, signals are interleaved with action steps. During conversion to flow, signals are used to:
- Insert `wait` steps before actions that follow a URL change
- Add `waitForDOMStable` before actions that follow DOM mutations
- Generate checkpoints after navigations

---

## 3. State Checkpoint Design

### 3.1 When to capture checkpoints

| Trigger | What to capture |
|---|---|
| After navigation (framenavigated) | URL, page title, main content hash |
| After form submit (detected by URL change or DOM mutation) | URL, form target element existence, success/error indicators |
| After click that causes navigation | URL, key element existence |
| User annotation "checkpoint" | Full snapshot |
| Periodic (every N steps) | URL, viewport, key element count |

### 3.2 Checkpoint data structure

```typescript
interface StateCheckpoint {
  id: string;
  stepId: string;                      // Step that triggered this checkpoint
  timestamp: number;

  // URL state
  url: string;
  urlPattern: string;                  // Origin + pathname (no query/hash)

  // Element assertions
  elementChecks: Array<{
    selector: string;
    exists: boolean;
    visible: boolean;
    textContent?: string;              // First 50 chars at checkpoint time
  }>;

  // DOM content hash (lightweight)
  contentHash: string;                 // Hash of main content area innerHTML (first 10KB)

  // Page metadata
  title: string;
  interactiveElementCount: number;     // Count of interactive elements in snapshot
}
```

### 3.3 Content hash strategy

To avoid full DOM snapshots (too large), use a lightweight hash:

```javascript
// In inject.js
function computeContentHash() {
  const main = document.querySelector('main, [role="main"], #content, .content, article')
    || document.body;
  const html = main.innerHTML.substring(0, 10240);
  // Simple hash (no crypto needed, just change detection)
  let hash = 0;
  for (let i = 0; i < html.length; i++) {
    hash = ((hash << 5) - hash + html.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}
```

### 3.4 Checkpoint storage

Checkpoints are stored in a separate array within the recording session:

```typescript
interface RecordingSession {
  steps: EnhancedRecordedStep[];
  signals: EnvironmentSignal[];
  checkpoints: StateCheckpoint[];
  pages: Array<{ url: string; title: string; firstVisitTime: number }>;
}
```

---

## 4. Replay Engine Design

### 4.1 Enhanced FlowExecutor: pre-step decision tree

For each step, the enhanced replay engine runs a verification loop before execution:

```
FOR EACH step IN flow.steps:
  1. Pre-step verification
     a. URL check: does current URL match step.environment.urlPattern?
        - YES -> continue
        - NO -> is this expected (step causes navigation)?
          - Expected -> continue
          - Unexpected -> PAUSE and log warning

     b. Element check: does step.selector resolve to an element?
        - YES -> check visibility
          - Visible -> continue
          - Hidden but exists -> wait for visibility (up to timeout)
        - NO -> enter self-healing (see Section 5)

     c. DOM stability check: has DOM been stable for 200ms?
        - YES -> continue
        - NO -> wait for stability (max 5s)

  2. Execute step action

  3. Post-step verification
     a. If step had a checkpoint -> verify checkpoint matches
     b. If step caused navigation -> wait for page load
     c. Wait for DOM stability (configurable, default 300ms)

  4. Record result (success/failure/healing actions taken)
```

### 4.2 New FlowStep fields for replay intelligence

```typescript
interface FlowStep {
  // ... existing fields ...

  // Replay intelligence (new)
  environment?: {
    urlPattern?: string;               // Expected URL pattern at this step
    pageTitle?: string;                // Expected page title (substring match)
    waitDomStable?: boolean;           // Wait for DOM stability before executing
    domStableTimeout?: number;         // Max wait for DOM stability (ms)
  };

  fallbackSelectors?: string[];        // Alternative selectors to try
  elementIdentity?: {                  // For self-healing when selector fails
    tagName: string;
    textContent: string;
    attributes: Record<string, string>;
    parentSignature: string;
  };

  retry?: {                            // Retry configuration
    maxAttempts: number;               // Default: 3
    delayMs: number;                   // Default: 1000
    strategy: 'fixed' | 'exponential'; // Default: 'fixed'
  };

  onSelectorFailed?: FlowStep[];       // Steps to run when selector fails (recovery)
  checkpoint?: {                       // Expected state after this step
    urlPattern?: string;
    elementChecks?: Array<{
      selector: string;
      exists: boolean;
    }>;
  };
}
```

### 4.3 Wait strategies

Replace fixed `waitAfter` timeouts with intelligent waiting:

```typescript
type WaitStrategy =
  | { type: 'dom_stable'; timeout: number }       // Wait for no DOM mutations for 200ms
  | { type: 'element_visible'; selector: string }  // Wait for element to appear
  | { type: 'network_idle'; timeout: number }      // Wait for no network requests for 500ms
  | { type: 'url_change'; pattern: string }         // Wait for URL to match pattern
  | { type: 'fixed'; duration: number };            // Legacy fixed timeout
```

---

## 5. Self-Healing Algorithm

### 5.1 Selector failure recovery flow

```
Element not found for step.selector:

1. TRY fallbackSelectors (in order, with 500ms wait between each)
   -> If any resolves to a unique element: USE IT, log healing

2. TRY element-based re-discovery
   a. Find by tagName + textContent substring match
      -> If unique match: generate new selector, USE IT
   b. Find by tagName + semantic attributes (name, aria-label, data-testid)
      -> If unique match: generate new selector, USE IT
   c. Find within parentSignature scope
      -> If unique match: generate new selector, USE IT

3. TRY positional re-discovery (last resort)
   a. Take a new snapshot of the page
   b. Find element with similar bounding rect and tagName
   c. If found and plausible: USE IT, log warning

4. ALL FAILED
   -> Execute onSelectorFailed steps if defined
   -> Otherwise: PAUSE and ask for human intervention
```

### 5.2 Implementation in FlowExecutor

New method `resolveElement()`:

```typescript
private async resolveElement(step: FlowStep): Promise<{ locator: Locator; healed: boolean }> {
  const primarySelector = step.selector || '';
  const frame = step.inFrame ? this.getFrame(step.inFrame) : this.getFrame();

  // Try primary selector
  const primary = frame.locator(primarySelector);
  if (await primary.count() > 0) {
    return { locator: primary.first(), healed: false };
  }

  // Try fallback selectors
  for (const fallback of (step.fallbackSelectors || [])) {
    await new Promise(r => setTimeout(r, 500));
    const loc = frame.locator(fallback);
    if (await loc.count() > 0) {
      console.log(`[Self-Healing] Step ${step.id}: "${primarySelector}" -> "${fallback}"`);
      return { locator: loc.first(), healed: true };
    }
  }

  // Try element identity re-discovery
  if (step.elementIdentity) {
    const healed = await this.healByIdentity(step, frame);
    if (healed) return { locator: healed, healed: true };
  }

  // Try positional re-discovery
  const positional = await this.healByPosition(step, frame);
  if (positional) return { locator: positional, healed: true };

  // All strategies failed
  throw new ElementNotFoundError(step.id, primarySelector);
}
```

### 5.3 Identity-based healing

```typescript
private async healByIdentity(step: FlowStep, frame: Frame): Promise<Locator | null> {
  const identity = step.elementIdentity;
  if (!identity) return null;

  // Strategy 1: tagName + text content
  if (identity.textContent) {
    const escaped = identity.textContent.slice(0, 30).replace(/"/g, '\\"');
    const selector = `${identity.tagName.toLowerCase()}:text-is("${escaped}")`;
    const loc = frame.locator(selector);
    if (await loc.count() === 1) {
      console.log(`[Self-Healing] Step ${step.id}: healed by text content`);
      return loc.first();
    }
  }

  // Strategy 2: Semantic attributes
  if (identity.attributes) {
    for (const [attr, value] of Object.entries(identity.attributes)) {
      const selector = `${identity.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
      const loc = frame.locator(selector);
      if (await loc.count() === 1) {
        console.log(`[Self-Healing] Step ${step.id}: healed by attribute ${attr}`);
        return loc.first();
      }
    }
  }

  // Strategy 3: Within parent scope
  if (identity.parentSignature) {
    const parent = frame.locator(identity.parentSignature);
    if (await parent.count() > 0) {
      const child = parent.locator(identity.tagName.toLowerCase()).first();
      if (await child.count() > 0) {
        console.log(`[Self-Healing] Step ${step.id}: healed by parent scope`);
        return child;
      }
    }
  }

  return null;
}
```

### 5.4 Healing report

Each replay run produces a healing report:

```typescript
interface HealingReport {
  stepId: string;
  originalSelector: string;
  healedSelector: string;
  strategy: 'fallback' | 'identity_text' | 'identity_attr' | 'identity_parent' | 'positional';
  timestamp: number;
}
```

---

## 6. Script Export Design

### 6.1 Export targets

| Format | Use case |
|---|---|
| **Playwright TypeScript** | Direct replay, CI integration |
| **Puppeteer JavaScript** | Broader ecosystem compatibility |
| **Python (Playwright)** | Python-based automation |
| **Standalone Node script** | One-click runnable script |
| **Scraper config (JSON)** | Data extraction template |
| **Form-fill config (JSON)** | Auto-fill configuration |

### 6.2 Conversion pipeline

```
RecordingSession
  -> EnhancedRecordingConverter
    -> ScriptExporter (per format)
      -> Output file
```

### 6.3 Playwright TypeScript export example

Input recording with: navigate, fill username, fill password, click login, extract data

```typescript
// Generated by agent-browser recorder export
import { chromium } from 'playwright';

async function replay() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Step 1: Navigate
  await page.goto('https://example.com/login');
  await page.waitForLoadState('domcontentloaded');

  // Step 2: Fill username
  await page.locator('input[name="username"]').fill('${USERNAME}');

  // Step 3: Fill password
  await page.locator('input[name="password"]').fill('${PASSWORD}');

  // Step 4: Click login button
  await page.locator('button[type="submit"]').click();
  await page.waitForLoadState('load');

  // Step 5: Extract data
  const results = await page.locator('.data-item').evaluateAll(els =>
    els.map(el => ({
      title: el.querySelector('h2')?.textContent?.trim() || '',
      url: el.querySelector('a[href]')?.getAttribute('href') || '',
    }))
  );

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

replay();
```

### 6.4 Scraper script export

For recordings annotated with `data_container` and `data_item`:

```typescript
interface ScraperConfig {
  name: string;
  baseUrl: string;
  steps: Array<{
    action: string;
    selector?: string;
    value?: string;
  }>;
  extraction: {
    container: string;                 // data_container selector
    schema: Record<string, string>;    // field name -> selector
    pagination?: {
      nextSelector: string;
      maxPages: number;
    };
  };
}
```

### 6.5 Form-fill script export

For recordings that are primarily fill + submit actions:

```typescript
interface FormFillConfig {
  name: string;
  url: string;
  fields: Array<{
    selector: string;
    value: string;                     // Template variable like {{email}}
    type: 'text' | 'select' | 'check' | 'radio';
  }>;
  submit: {
    selector: string;
    waitForNavigation: boolean;
  };
  validation: {
    successIndicator?: string;         // Selector that confirms success
    errorIndicator?: string;           // Selector that indicates failure
  };
}
```

---

## 7. Implementation Phases

### Phase 1: Enhanced Recording (Week 1-2)

**Goal:** Capture richer data during recording without changing replay behavior.

| Task | Files changed | Description |
|---|---|---|
| Fallback selectors in inject.js | `src/recorder/inject.js` | Store top-3 selectors instead of just the best one |
| Element identity capture | `src/recorder/inject.js` | Capture tagName, text, semantic attrs, parent signature |
| URL change detection (SPA) | `src/recorder/inject.js` | Monkey-patch pushState/replaceState, listen for popstate |
| DOM stability signals | `src/recorder/inject.js` | MutationObserver with throttled batch reporting |
| Enhanced step type | `src/flow/recorder-to-flow.ts` | Update RecorderStep interface with new fields |
| Backward compatibility | `src/flow/recorder-to-flow.ts` | Ensure old recordings without new fields still work |

**Verification:** Record a session and inspect YAML output for fallbackSelectors, elementIdentity, and environment signals.

### Phase 2: Self-Healing Replay (Week 3-4)

**Goal:** Make replay resilient to selector breakage.

| Task | Files changed | Description |
|---|---|---|
| resolveElement() in FlowExecutor | `src/flow/flow-executor.ts` | New method with fallback chain |
| healByIdentity() | `src/flow/flow-executor.ts` | Identity-based element re-discovery |
| healByPosition() | `src/flow/flow-executor.ts` | Positional element re-discovery |
| Healing report | `src/flow/flow-executor.ts` | Log healing actions with strategy used |
| Enhanced convertStep | `src/flow/recorder-to-flow.ts` | Map fallbackSelectors and elementIdentity to FlowStep |
| Retry logic | `src/flow/flow-executor.ts` | Configurable retry with delay strategies |

**Verification:** Record on page v1, replay on page v2 with changed selectors, verify self-healing kicks in.

### Phase 3: State Checkpoints (Week 5)

**Goal:** Add pre/post-step verification.

| Task | Files changed | Description |
|---|---|---|
| Checkpoint capture in inject.js | `src/recorder/inject.js` | Content hash + element checks at key moments |
| Checkpoint data structure | `src/flow/types.ts` | StateCheckpoint interface |
| Checkpoint in FlowStep | `src/flow/types.ts` | Add checkpoint field to FlowStep |
| Pre-step verification | `src/flow/flow-executor.ts` | URL pattern matching, element existence checks |
| Post-step verification | `src/flow/flow-executor.ts` | Checkpoint matching after navigation/submission |
| DOM stability wait | `src/flow/flow-executor.ts` | Wait for no mutations for Xms |

**Verification:** Replay should pause/warn when page state doesn't match expected checkpoint.

### Phase 4: Script Export (Week 6)

**Goal:** Convert recordings to standalone scripts.

| Task | Files changed | Description |
|---|---|---|
| Exporter interface | `src/flow/exporters/types.ts` | Define ScriptExporter interface |
| Playwright TS exporter | `src/flow/exporters/playwright.ts` | Generate runnable Playwright TypeScript |
| Puppeteer JS exporter | `src/flow/exporters/puppeteer.ts` | Generate Puppeteer JavaScript |
| Python exporter | `src/flow/exporters/python.ts` | Generate Python Playwright script |
| Scraper config exporter | `src/flow/exporters/scraper.ts` | JSON scraper template |
| Form-fill exporter | `src/flow/exporters/form-fill.ts` | JSON form-fill config |
| CLI command | `src/actions.ts` | Add `recorder export --format playwright` command |

**Verification:** Record a session, export to Playwright TS, run the exported script, verify it works.

### Phase 5: Polish and Integration (Week 7)

| Task | Description |
|---|---|
| Configuration API | Allow users to set self-healing aggressiveness, checkpoint frequency |
| Healing analytics | Aggregate healing reports across runs to suggest selector improvements |
| Documentation | Update README with recording + replay features |
| Testing | E2E tests for recording -> conversion -> replay -> healing pipeline |

---

## Appendix A: Key Design Decisions

### A1. Stable selector as identity, not ephemeral refs

The existing system uses `@ref` (snapshot refs like `@e1`) which are ephemeral -- they only exist within a single snapshot. The enhanced system treats the **stable CSS selector** as the element's cross-session identity. This aligns with how `inject.js` already generates selectors and makes recordings transferable across browser sessions.

### A2. Signals interleaved with steps, not separate

Environment signals are stored in the same array as action steps, differentiated by a `type` field. This preserves temporal ordering and simplifies conversion: the converter just walks the array once, emitting wait steps when it encounters signals.

### A3. Self-healing is opt-in at the flow level

A flow can set `selfHealing: true` to enable the resolveElement() chain, or `selfHealing: false` to fail fast on broken selectors. Default: enabled for recorded flows, disabled for hand-written flows.

### A4. Checkpoints are lightweight, not full DOM snapshots

Full DOM snapshots would make recordings too large and too fragile. Instead, checkpoints use:
- URL pattern matching (not exact URL)
- Element existence checks (selector + visible)
- Content hash (32-bit hash of main content innerHTML)

This is enough to detect "wrong page" or "page didn't load" without being brittle.

### A5. Export is a separate pipeline, not inline

Export functionality is decoupled from the recording/replay pipeline. A `ScriptExporter` interface allows adding new export formats without touching the core recording or replay code.
