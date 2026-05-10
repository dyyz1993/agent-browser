import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    let dir = dirname(__filename);
    for (let i = 0; i < 5; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch {
        /* keep going up */
      }
      dir = dirname(dir);
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP_TEXT: Record<string, string> = {
  open: `
agent-browser open - Navigate to a URL

Usage: agent-browser open <url>

Navigates the browser to the specified URL. If no protocol is provided,
https:// is automatically prepended.

Aliases: goto, navigate

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session
  --headers <json>     Set HTTP headers (scoped to this origin)
  --headed             Show browser window

Examples:
  agent-browser open example.com
  agent-browser open https://github.com
  agent-browser open localhost:3000
  agent-browser open api.example.com --headers '{"Authorization": "Bearer token"}'
`,
  back: `
agent-browser back - Navigate back in history

Usage: agent-browser back

Goes back one page in the browser history.

Examples:
  agent-browser back
`,
  forward: `
agent-browser forward - Navigate forward in history

Usage: agent-browser forward

Goes forward one page in the browser history.

Examples:
  agent-browser forward
`,
  reload: `
agent-browser reload - Reload the current page

Usage: agent-browser reload

Reloads the current page.

Examples:
  agent-browser reload
`,
  click: `
agent-browser click - Click an element

Usage: agent-browser click <selector> [options]

Clicks on the specified element. The selector can be a CSS selector,
XPath, or an element reference from snapshot (e.g., @e1).

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after click
                       scope options:
                         - (no arg)  3 levels up from target (default)
                         - N         N levels up from target
                         - full      entire page
                         - selector  CSS selector for diff scope

Examples:
  agent-browser click "#submit-button"
  agent-browser click @e1
  agent-browser click @e1 --diff
  agent-browser click @e1 --diff 5
  agent-browser click @e1 --diff full
  agent-browser click @e2 --in-frame "frame1"
`,
  fill: `
agent-browser fill - Clear and fill an input field

Usage: agent-browser fill <selector> <text> [options]

Clears the input field and fills it with the specified text.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after fill

Examples:
  agent-browser fill "#email" "user@example.com"
  agent-browser fill @e3 "Hello World"
  agent-browser fill @e3 "Hello" --diff
  agent-browser fill "#input" "test" --in-frame "#frame1"
`,
  type: `
agent-browser type - Type text into an element

Usage: agent-browser type <selector> <text> [options]

Types text into the specified element character by character.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after type

Examples:
  agent-browser type "#search" "hello"
  agent-browser type @e2 "additional text"
  agent-browser type @e2 "hello" --diff
  agent-browser type "#input" "test" --in-frame "#frame1"
`,
  press: `
agent-browser press - Press a key or key combination

Usage: agent-browser press <key> [--diff [scope]] [--in-frame <path>]

Presses a key or key combination. Supports special keys and modifiers.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after press

Special Keys:
  Enter, Tab, Escape, Backspace, Delete, Space
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
  Home, End, PageUp, PageDown, F1-F12

Modifiers (combine with +):
  Control, Alt, Shift, Meta

Examples:
  agent-browser press Enter
  agent-browser press Control+a
  agent-browser press Control+Shift+s
  agent-browser press Enter --diff
`,
  wait: `
agent-browser wait - Wait for condition

Usage: agent-browser wait <selector|ms|option> [--in-frame <path>]

Waits for an element to appear, a timeout, or other conditions.

Options:
  --in-frame <path>    Target element in iframe

Modes:
  <selector>           Wait for element to appear
  <ms>                 Wait for specified milliseconds
  --url <pattern>      Wait for URL to match pattern
  --load <state>       Wait for load state (load, domcontentloaded, networkidle)
  --fn <expression>    Wait for JavaScript expression to be truthy
  --text <text>        Wait for text to appear on page
  --download [path]    Wait for a download to complete
  --request <pattern>  Wait for request and get response body

Examples:
  agent-browser wait "#loading-spinner"
  agent-browser wait 2000
  agent-browser wait --url "**/dashboard"
  agent-browser wait --load networkidle
  agent-browser wait --text "Welcome back"
  agent-browser wait --download ./file.pdf
  agent-browser wait --request "**/api/data"
  agent-browser wait "#btn" --in-frame "#frame1"
`,
  screenshot: `
agent-browser screenshot - Take a screenshot

Usage: agent-browser screenshot [selector] [path] [options]

Captures a screenshot of the current page or a specific element.

Arguments:
  [selector]           CSS selector, XPath, or element reference (e.g., @e1)
  [path]               Save path for the screenshot

Options:
  --full, -f           Capture full page (not just viewport)
  --in-frame <path>    Target iframe

Examples:
  agent-browser screenshot
  agent-browser screenshot ./screenshot.png
  agent-browser screenshot --full ./full-page.png
  agent-browser screenshot .header                        # Screenshot element
  agent-browser screenshot #submit-btn ./button.png       # Screenshot element to file
  agent-browser screenshot @e1                            # Screenshot referenced element
  agent-browser screenshot --in-frame "#frame1"
`,
  snapshot: `
agent-browser snapshot - Get accessibility tree snapshot

Usage: agent-browser snapshot [options]

Returns an accessibility tree representation of the page with element
references (like @e1, @e2) that can be used in subsequent commands.

Options:
  -i, --interactive    Only include interactive elements
  -C, --cursor         Include cursor-interactive elements
  -c, --compact        Remove empty structural elements
  -d, --depth <n>      Limit tree depth
  -s, --selector <sel> Scope snapshot to CSS selector
  --in-frame <path>    Target iframe (path: "#frame1" or "#frame1/#frame2")
  --path               Include xpath and cssPath in refs (requires --selector)
  --attrs              Include element attributes in refs (requires --selector)

Selector Commands:
  --selector-for <snap_N:@eN>   Get stable CSS selector for element
  --selector-for <snap_N:N>     Get selector by index
  --selectors-of <snap_N>       List all selectors for a snapshot
  --validate <snap_N>           Validate selectors still match current page

Examples:
  agent-browser snapshot
  agent-browser snapshot -i
  agent-browser snapshot -i -C
  agent-browser snapshot --compact --depth 5
  agent-browser snapshot --selector "main" --path
  agent-browser snapshot --selector "form" --attrs
  agent-browser snapshot -s "main" --path --attrs
  agent-browser snapshot --selector-for snap_3:@e1
  agent-browser snapshot --selector-for snap_3:1
  agent-browser snapshot --selectors-of snap_3
  agent-browser snapshot --validate snap_3
`,
  eval: `
agent-browser eval - Execute JavaScript

Usage: agent-browser eval [options] <script> [--in-frame <path>]

Executes JavaScript code in browser context.

Options:
  --in-frame <path>    Execute in iframe
  -b, --base64         Decode script from base64
  --stdin              Read script from stdin
  --file <path>        Read script from file

Examples:
  agent-browser eval "document.title"
  agent-browser eval -b "ZG9jdW1lbnQudGl0bGU="
  agent-browser eval --file script.js
  agent-browser eval "document.body.innerHTML" --in-frame "#frame1"
  `,
  search: `
agent-browser search - Search web using search engines

Usage: agent-browser search <query> [options]

Performs web search using specified search engine and returns
structured results including titles, URLs, and snippets.

Anti-bot measures are applied by default for Google and DuckDuckGo:
  - Google: uses udm=14 (Web tab) with stealth patches and realistic UA
  - DuckDuckGo: uses html.duckduckgo.com (lighter HTML version)
  - Bing: no patches needed (works as-is in headless)

Options:
  --engine <engine>    Search engine: google (default), bing, duckduckgo
  --limit <number>      Number of results to return (default: 10)
  --timeout <seconds>   Timeout for page load (default: 15)
  --output <file>       Write output to file instead of stdout
  --headed             Show browser window
  --stealth            Enable stealth mode (default: on for search)
  --no-stealth         Disable stealth patches

Examples:
  agent-browser search "playwright automation"
  agent-browser search "playwright automation" --engine bing
  agent-browser search "playwright automation" --limit 5 --engine duckduckgo
  agent-browser search "playwright automation" --output results.json
  agent-browser search "playwright automation" --timeout 20
  agent-browser search "playwright automation" --no-stealth
`,
  scrape: `
agent-browser scrape - Scrape page content from a URL

Usage: agent-browser scrape <url> [options]

Navigates to the specified URL, waits for the page to load, and extracts
the main content using automatic content discovery (no selector needed).

Content Auto-Discovery:
  1. Checks common content containers (#main, .content, article, main, etc.)
  2. Falls back to removing navigation/ads/footer elements
  3. Final fallback to full page content

Options:
  --format <format>       Content format: text, html, markdown (default: markdown)
  --selector <css>        Override auto-discovery with specific selector
  --timeout <seconds>     Page load timeout (default: 15)
  --wait-for <selector>   Wait for element to be visible before extracting
  --output <file>         Write output to file instead of stdout
  --cookies <json>        Set cookies before navigation (JSON array)
  --javascript <bool>     Enable/disable JavaScript (true/false, default: true)
  --metadata              Include page metadata (description, og:image, keywords, etc.)
  --headed                Show browser window (debug)

Examples:
  agent-browser scrape https://example.com
  agent-browser scrape https://example.com --format html
  agent-browser scrape https://example.com --selector ".article-body"
  agent-browser scrape https://example.com --wait-for ".loaded-content"
  agent-browser scrape https://example.com --output result.md
  agent-browser scrape https://example.com --metadata
  agent-browser scrape https://example.com --cookies '[{"name":"session","value":"abc"}]'
  agent-browser scrape https://example.com --javascript false
`,
  crawl: `
agent-browser crawl - Recursively crawl a website with auto content discovery

Usage: agent-browser crawl <url> [options]

Recursively crawls all linked pages on a website, automatically detecting
and extracting main content from each page (no selector needed).

Content Auto-Discovery (Firecrawl-style):
  1. Checks common content containers (#main, .content, article, main, etc.)
  2. Falls back to removing navigation/ads/footer elements
  3. Final fallback to full page content

Link Discovery:
  - Same-domain links only (use --allow-external for cross-domain)
  - Filters static resources (.png, .css, .js, .pdf, etc.)
  - Filters social media links
  - Supports SPA hash routing (/#/page treated as separate page)

Options:
  --depth <number>        Crawl depth (default: 2, 0 = only seed URL)
  --limit <number>        Max pages to crawl (default: 50)
  --format <format>       Content format: text, html, markdown (default: markdown)
  --timeout <seconds>     Per-page timeout (default: 15)
  --selector <css>        Override auto-discovery with specific selector
  --concurrency <n>       Number of pages to process concurrently (default: 1)
  --cookies <json>        Set cookies before navigation (JSON array)
  --javascript <bool>     Enable/disable JavaScript (true/false, default: true)
  --exclude-patterns <p>  Comma-separated glob patterns to exclude URLs
  --include-patterns <p>  Comma-separated glob patterns to include URLs
  --allow-external        Follow links to external domains
  --headed                Show browser window (debug)

Examples:
  agent-browser crawl https://bark.day.app --depth 2 --limit 20 --json
  agent-browser crawl https://example.com --depth 0
  agent-browser crawl https://docs.example.com --depth 1 --format markdown
  agent-browser crawl https://example.com --concurrency 3
  agent-browser crawl https://example.com --cookies '[{"name":"auth","value":"token"}]'
  agent-browser crawl https://example.com --javascript false
  agent-browser crawl https://example.com --exclude-patterns "*/blog/*,*/tags/*"
  agent-browser crawl https://example.com --allow-external --depth 1
`,
  map: `
agent-browser map - Discover all URLs on a website

Usage: agent-browser map <url> [options]

Discovers all available URLs on a website using two strategies:
1. Sitemap parsing (/sitemap.xml)
2. HTML link extraction from the homepage

Only collects URLs, does not fetch page content.

Options:
  --limit <number>        Maximum number of URLs to return (default: 100)
  --timeout <seconds>     Page load timeout (default: 15)
  --exclude-patterns <p>  Comma-separated glob patterns to exclude URLs
  --include-patterns <p>  Comma-separated glob patterns to include URLs
  --headed                Show browser window
  --json                  JSON output

Examples:
  agent-browser map https://bark.day.app
  agent-browser map https://example.com --limit 50 --json
  agent-browser map https://docs.example.com --timeout 20
  agent-browser map https://example.com --exclude-patterns "*/blog/*,*/tags/*"
`,
  get: `
agent-browser get - Retrieve information from elements or page

Usage: agent-browser get <subcommand> [args] [--in-frame <path>]

Subcommands:
  text <selector>            Get text content
  html <selector>            Get inner HTML
  value <selector>           Get input value
  attr <selector> <name>     Get attribute value
  title                      Get page title
  url                        Get current URL
  count <selector>           Count matching elements
  box <selector>             Get bounding box
  styles <selector>          Get computed styles

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser get text @e1
  agent-browser get attr "#link" href
  agent-browser get title
  agent-browser get url
  agent-browser get text "#content" --in-frame "#frame1"
`,
  is: `
agent-browser is - Check element state

Usage: agent-browser is <subcommand> <selector> [--in-frame <path>]

Subcommands:
  visible <selector>   Check if element is visible
  enabled <selector>   Check if element is enabled
  checked <selector>   Check if checkbox is checked

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser is visible "#modal"
  agent-browser is enabled "#submit-btn"
  agent-browser is visible "#element" --in-frame "#frame1"
`,
  find: `
agent-browser find - Find and interact with elements by locator

Usage: agent-browser find <locator> <value> [action] [text] [--in-frame <path>]

Locators:
  role <role>              Find by ARIA role (--name <n>, --exact)
  text <text>              Find by text content (--exact)
  label <label>            Find by associated label
  placeholder <text>       Find by placeholder text
  alt <text>               Find by alt text
  title <text>             Find by title attribute
  testid <id>              Find by data-testid
  first <selector>         First matching element
  last <selector>          Last matching element
  nth <index> <selector>   Nth matching element

Actions (default: click):
  click, fill, type, hover, focus, check, uncheck

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser find role button click --name Submit
  agent-browser find text "Sign In" click
  agent-browser find label "Email" fill "user@example.com"
  agent-browser find role button --in-frame "#frame1"
`,
  set: `
agent-browser set - Configure browser settings

Usage: agent-browser set <setting> [args]

Settings:
  viewport <w> <h>           Set viewport size
  device <name>              Emulate device
  geo <lat> <lng>            Set geolocation
  offline [on|off]           Toggle offline mode
  headers <json>             Set extra HTTP headers
  credentials <user> <pass>  Set HTTP authentication
  media [dark|light] [reduced-motion]

Examples:
  agent-browser set viewport 1920 1080
  agent-browser set device "iPhone 12"
  agent-browser set geo 37.7749 -122.4194
  agent-browser set headers '{"X-Custom": "value"}'
`,
  network: `
agent-browser network - Network interception and monitoring

Usage: agent-browser network <subcommand> [args]

Subcommands:
  route <url> [options]      Intercept requests
    --abort                  Abort matching requests
    --body <json>            Respond with custom body
    --content-type <type>    Content-Type for mocked response
  unroute [url]              Remove route
  requests [options]         List captured requests
    --clear                  Clear request log
    --filter <pattern>       Filter by URL
    --capture-response       Capture response body
    --type <json>            Filter by response type
    --output <dir>           Save requests to directory

Examples:
  agent-browser network route "**/api/*" --abort
  agent-browser network requests
  agent-browser network requests --capture-response
  agent-browser network requests --output ./captures/ --type json --filter "comment"
`,
  cookies: `
agent-browser cookies - Manage browser cookies

Usage: agent-browser cookies [operation] [args]

Operations:
  get                                Get all cookies (default)
  set <name> <value> [options]       Set a cookie
  clear                              Clear all cookies

Cookie Set Options:
  --url <url>                        URL for the cookie
  --domain <domain>                  Cookie domain
  --path <path>                      Cookie path
  --httpOnly                         Set HttpOnly flag
  --secure                           Set Secure flag
  --sameSite <Strict|Lax|None>       SameSite policy
  --expires <timestamp>              Expiration time

Examples:
  agent-browser cookies set session_id "abc123"
  agent-browser cookies set auth "token" --url https://app.example.com
  agent-browser cookies
  agent-browser cookies clear
`,
  storage: `
agent-browser storage - Manage web storage

Usage: agent-browser storage <type> [operation] [key] [value]

Types:
  local                localStorage
  session              sessionStorage

Operations:
  get [key]            Get all storage or specific key
  set <key> <value>    Set a key-value pair
  clear                Clear all storage

Examples:
  agent-browser storage local
  agent-browser storage local set theme "dark"
  agent-browser storage session clear
`,
  tab: `
agent-browser tab - Manage browser tabs

Usage: agent-browser tab [operation] [args]

Operations:
  list                 List all tabs (default)
  new [url]            Open new tab
  close [index]        Close tab
  <index>              Switch to tab by index

Examples:
  agent-browser tab
  agent-browser tab new https://example.com
  agent-browser tab 2
  agent-browser tab close
`,
  kill: `
agent-browser kill - Kill the daemon process

Usage: agent-browser kill [--all] [--force]

Kills the daemon process for the current session (or all sessions with --all).

Options:
  --all                 Kill all session daemons and Stream Server
  --force               Force kill (SIGKILL instead of SIGTERM)

Examples:
  agent-browser kill              # Kill current session daemon
  agent-browser kill --all        # Kill all daemons + Stream Server
  agent-browser kill --force      # Force kill current daemon
`,
  update: `
agent-browser update - Update agent-browser to latest version

Usage: agent-browser update [--check] [--version <ver>]

Checks npm for the latest version and installs it globally.
Kills the current daemon before updating.

Options:
  --check               Check for updates without installing
  --version <ver>       Install a specific version

Examples:
  agent-browser update              # Update to latest
  agent-browser update --check      # Check only
  agent-browser update --version 0.24.1  # Specific version
`,
  restart: `
agent-browser restart - Restart the daemon process

Usage: agent-browser restart

Kills the current session daemon. The next command will
auto-start a fresh daemon.

Examples:
  agent-browser restart
`,
  session: `
agent-browser session - Manage sessions

Usage: agent-browser session [operation]

Manage isolated browser sessions. Each session has its own browser
instance with separate cookies, storage, and state.

Operations:
  (none)               Show current session name
  list                 List all active sessions

Examples:
  agent-browser session
  agent-browser session list
  agent-browser --session test open example.com
`,
  install: `
agent-browser install - Install browser binaries

Usage: agent-browser install [--with-deps]

Downloads and installs browser binaries required for automation.

Options:
  -d, --with-deps      Also install system dependencies (Linux only)

Examples:
  agent-browser install
  agent-browser install --with-deps
`,
  connect: `
agent-browser connect - Connect to browser via CDP

Usage: agent-browser connect <port|url>

Connects to a running browser instance via Chrome DevTools Protocol.

Arguments:
  <port>               Local port number (e.g., 9222)
  <url>                Full WebSocket URL

Examples:
  agent-browser connect 9222
  agent-browser connect "ws://localhost:9222/devtools/browser/abc123"
`,
  close: `
agent-browser close - Close the browser

Usage: agent-browser close

Closes the browser instance for the current session.

Aliases: quit, exit

Examples:
  agent-browser close
`,
  record: `
agent-browser record - Record browser session to video

Usage: agent-browser record <operation> [path] [url]

Operations:
  start <path> [url]     Start recording
  stop                   Stop and save video
  restart <path> [url]   Stop current and start new

Examples:
  agent-browser record start ./demo.webm
  agent-browser record stop
`,
  recorder: `
agent-browser recorder - Record user interactions as steps

Usage: agent-browser recorder <operation> [options]

Records user interactions (clicks, inputs, scrolls, etc.) as structured
steps that can be exported as YAML for LLM processing.

The recorder captures fallback selectors (top-3 alternatives per element),
element identity (tagName, text, attributes, parent signature), SPA URL
changes (pushState/replaceState), and DOM stability signals
(MutationObserver) for self-healing replay.

Operations:
  start [url]              Start recording (optionally navigate to URL)
  stop [--output file]     Stop recording and output YAML
  status                   Show recording status
  replay [file]            Replay recorded CLI commands from YAML

Options:
  --output <file>          Save YAML to file (default: temp directory)
  [file]                   YAML file to replay (default: most recent)

Output Format:
  YAML with session info, pages visited, and recorded steps.
  Each step includes: action, selector, xpath, value, trajectory.
  CLI Commands section contains executable commands for replay.

Examples:
  agent-browser recorder start
  agent-browser recorder start https://example.com
  agent-browser recorder start --hide                # No overlay panel
  agent-browser recorder stop
  agent-browser recorder stop --output session.yaml
  agent-browser recorder status
  agent-browser recorder replay                  # Replay most recent
  agent-browser recorder replay session.yaml     # Replay specific file
`,
  trace: `
agent-browser trace - Record execution trace

Usage: agent-browser trace <operation> [path]

Operations:
  start               Start recording trace
  stop <path>         Stop and save trace

Examples:
  agent-browser trace start
  agent-browser trace stop ./debug-trace.zip
`,
  state: `
agent-browser state - Save/load browser state

Usage: agent-browser state <operation> <path>

Operations:
  save <path>         Save current state to file
  load <path>         Set state path (load at launch)

Examples:
  agent-browser state save ./auth-state.json
  agent-browser --state ./auth-state.json open example.com
`,
  hover: `
agent-browser hover - Hover over an element

Usage: agent-browser hover <selector> [options]

Hovers over the specified element.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after hover

Examples:
  agent-browser hover "#menu-item"
  agent-browser hover @e2
  agent-browser hover "#btn" --in-frame "#frame1"
`,
  focus: `
agent-browser focus - Focus an element

Usage: agent-browser focus <selector> [--diff [scope]] [--in-frame <path>]

Sets focus on the specified element.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after focus

Examples:
  agent-browser focus "#input"
  agent-browser focus @e3
  agent-browser focus "#field" --in-frame "#frame1"
`,
  check: `
agent-browser check - Check a checkbox or radio button

Usage: agent-browser check <selector> [--diff [scope]] [--in-frame <path>]

Checks the specified checkbox or radio button.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after check

Examples:
  agent-browser check "#agree"
  agent-browser check @e4
  agent-browser check "#terms" --in-frame "#frame1"
`,
  uncheck: `
agent-browser uncheck - Uncheck a checkbox

Usage: agent-browser uncheck <selector> [--diff [scope]] [--in-frame <path>]

Unchecks the specified checkbox.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after uncheck

Examples:
  agent-browser uncheck "#newsletter"
  agent-browser uncheck @e5
  agent-browser uncheck "#opt-in" --in-frame "#frame1"
`,
  select: `
agent-browser select - Select dropdown option(s)

Usage: agent-browser select <selector> <value...> [--diff [scope]] [--in-frame <path>]

Selects option(s) in a dropdown element.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after select

Examples:
  agent-browser select "#country" "US"
  agent-browser select "#colors" "red" "blue"
  agent-browser select "#menu" "option1" --in-frame "#frame1"
`,
  drag: `
agent-browser drag - Drag and drop

Usage: agent-browser drag <source> <target> [--in-frame <path>]

Drags an element from source to target.

Options:
  --in-frame <path>    Target elements in iframe

Examples:
  agent-browser drag "#item" "#dropzone"
  agent-browser drag @e1 @e2
  agent-browser drag "#item" "#target" --in-frame "#frame1"
`,
  upload: `
agent-browser upload - Upload files

Usage: agent-browser upload <selector> <files...> [--in-frame <path>]

Uploads files to a file input element.

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser upload "#file-input" ./document.pdf
  agent-browser upload "#photos" ./img1.jpg ./img2.jpg
  agent-browser upload "#file" ./doc.pdf --in-frame "#frame1"
`,
  download: `
agent-browser download - Download file by clicking element

Usage: agent-browser download <selector> <path> [--in-frame <path>]

Clicks an element and saves the downloaded file.

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser download "#download-btn" ./file.pdf
  agent-browser download @e6 ./report.xlsx
  agent-browser download "#link" ./data.csv --in-frame "#frame1"
`,
  scroll: `
agent-browser scroll - Scroll the page

Usage: agent-browser scroll <direction> [amount] [--in-frame <path>]

Scrolls the page in the specified direction.

Options:
  --in-frame <path>    Target iframe

Directions:
  up, down, left, right

Examples:
  agent-browser scroll down
  agent-browser scroll up 500
  agent-browser scroll down --in-frame "#frame1"
`,
  scrollintoview: `
agent-browser scrollintoview - Scroll element into view

Usage: agent-browser scrollintoview <selector> [--in-frame <path>]

Scrolls the page until the element is visible.

Options:
  --in-frame <path>    Target element in iframe

Examples:
  agent-browser scrollintoview "#footer"
  agent-browser scrollintoview @e7
  agent-browser scrollintoview "#section" --in-frame "#frame1"
`,
  dblclick: `
agent-browser dblclick - Double-click an element

Usage: agent-browser dblclick <selector> [options]

Double-clicks on the specified element.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after double-click

Examples:
  agent-browser dblclick "#item"
  agent-browser dblclick @e8
  agent-browser dblclick "#file" --in-frame "#frame1"
`,
  viewer: `
agent-browser viewer - Get viewer URL for browser session

Usage: agent-browser viewer

Returns URLs for viewing the browser session remotely.
Requires Stream Server to be running.

Output (JSON mode):
  url         HTTP viewer URL (e.g., http://localhost:5005/view?instanceId=xxx)
  wsUrl       WebSocket URL (e.g., ws://localhost:5005?instanceId=xxx)
  streamPort  Stream server port (default: 5005)

Note: In normal mode, only the HTTP viewer URL is printed.
Use --json to see all fields.

Examples:
  agent-browser viewer
  agent-browser viewer --json
`,
  ask: `
agent-browser ask - Ask user a question

Usage: agent-browser ask <question>

Sends a question to the user and waits for a response.
Requires Stream Server with message bridge.

Question Formats:

1. Simple String:
   agent-browser ask "What should I do next?"

2. Structured JSON (for multiple choice):
   **IMPORTANT**: The question field must be an OBJECT containing a questions array.

   Structure:
   {
     "question": {
       "questions": [
         {
           "header": "Section Title (optional)",
           "question": "Your question here",
           "multiSelect": false,
           "options": [
             { "label": "Option 1", "description": "Optional description" },
             { "label": "Option 2" }
           ]
         }
       ]
     }
   }

Examples:
  # Simple question
  agent-browser ask "What should I do next?"

  # Multiple choice question (correct format)
  agent-browser ask '{"question":{"questions":[{"question":"Choose an action","options":[{"label":"Login"},{"label":"Skip"}]}]}}'

  # Multi-select question
  agent-browser ask '{"question":{"questions":[{"question":"Select items","multiSelect":true,"options":[{"label":"Item 1"},{"label":"Item 2"}]}]}}'

  # With header and descriptions
  agent-browser ask '{"question":{"questions":[{"header":"Authentication","question":"How would you like to login?","options":[{"label":"Email","description":"Login with email and password"},{"label":"Google","description":"Login with Google account"}]}]}}'

Output:
  answer    User's response (string or selected option(s))
`,
  config: `
agent-browser config - Show or manage persistent configuration

Usage:
  agent-browser config                   Show all settings
  agent-browser config set <key> <val>  Persist a setting
  agent-browser config get <key>        Get a specific setting
  agent-browser config list             List configurable keys
  agent-browser config --json           JSON output

Persistent Configuration:
  Settings are saved to ~/.agent-browser/config.json and survive restarts.
  Environment variables always take priority over the config file.

Configurable Keys:
  viewer.host            Viewer URL host (e.g., https://viewer.example.com:8443)
  viewer.port            Stream Server port (default: 5005)
  messageBridge.url      Message Bridge URL for 'ask' command
  browser.executablePath Browser executable path (e.g., /Applications/Chromium.app/Contents/MacOS/Chromium)
  proxy.url              Proxy server URL for browser
  messageProxy.url       Proxy URL for Message Bridge requests

Examples:
  agent-browser config
  agent-browser config set viewer.host https://viewer.example.com:8443
  agent-browser config set browser.executablePath /Applications/Chromium.app/Contents/MacOS/Chromium
  agent-browser config set messageBridge.url https://bridge.example.com:8443
  agent-browser config get viewer.host
  agent-browser config list
  agent-browser config --json
`,
  interact: `
agent-browser interact - Execute browser interaction steps

Usage: agent-browser interact [options] [steps]

Executes a sequence of browser interaction steps for automation.

Modes:
  Single step          Execute one action
    agent-browser interact navigate <url>
    agent-browser interact click <selector>
    agent-browser interact fill <selector> <value>
    agent-browser interact type <selector> <text>
    agent-browser interact press <key>
    agent-browser interact get <type> [selector]
    agent-browser interact wait [selector] [timeout]
    agent-browser interact screenshot [path]

  JSON flow            Execute multiple steps as JSON
    agent-browser interact '[
      { "action": "navigate", "url": "https://example.com" },
      { "action": "click", "selector": "#submit" }
    ]'

  From file             Load steps from JSON file
    agent-browser interact --file flow.json

Actions:
  navigate <url>           Navigate to URL
  click <selector>          Click element
  fill <selector> <value>   Clear and fill input
  type <selector> <text>    Type character by character
  press <key>               Press keyboard key
  get <type> [selector]      Get page/element data
    Types: text, html, value, url, title
  wait [selector] [timeout]   Wait for element or timeout
  screenshot [path]           Take screenshot

Options:
  --file <path>              Load steps from JSON file
  --timeout <ms>             Default timeout for operations
  --headed                    Show browser window (default: headless)

Examples:
  # Single step
  agent-browser interact navigate https://example.com
  agent-browser interact click "#submit"
  agent-browser interact fill "#email" "test@example.com"
  agent-browser interact get text "main"

  # Multiple steps (JSON)
  agent-browser interact '[
    { "action": "navigate", "url": "https://example.com" },
    { "action": "fill", "selector": "#email", "value": "test@example.com" },
    { "action": "fill", "selector": "#password", "value": "password" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait", "selector": ".welcome" }
  ]'

  # From file
  agent-browser interact --file flow.json
  echo '[{"action":"navigate","url":"https://example.com"}]' > flow.json
  agent-browser interact --file flow.json

  # Get data
  agent-browser interact get url
  agent-browser interact get title
  agent-browser interact get text "main"
  agent-browser interact get value "#input"
  `,
  flow: `
agent-browser flow - Flow engine commands for YAML-defined automation

Usage: agent-browser flow <subcommand> [args]

Subcommands:
  list [--sites-dir <dir>]            List all available sites and flows
  show <site.flow> [--sites-dir <dir>] Show details of a specific flow
  run <site.flow> [options]           Execute a flow
    --param key=value                  Pass parameters (repeatable)
    --sites-dir <dir>                  Override sites directory
    --output json|yaml|table           Output format
  validate <file.yaml>                Validate a site YAML file
  from-recorder <file.yaml> [options] Convert recorder YAML to flow YAML
    --name <name>                      Site name (default: recorded-site)
    --flow-id <id>                     Flow ID (default: auto-generated)
    --base-url <url>                   Base URL override
    --description <text>               Flow description
    --output <file.yaml>               Write output to file
    --max-pages <n>                    Max pagination iterations (default: 10)
  export <file> [options]              Export flow as standalone script
    --format <playwright|python>       Export format (required)
    --headless                         Include headless mode in script
    --base-url <url>                   Override base URL in exported script

Site/Flow Reference:
  Use "site-name.flow-name" format (e.g., "baidu-search.search-and-extract").
  If only a flow name is given, all sites are searched for a match.

Sites Directory:
  Flows are loaded from ./sites/ (project-local) and ~/.agent-browser/sites/.
  Use --sites-dir to specify a custom directory.

Examples:
  agent-browser flow list
  agent-browser flow show baidu-search.search-and-extract
  agent-browser flow run baidu-search.search-and-extract --param keyword=test
  agent-browser flow run baidu-search.search-and-extract --param keyword=AI --param maxPages=3
  agent-browser flow validate sites/baidu-search.yaml
  agent-browser flow from-recorder recording.yaml --name my-site --output sites/my-site.yaml
  agent-browser flow list --sites-dir ./my-sites
  agent-browser flow export recording.yaml --format playwright
  agent-browser flow export recording.yaml --format python --headless
  agent-browser flow export recording.yaml --format playwright --base-url https://staging.example.com
`,
  plugin: `
agent-browser plugin - Manage plugins

Usage: agent-browser plugin <subcommand> [args]

Subcommands:
  install <source>       Install a plugin (npm package, git repo, local path, URL)
  uninstall <name>       Uninstall a plugin by name
  update [name]          Update plugin(s). Updates all if no name given.
  list [--json]          List installed plugins
  info <name>            Show detailed plugin info
  search <keyword>       Search installed plugins by keyword
  run <name> <cmd> [args]  Run a plugin command directly
  create <name> [options]  Create a new plugin from template
    --dir <dir>            Target directory (default: ~/.agent-browser/plugins)
    --minimal              Create minimal template

Plugin Discovery:
  Unknown CLI commands are automatically routed as plugin commands.
  For example, "agent-browser doubao search query" becomes:
  plugin_run(pluginName="doubao", commandName="search", args=["query"])

Examples:
  agent-browser plugin install agent-browser-plugin-doubao
  agent-browser plugin install ./my-plugin
  agent-browser plugin list
  agent-browser plugin list --json
  agent-browser plugin info doubao
  agent-browser plugin search dou
  agent-browser plugin update
  agent-browser plugin update doubao
  agent-browser plugin uninstall doubao
  agent-browser plugin create my-plugin
  agent-browser plugin create my-plugin --dir /tmp/plugins
  agent-browser plugin create my-plugin --minimal
  agent-browser plugin run doubao search "query"
`,
};

export function printCommandHelp(command: string): boolean {
  const help = HELP_TEXT[command];
  if (help) {
    console.log(help.trim());
    return true;
  }
  return false;
}

export function printHelp(): void {
  console.log(`
agent-browser - fast browser automation CLI for AI agents

Usage: agent-browser <command> [args] [options]

Core Commands:
  open <url>                 Navigate to URL
  click <sel>                Click element (or @ref)
  dblclick <sel>             Double-click element
  type <sel> <text>          Type into element
  fill <sel> <text>          Clear and fill
  press <key>                Press key (Enter, Tab, Control+a)
  hover <sel>                Hover element
  focus <sel>                Focus element
  check <sel>                Check checkbox
  uncheck <sel>              Uncheck checkbox
  select <sel> <val...>      Select dropdown option
  drag <src> <dst>           Drag and drop
  upload <sel> <files...>    Upload files
  download <sel> <path>      Download file by clicking element
  scroll <dir> [px]          Scroll (up/down/left/right)
  scrollintoview <sel>       Scroll element into view
  wait <sel|ms>              Wait for element or time
  screenshot [path]          Take screenshot
  pdf <path>                 Save as PDF
  snapshot                   Accessibility tree with refs (for AI)
  interact [steps]            Execute interaction steps
  scrape <url>               Scrape page content (text/html/markdown)
  search <query>             Search web (google/bing/duckduckgo)
  crawl <url>                Crawl website pages recursively
  map <url>                  Discover all URLs on a website
  connect <port|url>         Connect to browser via CDP
  close                      Close browser

Navigation:
  back                       Go back
  forward                    Go forward
  reload                     Reload page

Get Info:  agent-browser get <what> [selector]
  text, html, value, attr <name>, title, url, count, box, styles

Check State:  agent-browser is <what> <selector>
  visible, enabled, checked

Find Elements:  agent-browser find <locator> <value> <action> [text]
  role, text, label, placeholder, alt, title, testid, first, last, nth

Mouse:  agent-browser mouse <action> [args]
  move <x> <y>, down [btn], up [btn], wheel <dy> [dx]
  wander <ms>                     Random mouse movement
  trajectory "x:y:d;..."          Move along trajectory points

Browser Settings:  agent-browser set <setting> [value]
  viewport <w> <h>, device <name>, geo <lat> <lng>
  offline [on|off], headers <json>, credentials <user> <pass>
  media [dark|light] [reduced-motion]

Network:  agent-browser network <action>
  route <url> [--abort|--body <json>]
  unroute [url]
  requests [--clear] [--filter <pattern>]

Storage:
  cookies [get|set|clear]    Manage cookies
  storage <local|session>    Manage web storage

Tabs:
  tab [new|list|close|<n>]   Manage tabs

Debug:
  trace start|stop [path]    Record trace
  record start <path> [url]  Start video recording (WebM)
  record stop                Stop and save video
  recorder start [url] [--hide] Start step recording
  recorder stop [--output]   Stop and output YAML
  recorder status            Show recording status
  recorder replay [file]     Replay recorded commands
  console [--clear]          View console logs
  errors [--clear]           View page errors
  highlight <sel>            Highlight element

Sessions:
  session                    Show current session name
  session list               List active sessions
  kill                       Kill daemon process
  kill --all                 Kill all daemons and Stream Server
  kill --force               Force kill (SIGKILL)
  restart                    Restart the daemon process
  update                     Update to latest version
  update --check             Check for updates only
  update --version <ver>     Install specific version

Remote:
  viewer                     Get viewer URL for browser session
  ask <question>             Ask user a question (requires Stream Server)

Config:
  config [--json]            Show current environment configuration

Setup:
  install                    Install browser binaries
  install --with-deps        Also install system dependencies (Linux)

Plugins:
  plugin install <source>    Install a plugin
  plugin uninstall <name>    Uninstall a plugin
  plugin update [name]       Update plugin(s)
  plugin list [--json]       List installed plugins
  plugin info <name>         Show plugin info
  plugin search <keyword>    Search plugins
  plugin create <name>       Create plugin from template
  plugin run <name> <cmd>    Run a plugin command

Snapshot Options:
  -i, --interactive          Only interactive elements
  -c, --compact              Remove empty structural elements
  -d, --depth <n>            Limit tree depth
  -s, --selector <sel>       Scope snapshot to CSS selector
  --in-frame <path>          Target iframe

Iframe Path Format:
  --in-frame <path>          Target element in iframe
                             path format:
                               - "#frame1"              single iframe by ID/name
                               - "#frame1/#frame2"      nested iframes (2 levels)
                               - "0"                    by index (0-based)
                               - "iframe-url"           by URL path segment

Diff Options (for click, fill, type, press, etc.):
  --diff [scope]             Show page changes after action
                             scope options:
                               - (no arg)  3 levels up from target (default)
                               - N         N levels up from target
                               - full      entire page
                               - selector  CSS selector for diff scope

Options:
  --session <name>           Isolated session (or AGENT_BROWSER_SESSION env)
  --profile <path>           Persistent browser profile
  --state <path>             Load storage state from JSON file
  --headers <json>           HTTP headers scoped to URL's origin
  --executable-path <path>   Custom browser executable
  --extension <path>         Load browser extensions (repeatable)
  --args <args>              Browser launch args
  --user-agent <ua>          Custom User-Agent
  --proxy <server>           Proxy server URL
  --proxy-bypass <hosts>     Bypass proxy for these hosts
  --ignore-https-errors      Ignore HTTPS certificate errors
  --allow-file-access        Allow file:// URLs to access local files
  -p, --provider <name>      Browser provider: browserbase, kernel
  --json                     JSON output
  --full, -f                 Full page screenshot
  --headed                   Show browser window
  --cdp <port>               Connect via CDP
  --debug                    Debug output
  --version, -V              Show version
  --help, -h                 Show this help

Environment:
  AGENT_BROWSER_SESSION          Session name (default: "default")
  AGENT_BROWSER_EXECUTABLE_PATH  Custom browser executable path
  AGENT_BROWSER_PROVIDER         Browser provider (browserbase, kernel, browseruse)
  AGENT_BROWSER_STREAM_PORT      Stream Server port (default: 5005)
  AGENT_BROWSER_VIEWER_HOST      Viewer URL host (default: http://localhost)
  AGENT_BROWSER_SOCKET_DIR       Custom socket directory
  AGENT_BROWSER_HOME             Installation directory
  AGENT_BROWSER_PROFILE          Persistent browser profile path
  AGENT_BROWSER_STATE            Storage state JSON file path
  AGENT_BROWSER_EXTENSIONS       Browser extensions (comma-separated)
  AGENT_BROWSER_ARGS             Browser launch args
  AGENT_BROWSER_USER_AGENT       Custom User-Agent
  AGENT_BROWSER_PROXY            Proxy server URL
  AGENT_BROWSER_PROXY_BYPASS     Proxy bypass hosts
  AGENT_BROWSER_IGNORE_HTTPS_ERRORS  Set to "1" to ignore HTTPS errors
  AGENT_BROWSER_ALLOW_FILE_ACCESS    Set to "1" to allow file:// access
  AGENT_BROWSER_HEADED           Set to "1" for headed mode
  AGENT_BROWSER_HUMAN            Enable human-like mouse movement (1, bezier, arc, random, linear)

  MESSAGE_BRIDGE_URL             Message Bridge URL for 'ask' command
  HTTP_PROXY / HTTPS_PROXY       Proxy for Message Bridge requests

Persistent Config (~/.agent-browser/config.json):
  Use "agent-browser config set <key> <value>" to persist settings.
  Run "agent-browser config list" to see all configurable keys.
  Environment variables always take priority over the config file.

Provider API Keys:
  BROWSERBASE_API_KEY            Browserbase API key
  BROWSERBASE_PROJECT_ID         Browserbase project ID
  KERNEL_API_KEY                 Kernel API key
  KERNEL_PROFILE_NAME            Kernel profile name
  KERNEL_HEADLESS                Kernel headless mode (true/false)
  KERNEL_STEALTH                 Kernel stealth mode (default: true)
  KERNEL_TIMEOUT_SECONDS         Kernel timeout (default: 300)
  BROWSER_USE_API_KEY            BrowserUse API key

Examples:
  agent-browser open example.com
  agent-browser snapshot -i
  agent-browser click @e2
  agent-browser fill @e3 "test@example.com"
  agent-browser find role button click --name Submit
  agent-browser screenshot --full
  agent-browser --cdp 9222 snapshot
  agent-browser --profile ~/.myapp open example.com
`);
}

export function printVersion(): void {
  console.log(`agent-browser ${getVersion()}`);
}
