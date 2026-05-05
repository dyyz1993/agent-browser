import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import yaml from 'js-yaml';
import { parseYamlSiteFile, loadAllSites } from './yaml-parser.js';
import type { SiteDefinition } from './types.js';

export class SiteManager {
  private sitesDirs: string[];

  constructor(sitesDirs?: string[]) {
    if (sitesDirs) {
      this.sitesDirs = sitesDirs;
    } else {
      this.sitesDirs = this.getDefaultDirs();
    }
  }

  private getDefaultDirs(): string[] {
    const dirs: string[] = [];

    const local = resolve(process.cwd(), 'sites');
    if (existsSync(local)) dirs.push(local);

    const home = resolve(
      process.env.HOME || process.env.USERPROFILE || '~',
      '.agent-browser',
      'sites'
    );
    if (existsSync(home)) {
      dirs.push(home);
    } else {
      try {
        mkdirSync(home, { recursive: true });
        dirs.push(home);
      } catch {}
    }

    return dirs;
  }

  listSites(): Map<string, SiteDefinition> {
    return loadAllSites();
  }

  getSite(name: string): SiteDefinition | null {
    const sites = this.listSites();
    return sites.get(name) || null;
  }

  registerFromFile(filePath: string, name?: string): { siteName: string; targetPath: string } {
    const site = parseYamlSiteFile(filePath);
    const targetDir = this.sitesDirs[0];

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const targetName = name || site.name;
    const targetPath = join(targetDir, `${targetName}.yaml`);

    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(targetPath, content, 'utf-8');

    return { siteName: site.name, targetPath };
  }

  async registerFromUrl(
    url: string,
    name?: string
  ): Promise<{ siteName: string; targetPath: string }> {
    const { fetch } = await import('undici');
    const response = await fetch(url);
    if (!(response as any).ok) {
      throw new Error(`Failed to fetch site YAML from ${url}: ${(response as any).status}`);
    }
    const content = await response.text();

    const targetDir = this.sitesDirs[0] || '/tmp';
    const tmpPath = join(targetDir, `_tmp_${Date.now()}.yaml`);
    writeFileSync(tmpPath, content, 'utf-8');

    let site: SiteDefinition;
    try {
      site = parseYamlSiteFile(tmpPath);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {}
    }

    const finalTargetDir = this.sitesDirs[0];
    if (!existsSync(finalTargetDir)) mkdirSync(finalTargetDir, { recursive: true });

    const targetName = name || site.name;
    const targetPath = join(finalTargetDir, `${targetName}.yaml`);
    writeFileSync(targetPath, content, 'utf-8');

    return { siteName: site.name, targetPath };
  }

  registerFromDefinition(site: SiteDefinition): { siteName: string; targetPath: string } {
    const targetDir = this.sitesDirs[0];
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    const targetPath = join(targetDir, `${site.name}.yaml`);
    const yamlContent = this.siteToYaml(site);
    writeFileSync(targetPath, yamlContent, 'utf-8');

    return { siteName: site.name, targetPath };
  }

  unregister(name: string): boolean {
    for (const dir of this.sitesDirs) {
      const yamlPath = join(dir, `${name}.yaml`);
      const ymlPath = join(dir, `${name}.yml`);
      if (existsSync(yamlPath)) {
        unlinkSync(yamlPath);
        return true;
      }
      if (existsSync(ymlPath)) {
        unlinkSync(ymlPath);
        return true;
      }
    }
    return false;
  }

  exists(name: string): boolean {
    for (const dir of this.sitesDirs) {
      if (existsSync(join(dir, `${name}.yaml`))) return true;
      if (existsSync(join(dir, `${name}.yml`))) return true;
    }
    return false;
  }

  siteToYaml(site: SiteDefinition): string {
    const yamlObj = {
      site: {
        name: site.name,
        description: site.description,
        baseUrl: site.baseUrl,
      },
      flows: site.flows,
    };
    return yaml.dump(yamlObj, { lineWidth: -1, noRefs: true });
  }
}
