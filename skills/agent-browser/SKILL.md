---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Core Workflow

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

## Working with Iframes

Use `--in-frame` to operate inside iframes. The path uses iframe name/id or index:

```bash
# Direct iframe by ID or name
agent-browser snapshot --in-frame "#my-iframe"

# Nested iframe using path (name/id or index)
agent-browser snapshot --in-frame "#outer-frame/inner-frame"

# Example: Click element inside nested cross-origin iframe
agent-browser open https://example.com
agent-browser snapshot --in-frame "#iframe-container"
agent-browser click @e1 --in-frame "#iframe-container/login-frame"
agent-browser fill #username "admin" --in-frame "#iframe-container/login-frame"
agent-browser get value #username --in-frame "#iframe-container/login-frame"
```

### Frame Path Syntax

The frame path supports:
- **ID/Name**: `#frame-id` or `#frame-name`
- **Index**: `#0`, `#1` (by position)
- **Nested**: `#parent/child/grandchild`

Examples:
- `#my-iframe` - Single iframe
- `#0` - First iframe
- `#outer-iframe/login-frame` - Nested iframes by name
- `#0/1` - First iframe's second child

## Essential Commands

```bash
# Navigation
agent-browser open <url>              # Navigate (aliases: goto, navigate)
agent-browser close                   # Close browser

# Snapshot
agent-browser snapshot -i             # Interactive elements with refs (recommended)
agent-browser snapshot -i -C          # Include cursor-interactive elements (divs with onclick, cursor:pointer)
agent-browser snapshot -s "#selector" # Scope to CSS selector
agent-browser snapshot -s "body" --path   # Include xpath and cssPath in refs
agent-browser snapshot -s "body" --attrs  # Include element attributes in refs

# Interaction (use @refs from snapshot)
agent-browser click @e1               # Click element
agent-browser fill @e2 "text"         # Clear and type text
agent-browser type @e2 "text"         # Type without clearing
agent-browser select @e1 "option"     # Select dropdown option
agent-browser check @e1               # Check checkbox
agent-browser press Enter             # Press key
agent-browser scroll down 500         # Scroll page

# Get information
agent-browser get text @e1            # Get element text
agent-browser get url                 # Get current URL
agent-browser get title               # Get page title

# Wait
agent-browser wait @e1                # Wait for element
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --url "**/page"    # Wait for URL pattern
agent-browser wait 2000               # Wait milliseconds

# Capture
agent-browser screenshot              # Screenshot to temp dir
agent-browser screenshot --full       # Full page screenshot
agent-browser pdf output.pdf          # Save as PDF
```

## Human-like Mouse Movement

Enable globally via environment variable to simulate natural mouse trajectories:

```bash
# Enable human mode (default: arc path type)
export AGENT_BROWSER_HUMAN=1

# Or specify path type
export AGENT_BROWSER_HUMAN=bezier   # Bezier curve with overshoot
export AGENT_BROWSER_HUMAN=arc      # Smooth arc (default, most natural)
export AGENT_BROWSER_HUMAN=random   # Random path with jitter
export AGENT_BROWSER_HUMAN=linear   # Straight line (fastest)

# All interactions will use human-like movement
agent-browser click @e1
agent-browser fill @e1 "text"
agent-browser type @e1 "text"
agent-browser hover @e1
agent-browser dblclick @e1

# Wait with mouse wandering (when human mode enabled)
agent-browser wait 3000  # Wanders mouse while waiting

# Disable human mode
unset AGENT_BROWSER_HUMAN
```

**Features:**
- Continues from last mouse position for realistic trajectories
- Natural acceleration/deceleration curves
- Randomized delays between movements
- Four trajectory types: `arc` (default), `bezier`, `random`, `linear`
- `wait <ms>` automatically does mouse wandering when enabled

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
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
```

### Data Extraction

```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e5           # Get specific element text
agent-browser get text body > page.txt  # Get all page text

# JSON output for parsing
agent-browser snapshot -i --json
agent-browser get text @e1 --json
```

### API Interception

Passively capture API responses without making direct requests. Useful for sites with anti-scraping measures.

```bash
# 1. Open blank page first
agent-browser open "about:blank"

# 2. Start request listener in background
(agent-browser wait --request "api/users" --timeout 30000 > response.json) &
WAIT_PID=$!
sleep 1

