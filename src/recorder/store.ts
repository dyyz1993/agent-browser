import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RecordingSession, RecordedStep, PageInfo } from './types.js';

export class SessionStore {
  private session: RecordingSession;
  private filePath: string;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string, persistPath?: string) {
    const dir = persistPath || path.join(os.tmpdir(), 'agent-browser-recorder');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.filePath = path.join(dir, `session-${sessionId}.json`);
    this.session = this.load();
  }

  private load(): RecordingSession {
    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.warn('[SessionStore] Failed to load session:', e);
      }
    }
    
    return {
      id: path.basename(this.filePath, '.json').replace('session-', ''),
      name: `Recording Session`,
      startTime: Date.now(),
      pages: [],
      steps: []
    };
  }

  addStep(step: RecordedStep): void {
    this.session.steps.push(step);
    
    const pageUrl = this.normalizeUrl(step.url);
    if (pageUrl && !this.session.pages.find(p => p.url === pageUrl)) {
      this.session.pages.push({
        url: pageUrl,
        title: '',
        firstVisitTime: step.timestamp
      });
    }
    
    this.scheduleSave();
  }

  updatePageTitle(url: string, title: string): void {
    const page = this.session.pages.find(p => p.url === this.normalizeUrl(url));
    if (page) {
      page.title = title;
      this.scheduleSave();
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch {
      return url;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.save();
    }, 100);
  }

  save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.session, null, 2));
    } catch (e) {
      console.error('[SessionStore] Failed to save session:', e);
    }
  }

  getSession(): RecordingSession {
    return this.session;
  }

  getSteps(): RecordedStep[] {
    return this.session.steps;
  }

  getPages(): PageInfo[] {
    return this.session.pages;
  }

  endSession(): void {
    this.session.endTime = Date.now();
    this.save();
  }

  clear(): void {
    this.session.steps = [];
    this.session.pages = [];
    this.session.startTime = Date.now();
    this.session.endTime = undefined;
    this.save();
  }

  export(): string {
    return JSON.stringify(this.session, null, 2);
  }

  exportToScript(): string {
    const lines: string[] = [
      `#!/bin/bash`,
      `# Recording: ${this.session.name}`,
      `# Pages: ${this.session.pages.length}`,
      `# Steps: ${this.session.steps.length}`,
      `# Generated: ${new Date().toISOString()}`,
      ''
    ];

    let currentUrl = '';
    
    for (const step of this.session.steps) {
      if (step.url !== currentUrl && step.action !== 'navigate') {
        currentUrl = step.url;
        lines.push(`# Page: ${step.url}`);
      }

      const comment = step.annotation 
        ? ` # ${step.annotation.label}` 
        : '';

      switch (step.action) {
        case 'navigate':
          lines.push(`agent-browser open "${step.value}"${comment}`);
          currentUrl = step.value || '';
          break;
        case 'click':
          lines.push(`agent-browser click "${step.selector}"${comment}`);
          break;
        case 'fill':
          lines.push(`agent-browser fill "${step.selector}" "${step.value}"${comment}`);
          break;
        case 'select':
          lines.push(`agent-browser select "${step.selector}" "${step.value}"${comment}`);
          break;
        case 'annotate':
          lines.push(`# Annotate: ${step.selector} -> ${step.annotation?.label}`);
          break;
      }
    }

    return lines.join('\n');
  }

  static loadFromPath(filePath: string): SessionStore | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const session: RecordingSession = JSON.parse(content);
    const store = new SessionStore(session.id, path.dirname(filePath));
    return store;
  }
}
