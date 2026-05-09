# map

Discover all URLs on a website without scraping content. Fast site structure analysis.

## Syntax

```bash
agent-browser map <url> [options]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--timeout` | `15000` | Page load timeout in milliseconds |

## Examples

### Map a website

```bash
agent-browser map https://example.com
```

### Map with custom timeout

```bash
agent-browser map https://example.com --timeout 30000
```

## Output

Returns a list of discovered URLs:

```json
{
  "url": "https://example.com",
  "urls": [
    "https://example.com/",
    "https://example.com/about",
    "https://example.com/contact",
    "https://example.com/blog"
  ],
  "total": 4
}
```

## How It Works

1. Loads the page in a headless browser
2. Extracts all `<a href>` attributes
3. Resolves relative URLs to absolute
4. Filters to HTTP(S) URLs only
5. Removes duplicates
6. Returns the unique URL list

## Use Cases

- **SEO audit**: Check internal linking structure
- **Pre-crawl analysis**: Understand site size before full crawl
- **Sitemap generation**: Discover pages not in sitemap.xml
- **Broken link detection**: Combine with scrape to verify each URL
