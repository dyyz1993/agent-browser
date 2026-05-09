# crawl

Multi-page crawling with BFS (Breadth-First Search). Discovers and scrapes pages up to a configurable depth.

## Syntax

```bash
agent-browser crawl <url> [options]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--limit` | `10` | Maximum number of pages to crawl |
| `--depth` | `2` | Maximum crawl depth from start URL |
| `--format` | `markdown` | Output format per page |
| `--timeout` | `15000` | Page load timeout in milliseconds |

## Examples

### Basic crawl

```bash
agent-browser crawl https://example.com --limit 10 --depth 2
```

### Shallow crawl (1 level)

```bash
agent-browser crawl https://example.com --depth 1 --limit 5
```

### Deep crawl with HTML output

```bash
agent-browser crawl https://example.com --depth 3 --limit 50 --format html
```

## How Crawling Works

1. **Start**: Load the seed URL
2. **Discover**: Extract all same-origin links from the page
3. **Filter**: Skip external links, media files, and duplicates
4. **Queue**: Add new URLs to the BFS queue
5. **Repeat**: Process next URL in queue until limit or depth reached

## URL Filtering

The crawler automatically skips:

- External domains (only same-origin URLs)
- Static assets (`.png`, `.jpg`, `.css`, `.js`, `.pdf`, `.zip`)
- Duplicate URLs (normalized)
- Fragment-only links (`#section`)

## Output

Returns a JSON array of results:

```json
[
  {
    "url": "https://example.com/page1",
    "title": "Page 1 Title",
    "content": "Extracted content...",
    "depth": 1
  }
]
```

## Limitations

- Only follows same-origin links
- Does not submit forms or interact with JavaScript-heavy navigation
- Rate-limited to avoid overwhelming target servers
