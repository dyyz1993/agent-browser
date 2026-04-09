---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, viewer/streaming mode, mobile remote control, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", "view remote browser", "mobile browsing", or any task requiring programmatic web interaction.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Quick Start

Every browser automation follows this pattern:

1. **Navigate**: `agent-browser open <url>`
2. **Snapshot**: `agent-browser snapshot -i` (get element refs like `@e1`, `@e2`)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation or DOM changes, get fresh refs

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Submit"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Essential Commands

### Navigation

```bash
agent-browser open <url>              # Navigate (aliases: goto, navigate)
agent-browser back                   # Go back
agent-browser forward                # Go forward
agent-browser reload                 # Reload page
agent-browser close                  # Close browser (alias: quit, exit)
```

### Element Interaction

```bash
agent-browser click @e1               # Click element
agent-browser dblclick @e1            # Double-click
agent-browser fill @e2 "text"         # Clear and type text
agent-browser type @e2 "text"         # Type without clearing
agent-browser select @e1 "option"     # Select dropdown option
agent-browser check @e1               # Check checkbox
agent-browser uncheck @e1             # Uncheck checkbox
agent-browser press Enter             # Press key (alias: key)
agent-browser keydown / keyup         # Raw key down / up
agent-browser hover @e1               # Hover over element
agent-browser focus @e1               # Focus element
agent-browser drag @e1 @e2            # Drag from e1 to e2
agent-browser upload @e1 "/path"      # Upload file
agent-browser download @e1 "/path"   # Download resource
```

### Scrolling

```bash
agent-browser scroll down 500         # Scroll pixels
agent-browser scrollintoview @e1     # Scroll element into view
```

### Snapshot & Inspection

```bash
agent-browser snapshot -i             # Interactive elements with refs (recommended)
agent-browser snapshot -i -C          # Include cursor-interactive elements
agent-browser snapshot -s "#selector" # Scope to CSS selector
agent-browser snapshot -s "body" --path   # Include xpath and cssPath in refs
agent-browser snapshot -s "body" --attrs  # Include element attributes in refs
agent-browser snapshot -i --json       # JSON output for parsing
```

### Getting Information

```bash
agent-browser get text @e1            # Get element text content
agent-browser get url                 # Get current URL
agent-browser get title               # Get page title
agent-browser get count ".item"       # Count matching elements
agent-browser get box @e1             # Bounding box {x,y,width,height}
agent-browser get styles @e1           # Computed styles
agent-browser is visible @e1          # Visibility check
agent-browser is enabled @e1          # Enabled check
agent-browser is checked @e1          # Checked state
```

### Waiting

```bash
agent-browser wait @e1                # Wait for element to appear
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --load domcontentloaded  # Wait for DOM ready
agent-browser wait --url "**/page"    # Wait for URL pattern match
agent-browser wait --text "Hello"     # Wait for text on page
agent-browser wait --fn "document.hidden === false"  # Wait for JS expression
agent-browser wait --download         # Wait for download to complete
agent-browser wait 2000               # Wait milliseconds (fixed delay)
agent-browser wait --request "api/data"  # Wait for specific network request (background listener)
```

### Capture

```bash
agent-browser screenshot              # Screenshot to temp dir
agent-browser screenshot --full       # Full page screenshot
agent-browser screenshot output.png  # Save to file
agent-browser pdf output.pdf          # Save as PDF
```

### Network Monitoring

```bash
agent-browser network requests                 # View all network requests
agent-browser network requests --filter "**/api/**"  # Filter by URL pattern
agent-browser network requests --clear         # Clear request history
agent-browser network requests --capture-response  # Capture response bodies
agent-browser network requests --capture-response --type json  # Filter captured by content type
agent-browser network requests --output ./captures/  # Save captures to directory
agent-browser network route "**/api/**" --abort  # Block requests
agent-browser network route "**/api/**" --body '{"users": []}'  # Mock response
agent-browser network route "**/api/**" --status 404  # Mock status code
agent-browser network unroute "**/api/**"     # Remove route
```

See [network-monitoring.md](references/network-monitoring.md) for advanced patterns.

### Tabs & Windows

```bash
agent-browser tab list                # List all tabs
agent-browser tab new                 # Open new tab
agent-browser tab close 2             # Close tab by index
agent-browser tab switch 0            # Switch to tab
agent-browser window new              # Open new window
```

### Dialogs & Alerts

```bash
agent-browser dialog accept            # Accept alert/dialog
agent-browser dialog dismiss           # Dismiss alert/dialog
```

### Browser State

```bash
agent-browser state save auth.json    # Save cookies/localStorage/session
agent-browser state clear             # Clear all state
agent-browser storage session dump     # Dump session storage
agent-browser storage session load     # Load session storage
agent-browser cookies set name value domain  # Set cookie
agent-browser cookies export            # Export all cookies
```

### Debugging

