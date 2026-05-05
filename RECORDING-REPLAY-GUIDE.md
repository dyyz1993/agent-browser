# Recording, Replay & Flow Automation Guide

This guide covers agent-browser's recording, replay, and flow automation features. Use these to capture browser interactions, replay them reliably, convert recordings into reusable flows, and export flows as standalone test scripts.

## Table of Contents

- [Snapshot Selector System](#snapshot-selector-system)
- [Recording a Session](#recording-a-session)
- [Replaying a Recording](#replaying-a-recording)
- [Flow Engine](#flow-engine)
- [Exporting Flows as Scripts](#exporting-flows-as-scripts)
- [Snapshot Flags Reference](#snapshot-flags-reference)
- [Common Scenarios](#common-scenarios)

---

## Snapshot Selector System

Every `snapshot -i` returns a snapshot ID (`snap_1`, `snap_2`, ...) with interactive element references (`@e1`, `@e2`, ...). Use snapshot IDs to query stable CSS selectors that survive DOM changes.

### Take a Snapshot

```bash
agent-browser snapshot -i
```

Output:

```
## Snapshot: snap_1 (34 interactive elements)
---
[1] searchbox "Search" [ref=e1]
[2] button "Submit" [ref=e2]
[3] link "About" [ref=e3]
---
Tips:
  Get selector:  snapshot --selector-for snap_1:@e1
  Or by index:   snapshot --selector-for snap_1:1
  List all:      snapshot --selectors-of snap_1
  Validate:      snapshot --validate snap_1
```

### Query a Stable Selector

```bash
# By element ref
agent-browser snapshot --selector-for snap_1:@e1
# Output: snap_1 e1 (searchbox "Search")
#           CSS:      #search-input
#           XPath:    //*[@id="search-input"]

# By index number
agent-browser snapshot --selector-for snap_1:1
```

### List All Selectors for a Snapshot

```bash
agent-browser snapshot --selectors-of snap_1
# Output:
#   [1] e1 searchbox "Search"     ->  #search-input
#   [2] e2 button "Submit"        ->  #submit-btn
#   [3] e3 link "About"           ->  nav > a:nth-child(2)
```

### Validate Selectors After Page Changes

```bash
agent-browser snapshot --validate snap_1
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

---

## Recording a Session

The recorder captures user interactions (clicks, inputs, scrolls, navigation) as structured YAML steps.

### Start Recording

```bash
# Start recording on a URL
agent-browser recorder start https://example.com

# Start recording without the overlay panel
agent-browser recorder start https://example.com --hide

# Start recording on current page (no URL)
agent-browser recorder start
```

### Check Recording Status

```bash
agent-browser recorder status
```

### Stop Recording and Save

```bash
# Save to default temp location
agent-browser recorder stop

# Save to a specific file
agent-browser recorder stop --output my-session.yaml
```

The output YAML contains:

- Session metadata (start time, pages visited)
- Recorded steps with action, selector, xpath, value, and trajectory data
- A CLI Commands section with executable agent-browser commands

---

## Replaying a Recording

### Replay the Most Recent Recording

```bash
agent-browser recorder replay
```

### Replay a Specific Recording File

```bash
agent-browser recorder replay my-session.yaml
```

Replay executes the CLI commands from the YAML file sequentially.

---

## Flow Engine

Flows are YAML-defined automation scripts with self-healing selectors. Convert recordings into flows for robust, repeatable automation.

### Convert a Recording to a Flow

```bash
# Basic conversion
agent-browser flow from-recorder my-session.yaml --output my-flow.yaml

# With metadata
agent-browser flow from-recorder my-session.yaml \
  --name "my-site" \
  --flow-id "login-flow" \
  --base-url "https://example.com" \
  --description "Login and navigate to dashboard" \
  --output sites/my-site.yaml

# With pagination support
agent-browser flow from-recorder scraping-session.yaml \
  --name "data-source" \
  --max-pages 20 \
  --output sites/data-source.yaml
```

Options for `from-recorder`:

| Flag | Description | Default |
|------|-------------|---------|
| `--name <name>` | Site name | `recorded-site` |
| `--flow-id <id>` | Flow ID | auto-generated |
| `--base-url <url>` | Override base URL | from recording |
| `--description <text>` | Flow description | none |
| `--output <file>` | Write output to file | stdout |
| `--max-pages <n>` | Max pagination iterations | 10 |

### List Available Flows

```bash
# List all flows from default sites directories
agent-browser flow list

# JSON output
agent-browser flow list --json

# Custom sites directory
agent-browser flow list --sites-dir ./my-sites
```

Flows are loaded from `./sites/` (project-local) and `~/.agent-browser/sites/`.

### Show Flow Details

```bash
agent-browser flow show my-site.login-flow

# With custom sites directory
agent-browser flow show my-site.login-flow --sites-dir ./my-sites
```

### Run a Flow

```bash
# Basic run
agent-browser flow run my-site.login-flow

# With parameters
agent-browser flow run my-site.login-flow --param username=testuser --param password=secret123

# Multiple parameters
agent-browser flow run my-site.search-flow --param keyword=AI --param maxPages=3

# With custom output format
agent-browser flow run my-site.login-flow --output json

# With custom sites directory
agent-browser flow run my-site.login-flow --sites-dir ./my-sites
```

Site/flow reference format: `site-name.flow-name` (e.g., `baidu-search.search-and-extract`). If only a flow name is given, all sites are searched.

### Validate a Flow File

```bash
agent-browser flow validate sites/my-site.yaml
```

### Register and Unregister Sites

```bash
# Register from file
agent-browser flow register --file sites/my-site.yaml --name my-site

# Register from URL
agent-browser flow register --url https://example.com/flow.yaml --name remote-site

# Unregister
agent-browser flow unregister my-site
```

---

## Exporting Flows as Scripts

Export flows as standalone Playwright test scripts that can run without agent-browser.

### Export as Playwright TypeScript

```bash
agent-browser flow export my-flow.yaml --format playwright --output test.ts
```

### Export as Python Playwright

```bash
agent-browser flow export my-flow.yaml --format python --output test.py
```

### Export Options

```bash
# With headless mode configuration
agent-browser flow export my-flow.yaml --format playwright --headless true --output test.ts

# With base URL override
agent-browser flow export my-flow.yaml --format playwright --base-url https://staging.example.com --output test.ts
```

| Flag | Description | Default |
|------|-------------|---------|
| `--format <format>` | Output format: `playwright` or `python` | `playwright` |
| `--headless <bool>` | Set headless mode in generated script | `true` |
| `--base-url <url>` | Override base URL in generated script | from flow |

---

## Snapshot Flags Reference

The `snapshot` command supports several flags for richer output:

```bash
# Interactive elements only
agent-browser snapshot -i

# Interactive + XPath and CSS path for each element
agent-browser snapshot -i --path
agent-browser snapshot -i -p

# Interactive + all HTML attributes
agent-browser snapshot -i --attrs
agent-browser snapshot -i -a

# Interactive + compact selector table appended
agent-browser snapshot -i --selectors

# Include hidden elements (opacity:0, zero-dimension, off-screen)
agent-browser snapshot -i --all

# Combine flags
agent-browser snapshot -i --path --attrs --selectors
agent-browser snapshot -i -p -a

# Scope to a CSS selector
agent-browser snapshot -i -s "main" --path --attrs

# Limit tree depth
agent-browser snapshot -i --depth 5

# Target an iframe
agent-browser snapshot -i --in-frame "#my-iframe"
```

| Flag | Short | Description |
|------|-------|-------------|
| `--interactive` | `-i` | Only interactive elements |
| `--compact` | `-c` | Remove empty structural elements |
| `--cursor` | `-C` | Include cursor-interactive elements |
| `--depth <n>` | `-d` | Limit tree depth |
| `--selector <sel>` | `-s` | Scope snapshot to CSS selector |
| `--path` | `-p` | Include XPath and CSS path per element |
| `--attrs` | `-a` | Include all HTML attributes |
| `--selectors` | | Append compact selector table |
| `--all` | | Include visually hidden elements |
| `--in-frame <path>` | `-f` | Target iframe |

Note: Elements with `display: none` or `visibility: hidden` are excluded by Playwright's accessibility tree generator. Use `eval` for such elements.

---

## Common Scenarios

### Scenario 1: Record and Replay a Login Flow

```bash
# 1. Start recording on the login page
agent-browser recorder start https://app.example.com/login

# 2. (Interact in the browser: type email, password, click Login)

# 3. Stop recording
agent-browser recorder stop --output login-session.yaml

# 4. Replay to verify
agent-browser recorder replay login-session.yaml

# 5. Convert to a reusable flow
agent-browser flow from-recorder login-session.yaml \
  --name "app-example" \
  --flow-id "login" \
  --output sites/app-example.yaml

# 6. Run the flow with parameters
agent-browser flow run app-example.login --param email=user@test.com --param password=secret

# 7. Export as Playwright test
agent-browser flow export sites/app-example.yaml --format playwright --output login-test.ts
```

### Scenario 2: Record a Form Submission

```bash
# 1. Open the form page and start recording
agent-browser open https://example.com/contact
agent-browser recorder start

# 2. (Fill out form fields and submit)

# 3. Stop and save
agent-browser recorder stop --output contact-form.yaml

# 4. Convert to flow
agent-browser flow from-recorder contact-form.yaml \
  --name "example" \
  --flow-id "contact-form" \
  --output sites/example.yaml

# 5. Validate the flow file
agent-browser flow validate sites/example.yaml

# 6. Export as Python script
agent-browser flow export sites/example.yaml --format python --output test_contact.py
```

### Scenario 3: Record a Data Scraping Session with Pagination

```bash
# 1. Start recording on the data page
agent-browser recorder start https://data-source.example.com/items

# 2. (Navigate through pages, click "Next" to paginate)

# 3. Stop recording
agent-browser recorder stop --output scraping-session.yaml

# 4. Convert with pagination support
agent-browser flow from-recorder scraping-session.yaml \
  --name "data-source" \
  --flow-id "scrape-items" \
  --max-pages 20 \
  --output sites/data-source.yaml

# 5. Run the scraping flow
agent-browser flow run data-source.scrape-items --param maxPages=10
```

### Scenario 4: Snapshot-Guided Selector Workflow

```bash
# 1. Open the page
agent-browser open https://example.com

# 2. Take a snapshot
agent-browser snapshot -i

# 3. Get stable selectors for elements you need
agent-browser snapshot --selector-for snap_1:@e1
agent-browser snapshot --selector-for snap_1:@e2

# 4. Interact with the page
agent-browser fill @e1 "search term"
agent-browser click @e2

# 5. After page changes, validate which selectors still work
agent-browser snapshot --validate snap_1

# 6. Take a new snapshot for the updated page
agent-browser snapshot -i

# 7. List all selectors from the first snapshot for later reuse
agent-browser snapshot --selectors-of snap_1
```

### Scenario 5: End-to-End Pipeline (Record -> Flow -> Export)

```bash
# Record
agent-browser recorder start https://shop.example.com
# (browse, add to cart, checkout)
agent-browser recorder stop --output purchase.yaml

# Convert
agent-browser flow from-recorder purchase.yaml \
  --name shop \
  --flow-id purchase \
  --output sites/shop.yaml

# Validate
agent-browser flow validate sites/shop.yaml

# Run with parameters
agent-browser flow run shop.purchase \
  --param item="Widget" \
  --param quantity=2

# Export for CI
agent-browser flow export sites/shop.yaml --format playwright --output e2e/purchase.spec.ts
agent-browser flow export sites/shop.yaml --format python --output e2e/test_purchase.py
```

---

## Command Quick Reference

| Task | Command |
|------|---------|
| Start recording | `agent-browser recorder start [url]` |
| Stop recording | `agent-browser recorder stop --output file.yaml` |
| Recording status | `agent-browser recorder status` |
| Replay recording | `agent-browser recorder replay [file.yaml]` |
| Convert to flow | `agent-browser flow from-recorder file.yaml --output flow.yaml` |
| List flows | `agent-browser flow list` |
| Show flow | `agent-browser flow show site.flow` |
| Run flow | `agent-browser flow run site.flow --param key=val` |
| Validate flow | `agent-browser flow validate file.yaml` |
| Export flow | `agent-browser flow export file.yaml --format playwright --output test.ts` |
| Snapshot selectors | `agent-browser snapshot -i --selectors` |
| Get selector | `agent-browser snapshot --selector-for snap_N:@eN` |
| List selectors | `agent-browser snapshot --selectors-of snap_N` |
| Validate selectors | `agent-browser snapshot --validate snap_N` |