# 3. Navigate to trigger the API call
agent-browser open "https://example.com/user/profile"

# 4. Wait for response
wait $WAIT_PID

# 5. Process captured data
jq '.body' response.json
```

Example: Capture Douyin user videos
```bash
agent-browser open "about:blank"
(agent-browser wait --request "aweme/post" --timeout 30000 > /tmp/douyin.json) &
sleep 1
agent-browser open "https://www.douyin.com/user/xxx"
sleep 5
wait
jq '.body.aweme_list[:10] | map({id, desc, stats})' /tmp/douyin.json
```

### Parallel Sessions

```bash
agent-browser --session site1 open https://site-a.com
agent-browser --session site2 open https://site-b.com

agent-browser --session site1 snapshot -i
agent-browser --session site2 snapshot -i

agent-browser session list
```

### Visual Browser (Debugging)

```bash
agent-browser --headed open https://example.com
agent-browser highlight @e1          # Highlight element
agent-browser record start demo.webm # Record session
```

### Local Files (PDFs, HTML)

```bash
# Open local files with file:// URLs
agent-browser --allow-file-access open file:///path/to/document.pdf
agent-browser --allow-file-access open file:///path/to/page.html
agent-browser screenshot output.png
```

### iOS Simulator (Mobile Safari)

```bash
# List available iOS simulators
agent-browser device list

# Launch Safari on a specific device
agent-browser -p ios --device "iPhone 16 Pro" open https://example.com

# Same workflow as desktop - snapshot, interact, re-snapshot
agent-browser -p ios snapshot -i
agent-browser -p ios tap @e1          # Tap (alias for click)
agent-browser -p ios fill @e2 "text"
agent-browser -p ios swipe up         # Mobile-specific gesture

# Take screenshot
agent-browser -p ios screenshot mobile.png

# Close session (shuts down simulator)
agent-browser -p ios close
```

**Requirements:** macOS with Xcode, Appium (`npm install -g appium && appium driver install xcuitest`)

**Real devices:** Works with physical iOS devices if pre-configured. Use `--device "<UDID>"` where UDID is from `xcrun xctrace list devices`.

## Ref Lifecycle (Important)

Refs (`@e1`, `@e2`, etc.) are invalidated when the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (dropdowns, modals)

```bash
agent-browser click @e5              # Navigates to new page
agent-browser snapshot -i            # MUST re-snapshot
agent-browser click @e1              # Use new refs
```

## Semantic Locators (Alternative to Refs)

When refs are unavailable or unreliable, use semantic locators:

```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
agent-browser find placeholder "Search" type "query"
agent-browser find testid "submit-btn" click
```

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference with all options |
| [references/data-extraction.md](references/data-extraction.md) | **Data extraction patterns: DOM, JS variables, API interception, infinite scroll, iframe** |
| [references/snapshot-refs.md](references/snapshot-refs.md) | Ref lifecycle, invalidation rules, troubleshooting |
| [references/session-management.md](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping |
| [references/authentication.md](references/authentication.md) | Login flows, OAuth, 2FA handling, state reuse |
| [references/video-recording.md](references/video-recording.md) | Recording workflows for debugging and documentation |
| [references/proxy-support.md](references/proxy-support.md) | Proxy configuration, geo-testing, rotating proxies |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/data-extraction.sh](templates/data-extraction.sh) | **Universal data extraction (DOM/JS/API/Scroll modes)** |
| [templates/api-interception.sh](templates/api-interception.sh) | Passively capture API responses |
| [templates/form-automation.sh](templates/form-automation.sh) | Form filling with validation |
| [templates/authenticated-session.sh](templates/authenticated-session.sh) | Login once, reuse state |
| [templates/capture-workflow.sh](templates/capture-workflow.sh) | Content extraction with screenshots |

```bash
# Data extraction examples
./templates/data-extraction.sh https://example.com/products                    # DOM mode
./templates/data-extraction.sh https://spa-app.com data.json js               # JS variables
./templates/data-extraction.sh https://api-site.com output.json api "api/v1"  # API interception
./templates/data-extraction.sh https://infinite-list.com items.json scroll    # Infinite scroll

# Other templates
./templates/form-automation.sh https://example.com/form
./templates/authenticated-session.sh https://app.example.com/login
./templates/capture-workflow.sh https://example.com ./output
```
