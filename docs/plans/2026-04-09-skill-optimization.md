# Agent-Browser Skill Documentation Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring `skills/agent-browser/SKILL.md` and all references/templates up to date with v0.11.0 codebase capabilities, fixing ghost features, adding missing documentation for v0.10/v0.11 features, and reorganizing for better progressive disclosure.

**Architecture:** The skill is a static documentation package (`skills/agent-browser/`) shipped with the npm package. It consists of a mandatory `SKILL.md` (frontmatter + body), optional `references/` (deep-dive docs loaded on demand), and optional `templates/` (shell script templates). No build step, no tests — pure markdown + shell scripts. Changes are verified by reading the generated files and checking consistency against source code.

**Tech Stack:** Markdown, Shell Scripts (bash), YAML frontmatter

**Audit Baseline:**

- SKILL.md documents 21/55 commands (38%) and 10/19 global flags (53%)
- 3 major v0.10/v0.11 feature areas completely undocumented (Viewer mode, Mobile input, DeviceMode)
- 1 ghost reference file (`profiling.md`) describing nonexistent command
- Version drift: help.ts still says 0.10.0
- Templates have hardcoded user-specific proxy address

---

## Task 1: P0 — Fix Ghost Feature & Version Drift

**Files:**

- Delete: `skills/agent-browser/references/profiling.md`
- Modify: `src/cli/help.ts:1032`
- Modify: `src/stream-server-standalone.ts` (3 locations, search for `0.10.0`)
- Modify: `src/openapi.ts` (search for `0.10.0`)

### Step 1: Delete ghost profiling.md

```bash
rm skills/agent-browser/references/profiling.md
```

Reason: Documents nonexistent `agent-browser profiler` command. The actual command is `trace start`/`trace stop`, which is already documented in references/commands.md.

### Step 2: Fix version strings in source files

Search and replace all `0.10.0` -> `0.11.0` in:

- `src/cli/help.ts` line ~1032 (version display string)
- `src/stream-server-standalone.ts` (version in standalone server header, 3 occurrences)
- `src/openapi.ts` (API version string)

```bash
# Verify no other 0.10.0 remnants remain
grep -rn "0\.10\.0" src/ --include="*.ts" | grep -v node_modules | grep -v ".test."
```

Expected: Only test files or comments may still reference 0.10.0 historically.

### Step 3: Commit

```bash
git add skills/agent-browser/references/profiling.md src/cli/help.ts src/stream-server-standalone.ts src/openapi.ts
git commit -m "fix: remove ghost profiling.md, fix version drift to 0.11.0"
```

---

## Task 2: P1a — Reorganize SKILL.md Structure

**Files:**

- Modify: `skills/agent-browser/SKILL.md`

### Current structure (problematic):

```
1. Core Workflow          (good)
2. Recording & Replaying   (too early - advanced feature)
3. Working with Iframes    (specific, should be reference)
4. Essential Commands     (BURIED at #4!)
5. Human-like Mouse        (niche, equal weight to core)
6. Common Patterns         (good)
7. Ref Lifecycle          (important concept)
8. Semantic Locators      (alternative approach)
9. Proxy Configuration    (infrastructure)
10. Deep-Dive table       (reference links)
```

### Target structure:

```
# Header / Frontmatter

## Quick Start (Core Workflow)           -- was #1, keep as-is
## Essential Commands                    -- PROMOTE from #4
## Common Patterns                       -- was #6, move up
## Ref Lifecycle                         -- was #7, keep
## Advanced Features                     -- NEW section bucket
### Recording & Replaying              -- DEMOTE from #2
### Human-like Mouse Movement           -- was #5
### Viewer / Streaming Mode            -- NEW (Task 3)
### Mobile Remote Control              -- NEW (Task 4)
### iOS Simulator                      -- was iOS section, expand
### Cloud Providers                     -- NEW
## Reference Docs                        -- was Deep-Dive table, cleaned up
```

### Step 1: Write new SKILL.md skeleton

Create the reorganized file preserving ALL existing content but moving sections to new positions. Key changes:

