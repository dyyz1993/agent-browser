# Session: strict-mode-fallback-test
Date: 2026-04-30
Module: nested-modal
Scenarios: 2 passed / 0 failed

## Tested
- Strict mode auto-fallback: PASSED
- Yellow warning display: PASSED

## Findings
- After submitting the full modal workflow, "Alpha Edited" appears 4 times in the page
- `find text "Alpha Edited" click` succeeds with auto-fallback (uses first match)
- Warning output format: `⚠ Matched 4 elements, used first match. Use 'find nth <index> text "Alpha Edited" --click' for a specific match.`
- Warning is yellow (ANSI color code 33) as expected
- The suggestion message correctly recommends using `find nth` for specificity

## Updated
- No selector changes needed
