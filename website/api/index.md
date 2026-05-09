---
layout: page
title: API Reference
---

# API Reference

Agent Browser provides both a CLI and a programmatic API.

## CLI Commands

| Command | Description |
|---------|-------------|
| `scrape <url>` | Extract content from a URL |
| `crawl <url>` | Multi-page BFS crawling |
| `map <url>` | Discover all URLs on a site |
| `search <query>` | Web search with structured results |
| `interact <url>` | Multi-step browser automation |

## Global Options

| Option | Description |
|--------|-------------|
| `--executable-path` | Path to browser executable |
| `--timeout` | Default timeout in milliseconds |
| `--version` | Print version |
| `--help` | Print help |

## Demo API Server

The demo site includes an Express API server for trying Agent Browser in the browser.

### Base URL

```
http://localhost:3001
```

### Endpoints

#### POST /api/scrape

Scrape a URL and return extracted content.

```json
{
  "url": "https://example.com",
  "format": "markdown",
  "selector": "main"
}
```

#### POST /api/crawl

Crawl a URL and discover links (demo limited to 5 pages).

```json
{
  "url": "https://example.com",
  "limit": 5,
  "depth": 1
}
```

#### POST /api/map

Map all URLs on a page.

```json
{
  "url": "https://example.com"
}
```

#### POST /api/search

Search the web.

```json
{
  "query": "agent browser automation"
}
```

#### GET /api/health

Health check endpoint.

### Rate Limiting

The demo API is rate-limited to **10 requests per minute** per IP address.

### Demo Limitations

- Crawl: maximum 5 pages, depth 2
- Search: maximum 10 results
- No interact endpoint in demo mode
