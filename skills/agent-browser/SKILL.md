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

## Capabilities

| Area | Key Commands | Deep Dive |
|------|-------------|-----------|
| Page Navigation & Interaction | `open`, `click`, `dblclick`, `type`, `fill` | See `agent-browser --help` |
| Snapshot & Element Inspection | `snapshot` | [snapshot-refs](references/snapshot-refs.md) |
| Finding Elements | `find by role`, `text`, `label` | [commands](references/commands.md) |
| Data Extraction | `eval` | [data-extraction](references/data-extraction.md) |
| Network Control | `request monitoring`, `API mocking`, `URL blocking` | [network-monitoring](references/network-monitoring.md) |
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
2. `snapshot -i` → get element refs (`@e1`, `@e2`, ...)
3. `fill` / `click` / `select` → interact using refs
4. Re-`snapshot` after any page change (refs are invalidated)

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
