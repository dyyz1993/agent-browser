# scrape

Extract clean content from any URL. Handles SPAs, dynamic content, shadow DOM, and more.

## Syntax

```bash
agent-browser scrape <url> [options]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--format` | `markdown` | Output format: `markdown`, `html`, or `text` |
| `--selector` | - | CSS selector to target specific content |
| `--timeout` | `15000` | Page load timeout in milliseconds |
| `--executable-path` | - | Path to browser executable |

## Examples

### Basic scrape (markdown output)

```bash
agent-browser scrape https://example.com --format markdown
```

### Scrape as HTML

```bash
agent-browser scrape https://example.com --format html
```

### Scrape with CSS selector

```bash
agent-browser scrape https://example.com --selector "main article"
```

### Scrape a SPA (Docsify site)

```bash
agent-browser scrape https://docsify.js.org/#/quickstart --format markdown
```

Agent Browser automatically detects SPA hash routes and waits for JavaScript-rendered content to load.

### Scrape with custom timeout

```bash
agent-browser scrape https://slow-site.example.com --timeout 30000
```

## Output Format

### Markdown (default)

Returns clean markdown with:
- Headings preserved
- Links converted to `[text](url)` format
- Images converted to `![alt](src)` format
- Navigation, footers, ads, and boilerplate removed

### HTML

Returns cleaned HTML with:
- Navigation, footer, sidebar elements removed
- SVG and data URI images stripped
- Script and style tags removed

### Text

Returns plain text with:
- All formatting stripped
- Whitespace normalized
- Boilerplate content removed

## How It Works

1. Launches a headless browser (or connects via CDP)
2. Navigates to the URL
3. Waits for the page to fully load (`networkidle`)
4. For SPAs: waits for content selectors to appear
5. Extracts main content using smart selectors
6. Cleans and formats the output