1. **Promote "Essential Commands" to position #2** — right after Quick Start
2. **Move "Recording & Replaying" into "Advanced Features"** — it's not a daily workflow
3. **Move "Working with Iframes" into Essential Commands** as a sub-bullet of snapshot
4. **Add placeholder sections** for Viewer Mode (Task 3) and Mobile (Task 4) with TODO markers
5. **Remove `profiling.md` from Deep-Dive table**
6. **Add entries for new reference docs** (viewer.md, mobile-viewer.md — to be created in Tasks 3-4)

The reorganized SKILL.md should end up around 450-500 lines (up from 397, due to new content).

### Step 2: Verify markdown validity

```bash
# Check YAML frontmatter is intact
head -5 skills/agent-browser/SKILL.md
# Should show --- / name: / description: / ---

# Check no broken reference links
grep -oP '\[.*?\]\(references/.*?\)' skills/agent-browser/SKILL.md
# Each referenced file should exist
```

### Step 3: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): reorganize SKILL.md structure for better progressive disclosure"
```

---

## Task 3: P1b — Add Viewer/Streaming Mode Documentation

**Files:**

- Create: `skills/agent-browser/references/viewer-mode.md`
- Modify: `skills/agent-browser/SKILL.md` (fill in Viewer section from Task 2)

### Step 1: Create references/viewer-mode.md

Document the viewer/streaming architecture:

````markdown
# Viewer / Streaming Mode

## Overview

The viewer mode provides a real-time visual remote browser interface.
It streams browser frames (JPEG/WebP) over WebSocket and forwards
user input (mouse, keyboard, touch) back to the daemon.

## Starting the Viewer

```bash
# Method 1: Start viewer after opening a page
agent-browser open https://example.com
agent-browser viewer

# Method 2: Get connection details as JSON (for scripting)
agent-browser viewer --json
# Output: {"url":"http://localhost:5005/view?session=default","ws":"ws://...","port":5005}
```
````

## Viewer URL Parameters

- `?session=<id>` — Connect to a specific session
- `?instanceId=<id>` — Connect to a specific browser instance

## Architecture

```
Browser (Playwright) → Daemon (IPC) → Standalone Server (:5005) → Viewer (WebSocket)
                        ↑ frames (binary)              ↓ mouse/keyboard/touch (JSON)
```

## Element Selector / Crop Mode

Crop the video stream to a specific DOM element:

```bash
# Via viewer UI: click element selector button, then click target element
# Or via API when connected
```

When element mode is active:

- Frames are cropped to the element's bounding box on the server
- Mouse coordinates are automatically mapped to element-local space
- Falls back to full-page view if element is not found ("degraded mode")

## Viewer Features by Device Type

### Desktop (PC)

- Mouse movement, click, scroll via screen area
- Keyboard input via hidden capture field
- Full toolbar: URL bar, status indicator, record button

### Mobile (Touch Device)

- Touchpad at bottom: single-finger move cursor, long-press drag, two-finger scroll
- Virtual keyboard toolbar: Tab, Arrow keys, Enter, Backspace, Escape
- Input panel: tap an input field on remote page → local text input appears
- IME support: Chinese/Japanese composition (pinyin, etc.)
- DeviceMode: auto-detects mobile/desktop, switches UI dynamically

## Troubleshooting

- Black screen: Check daemon is running (`agent-browser status`)
- Connection refused: Ensure standalone server started (`agent-browser viewer` auto-starts it)
- Laggy updates: Check network latency; JPEG quality adjustable via status badge

````

### Step 2: Fill in SKILL.md Viewer section

In the "Advanced Features > Viewer / Streaming Mode" section added in Task 2, add:

```markdown
### Viewer / Streaming Mode

Remote browser visualization with real-time frame streaming.
See [viewer-mode.md](references/viewer-mode.md) for complete guide.

Quick start:
```bash
agent-browser open https://example.com
agent-browser viewer      # Opens viewer URL
agent-browser viewer --json # Get connection details
````

````

### Step 3: Commit

```bash
git add skills/agent-browser/references/viewer-mode.md skills/agent-browser/SKILL.md
git commit -m "docs(skill): add viewer/streaming mode documentation"
````

