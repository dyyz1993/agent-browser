const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18930;
const STATIC_DIR = path.join(__dirname, 'concurrent-test-pages');

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><body>
      <h1>Concurrent Test Server</h1>
      <ul>
        <li><a href="/form-isolation.html">Scenario 1: Form Isolation</a></li>
        <li><li><a href="/counter-state.html">Scenario 2: Counter State Isolation</a></li>
        <li><a href="/storage-isolation.html">Scenario 3: Storage Isolation</a></li>
        <li><a href="/headless-detect.html">Scenario 4: Headless Detection</a></li>
        <li><a href="/complex-form.html">Scenario 5: Complex Form Flow</a></li>
      </ul>
    </body></html>`);
    return;
  }

  const filePath = path.join(STATIC_DIR, route);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Concurrent test server running at http://localhost:${PORT}`);
});
