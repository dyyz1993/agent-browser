---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, viewer/streaming mode, mobile remote control, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", "view remote browser", "mobile browsing", or any task requiring programmatic web interaction.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

Fast CLI for browser automation. Works headlessly by default, supports named sessions, proxy, and remote streaming.

## Browser Setup (macOS)

Set the browser path to avoid Playwright downloading Chromium:

```bash
export AGENT_BROWSER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium
```

Or per-command: `agent-browser --executable-path /Applications/Chromium.app/Contents/MacOS/Chromium open <url>`

Verify: `agent-browser config`

**Important**: The daemon persists across commands. If the env var is not inherited by your shell (common in sub-processes), pass `--executable-path` on the first `open` — it's stored in the daemon for the session lifetime. If the daemon restarts (crash/timeout), you must pass it again.

## Daemon Management

agent-browser runs a background daemon per session. If commands hang or timeout, the daemon may be stale:

```bash
agent-browser kill                    # Kill all daemons + stream server
agent-browser kill --session myname   # Kill specific session daemon
agent-browser session list            # Check active sessions
```

Common recovery pattern:

```bash
agent-browser kill && agent-browser open https://example.com   # Fresh start
```

**`tab new <url>`** waits for full page load and may timeout on slow sites. If it fails, the tab is usually created — run `tab list` to check, then `tab <index>` to switch.

## Quick Start

```bash
agent-browser open https://example.com
agent-browser snapshot -i                        # Get refs: @e1, @e2, ...
agent-browser fill @e1 "user@example.com"        # Interact via refs
agent-browser click @e2
agent-browser snapshot -i                        # Re-snapshot after page change
```

## Discovering Commands

```bash
agent-browser --help                             # All commands & options
agent-browser snapshot --help                    # Command-specific help
agent-browser config                             # Current config & env vars
```

The CLI is self-documenting. When unsure about a command, run `--help` first.

Global flags (`--session`, `--proxy`, `--state`, etc.) work at any position — before or after the subcommand.

## Basic Info Commands

```bash
agent-browser get title              # Page title
agent-browser get url                # Current URL
agent-browser get text @e1           # Element text
agent-browser get text body          # All page text
agent-browser is visible @e1         # Visibility check
```

## Network Monitoring Pattern

Request tracking activates on first use. After `open`, run `network requests` twice — once to activate, once after triggering requests:

```bash
agent-browser open https://example.com
agent-browser network requests                 # Activates tracking (may show hint)
agent-browser reload                           # Trigger requests
agent-browser network requests                 # Now shows captured requests
```

### WebSocket Monitoring

WebSocket tracking activates on first use and captures all WS connections at the CDP level (no JS injection needed, survives page navigation):

```bash
agent-browser network websockets                 # Activate tracking + show connections
agent-browser network websockets --json          # Structured JSON output
agent-browser network websockets --filter "ws://"  # Filter by URL
agent-browser network websockets --clear          # Clear captured data
```

### Snapshot ID System

Every `snapshot -i` now returns a unique snapshot ID (snap_1, snap_2, ...) in the output. This ID is used to query stable CSS selectors for any element captured in that snapshot.

```bash
agent-browser snapshot -i
# Output includes:
#   ## Snapshot: snap_3
#   - searchbox "Search" [ref=e1]
#   - button "Submit" [ref=e2]
#   Tip: Use --selector-for snap_3:@e1 to get a stable selector
```

### Stable Selectors & Command History

After taking a snapshot, use the snapshot ID to query stable CSS selectors that survive across page changes (unlike refs, which are invalidated by DOM mutations). Selectors are generated using an 8-strategy algorithm that always produces the shortest, most semantically meaningful unique selector.

```bash
# Get selector for a specific element (by ref)
agent-browser snapshot --selector-for snap_3:@e1
# Output: snap_3 e1 (button "Submit")
#           CSS:      #submit-btn
#           XPath:    //*[@id="submit-btn"]

# Get selector by index
agent-browser snapshot --selector-for snap_3:1

# List all selectors for a snapshot
agent-browser snapshot --selectors-of snap_3
# Output:
#   [1] e1 searchbox "Search"     ->  #search-input
#   [2] e2 button "Submit"        ->  #submit-btn

# Validate selectors still match after page changes
agent-browser snapshot --validate snap_3
# Output:
#   [1] e1 #search-input   ->  valid
#   [2] e2 #submit-btn     ->  not found (element removed)
```

Selector strategies (tried in order, first unique match wins):