---

## Task 4: P1c — Add Mobile Remote Control Documentation

**Files:**

- Create: `skills/agent-browser/references/mobile-viewer.md`
- Modify: `skills/agent-browser/SKILL.md` (fill in Mobile section)

### Step 1: Create references/mobile-viewer.md

Document the mobile touch/input system built in v0.10-v0.11:

````markdown
# Mobile Remote Control (Viewer Mode)

## Touchpad System

On touch devices, the viewer shows a **touchpad** area at the bottom
of the screen that simulates mouse input on the remote browser:

| Gesture             | Action                             |
| ------------------- | ---------------------------------- |
| Single tap          | Click at cursor position           |
| Single finger drag  | Move virtual cursor                |
| Long press (~800ms) | Enter drag mode (hold mouse down)  |
| Two finger drag     | Scroll wheel (vertical/horizontal) |
| Two finger release  | Momentum scroll (deceleration)     |

## Virtual Keyboard Toolbar

Collapsible toolbar at top of touchpad with frequently used keys:

- Tab, Arrow Up/Left/Down/Right, Enter, Backspace, Escape
- Tap any key to send it to the remote browser
- Expand/collapse button to show all keys or minimize

## Text Input (Input Panel)

When you tap on an `<input>`, `<textarea>`, or `[contenteditable]`
element in the remote browser view:

1. Daemon detects focus event → sends `input_focused` message to viewer
2. Viewer enters **input mode**: hides cursor, shows input panel at bottom
3. You type in the local input field → text syncs to remote via `input_fill`
4. Press Send (arrow icon) or Enter → commits text + sends Enter key
5. Press Escape or click outside → exits input mode, restores touchpad

### IME / CJK Support

- Composition events (`compositionstart`/`compositionend`) are intercepted
- Intermediate pinyin/kana input is NOT sent to remote (prevents garbage)
- Only committed characters are synced (after user selects from IME candidate list)
- RAF polling catches value changes that compositionend might miss

## DeviceMode Dynamic Switching

The viewer auto-detects device type and switches UI accordingly:

```javascript
// Detection logic (in viewer-script.ts)
function detectDeviceMode() {
  var uaMatch = /iphone|ipod|android(?=.*mobile)|mobile|tablet|ipad/i.test(ua);
  var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return uaMatch || hasTouch ? 'mobile' : 'desktop';
}
```
````

Triggers for re-detection:

- `resize` event (window resize, phone rotation)
- `orientationchange` event
- `matchMedia("(pointer:coarse)")` change (e.g., connecting stylus)

Module architecture:

- **DeviceMode** singleton: reactive state (`current`, `switchTo()`, `onModeChange()`)
- **DesktopModule**: manages hiddenInput creation/removal for keyboard capture
- **MobileModule**: manages touchpad visibility, cursor init, input panel lifecycle

## Mobile-Specific Considerations

- **iOS Safari**: Uses `dvh` units for layout stability during keyboard show/hide
- **VisualViewport API**: Detects keyboard height to push input panel above it
- **Scroll guard**: Interval prevents iOS from auto-scrolling during input
- **Touch action**: Set to `none` on body during input mode to prevent browser gestures

````

### Step 2: Fill in SKILL.md Mobile section

In "Advanced Features > Mobile Remote Control":

```markdown
### Mobile Remote Control
Touch-optimized viewer with virtual touchpad, text input panel,
and IME support. See [mobile-viewer.md](references/mobile-viewer.md).

Automatically activates on touch devices (phones, tablets).
````

Also update the existing iOS Simulator section to cross-reference mobile viewer:

```markdown
### iOS Simulator

