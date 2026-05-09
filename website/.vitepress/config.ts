import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Agent Browser',
  description: 'Browser automation CLI for AI agents',
  base: '/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      {
        text: 'Commands',
        items: [
          { text: 'scrape', link: '/commands/scrape' },
          { text: 'crawl', link: '/commands/crawl' },
          { text: 'map', link: '/commands/map' },
          { text: 'search', link: '/commands/search' },
          { text: 'interact', link: '/commands/interact' },
        ],
      },
      { text: 'API Reference', link: '/api/' },
      { text: 'Demo', link: '/demo' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
      ],
      '/commands/': [
        {
          text: 'Commands',
          items: [
            { text: 'scrape', link: '/commands/scrape' },
            { text: 'crawl', link: '/commands/crawl' },
            { text: 'map', link: '/commands/map' },
            { text: 'search', link: '/commands/search' },
            { text: 'interact', link: '/commands/interact' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
          ],
        },
      ],
      '/demo': [
        {
          text: 'Demo',
          items: [
            { text: 'Interactive Demo', link: '/demo' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/nicepkg/agent-browser' },
    ],
    search: {
      provider: 'local',
    },
  },
  vite: {
    vue: {},
  },
});
