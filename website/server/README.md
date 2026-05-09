# Agent Browser Demo API Server

Express server that powers the interactive demo on the docs site.

## Quick Start

```bash
cd website
npm install
npm run server
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server listen port |
| `BROWSER_WS_URL` | (built-in default) | WebSocket URL to a remote Chromium instance via CDP |
| `RATE_LIMIT_PER_MINUTE` | `10` | Max API requests per IP per minute |
| `CRAWL_MAX_PAGES` | `5` | Max pages returned by the crawl endpoint |

## Deploy with PM2

```bash
pm2 start server/index.cjs --name agent-browser-api --cwd /path/to/website
```

## Deploy with Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.cjs"]
```

```bash
docker build -f website/server/Dockerfile -t agent-browser-api .
docker run -d -p 3001:3001 \
  -e BROWSER_WS_URL=wss://your-browser-host:8443/ws/connect \
  agent-browser-api
```

## CORS

The server enables CORS for all origins via the `cors` middleware. For production, restrict it to your docs domain:

```js
// In server/index.cjs, replace app.use(cors()) with:
app.use(cors({ origin: 'https://your-docs-domain.com' }));
```

## API Endpoints

- `POST /api/scrape` - Scrape a single page
- `POST /api/crawl` - Discover links from a page
- `POST /api/map` - List all URLs on a page
- `POST /api/search` - Search via Bing
- `GET  /api/health` - Health check
