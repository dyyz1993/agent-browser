# search

Search the web and extract structured results. No API keys required.

## Syntax

```bash
agent-browser search <query> [options]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--timeout` | `15000` | Page load timeout in milliseconds |

## Examples

### Basic search

```bash
agent-browser search "agent browser automation"
```

### Search with timeout

```bash
agent-browser search "web scraping best practices" --timeout 30000
```

## Output

Returns structured search results:

```json
{
  "query": "agent browser automation",
  "results": [
    {
      "title": "Agent Browser - GitHub",
      "url": "https://github.com/nicepkg/agent-browser",
      "snippet": "Browser automation CLI for AI agents..."
    }
  ],
  "total": 10
}
```

## How It Works

1. Opens a headless browser
2. Navigates to a search engine (Bing, since Google blocks headless)
3. Submits the search query
4. Extracts result titles, URLs, and snippets
5. Returns structured JSON

## Notes

- Uses Bing as the search engine (Google blocks headless browsers)
- Returns up to 10 results per query
- Snippets are extracted from search result previews
