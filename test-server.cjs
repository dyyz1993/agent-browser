const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18923;
const PAGES_DIR = path.join(__dirname, 'test-pages');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/not-found') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', status: 404 }));
  } else if (url.pathname === '/api/server-error') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error', status: 500 }));
  } else if (url.pathname === '/api/success') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Success', status: 200, data: { id: 1, name: 'test' } }));
  } else {
    const filePath = path.join(PAGES_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const ct = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + url.pathname);
    }
  }
});

server.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});