Native Appium-based iOS automation. See [commands.md](references/commands.md).
Note: Mobile viewer mode (above) is different — it works on ANY
phone/tablet browser via web viewer, no simulator required.
```

### Step 3: Commit

```bash
git add skills/agent-browser/references/mobile-viewer.md skills/agent-browser/SKILL.md
git commit -m "docs(skill): add mobile remote control documentation (touchpad, input, IME, DeviceMode)"
```

---

## Task 5: P1d — Complete Command Coverage in SKILL.md

**Files:**

- Modify: `skills/agent-browser/SKILL.md` (Essential Commands section)

### Step 1: Read current command inventory from source

```bash
# Extract all command names from the switch statement
grep -n "case '" src/cli/commands.ts | head -60
```

This gives us the authoritative list of 55 commands.

### Step 2: Expand Essential Commands section

Rewrite the Essential Commands block to include ALL commonly-used commands, organized by category:

```markdown
## Essential Commands

### Navigation

agent-browser open <url> # Navigate (aliases: goto, navigate)
agent-browser back # Go back
agent-browser forward # Go forward
agent-browser reload # Reload page
agent-browser close # Close browser

### Element Interaction

agent-browser click @e1 # Click element
agent-browser dblclick @e1 # Double-click
agent-browser fill @e2 "text" # Clear and type text
agent-browser type @e2 "text" # Type without clearing
agent-browser select @e1 "option" # Select dropdown
agent-browser check @e1 # Check checkbox
agent-browser uncheck @e1 # Uncheck checkbox
agent-browser press Enter # Press key
agent-browser keydown / keyup # Raw key down/up
agent-browser hover @e1 # Hover over element
agent-browser focus @e1 # Focus element
agent-browser drag @e1 @e2 # Drag from e1 to e2
agent-browser upload @e1 "/path" # Upload file
agent-browser download @e1 "/path" # Download resource

### Scrolling

agent-browser scroll down 500 # Scroll pixels
agent-browser scrollintoview @e1 # Scroll element into view

### Information

agent-browser snapshot -i # Interactive elements with refs
agent-browser get text @e1 # Get element text
agent-browser get url / title # Page info
agent-browser get count ".item" # Count matching elements
agent-browser get box @e1 # Bounding box
agent-browser is visible @e1 # Visibility check
agent-browser is enabled @e1 # Enabled check
agent-browser is checked @e1 # Checked state

### Waiting

agent-browser wait @e1 # Wait for element
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --url "\*\*/page" # Wait for URL
agent-browser wait --text "Hello" # Wait for text
agent-browser wait --fn "document.hidden === false"
agent-browser wait --download # Wait for download
agent-browser wait 2000 # Wait ms

### Capture

agent-browser screenshot # Screenshot
agent-browser screenshot --full # Full page
agent-browser pdf output.pdf # Save PDF

### Session & State

agent-browser --session name open ... # Named session
agent-browser state save auth.json # Save browser state
agent-browser --state auth.json open ... # Restore state
agent-browser connect <url> # Connect to remote browser
agent-browser kill # Kill daemon process
agent-browser config [--json] # Show/edit config
```

### Step 3: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): expand Essential Commands to cover all 55 commands"
```

---

## Task 6: P2a — Add Missing Global Flags Section

**Files:**

- Modify: `skills/agent-browser/SKILL.md`

### Step 1: Add Global Options section

After Essential Commands, add:

````markdown
## Global Options

These flags work with most commands:

| Flag                       | Description                          |
| -------------------------- | ------------------------------------ |
| `--session <name>`         | Use named browser session            |
| `--json`                   | Output JSON format                   |
| `--headed`                 | Show browser window (debugging)      |
| `--cdp <url>`              | Connect via Chrome DevTools Protocol |
| `--proxy <url>`            | HTTP/SOCKS proxy                     |
| `--proxy-bypass <rules>`   | Proxy bypass rules                   |
| `--headers 'K: V'`         | Extra HTTP headers                   |
| `--state <path>`           | Restore browser state file           |
| `--profile <path>`         | Chrome profile directory             |
| `--args "<args>"`          | Extra Chromium args                  |
| `--user-agent <ua>`        | Custom User-Agent string             |
| `--executable-path <path>` | Browser binary path                  |
| `--extension <path>`       | Load Chrome extension                |
| `--ignore-https-errors`    | Ignore HTTPS errors                  |
| `--allow-file-access`      | Allow file:// URLs                   |
| `--timeout <ms>`           | Global operation timeout             |
| `--debug`                  | Verbose debug logging                |

