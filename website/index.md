---
layout: home

hero:
  name: "Agent Browser"
  text: "Browser automation for AI agents"
  tagline: "Scrape, crawl, map, and search the web with a single CLI command. Built on Playwright, designed for AI workflows."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Try Demo
      link: /demo
    - theme: alt
      text: View on GitHub
      link: https://github.com/nicepkg/agent-browser

features:
  - icon: "&#128196;"
    title: Scrape
    details: Extract clean content from any URL as markdown, HTML, or plain text. Handles SPAs, shadow DOM, and dynamic content out of the box.
  - icon: "&#128736;"
    title: Crawl
    details: BFS-based multi-page crawling with configurable depth and page limits. Automatic URL filtering and deduplication.
  - icon: "&#128506;"
    title: Map
    details: Discover all internal URLs on a website instantly. Understand site structure without crawling content.
  - icon: "&#128269;"
    title: Search
    details: Search the web and extract structured results with titles, URLs, and snippets. No API keys required.
  - icon: "&#9889;"
    title: Interact
    details: Multi-step browser automation with click, type, scroll, and wait actions. Build complex workflows from the CLI.
  - icon: "&#127760;"
    title: SPA Support
    details: Full support for single-page applications including hash routes (#/), Vue Router, React Router, and Docsify sites.
---

<div class="install-section">
  <h3>Quick Install</h3>
  <div class="install-cmd">
    <code>npm install -g agent-browser</code>
    <button class="copy-install" onclick="navigator.clipboard.writeText('npm install -g agent-browser');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)">Copy</button>
  </div>
</div>

<style>
.install-section {
  text-align: center;
  margin-top: 48px;
  padding: 32px;
  border-top: 1px solid var(--vp-c-divider);
}
.install-section h3 {
  margin: 0 0 16px;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.install-cmd {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px 16px;
}
.install-cmd code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
}
.copy-install {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}
.copy-install:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
