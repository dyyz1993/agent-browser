<template>
  <div class="demo-playground">
    <div class="demo-header">
      <h2>Interactive Demo</h2>
      <p class="demo-desc">Try Agent Browser commands directly in your browser. Powered by a remote headless browser.</p>
    </div>

    <div class="demo-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="switchTab(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <div class="demo-input-area">
      <div class="input-row">
        <input
          v-if="activeTab !== 'search'"
          v-model="url"
          type="url"
          placeholder="https://example.com"
          class="url-input"
          @keydown.enter="run"
        />
        <input
          v-else
          v-model="searchQuery"
          type="text"
          placeholder="agent browser automation"
          class="url-input"
          @keydown.enter="run"
        />
        <button class="run-btn" :disabled="loading" @click="run">
          <span v-if="loading" class="spinner"></span>
          <span v-else>Run</span>
        </button>
      </div>

      <div class="options-row">
        <div v-if="activeTab === 'scrape'" class="option-group">
          <label>Format</label>
          <select v-model="format">
            <option value="markdown">markdown</option>
            <option value="html">html</option>
            <option value="text">text</option>
          </select>
        </div>
        <div v-if="activeTab === 'scrape'" class="option-group">
          <label>Selector</label>
          <input v-model="selector" type="text" placeholder="CSS selector (optional)" class="option-input" />
        </div>
        <div v-if="activeTab === 'crawl'" class="option-group">
          <label>Limit</label>
          <input v-model.number="crawlLimit" type="number" min="1" max="5" class="option-input" />
        </div>
        <div v-if="activeTab === 'crawl'" class="option-group">
          <label>Depth</label>
          <input v-model.number="crawlDepth" type="number" min="1" max="2" class="option-input" />
        </div>
      </div>

      <div class="examples">
        <span class="examples-label">Try:</span>
        <button
          v-for="ex in currentExamples"
          :key="ex"
          class="example-btn"
          @click="applyExample(ex)"
        >{{ truncate(ex, 50) }}</button>
      </div>
    </div>

    <div v-if="rateLimited" class="rate-limit-warning">
      Rate limited - please wait before trying again. 10 requests per minute.
    </div>

    <div v-if="error" class="error-box">
      <strong>Error:</strong> {{ error }}
    </div>

    <div v-if="result" class="result-area">
      <div class="result-header">
        <span class="result-title">{{ resultTitle }}</span>
        <button class="copy-btn" @click="copyResult">
          <span v-if="copied" class="copy-check">&#10003;</span>
          <span v-else>Copy</span>
        </button>
      </div>

      <div v-if="activeTab === 'search'" class="search-results">
        <div v-for="(item, i) in result.data.results" :key="i" class="search-item">
          <a :href="item.url" target="_blank" rel="noopener" class="search-item-title">{{ item.title }}</a>
          <div class="search-item-url">{{ item.url }}</div>
          <div class="search-item-snippet">{{ item.snippet }}</div>
        </div>
      </div>

      <div v-else-if="activeTab === 'map'" class="map-results">
        <div class="map-summary">{{ result.data.total }} URLs found</div>
        <ul class="url-list">
          <li v-for="(u, i) in result.data.urls" :key="i">
            <a :href="u" target="_blank" rel="noopener">{{ u }}</a>
          </li>
        </ul>
      </div>

      <div v-else-if="activeTab === 'crawl'" class="crawl-results">
        <div class="crawl-summary">
          <strong>{{ result.data.title }}</strong>
          <span class="crawl-count">{{ result.data.total }} pages discovered</span>
        </div>
        <p class="crawl-note">{{ result.data.message }}</p>
        <ul class="url-list">
          <li v-for="(link, i) in result.data.links" :key="i">
            <a :href="link" target="_blank" rel="noopener">{{ link }}</a>
          </li>
        </ul>
      </div>

      <div v-else class="scrape-results">
        <div class="scrape-meta">
          <strong>{{ result.data.title }}</strong>
          <span class="scrape-url">{{ result.data.url }}</span>
          <span class="scrape-format">{{ result.data.format }}</span>
        </div>
        <div v-if="result.data.format === 'markdown'" class="markdown-output" v-html="renderedMarkdown"></div>
        <pre v-else class="output-pre"><code>{{ result.data.content }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// In production, the API server runs on a different domain than GitHub Pages.
// Set VITE_API_URL at build time (e.g. https://api.example.com/api) to point to it.
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001/api'
  : (import.meta.env.VITE_API_URL || '/api');

const tabs = [
  { id: 'scrape', label: 'Scrape' },
  { id: 'crawl', label: 'Crawl' },
  { id: 'map', label: 'Map' },
  { id: 'search', label: 'Search' },
];

const activeTab = ref('scrape');
const url = ref('https://example.com');
const searchQuery = ref('playwright browser automation');
const format = ref('markdown');
const selector = ref('');
const crawlLimit = ref(5);
const crawlDepth = ref(1);
const loading = ref(false);
const error = ref('');
const result = ref(null);
const rateLimited = ref(false);
const copied = ref(false);

const examples = {
  scrape: ['https://example.com', 'https://docsify.js.org/#/quickstart'],
  crawl: ['https://example.com'],
  map: ['https://example.com'],
  search: ['playwright browser automation', 'web scraping CLI tools'],
};

const currentExamples = computed(() => examples[activeTab.value] || []);

const resultTitle = computed(() => {
  if (!result.value) return '';
  switch (activeTab.value) {
    case 'scrape': return 'Scraped Content';
    case 'crawl': return 'Crawl Results';
    case 'map': return 'Site Map';
    case 'search': return 'Search Results';
    default: return 'Results';
  }
});

const renderedMarkdown = computed(() => {
  if (!result.value || !result.value.data || result.value.data.format !== 'markdown') return '';
  const raw = result.value.data.content || '';
  return simpleMarkdownToHtml(raw);
});

function simpleMarkdownToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/^---$/gm, '<hr/>');

  html = html.replace(/\n{2,}/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

function switchTab(tab) {
  activeTab.value = tab;
  result.value = null;
  error.value = '';
  copied.value = false;
}

function applyExample(ex) {
  if (activeTab.value === 'search') {
    searchQuery.value = ex;
  } else {
    url.value = ex;
  }
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

async function run() {
  loading.value = true;
  error.value = '';
  result.value = null;
  rateLimited.value = false;
  copied.value = false;

  try {
    let endpoint, body;

    switch (activeTab.value) {
      case 'scrape':
        endpoint = `${API_BASE}/scrape`;
        body = { url: url.value, format: format.value };
        if (selector.value) body.selector = selector.value;
        break;
      case 'crawl':
        endpoint = `${API_BASE}/crawl`;
        body = { url: url.value, limit: crawlLimit.value, depth: crawlDepth.value };
        break;
      case 'map':
        endpoint = `${API_BASE}/map`;
        body = { url: url.value, maxDepth: 1 };
        break;
      case 'search':
        endpoint = `${API_BASE}/search`;
        body = { query: searchQuery.value };
        break;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (resp.status === 429) {
      rateLimited.value = true;
      return;
    }

    if (!resp.ok) {
      error.value = data.error || `Request failed (HTTP ${resp.status})`;
      return;
    }

    if (!data.success) {
      error.value = data.error || 'Unknown error occurred';
      return;
    }

    result.value = data;
  } catch (err) {
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      error.value = 'Cannot connect to API server. Make sure it is running on localhost:3001.';
    } else {
      error.value = err.message || 'An unexpected error occurred';
    }
  } finally {
    loading.value = false;
  }
}

function copyResult() {
  if (!result.value) return;
  let text;
  if (activeTab.value === 'scrape') {
    text = result.value.data.content;
  } else {
    text = JSON.stringify(result.value.data, null, 2);
  }
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }).catch(() => {});
}
</script>

<style scoped>
.demo-playground {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.demo-header {
  margin-bottom: 24px;
}

.demo-header h2 {
  margin: 0 0 8px;
  font-size: 1.5rem;
  border: none;
  padding: 0;
}

.demo-desc {
  color: var(--vp-c-text-2);
  margin: 0;
  font-size: 0.95rem;
}

.demo-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 0;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  background: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--vp-c-text-1);
}