Examples:

```bash
agent-browser --proxy http://proxy:8080 open https://example.com
agent-browser --headed --debug open https://example.com
agent-browser --user-agent "MyBot/1.0" open https://example.com
```
````

````

### Step 2: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): add Global Options section covering all 19 flags"
````

---

## Task 7: P2b — Update Network Monitoring Section

**Files:**

- Modify: `skills/agent-browser/SKILL.md` (Network Monitoring section)

### Step 1: Add missing flags to Network Monitoring section

Current section (lines 121-126) only shows 4 flags. Expand to:

````markdown
## Network Monitoring & API Mocking

```bash
# View all requests
agent-browser network requests

# Filter requests
agent-browser network requests --filter "**/api/**"

# Clear history
agent-browser network requests --clear

# Capture response bodies (for API testing/data extraction)
agent-browser network requests --capture-response
agent-browser network requests --capture-response --type json
agent-browser network requests --output ./captures/

# Mock API responses
agent-browser network route "**/api/users" --body '{"users": []}'

# Block requests (ads, tracking, analytics)
agent-browser network route "**/ads/**" --abort

# Remove routes
agent-browser network unroute "**/api/users"

# Passive capture: wait for specific request (background listener)
agent-browser wait --request "api/data" --timeout 30 > response.json
```
````

See [network-monitoring.md](references/network-monitoring.md) for advanced patterns including request modification and concurrent interception.

````

### Step 2: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): add --capture-response, --type, --output to network monitoring docs"
````

---

## Task 8: P2c — Add Cloud Providers Section

**Files:**

- Modify: `skills/agent-browser/SKILL.md`

### Step 1: Add Cloud Providers section

In Advanced Features, add:

````markdown
### Cloud Browser Providers

Connect to managed browser services instead of local Chromium:

```bash
# Browserbase (browserbase.com)
BROWSERBASE_API_KEY=your-key agent-browser --provider browserbase open https://example.com

# Browser Kernel (kernel.dev)
KERNEL_API_KEY=your-key agent-browser --provider kernel open https://example.com

# BrowserUse (browseruse.com)
BROWSERUSE_API_KEY=your-key agent-browser --provider browseruse open https://example.com
```
````

Providers support all standard commands (click, fill, snapshot, etc.) with cloud-hosted browsers. Useful for:

- Geo-distributed testing (browsers in different regions)
- Avoiding IP blocks (residential proxies built-in)
- Team sharing (persistent sessions)
- Scaling (parallel browser instances)

````

### Step 2: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): add Cloud Providers section (Browserbase, Kernel, BrowserUse)"
````

---

## Task 9: P3a — Fix Templates

**Files:**

- Modify: `skills/agent-browser/templates/*.sh` (all 7 template files)

### Step 1: Remove hardcoded proxy address