1. `#id`
2. `[data-testid="..."]`
3. `tag[name="..."]`
4. `tag[aria-label="..."]`
5. `tag.semantic-class`
6. `tag.class[attr="..."]`
7. Composed path (`ancestor > tag`)
8. `tag:nth-child(n)` fallback

Each strategy validates uniqueness via `querySelectorAll`, ensuring the selector matches exactly one element.

```bash
# Get recorded interaction history (auto-captured)
agent-browser history                    # Show all recorded interactions
agent-browser history --filter "fill"    # Filter by action type
agent-browser history --clear            # Clear history
```

**Note:** `history` records `fill`, `click`, `select`, `check`, `uncheck`, and `eval` commands. `eval` entries have `action: "eval"`, `selector: "javascript"`, and `value` containing the script (truncated at 200 chars). Failed eval commands are also recorded with `success: false`.

### Strict Mode Auto-Fallback

When `find text`, `find role`, or `find label` matches multiple elements, Playwright throws a "strict mode violation" error. agent-browser now automatically falls back to the first matching element instead of failing.

The command succeeds with a yellow warning in the output:
```
⚠ Matched 3 elements, used first match. Use 'find nth <index> text "X" --click' for a specific match.
```

To target a specific element, use `find nth <index> text "X" --click` or a more specific CSS selector (`#id`, `[data-testid]`).

### Snapshot --all (Include Visually Hidden Elements)

By default, `snapshot -i --selectors` only includes elements that are visually visible. Elements with `opacity: 0`, zero dimensions, or positioned off-screen are filtered out.

Use `--all` to include all elements present in the accessibility tree:
```bash
agent-browser snapshot -i --selectors --all
```

**Limitation:** Elements with `display: none` or `visibility: hidden` are excluded by Playwright's accessibility tree generator and cannot be included, even with `--all`. For such elements, use `eval` to discover them via DOM queries.

## Capabilities

| Area | Key Commands | Deep Dive |
|------|-------------|-----------|
| Page Navigation & Interaction | `open`, `click`, `dblclick`, `type`, `fill` | See `agent-browser --help` |
| Snapshot & Element Inspection | `snapshot` | [snapshot-refs](references/snapshot-refs.md) |
| Finding Elements | `find by role`, `text`, `label` | [commands](references/commands.md) |
| Data Extraction | `eval` | [data-extraction](references/data-extraction.md) |
| Network Control | `request monitoring`, `WebSocket monitoring`, `API mocking`, `URL blocking` | [network-monitoring](references/network-monitoring.md) |
| Session & State | `connect`, `close`, `cookies`, `storage`, `tab` | [session-management](references/session-management.md) |
| Authentication | `login flows`, `OAuth`, `2FA` | [authentication](references/authentication.md) |
| Recording & Replay | `record`, `recorder` | [recorder](references/recorder.md) |
| Visual Remote Control (Viewer) | `viewer` | [viewer-mode](references/viewer-mode.md) |
| Mobile Remote Control | `touchpad gestures`, `input panel`, `IME/CJK` | [mobile-viewer](references/mobile-viewer.md) |
| iOS Simulator (Appium) | `native iOS automation via Xcode + Appium` | See `agent-browser -p ios --help` |
| Cloud Browser Providers | `browserbase`, `kernel`, `browseruse` | See `agent-browser --help` |
| Proxy & Network Config | `install` | [proxy-support](references/proxy-support.md) |

### Core Workflow Pattern

1. `open <url>` → navigate
2. `snapshot -i` → get element refs (`@e1`, `@e2`, ...) and a snapshot ID (`snap_N`)
3. `fill` / `click` / `select` → interact using refs
4. After page changes, `snapshot --validate snap_N` to check which selectors still work
5. Use `snapshot --selectors-of snap_N` to collect stable selectors for later use
6. Re-`snapshot -i` after significant page changes (refs are invalidated)

### Session Isolation

Refs live within a **session scope** (default: `default`). Multiple Bash processes sharing the same session share the same refs and browser state — one process navigating away invalidates another's refs.

**When running parallel tasks**, assign each a unique session:

```bash
agent-browser --session task1 open https://site-a.com
agent-browser --session task2 open https://site-b.com
```

If ref errors occur unexpectedly, check whether another process is operating on the same session with `agent-browser session list`.

### Refs

Refs (`@e1`, `@e2`) are **session-scoped** — valid across Bash processes within the same session, but invalidated by any page change (navigation, form submit, dynamic load). Always re-snapshot after DOM mutations. See [snapshot-refs.md](references/snapshot-refs.md).

For selectors that survive page changes, use the stable selector system (`--selector-for`, `--selectors-of`, `--validate`) with snapshot IDs. Stable selectors are CSS selectors computed once per snapshot and can be validated later even after the DOM mutates.

