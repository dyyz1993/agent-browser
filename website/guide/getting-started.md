# Getting Started

## Installation

Install agent-browser globally via npm:

```bash
npm install -g @dyyz1993/agent-browser
```

Verify the installation:

```bash
agent-browser --version
```

## First Scrape

Extract content from any URL as markdown:

```bash
agent-browser scrape https://example.com --format markdown
```

This connects to a headless browser, loads the page, and extracts the main content as clean markdown.

## Configuration

### Browser Executable Path

On macOS, use the system Chromium:

```bash
export AGENT_BROWSER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium
```

Or pass the flag directly:

```bash
agent-browser --executable-path /Applications/Chromium.app/Contents/MacOS/Chromium scrape https://example.com
```

### Timeout

Set a custom timeout (in milliseconds) for page loads:

```bash
agent-browser scrape https://example.com --timeout 30000
```

The default timeout is 15 seconds.

### Output

Results are printed to stdout. Redirect to a file to save:

```bash
agent-browser scrape https://example.com --format markdown > output.md
```

## Next Steps

- [Scrape command](/commands/scrape) - Extract content from pages
- [Crawl command](/commands/crawl) - Multi-page crawling
- [Map command](/commands/map) - Discover site URLs
- [Search command](/commands/search) - Web search
- [Interact command](/commands/interact) - Browser automation
