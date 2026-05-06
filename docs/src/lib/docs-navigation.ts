export type NavItem = {
  name: string;
  href: string;
};

export const allDocsPages: NavItem[] = [
  { name: 'Introduction', href: '/' },
  { name: 'Installation', href: '/installation' },
  { name: 'Quick Start', href: '/quick-start' },
  { name: 'Commands', href: '/commands' },
  { name: 'Selectors', href: '/selectors' },
  { name: 'Snapshots', href: '/snapshots' },
  { name: 'Sessions', href: '/sessions' },
  { name: 'Self-Healing', href: '/self-healing' },
  { name: 'Recording & Replay', href: '/recording' },
  { name: 'Script Export', href: '/script-export' },
  { name: 'Streaming', href: '/streaming' },
  { name: 'CDP Mode', href: '/cdp-mode' },
  { name: 'Changelog', href: '/changelog' },
];