```bash
agent-browser console "1+1"           # Evaluate JS in browser console
agent-browser errors                   # Show recent page errors
agent-browser highlight @e1            # Highlight element on page
agent-browser trace start             # Start Chrome trace
agent-browser trace stop ./trace.json  # Stop and save trace
```

### Session Management

```bash
agent-browser --session site1 open https://a.com   # Named session
agent-browser --session site2 open https://b.com   # Parallel session
agent-browser session list                       # List active sessions
agent-browser connect ws://localhost:9222        # Connect to remote CDP browser
agent-browser kill                                 # Kill daemon process
agent-browser config                               # Show/edit config
agent-browser config [--json]                      # Config as JSON
```

## Global Options

These flags work with most commands:

| Flag                       | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `--session <name>`         | Named browser session                          |
| `--json`                   | JSON output format                             |
| `--headed`                 | Show visible browser window                    |
| `--cdp <url>`              | Connect via Chrome DevTools Protocol directly  |
| `-p/--provider`            | Provider: ios, browserbase, kernel, browseruse |
| `--proxy <url>`            | HTTP/SOCKS5 proxy                              |
| `--proxy-bypass <rules>`   | Proxy bypass rules                             |
| `--headers 'K: V'`         | Extra HTTP headers per request                 |
| `--state <path>`           | Restore browser state from file                |
| `--profile <path>`         | Chrome profile directory                       |
| `--args "<args>"`          | Extra Chromium launch arguments                |
| `--user-agent <ua>`        | Custom User-Agent string                       |
| `--executable-path <path>` | Browser binary path                            |
| `--extension <path>`       | Load .crx Chrome extension                     |
| `--ignore-https-errors`    | Ignore HTTPS certificate errors                |
| `--allow-file-access`      | Allow file:// URLs                             |
| `--timeout <ms>`           | Global operation timeout                       |
| `--debug`                  | Verbose debug logging                          |

Examples:

```bash
agent-browser --proxy http://proxy:8080 open https://example.com
agent-browser --headed --debug open https://example.com
agent-browser --user-agent "MyBot/1.0" open https://example.com
```

## Common Patterns

### Form Submission

```bash
agent-browser open https://example.com/signup
agent-browser snapshot -i
agent-browser fill @e1 "Jane Doe"
agent-browser fill @e2 "jane@example.com"
agent-browser select @e3 "California"
agent-browser check @e4
agent-browser click @e5
agent-browser wait --load networkidle
```

### Authentication with State Persistence

```bash
# Login once and save state
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "$USERNAME"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Reuse in future sessions
agent-browser --state auth.json open https://app.example.com/dashboard
```

### Data Extraction

```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e5           # Specific element
agent-browser get text body > page.txt  # All page text
agent-browser snapshot -i --json      # JSON for parsing
agent-browser get text @e1 --json   # Element as JSON
```

### API Interception (Passive Capture)

Capture API responses without making direct requests:

```bash
agent-browser open "about:blank"
(agent-browser wait --request "api/users" --timeout 30000 > response.json) &
sleep 1
agent-browser open "https://example.com/user/profile"
wait $!
jq '.body' response.json
```

### Network Monitoring & API Mocking

```bash
agent-browser network requests --filter "**/api/**"
agent-browser network route "**/api/users" --body '{"users": []}'
agent-browser network route "**/ads/**" --abort
agent-browser network unroute "**/api/users"
```

### Parallel Sessions

```bash
agent-browser --session site1 open https://site-a.com
agent-browser --session site2 open https://site-b.com
agent-browser --session site1 snapshot -i
agent-browser session list
```

### Local Files (PDFs, HTML)

```bash
agent-browser --allow-file-access open file:///path/to/doc.pdf
agent-browser --allow-file-access open file:///path/to/page.html
agent-browser screenshot output.png
```

### Working with Iframes

Use `--in-frame` to operate inside iframes:

```bash
agent-browser snapshot --in-frame "#my-iframe"
agent-browser snapshot --in-frame "#outer/inner"  # Nested path
agent-browser click @e1 --in-frame "#container/frame"
agent-browser fill #user "admin" --in-frame "#container/login-frame"
```

Frame path syntax: `#id-or-name`, `#index` (position), `#parent/child` (nested).

### Semantic Locators (Alternative to Refs)

When refs are unavailable, use semantic locators:

```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
agent-browser find placeholder "Search" type "query"
agent-browser find testid "submit-btn" click
```

### Proxy Configuration

```bash
agent-browser --proxy http://proxy:8080 open https://example.com
agent-browser --proxy socks5://proxy:1080 open https://example.com
agent-browser --proxy http://user:pass@proxy:8080 --proxy-bypass "localhost,*.internal" open https://example.com
```

## Advanced Features

### Recording & Replaying Workflows

For test automation and workflow capture:

