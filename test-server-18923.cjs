const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18923;
const PAGES_DIR = path.join(__dirname, 'test-pages');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API endpoints for error simulation
  if (url.pathname === '/api/server-error-500') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error', code: 500 }));
    return;
  }

  if (url.pathname === '/api/nonexistent-endpoint-404') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', code: 404 }));
    return;
  }

  if (url.pathname === '/api/missing-resource-404') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', code: 404 }));
    return;
  }

  if (url.pathname === '/api/slow-resource') {
    const delay = parseInt(url.searchParams.get('delay') || '2000', 10);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: 'slow response', delay }));
    }, delay);
    return;
  }

  // Static file serving
  let filePath = path.join(PAGES_DIR, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + url.pathname);
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
});