.tab-btn.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.demo-input-area {
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--vp-c-divider);
}

.input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.url-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
  font-family: var(--vp-font-family-mono);
  outline: none;
  transition: border-color 0.2s;
}

.url-input:focus {
  border-color: var(--vp-c-brand-1);
}

.run-btn {
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 80px;
  justify-content: center;
  transition: opacity 0.2s;
}

.run-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.run-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.options-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.option-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.option-group label {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.option-group select,
.option-input {
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.85rem;
  outline: none;
}

.option-input {
  width: 160px;
  font-family: var(--vp-font-family-mono);
}

.examples {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.examples-label {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  font-weight: 500;
}

.example-btn {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  cursor: pointer;
  transition: all 0.2s;
}

.example-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.rate-limit-warning {
  padding: 12px 16px;
  background: #f59e0b15;
  border: 1px solid #f59e0b40;
  border-radius: 8px;
  color: #d97706;
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.error-box {
  padding: 12px 16px;
  background: var(--vp-c-danger-dimm);
  border: 1px solid var(--vp-c-danger-1);
  border-radius: 8px;
  color: var(--vp-c-danger-1);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.result-area {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.result-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
}

.copy-btn {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 50px;
  text-align: center;
}

.copy-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.copy-check {
  color: var(--vp-c-green-1);
  font-weight: bold;
}

.markdown-output {
  padding: 16px;
  font-size: 0.85rem;
  line-height: 1.7;
  max-height: 600px;
  overflow-y: auto;
  background: var(--vp-c-bg);
}

.markdown-output :deep(h1) {
  font-size: 1.4rem;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.markdown-output :deep(h2) {
  font-size: 1.2rem;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.markdown-output :deep(h3) { font-size: 1.1rem; margin: 12px 0 6px; }
.markdown-output :deep(h4) { font-size: 1rem; margin: 12px 0 6px; }
.markdown-output :deep(h5) { font-size: 0.95rem; margin: 8px 0 4px; }
.markdown-output :deep(h6) { font-size: 0.9rem; margin: 8px 0 4px; }

.markdown-output :deep(pre) {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-output :deep(code) {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
}

.markdown-output :deep(p code) {
  background: var(--vp-c-bg-soft);
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-output :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.markdown-output :deep(a:hover) {
  text-decoration: underline;
}

.markdown-output :deep(blockquote) {
  border-left: 3px solid var(--vp-c-divider);
  padding-left: 12px;
  color: var(--vp-c-text-2);
  margin: 8px 0;
}

.markdown-output :deep(strong) { font-weight: 600; }

.markdown-output :deep(hr) {
  border: none;
  border-top: 1px solid var(--vp-c-divider);
  margin: 16px 0;
}

.output-pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.6;
  background: var(--vp-c-bg);
  max-height: 600px;
  overflow-y: auto;
}

.output-pre code {
  font-family: var(--vp-font-family-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.scrape-meta {
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scrape-url {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.scrape-format {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--vp-c-brand-dimm);
  color: var(--vp-c-brand-1);
  text-transform: uppercase;
}

.search-results {
  padding: 0;
}

.search-item {
  padding: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.search-item:last-child {
  border-bottom: none;
}

.search-item-title {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-size: 0.95rem;
  display: block;
  margin-bottom: 4px;
}

.search-item-title:hover {
  text-decoration: underline;
}

.search-item-url {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  margin-bottom: 6px;
}

.search-item-snippet {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.map-results,
.crawl-results {
  padding: 16px;
}

.map-summary,
.crawl-summary {
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.crawl-count {
  margin-left: 8px;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}

.crawl-note {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  margin: 0 0 12px;
  font-style: italic;
}

.url-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.url-list li {
  padding: 6px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.url-list li:last-child {
  border-bottom: none;
}

.url-list a {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.url-list a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .demo-playground {
    padding: 16px;
  }

  .input-row {
    flex-direction: column;
  }

  .run-btn {
    width: 100%;
    justify-content: center;
  }

  .options-row {
    flex-direction: column;
    gap: 10px;
  }

  .option-input {
    width: 100%;
  }

  .examples {
    flex-direction: column;
    align-items: flex-start;
  }

  .scrape-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .demo-tabs {
    overflow-x: auto;
  }

  .tab-btn {
    white-space: nowrap;
    padding: 8px 14px;
  }
}
</style>