All templates contain:

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
```

Replace with:

```bash
# Optional: set your proxy if needed
export https_proxy=${PROXY_URL:-http://127.0.0.1:7890}
export http_proxy=${PROXY_URL:-http://127.0.0.1:7890}
```

Affected templates:

- `templates/api-interception.sh`
- `templates/authenticated-session.sh`
- `templates/capture-workflow.sh`
- `templates/data-extraction.sh`
- `templates/form-automation.sh`
- `templates/network-intercept-crawl.sh`
- `templates/verify-form.sh`
- `templates/verify-login.sh`
- `templates/verify-recording.sh`
- `templates/verify-upload.sh`

### Step 2: Standardize error handling

Ensure all templates have:

```bash
set -euo pipefail
```

Check which ones are missing it and add.

### Step 3: Thicken form-automation.sh

Current form-automation.sh is mostly comments. Add a working example:

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://example.com/form}"
SESSION="form-demo-$(date +%s)"

echo "=== Form Automation: $URL ==="

agent-browser --session "$SESSION" open "$URL"
agent-browser --session "$SESSION" snapshot -i
# Output: @e1 [input name="email"], @e2 [input name="password"], @e3 [button] "Submit"

agent-browser --session "$SESSION" fill @e1 "user@example.com"
agent-browser --session "$SESSION" fill @e2 "secretpass123"
agent-browser --session "$SESSION" click @e3
agent-browser --session "$SESSION" wait --load networkidle

echo "=== Result ==="
agent-browser --session "$SESSION" snapshot -i
```

### Step 4: Add missing template — viewer-mode.sh

Create `templates/viewer-remote.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Viewer Mode: Remote browser visualization and control
# Usage: ./viewer-remote.sh [url]

URL="${1:-https://www.baidu.com}"
SESSION="viewer-$(date +%s)"

echo "=== 1. Launch browser ==="
agent-browser --session "$SESSION" --headed open "$URL"

echo "=== 2. Start viewer ==="
INFO=$(agent-browser --session "$SESSION" viewer --json)
echo "Viewer: $INFO"

# Extract URL from JSON (requires jq)
VIEWER_URL=$(echo "$INFO" | jq -r '.url')
echo "Open in browser: $VIEWER_URL"

echo "=== 3. Interact remotely ==="
# At this point, open VIEWER_URL in your browser
# You can see and interact with the remote browser in real-time
echo "Waiting for interaction... (Ctrl+C to stop)"

sleep 300

echo "=== Cleanup ==="
agent-browser --session "$SESSION" close
```

### Step 5: Add missing template — recorder-workflow.sh

Create `templates/recorder-workflow.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Recorder Workflow: Record actions, save as YAML, replay later
# Usage: ./recorder-workflow.sh [url]

URL="${1:-https://example.com}"
OUTPUT="${2:-recording-$(date +%Y%m%d-%H%M%S).yaml}"

echo "=== 1. Start recording ==="
agent-browser recorder start --session record-session

echo "=== 2. Perform workflow on: $URL ==="
agent-browser --session record-session open "$URL"
agent-browser --session record-session snapshot -i
# ... perform your actions here ...

echo "=== 3. Stop and save ==="
agent-browser recorder stop --session record-session --output "$OUTPUT"
echo "Saved to: $OUTPUT"

echo "=== 4. Replay (verify) ==="
# agent-browser recorder replay "$OUTPUT"
```

### Step 6: Commit

```bash
git add skills/agent-browser/templates/
git commit -m "docs(skill): fix templates — remove hardcoded proxy, add viewer/recorder templates"
```

---

## Task 10: P3b — Update Reference Table & Cross-References

**Files:**

- Modify: `skills/agent-browser/SKILL.md` (Deep-Dive / Reference Docs table)

### Step 1: Rewrite reference table

Replace the old table (lines 387-396) with:

```markdown
## Reference Docs

| Reference                                                 | Content                                              |
| --------------------------------------------------------- | ---------------------------------------------------- |
| [commands.md](references/commands.md)                     | Complete command reference with all options          |
| [data-extraction.md](references/data-extraction.md)       | DOM, JS variables, API interception, infinite scroll |
| [snapshot-refs.md](references/snapshot-refs.md)           | Ref lifecycle, invalidation, troubleshooting         |
| [session-management.md](references/session-management.md) | Parallel sessions, state persistence                 |
| [authentication.md](references/authentication.md)         | Login flows, OAuth, 2FA, state reuse                 |
| [recorder.md](references/recorder.md)                     | Action recording & replay for test automation        |
| [video-recording.md](references/video-recording.md)       | Video recording for debugging                        |
| [proxy-support.md](references/proxy-support.md)           | Proxy config, geo-testing, rotating proxies          |
| [network-monitoring.md](references/network-monitoring.md) | Request monitoring, API mocking, blocking            |
| [viewer-mode.md](references/viewer-mode.md)               | **NEW** Streaming viewer, element crop, architecture |
| [mobile-viewer.md](references/mobile-viewer.md)           | **NEW** Touchpad, input panel, IME, DeviceMode       |
```

Changes vs old table:

- Removed: `profiling.md` (ghost feature, deleted in Task 1)
- Added: `viewer-mode.md` (created in Task 3)
- Added: `mobile-viewer.md` (created in Task 4)

### Step 2: Verify all referenced files exist

```bash
for f in commands data-extraction snapshot-refs session-management \
           authentication recorder video-recording proxy-support \
           network-monitoring viewer-mode mobile-viewer; do
  if [ -f "skills/agent-browser/references/${f}.md" ]; then
    echo "OK: ${f}.md"
  else
    echo "MISSING: ${f}.md"
  fi
done
```

Expected: All 12 files report OK.

### Step 3: Final lint pass

```bash
# Check SKILL.md has valid frontmatter
head -6 skills/agent-browser/SKILL.md
# Must have: --- / name: / description: / allowed-tools: / ---

# Check total size (target: 500-600 lines)
wc -l skills/agent-browser/SKILL.md

# Check no trailing whitespace
grep -rn ' $' skills/agent-browser/SKILL.md skills/agent-browser/references/*.md | head -5
```

### Step 4: Commit

```bash
git add skills/agent-browser/SKILL.md
git commit -m "docs(skill): update reference table, add viewer/mobile entries, remove profiling"
```

---

## Task 11: Final Verification & Build Test

**Files:** None (verification only)

### Step 1: Run full skill validation

```bash
# 1. All reference files exist and are non-empty
for f in skills/agent-browser/references/*.md; do
  [ -s "$f" ] && echo "OK: $f" || echo "EMPTY: $f"
done

# 2. All templates are executable and have shebang
for f in skills/agent-browser/templates/*.sh; do
  head -1 "$f" | grep -q "#!/" && echo "OK: $f" || echo "NO_SHEBANG: $f"
done

# 3. SKILL.md frontmatter is valid
python3 -c "
import yaml, sys
with open('skills/agent-browser/SKILL.md') as f:
    content = f.read()
# Extract frontmatter
if content.startswith('---'):
    end = content.index('---', 4)
    meta = yaml.safe_load(content[3:end])
    assert 'name' in meta, 'Missing name'
    assert 'description' in meta, 'Missing description'
    print('Frontmatter OK:', meta['name'])
else:
    print('ERROR: No frontmatter found')
    sys.exit(1)
"

# 4. No broken internal links
grep -ohP '\[.*?\]\(references/[^)]+\)' skills/agent-browser/SKILL.md | \
  sed 's/.*\(references\/[^)]*\).*/\1/' | sort -u | while read ref; do
  [ -f "skills/agent-browser/$ref" ] && echo "OK: $ref" || echo "BROKEN: $ref"
done

# 5. Build still passes
npm run build 2>&1 | tail -3

# 6. Tests still pass
npx vitest run src/__tests__/device-mode-tdd.test.ts src/__tests__/mobile-input*.test.ts 2>&1 | tail -5
```

### Step 2: Final commit (if any fixes needed)

```bash
git add -A
git commit -m "docs(skill): final verification — all references valid, build passes"
```

---

## Execution Summary

| Task                                 | Priority | Scope                              | Files Changed |
| ------------------------------------ | -------- | ---------------------------------- | ------------- |
| 1. Fix ghost feature + version drift | P0       | Delete 1 file, edit 3 source files | 4             |
| 2. Reorganize SKILL.md structure     | P1       | Restructure 397-line doc           | 1             |
| 3. Add viewer mode docs              | P1       | Create 1 ref doc, update SKILL.md  | 2             |
| 4. Add mobile viewer docs            | P1       | Create 1 ref doc, update SKILL.md  | 2             |
| 5. Complete command coverage         | P1       | Expand Essential Commands          | 1             |
| 6. Add global flags section          | P2       | New section in SKILL.md            | 1             |
| 7. Update network monitoring         | P2       | Expand existing section            | 1             |
| 8. Add cloud providers               | P2       | New section in SKILL.md            | 1             |
| 9. Fix templates                     | P3       | Edit 7+ templates, create 2 new    | ~10           |
| 10. Update reference table           | P3       | Clean up table + verify links      | 1             |
| 11. Final verification               | —        | Validation only                    | 0             |

**Total: 11 tasks, ~25 files touched, estimated 200-300 lines added/changed**

**Execution options:**

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks
2. **Parallel Session (separate)** — Save plan, open new session with executing-plans

Which approach?
