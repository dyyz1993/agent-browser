const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18931;
const STATIC_DIR = path.join(__dirname, 'edge-test-pages');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

const metrics = {};

function logRequest(agent, action, detail) {
  if (!metrics[agent]) metrics[agent] = { actions: [], errors: 0, startTime: Date.now() };
  metrics[agent].actions.push({ action, detail, time: Date.now() });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (route === '/') {
    const pages = [
      { href: '/shadow-dom.html', name: 'Edge A: Shadow DOM Components' },
      { href: '/async-loading.html', name: 'Edge B: Async Progressive Loading' },
      { href: '/infinite-scroll.html', name: 'Edge C: Infinite Scroll List' },
      { href: '/nested-modal.html', name: 'Edge D: Nested Modal Workflow' },
      { href: '/drag-sort-rich-text.html', name: 'Edge E: Drag Sort + Rich Text' },
      { href: '/sticky-tabs-accordion.html', name: 'Edge F: Sticky + Tabs + Accordion' },
      { href: '/iframe-nested.html', name: 'Edge G: Iframe Isolation' },
      { href: '/animated-transitions.html', name: 'Edge H: Animated Transitions' }
    ];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><body style="font-family:monospace;max-width:700px;margin:40px auto;padding:20px">
      <h1>Edge Case Test Server</h1><ul>${pages.map(p => `<li><a href="${p.href}">${p.name}</a></li>`).join('')}</ul>
    </body></html>`);
    return;
  }

  if (route === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
    return;
  }

  if (route === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
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
  console.log(`Edge test server running at http://localhost:${PORT}`);
});
