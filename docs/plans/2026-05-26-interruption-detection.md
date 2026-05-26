# Interruption Detection & Collection System

## Overview

Auto-detect human-intervention elements (captcha, login, popup) during browsing, report via `tips`, and provide a collector mode for users to capture patterns for built-in rule generation.

## Architecture

### 1. Collector Mode (采集模式)

**Command**: `collect start` / `collect stop`

**Lifecycle**:
1. `collect start` → inject overlay script into browser context via `context.addInitScript()`
2. Overlay script listens for `Ctrl+Shift+P` hotkey on ALL pages
3. While hotkey held: mouse-follow highlight, prefer container-level elements (id/data-testid), fallback to nearest ancestor by x/y distance
4. On release: floating type selector appears → Tab to cycle types → Enter confirm / Esc cancel
5. Confirmed → send collection data to main process via `window.__agentBrowserCollect`
6. `collect stop` → remove overlay, export session JSON to `~/.agent-browser/collections/`

**Injection scope**: Global to browser context, works on all tabs/pages including user-opened ones.

**Type selector options**:
- Captcha (reCAPTCHA / hCaptcha / Cloudflare / slide / SMS / image select / text input)
- Login (full page / modal / iframe)
- Popup (cookie consent / newsletter / notification / discount / ad / age verify / paywall / other)

### 2. Data Structures

**Collection entry**:
```typescript
interface CollectionEntry {
  id: string;
  timestamp: string;
  type: InterruptionType;
  subType: string;
  page: { url: string; domain: string; path: string; title: string };
  element: {
    selector: string;
    xpath: string;
    tagName: string;
    html: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    isIframe: boolean;
    iframeSrc?: string;
    parentSelector?: string;
  };
  context: {
    trigger: "auto_popup" | "page_load" | "user_action";
    isVisible: boolean;
    zIndex: number;
    hasOverlay: boolean;
    overlaySelector?: string;
  };
}
```

**Session output**: `~/.agent-browser/collections/session_YYYY-MM-DD_HHMMSS.json`

### 3. Processor Script (加工脚本)

**Command**: `npx agent-browser process-collections`

Reads all JSON files from `~/.agent-browser/collections/`, extracts:
- Domain + path patterns (with wildcard support)
- Selector signatures (common selectors across same-type collections)
- iframe src patterns
- Form field patterns (input types, names)

Outputs: `src/builtins/interruption-rules.json`

### 4. Runtime Detection (运行时检测)

After each successful command execution in `executeCommand()`:

```typescript
const interruptions = scanForInterruptions(page);
if (interruptions.length > 0) {
  response.tips = [...(response.tips || []), ...interruptions.map(formatTip)];
}
```

**Detection logic**:
1. Fast check: match current URL against built-in rules (domain + path)
2. If domain matches, scan DOM for selector patterns
3. Return matched interruptions as tips

**Tips format**: `[!] captcha detected: reCAPTCHA v2` / `[!] login required: full page login`

### 5. Built-in Rules File

`src/builtins/interruption-rules.json`

```typescript
interface InterruptionRule {
  name: string;
  domains: string[];
  paths?: string[];
  selectors: string[];
  type: InterruptionType;
  subType: string;
  confidence: number;
}
```

Ships with ~20 pre-built rules for common patterns (Google reCAPTCHA, Cloudflare Turnstile, major site login pages, cookie consent banners).

## Implementation Plan

### Phase 1: Collector Mode
- New action handlers: `collect_start`, `collect_stop`
- Overlay script: mouse-follow highlight + type selector UI
- Data collection and file export
- CLI commands integration

### Phase 2: Processor Script
- Read collections, extract patterns
- Generate rules JSON
- Validate rules against test pages

### Phase 3: Runtime Detection
- `scanForInterruptions()` function
- Integrate into `executeCommand()` post-handler
- Load built-in rules + user custom rules

### Phase 4: Pre-built Rules
- Ship ~20 common rules
- Document how users can contribute