```bash
agent-browser recorder start --session my-test
agent-browser open https://example.com/form
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser click @e3
agent-browser recorder stop --output test-workflow.yaml
agent-browser recorder replay test-workflow.yaml
```

See [recorder.md](references/recorder.md) for details.

### Human-like Mouse Movement

Simulate natural mouse trajectories via environment variable:

```bash
export AGENT_BROWSER_HUMAN=1           # Enable (default: arc path)
export AGENT_BROWSER_HUMAN=bezier     # Bezier curve with overshoot
export AGENT_BROWSER_HUMAN=random     # Random path with jitter
export AGENT_BROWSER_HUMAN=linear     # Straight line (fastest)

agent-browser click @e1              # Uses human trajectory
agent-browser wait 3000              # Mouse wandering while waiting
unset AGENT_BROWSER_HUMAN           # Disable
```

Features: continuous position tracking, acceleration curves, 4 trajectory types, auto-wandering on wait.

### Viewer / Streaming Mode

Real-time remote browser visualization with frame streaming over WebSocket.

```bash
# Start viewer after opening a page
agent-browser open https://example.com
agent-browser viewer                    # Opens viewer URL in browser
agent-browser viewer --json              # Get connection details as JSON
```

**Architecture:** Browser -> Daemon (IPC) -> Standalone Server (:5005) -> Viewer (WebSocket)

**Element Crop Mode:** Stream can be cropped to a specific DOM element's bounds. Coordinates auto-map to element-local space.

See [viewer-mode.md](references/viewer-mode.md) for architecture details, troubleshooting, and element mode.

### Mobile Remote Control (Touch Devices)

When viewer is opened on a phone/tablet, it automatically enters **mobile mode** with touch-optimized UI:

- **Touchpad**: Bottom-area gesture surface (tap=click, drag=move cursor, long-press=drag, 2-finger=scroll)
- **Input Panel**: Tap remote input field -> local text input appears -> syncs to remote via `input_fill`
- **Virtual Keyboard Toolbar**: Tab, Arrows, Enter, Backspace, Escape
- **IME Support**: Chinese/Japanese composition (pinyin etc.) — intermediate input NOT sent to remote
- **DeviceMode**: Auto-detects device type, switches UI dynamically on resize/orientationchange/matchMedia

See [mobile-viewer.md](references/mobile-viewer.md) for touchpad gestures, input panel flow, DeviceMode architecture.

### iOS Simulator (Appium)

Native iOS automation via Xcode + Appium:

```bash
agent-browser device list                                    # List simulators
agent-browser -p ios --device "iPhone 16 Pro" open https://example.com
agent-browser -p ios snapshot -i && agent-browser -p ios click @e1
agent-browser -p ios close                                        # Shuts down simulator
```

Requires: macOS + Xcode + `npm install -g appium && appium driver install xcuitest`.

Note: Mobile viewer mode (above) works on ANY phone browser via web viewer — no simulator needed.

### Cloud Browser Providers

Connect to managed browser services:

```bash
BROWSERBASE_API_KEY=key agent-browser --provider browserbase open https://example.com
KERNEL_API_KEY=key agent-browser --provider kernel open https://example.com
BROWSERUSE_API_KEY=key agent-browser --provider browseruse open https://example.com
```

Useful for: geo-distributed testing, IP diversity, team sharing, parallel scaling.

## Ref Lifecycle (Important)

Refs (`@e1`, `@e2`) are invalidated when the page changes. Always re-snapshot after navigation, form submission, or dynamic content loading:

```bash
agent-browser click @e5              # Navigates to new page
agent-browser snapshot -i            # MUST re-snapshot
agent-browser click @e1              # Use new refs
```

Refs are session-specific. For shell scripts, use semantic locators or CSS selectors instead. See [snapshot-refs.md](references/snapshot-refs.md).

## Reference Docs

| Reference                                                 | Content                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| [commands.md](references/commands.md)                     | Complete command reference with all options                   |
| [data-extraction.md](references/data-extraction.md)       | DOM, JS variables, API interception, infinite scroll, iframe  |
| [snapshot-refs.md](references/snapshot-refs.md)           | Ref lifecycle, invalidation rules, shell script conversion    |
| [session-management.md](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping     |
| [authentication.md](references/authentication.md)         | Login flows, OAuth, 2FA handling, state reuse                 |
| [video-recording.md](references/video-recording.md)       | Video recording for debugging                                 |
| [recorder.md](references/recorder.md)                     | Action recording & replay for test automation                 |
| [proxy-support.md](references/proxy-support.md)           | Proxy config, geo-testing, rotating proxies                   |
| [network-monitoring.md](references/network-monitoring.md) | Request monitoring, API mocking, request blocking             |
| [viewer-mode.md](references/viewer-mode.md)               | Streaming viewer, element crop, architecture, troubleshooting |
| [mobile-viewer.md](references/mobile-viewer.md)           | Touchpad, input panel, IME/CJK support, DeviceMode            |
