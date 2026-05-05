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
});
