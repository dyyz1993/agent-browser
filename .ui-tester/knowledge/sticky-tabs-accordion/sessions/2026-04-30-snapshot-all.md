# Session: snapshot-all-test
Date: 2026-04-30
Module: sticky-tabs-accordion
Scenarios: 0 passed / 1 failed (feature present but no difference observed)

## Tested
- `snapshot -i --selectors --all` vs `snapshot -i --selectors`: NO DIFFERENCE OBSERVED

## Findings
- The `--all` flag is accepted without error (feature exists)
- On this page, with the default Profile tab active:
  - Normal: 2 selectors (#p-name, #p-title)
  - With --all: 2 selectors (identical)
- Hidden elements on this page:
  - `display:none` - panels: #panel-details, #panel-settings, #panel-review, #final
  - `opacity:0` - save indicators: #save-ind-1, #save-ind-3
- Even collapsing accordions on the Details tab did not produce a diff
- The accessibility tree itself may filter display:none elements before --all visibility filtering
- --all may only affect elements with opacity:0 or off-screen positioning, not display:none
- Raw JSON snapshot output is identical between --all and no --all

## Possible Explanation
- display:none elements are removed from the accessibility tree by the browser, so --all cannot include them
- opacity:0 save indicators may not be interactive (no role in accessibility tree), so they are not included
- The feature may work correctly for elements that are in the accessibility tree but marked invisible by CSS (off-screen, zero-size) rather than display:none
