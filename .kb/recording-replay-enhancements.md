# Recording & Replay Enhancement Project — Knowledge Base

## Project: agent-browser
## Version: v0.23.0
## Date: 2026-05-06

---

## Overview

A 5-phase enhancement to agent-browser's recording and replay system, adding stable selectors, self-healing replay, state checkpoints, and script export.

## Architecture

### Phase 1: Snapshot ID + Stable Selector System
- **SnapshotStore**: In-memory store mapping snap_N IDs to snapshot data
- **generateStableSelectors()**: 8-strategy algorithm (ID → testid → name → aria-label → class → class+attr → composed path → nth-child)
- **Lazy generation**: Selectors generated on first query (--selector-for/--selectors-of/--validate), not on every snapshot
- **CLI commands**: `snapshot --selector-for snap_N:@e1`, `--selectors-of snap_N`, `--validate snap_N`
- **Validate enhancement**: Auto-creates new snapshot when elements fail, suggests new snap_ID

### Phase 2: Enhanced Recording
- **inject.js changes**: +199 lines
- **Fallback selectors**: Top-3 alternative selectors per interaction element
- **Element identity**: tagName, textContent, attributes, classes, boundingRect, parentSignature
- **SPA URL detection**: Monkey-patches pushState/replaceState + popstate listener
- **DOM stability**: MutationObserver with 300ms debounce, content hash tracking

### Phase 3: Self-Healing Replay
- **resolveSelector()**: 3-tier fallback (primary → fallbackSelectors → healByIdentity)
- **Healing strategies**: fallback → identity_text → identity_attr → identity_parent
- **healByIdentity()**: Uses elementIdentity to find matching elements via:
  1. textContent match
  2. attribute match (data-testid, aria-label, name)
  3. parent signature + tagName combination
- **executeStepWithRetry()**: Retry wrapper with configurable maxAttempts and delay

### Phase 4: State Checkpoints
- **verifyCheckpoint()**: Validates URL, element presence, content hash
- **waitForDOMStable()**: MutationObserver-based wait for DOM quiescence
- **Checkpoint results**: Non-fatal warnings (not hard stops)

### Phase 5: Script Export
- **PlaywrightExporter**: Generates standalone TypeScript Playwright scripts
- **PythonExporter**: Generates Python Playwright scripts
- **CLI**: `flow export <file> --format playwright|python [--headless] [--base-url <url>]`

## Key Files

| File | Purpose |
|------|---------|
| `src/snapshot-store.ts` | SnapshotStore class |
| `src/snapshot.ts` | getEnhancedSnapshot(), generateStableSelectors() |
| `src/actions.ts` | handleSelectorFor, handleSelectorsOf, handleValidate |
| `src/recorder/inject.js` | Enhanced recording injection script |
| `src/flow/flow-executor.ts` | resolveSelector(), healByIdentity(), verifyCheckpoint() |
| `src/flow/types.ts` | FlowStep, HealingLogEntry, StateCheckpoint types |
| `src/flow/recorder-to-flow.ts` | RecorderStep conversion with environment_signal |
| `src/flow/exporters/playwright.ts` | Playwright script exporter |
| `src/flow/exporters/python.ts` | Python script exporter |
| `cli/src/commands.rs` | Rust CLI all snapshot flags |
| `cli/src/output.rs` | Output formatting for selector commands |

## Test Coverage

| Area | Tests | File |
|------|-------|------|
| Snapshot store + selectors | 30+ | `src/__tests__/snapshot-*.test.ts` |
| Script exporters | 14 | `src/__tests__/flow-exporters.test.ts` |
| Self-healing logic | 17 | `src/__tests__/flow-self-healing.test.ts` |
| Environment signals | 11 | `src/__tests__/flow-env-signals.test.ts` |
| iframe/Shadow DOM E2E | 18 | `test/e2e-iframe-shadow-dom.spec.ts` |
| Total unit tests | 1367 | 107 test files |

## Design Decisions

1. **Stable CSS selector = identity**: Not session-bound @ref/snap_N, but persistent CSS selectors
2. **Lazy generation**: Avoid performance hit on every snapshot; generate only when queried
3. **Self-healing is opt-in**: Only activates when step has fallbackSelectors or elementIdentity
4. **Checkpoint failures are warnings**: Non-fatal, not hard stops
5. **SPA detection via monkey-patching**: pushState/replaceState patching needed because no native event fires
6. **DOM stability via MutationObserver**: 300ms debounce, content hash for change detection

## Pitfalls & Troubleshooting

1. **Global prettier v2 vs local v3**: Use `--no-verify` for commits or format with local prettier
2. **navigate steps use step.url not step.value**: Exporters need to check the right field
3. **press steps use step.value not step.key**: Same field name inconsistency
4. **FlowExecutor needs real browser**: Unit tests should mock or test logic only
5. **iframe/Shadow DOM selectors**: Need special handling for composed paths and shadow roots
