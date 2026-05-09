---
layout: page
title: Interactive Demo
---

# Interactive Demo

Try Agent Browser commands directly in your browser. The demo is powered by a live headless browser instance running on the server.

:::tip Try it out
Enter a URL or search query and hit **Run**. Results appear below the input.
:::

<DemoPlayground />

## How it works

| Tab | Endpoint | Description |
| --- | -------- | ----------- |
| Scrape | `POST /api/scrape` | Extract clean content from any URL as markdown, HTML, or plain text |
| Crawl | `POST /api/crawl` | BFS-based multi-page crawling with configurable depth and limits |
| Map | `POST /api/map` | Discover all internal URLs on a website |
| Search | `POST /api/search` | Search the web and return structured results |

All requests are rate-limited to **10 requests per minute** to prevent abuse.

## Next steps

- Read the [Getting Started guide](/guide/getting-started) to install the CLI
- Browse [Commands](/commands/scrape) for full parameter documentation
- Check the [API Reference](/api/) to integrate with your own backend
