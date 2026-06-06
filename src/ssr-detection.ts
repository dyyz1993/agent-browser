import type { Page } from 'playwright-core';

export interface SSRDetectionResult {
  detected: boolean;
  framework?: string;
  globals?: string[];
  tip?: string;
}

interface SSRProbe {
  globals: string[];
  framework: string;
  dataPath?: string;
}

const SSR_PROBES: SSRProbe[] = [
  {
    globals: ['__NEXT_DATA__'],
    framework: 'Next.js',
    dataPath: '__NEXT_DATA__',
  },
  {
    globals: ['__NUXT__'],
    framework: 'Nuxt.js',
    dataPath: '__NUXT__',
  },
  {
    globals: ['__pace_f'],
    framework: 'Pace SSR',
    dataPath: '__pace_f',
  },
  {
    globals: ['__INITIAL_STATE__', '__STATE__'],
    framework: 'Generic SSR',
  },
  {
    globals: ['__remixContext'],
    framework: 'Remix',
  },
  {
    globals: ['__SVELTE_HMR'],
    framework: 'SvelteKit',
  },
  {
    globals: ['__APP_DATA__', '__initial_data__'],
    framework: 'Custom SSR',
  },
  {
    globals: ['__APOLLO_STATE__'],
    framework: 'Apollo GraphQL',
  },
  {
    globals: ['__PRELOADED_STATE__'],
    framework: 'Redux SSR',
  },
  {
    globals: ['__GWT_APP_DATA'],
    framework: 'GWT SSR',
  },
];

const DETECTION_SCRIPT = `
(function() {
  var probes = ${JSON.stringify(SSR_PROBES)};
  var results = [];
  for (var i = 0; i < probes.length; i++) {
    var found = [];
    for (var j = 0; j < probes[i].globals.length; j++) {
      var g = probes[i].globals[j];
      try {
        if (typeof window[g] !== 'undefined') {
          var t = typeof window[g];
          var size = 0;
          try { size = JSON.stringify(window[g]).length; } catch(e) {}
          found.push({ name: g, type: t, size: size });
        }
      } catch(e) {}
    }
    if (found.length > 0) {
      results.push({ framework: probes[i].framework, globals: found });
    }
  }
  if (results.length === 0) {
    var extra = [];
    for (var k in window) {
      if (k.startsWith('__') && typeof window[k] !== 'function') {
        try {
          var v = window[k];
          if (v !== null && typeof v === 'object') {
            extra.push(k);
          }
        } catch(e) {}
      }
    }
    if (extra.length > 0) {
      results.push({ framework: 'Unknown', globals: extra.map(function(g) {
        return { name: g, type: typeof window[g], size: 0 };
      })});
    }
  }
  return JSON.stringify(results);
})()
`;

export async function detectSSR(page: Page): Promise<SSRDetectionResult> {
  try {
    const raw = (await page.evaluate(DETECTION_SCRIPT)) as string;
    const results: Array<{
      framework: string;
      globals: Array<{ name: string; type: string; size: number }>;
    }> = JSON.parse(raw);

    if (!results || results.length === 0) {
      return { detected: false };
    }

    if (results.every((r) => r.framework === 'Unknown')) {
      return { detected: false };
    }

    const primary = results[0];
    const globalNames = primary.globals.map((g) => g.name);
    const totalSize = primary.globals.reduce((sum, g) => sum + g.size, 0);
    const sizeKB = Math.round(totalSize / 1024);

    let tip: string;
    if (results.length === 1 && primary.globals.length === 1) {
      tip = `SSR detected: ${primary.framework} (${globalNames[0]}, ~${sizeKB}KB). Extract via: eval "window.${globalNames[0]}"`;
    } else {
      const fwList = results.map((r) => r.framework).join(', ');
      const gList = globalNames.join(', ');
      tip = `SSR detected: ${fwList} (${gList}, ~${sizeKB}KB). Extract via: eval "window.${globalNames[0]}"`;
    }

    return {
      detected: true,
      framework: results.map((r) => r.framework).join(', '),
      globals: globalNames,
      tip,
    };
  } catch {
    return { detected: false };
  }
}
