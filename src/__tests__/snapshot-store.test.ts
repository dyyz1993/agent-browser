import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotStore } from '../snapshot-store.js';

describe('SnapshotStore', () => {
  let store: SnapshotStore;

  beforeEach(() => {
    store = new SnapshotStore();
  });

  describe('create()', () => {
    it('should create snapshot and return sequential ID', () => {
      const id1 = store.create('https://example.com', [
        {
          ref: 'e1',
          index: 1,
          role: 'button',
          name: 'Submit',
          cssSelector: '#submit',
          xpath: '//*[@id="submit"]',
        },
      ]);
      expect(id1).toBe('snap_1');

      const id2 = store.create('https://example.com', [
        {
          ref: 'e1',
          index: 1,
          role: 'link',
          name: 'Home',
          cssSelector: '#home',
          xpath: '//*[@id="home"]',
        },
      ]);
      expect(id2).toBe('snap_2');
    });

    it('should store elements with framePath', () => {
      const id = store.create('https://example.com', [], '#myframe');
      const entry = store.get(id);
      expect(entry?.framePath).toBe('#myframe');
    });

    it('should handle empty elements array', () => {
      const id = store.create('https://example.com', []);
      expect(id).toBe('snap_1');
      expect(store.getElements(id)).toEqual([]);
    });
  });

  describe('getElement()', () => {
    beforeEach(() => {
      store.create('https://example.com', [
        {
          ref: 'e1',
          index: 1,
          role: 'button',
          name: 'Submit',
          cssSelector: '#submit',
          xpath: '//*[@id="submit"]',
        },
        {
          ref: 'e2',
          index: 2,
          role: 'link',
          name: 'Home',
          cssSelector: '#home',
          xpath: '//*[@id="home"]',
        },
        {
          ref: 'e3',
          index: 3,
          role: 'textbox',
          name: 'Email',
          cssSelector: 'input[name="email"]',
          xpath: '//input[@name="email"]',
        },
      ]);
    });

    it('should find element by ref with @ prefix', () => {
      const el = store.getElement('snap_1', '@e1');
      expect(el).toBeDefined();
      expect(el?.ref).toBe('e1');
      expect(el?.role).toBe('button');
      expect(el?.name).toBe('Submit');
      expect(el?.cssSelector).toBe('#submit');
    });

    it('should find element by ref without @ prefix', () => {
      const el = store.getElement('snap_1', 'e2');
      expect(el).toBeDefined();
      expect(el?.ref).toBe('e2');
    });

    it('should find element by numeric index', () => {
      const el = store.getElement('snap_1', '1');
      expect(el).toBeDefined();
      expect(el?.ref).toBe('e1');
    });

    it('should find element by index 2', () => {
      const el = store.getElement('snap_1', '2');
      expect(el).toBeDefined();
      expect(el?.ref).toBe('e2');
    });

    it('should return undefined for non-existent snapshot', () => {
      const el = store.getElement('snap_99', '@e1');
      expect(el).toBeUndefined();
    });

    it('should return undefined for non-existent ref', () => {
      const el = store.getElement('snap_1', '@e99');
      expect(el).toBeUndefined();
    });

    it('should return undefined for non-existent index', () => {
      const el = store.getElement('snap_1', '99');
      expect(el).toBeUndefined();
    });
  });

  describe('getElements()', () => {
    it('should return all elements sorted by index', () => {
      store.create('https://example.com', [
        { ref: 'e3', index: 3, role: 'link', name: 'C', cssSelector: '#c', xpath: '' },
        { ref: 'e1', index: 1, role: 'button', name: 'A', cssSelector: '#a', xpath: '' },
        { ref: 'e2', index: 2, role: 'link', name: 'B', cssSelector: '#b', xpath: '' },
      ]);
      const elements = store.getElements('snap_1');
      expect(elements).toHaveLength(3);
      expect(elements?.[0].ref).toBe('e1');
      expect(elements?.[1].ref).toBe('e2');
      expect(elements?.[2].ref).toBe('e3');
    });

    it('should return undefined for non-existent snapshot', () => {
      expect(store.getElements('snap_99')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('should return true for existing snapshot', () => {
      store.create('https://example.com', []);
      expect(store.has('snap_1')).toBe(true);
    });

    it('should return false for non-existent snapshot', () => {
      expect(store.has('snap_99')).toBe(false);
    });
  });

  describe('getCounter()', () => {
    it('should return 0 initially', () => {
      expect(store.getCounter()).toBe(0);
    });

    it('should increment with each create', () => {
      store.create('https://a.com', []);
      expect(store.getCounter()).toBe(1);
      store.create('https://b.com', []);
      expect(store.getCounter()).toBe(2);
    });
  });

  describe('getRecentIds()', () => {
    it('returns IDs ordered most recent first', async () => {
      store.create('https://a.com', []);
      await new Promise((r) => setTimeout(r, 10));
      store.create('https://b.com', []);
      await new Promise((r) => setTimeout(r, 10));
      store.create('https://c.com', []);
      const ids = store.getRecentIds();
      expect(ids).toEqual(['snap_3', 'snap_2', 'snap_1']);
    });

    it('returns empty array when no snapshots', () => {
      expect(store.getRecentIds()).toEqual([]);
    });
  });

  describe('markSelectorsGenerated() / isSelectorsGenerated()', () => {
    it('defaults to false', () => {
      store.create('https://a.com', []);
      expect(store.isSelectorsGenerated('snap_1')).toBe(false);
    });

    it('returns true after marking', () => {
      store.create('https://a.com', []);
      store.markSelectorsGenerated('snap_1');
      expect(store.isSelectorsGenerated('snap_1')).toBe(true);
    });

    it('returns false for non-existent snapshot', () => {
      expect(store.isSelectorsGenerated('snap_99')).toBe(false);
    });
  });

  describe('selector tip lookup flow', () => {
    it('getElement finds ref across snapshots with cssSelector', () => {
      store.create('https://a.com', [
        { ref: 'e1', index: 1, role: 'button', name: 'Click', cssSelector: '#btn', xpath: '' },
      ]);
      store.create('https://b.com', [
        { ref: 'e1', index: 1, role: 'link', name: 'Home', cssSelector: '#home', xpath: '' },
      ]);
      const el1 = store.getElement('snap_1', 'e1');
      expect(el1?.cssSelector).toBe('#btn');
      const el2 = store.getElement('snap_2', 'e1');
      expect(el2?.cssSelector).toBe('#home');
    });

    it('getRecentIds enables tip lookup from newest snapshot', async () => {
      store.create('https://a.com', [
        { ref: 'e1', index: 1, role: 'button', name: 'Old', cssSelector: '#old-btn', xpath: '' },
      ]);
      await new Promise((r) => setTimeout(r, 10));
      store.create('https://a.com', [
        { ref: 'e1', index: 1, role: 'button', name: 'New', cssSelector: '#new-btn', xpath: '' },
      ]);
      const ids = store.getRecentIds();
      expect(ids[0]).toBe('snap_2');
      const el = store.getElement(ids[0], 'e1');
      expect(el?.cssSelector).toBe('#new-btn');
    });
  });

  describe('iframe framePath handling', () => {
    it('stores and retrieves iframe snapshot', () => {
      const id = store.create(
        'https://a.com',
        [
          {
            ref: 'e1',
            index: 1,
            role: 'button',
            name: 'Frame Btn',
            cssSelector: '#frame-btn',
            xpath: '',
          },
        ],
        'iframe/login'
      );
      const entry = store.get(id);
      expect(entry?.framePath).toBe('iframe/login');
      const el = store.getElement(id, 'e1');
      expect(el?.cssSelector).toBe('#frame-btn');
    });

    it('multiple iframes with different framePaths', () => {
      const id1 = store.create(
        'https://a.com',
        [{ ref: 'e1', index: 1, role: 'button', name: 'A', cssSelector: '#a', xpath: '' }],
        'iframe/header'
      );
      const id2 = store.create(
        'https://a.com',
        [{ ref: 'e1', index: 1, role: 'link', name: 'B', cssSelector: '#b', xpath: '' }],
        'iframe/footer'
      );
      const el1 = store.getElement(id1, 'e1');
      const el2 = store.getElement(id2, 'e1');
      expect(el1?.cssSelector).toBe('#a');
      expect(el2?.cssSelector).toBe('#b');
      expect(store.get(id1)?.framePath).toBe('iframe/header');
      expect(store.get(id2)?.framePath).toBe('iframe/footer');
    });

    it('nested iframe path', () => {
      const id = store.create(
        'https://a.com',
        [
          {
            ref: 'e1',
            index: 1,
            role: 'textbox',
            name: 'Deep',
            cssSelector: 'input[name="deep"]',
            xpath: '',
          },
        ],
        'iframe/outer/inner'
      );
      const el = store.getElement(id, 'e1');
      expect(el?.cssSelector).toBe('input[name="deep"]');
      expect(store.get(id)?.framePath).toBe('iframe/outer/inner');
    });
  });

  describe('MAX_SNAPSHOTS eviction', () => {
    it('evicts oldest when exceeding 100 snapshots', () => {
      for (let i = 0; i < 102; i++) {
        store.create(`https://a.com/${i}`, []);
      }
      expect(store.has('snap_1')).toBe(false);
      expect(store.has('snap_2')).toBe(false);
      expect(store.has('snap_3')).toBe(true);
      expect(store.getRecentIds().length).toBeLessThanOrEqual(100);
    });
  });

  describe('reset()', () => {
    it('clears all data', () => {
      store.create('https://a.com', [
        { ref: 'e1', index: 1, role: 'button', name: 'X', cssSelector: '#x', xpath: '' },
      ]);
      store.markSelectorsGenerated('snap_1');
      store.reset();
      expect(store.getCounter()).toBe(0);
      expect(store.has('snap_1')).toBe(false);
      expect(store.getRecentIds()).toEqual([]);
    });
  });
});