When multiple elements share the same role+name, each gets a unique ref with a `[nth=N]` annotation. Just use the ref — the nth index is built in:

```
- button "Submit" [ref=e1]
- button "Submit" [ref=e5] [nth=1]    # Use @e5, no need to specify nth
```

### Iframes

```bash
agent-browser snapshot --in-frame "#my-iframe"           # Single iframe
agent-browser click @e1 --in-frame "#outer/inner"        # Nested
```

### Semantic Locators (No Refs Needed)

```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
```

## Key Flags

- `--session <name>` — Isolated session (or AGENT_BROWSER_SESSION env)
- `--profile <path>` — Persistent browser profile
- `--state <path>` — Load storage state from JSON file
- `--headers <json>` — HTTP headers scoped to URL's origin
- `--executable-path <path>` — Custom browser executable
- `--extension <path>` — Load browser extensions (repeatable)
- `--args <args>` — Browser launch args
- `--user-agent <ua>` — Custom User-Agent
- `--proxy <server>` — Proxy server URL
- `--proxy-bypass <hosts>` — Bypass proxy for these hosts
- `--ignore-https-errors` — Ignore HTTPS certificate errors
- `--allow-file-access` — Allow file:// URLs to access local files
- `-p, --provider <name>` — Browser provider: ios, browserbase, kernel
- `--device <name>` — iOS device name
- `--json` — JSON output
- `--full, -f` — Full page screenshot
- `--headed` — Show browser window
- `--cdp <port>` — Connect via CDP
- `--debug` — Debug output
- `--version, -V` — Show version
- `--help, -h` — Show this help

## Environment Variables

- `AGENT_BROWSER_SESSION` — Session name (default: "default")
- `AGENT_BROWSER_EXECUTABLE_PATH` — Custom browser executable path
- `AGENT_BROWSER_PROVIDER` — Browser provider (ios, browserbase, kernel, browseruse)
- `AGENT_BROWSER_IOS_DEVICE` — Default iOS device name
- `AGENT_BROWSER_IOS_UDID` — iOS device UDID
- `AGENT_BROWSER_STREAM_PORT` — Stream Server port (default: 5005)
- `AGENT_BROWSER_SOCKET_DIR` — Custom socket directory
- `AGENT_BROWSER_HOME` — Installation directory
- `AGENT_BROWSER_PROFILE` — Persistent browser profile path
- `AGENT_BROWSER_STATE` — Storage state JSON file path
- `AGENT_BROWSER_EXTENSIONS` — Browser extensions (comma-separated)
- `AGENT_BROWSER_ARGS` — Browser launch args
- `AGENT_BROWSER_USER_AGENT` — Custom User-Agent
- `AGENT_BROWSER_PROXY` — Proxy server URL
- `AGENT_BROWSER_PROXY_BYPASS` — Proxy bypass hosts
- `AGENT_BROWSER_IGNORE_HTTPS_ERRORS` — Set to "1" to ignore HTTPS errors
- `AGENT_BROWSER_ALLOW_FILE_ACCESS` — Set to "1" to allow file:// access
- `AGENT_BROWSER_HEADED` — Set to "1" for headed mode
- `AGENT_BROWSER_HUMAN` — Enable human-like mouse movement (1, bezier, arc, random, linear)
- `MESSAGE_BRIDGE_URL` — Message Bridge URL for 'ask' command
- `HTTP_PROXY` / `HTTPS_PROXY` — Proxy for Message Bridge requests

## Reference Docs

| Doc | Content |
|-----|---------|
| [Complete Command Reference](references/commands.md) | All commands with options and examples |
| [Snapshot & Refs](references/snapshot-refs.md) | Ref lifecycle, invalidation rules, shell scripts |
| [Data Extraction](references/data-extraction.md) | DOM scraping, JS eval, API interception, infinite scroll |
| [Session & State](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping |
| [Authentication](references/authentication.md) | Login flows, OAuth, 2FA, state reuse |
| [Network Control](references/network-monitoring.md) | Request monitoring, API mocking, URL blocking |
| [Recording & Replay](references/recorder.md) | Step recorder, video recording, trace |
| [Proxy Config](references/proxy-support.md) | HTTP/SOCKS5 proxy, geo-testing, rotating proxies |
| [Viewer / Streaming](references/viewer-mode.md) | Frame streaming, element crop, architecture |
| [Mobile Remote Control](references/mobile-viewer.md) | Touchpad, input panel, IME/CJK, DeviceMode |
| [Video Recording](references/video-recording.md) | WebM video capture for debugging |
