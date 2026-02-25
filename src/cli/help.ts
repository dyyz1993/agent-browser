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
  --human [type]       Simulate human-like mouse movement
                       type options: bezier, arc (default), random, linear

Examples:
  agent-browser click "#submit-button"
  agent-browser click @e1
  agent-browser click @e1 --diff
  agent-browser click @e1 --diff 5
  agent-browser click @e1 --diff full
  agent-browser click @e2 --in-frame "frame1"
  agent-browser click @e1 --human
  agent-browser click @e1 --human arc
  agent-browser click @e1 --human random
`,
  fill: `
agent-browser fill - Clear and fill an input field

Usage: agent-browser fill <selector> <text> [options]

Clears the input field and fills it with the specified text.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after fill
  --human [type]       Simulate human-like mouse movement
                       type options: bezier, arc (default), random, linear

Examples:
  agent-browser fill "#email" "user@example.com"
  agent-browser fill @e3 "Hello World"
  agent-browser fill @e3 "Hello" --diff
  agent-browser fill "#input" "test" --in-frame "#frame1"
  agent-browser fill "#email" "test@example.com" --human
`,
  type: `
agent-browser type - Type text into an element

Usage: agent-browser type <selector> <text> [options]

Types text into the specified element character by character.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after type
  --human [type]       Simulate human-like mouse movement
                       type options: bezier, arc (default), random, linear

Examples:
  agent-browser type "#search" "hello"
  agent-browser type @e2 "additional text"
  agent-browser type @e2 "hello" --diff
  agent-browser type "#input" "test" --in-frame "#frame1"
  agent-browser type "#search" "query" --human
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

Usage: agent-browser screenshot [path] [--full] [--in-frame <path>]

Captures a screenshot of the current page.

Options:
  --full, -f           Capture full page (not just viewport)
  --in-frame <path>    Target iframe

Examples:
  agent-browser screenshot
  agent-browser screenshot ./screenshot.png
  agent-browser screenshot --full ./full-page.png
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

Examples:
  agent-browser snapshot
  agent-browser snapshot -i
  agent-browser snapshot -i -C
  agent-browser snapshot --compact --depth 5
`,
  eval: `
agent-browser eval - Execute JavaScript

Usage: agent-browser eval [options] <script> [--in-frame <path>]

Executes JavaScript code in the browser context.

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
  unroute [url]              Remove route
  requests [options]         List captured requests
    --clear                  Clear request log
    --filter <pattern>       Filter by URL

Examples:
  agent-browser network route "**/api/*" --abort
  agent-browser network requests
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

Operations:
  start [url]              Start recording (optionally navigate to URL)
  stop [--output file]     Stop recording and output YAML
  status                   Show recording status

Options:
  --output <file>          Save YAML to file (default: stdout)

Output Format:
  YAML with session info, pages visited, and recorded steps.
  Each step includes: action, selector, xpath, value, trajectory.

Examples:
  agent-browser recorder start
  agent-browser recorder start https://example.com
  agent-browser recorder stop
  agent-browser recorder stop --output session.yaml
  agent-browser recorder status
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
  device: `
agent-browser device - Manage iOS simulators

Usage: agent-browser device [list]

Operations:
  list                List available iOS simulators

Examples:
  agent-browser device list
`,
  hover: `
agent-browser hover - Hover over an element

Usage: agent-browser hover <selector> [options]

Hovers over the specified element.

Options:
  --in-frame <path>    Target element in iframe
  --diff [scope]       Show page changes after hover
  --human [type]       Simulate human-like mouse movement
                       type options: bezier, arc (default), random, linear

Examples:
  agent-browser hover "#menu-item"
  agent-browser hover @e2
  agent-browser hover "#btn" --in-frame "#frame1"
  agent-browser hover "#menu" --human
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
  --human [type]       Simulate human-like mouse movement
                       type options: bezier, arc (default), random, linear

Examples:
  agent-browser dblclick "#item"
  agent-browser dblclick @e8
  agent-browser dblclick "#file" --in-frame "#frame1"
  agent-browser dblclick "#item" --human
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
   The question can be a JSON string with options for the user to select.

   Structure:
   {
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

Examples:
  # Simple question
  agent-browser ask "What should I do next?"
  
  # Multiple choice question
  agent-browser ask '{"questions":[{"question":"Choose an action","options":[{"label":"Login"},{"label":"Skip"}]}]}'
  
  # Multi-select question
  agent-browser ask '{"questions":[{"question":"Select items","multiSelect":true,"options":[{"label":"Item 1"},{"label":"Item 2"}]}]}'
  
  # With header and descriptions
  agent-browser ask '{"questions":[{"header":"Authentication","question":"How would you like to login?","options":[{"label":"Email","description":"Login with email and password"},{"label":"Google","description":"Login with Google account"}]}]}'

Output:
  answer    User's response (string or selected option(s))
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
  eval <js>                  Run JavaScript
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
  wander <ms> [--human [type]]  Random mouse movement

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
  recorder start [url]       Start step recording
  recorder stop [--output]   Stop and output YAML
  recorder status            Show recording status
  console [--clear]          View console logs
  errors [--clear]           View page errors
  highlight <sel>            Highlight element

Sessions:
  session                    Show current session name
  session list               List active sessions
  kill                       Kill all daemons and Stream Server

Remote:
  viewer                     Get viewer URL for browser session
  ask <question>             Ask user a question (requires Stream Server)

Setup:
  install                    Install browser binaries
  install --with-deps        Also install system dependencies (Linux)

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
  -p, --provider <name>      Browser provider: ios, browserbase, kernel
  --device <name>            iOS device name
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
  AGENT_BROWSER_PROVIDER         Browser provider (ios, browserbase, kernel, browseruse)
  AGENT_BROWSER_IOS_DEVICE       Default iOS device name
  AGENT_BROWSER_IOS_UDID         iOS device UDID
  AGENT_BROWSER_STREAM_PORT      Stream Server port (default: 5005)
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

  MESSAGE_BRIDGE_URL             Message Bridge URL for 'ask' command
  HTTP_PROXY / HTTPS_PROXY       Proxy for Message Bridge requests

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

iOS Simulator (requires Xcode and Appium):
  agent-browser -p ios open example.com
  agent-browser -p ios --device "iPhone 15 Pro" open url
  agent-browser -p ios device list
  agent-browser -p ios swipe up
`);
}

export function printVersion(): void {
  console.log('agent-browser 0.9.2');
}
