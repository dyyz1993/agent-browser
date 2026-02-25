import { describe, it, expect } from 'vitest';
import {
  computeDiff,
  formatDiff,
  parseSnapshot,
  elementsMatch,
  type ElementInfo,
  type SnapshotDiff,
} from '../diff.js';

describe('diff module', () => {
  describe('parseSnapshot', () => {
    it('should parse multi-line snapshot', () => {
      const text = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]
- paragraph: "Hello"`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(3);
    });

    it('should parse empty snapshot', () => {
      const result = parseSnapshot('');
      expect(result.size).toBe(0);
    });

    it('should parse snapshot with indentation', () => {
      const text = `- document:
    - heading "Title" [ref=e1]
    - button "Click" [ref=e2]`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(2);
    });

    it('should parse nested structure', () => {
      const text = `- document:
    - heading "Welcome" [ref=e1] [level=1]
    - textbox "Name" [ref=e2]
    - button "Submit" [ref=e3]`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(3);
    });

    it('should parse mixed formats', () => {
      const text = `- button "Submit" [ref=e1]
- paragraph: "Counter: 0"
- textbox "Email" [ref=e2] [value: "test@example.com"]
- paragraph: This is plain text`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(4);
    });

    it('should parse button with ref', () => {
      const text = `- button "Submit" [ref=e1]`;
      const result = parseSnapshot(text);
      const el = result.get(0);
      expect(el).toEqual({
        role: 'button',
        name: 'Submit',
        ref: 'e1',
        value: undefined,
      });
    });

    it('should parse textbox with value', () => {
      const text = `- textbox "Email" [ref=e2] [value: "test@example.com"]`;
      const result = parseSnapshot(text);
      const el = result.get(0);
      expect(el).toEqual({
        role: 'textbox',
        name: 'Email',
        ref: 'e2',
        value: 'test@example.com',
      });
    });

    it('should parse paragraph with quoted text', () => {
      const text = `- paragraph: "Counter: 0"`;
      const result = parseSnapshot(text);
      const el = result.get(0);
      expect(el).toEqual({
        role: 'paragraph',
        name: '',
        value: 'Counter: 0',
      });
    });

    it('should parse paragraph with plain text', () => {
      const text = `- paragraph: This is a secret message!`;
      const result = parseSnapshot(text);
      const el = result.get(0);
      expect(el).toEqual({
        role: 'paragraph',
        name: '',
        value: 'This is a secret message!',
      });
    });

    it('should skip empty lines', () => {
      const text = `- button "Submit" [ref=e1]

- textbox "Email" [ref=e2]`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(2);
    });
  });

  describe('elementsMatch', () => {
    it('should match elements with same ref', () => {
      const a: ElementInfo = { role: 'button', name: 'Submit', ref: 'e1' };
      const b: ElementInfo = { role: 'button', name: 'Cancel', ref: 'e1' };
      expect(elementsMatch(a, b)).toBe(true);
    });

    it('should match elements with same role and name', () => {
      const a: ElementInfo = { role: 'button', name: 'Submit' };
      const b: ElementInfo = { role: 'button', name: 'Submit' };
      expect(elementsMatch(a, b)).toBe(true);
    });

    it('should not match elements with different role', () => {
      const a: ElementInfo = { role: 'button', name: 'Submit' };
      const b: ElementInfo = { role: 'link', name: 'Submit' };
      expect(elementsMatch(a, b)).toBe(false);
    });

    it('should not match elements with different name', () => {
      const a: ElementInfo = { role: 'button', name: 'Submit' };
      const b: ElementInfo = { role: 'button', name: 'Cancel' };
      expect(elementsMatch(a, b)).toBe(false);
    });

    it('should match elements with empty name', () => {
      const a: ElementInfo = { role: 'paragraph', name: '' };
      const b: ElementInfo = { role: 'paragraph', name: '' };
      expect(elementsMatch(a, b)).toBe(true);
    });
  });

  describe('computeDiff', () => {
    it('should detect added element', () => {
      const before = `- button "Submit" [ref=e1]`;
      const after = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]`;
      const diff = computeDiff(before, after);
      expect(diff.added.length).toBe(1);
      expect(diff.added[0].role).toBe('textbox');
      expect(diff.removed.length).toBe(0);
      expect(diff.changed.length).toBe(0);
    });

    it('should detect removed element', () => {
      const before = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]`;
      const after = `- button "Submit" [ref=e1]`;
      const diff = computeDiff(before, after);
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].role).toBe('textbox');
      expect(diff.added.length).toBe(0);
      expect(diff.changed.length).toBe(0);
    });

    it('should detect value change', () => {
      const before = `- paragraph: "Counter: 0"`;
      const after = `- paragraph: "Counter: 1"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].before.value).toBe('Counter: 0');
      expect(diff.changed[0].after.value).toBe('Counter: 1');
    });

    it('should detect name change as remove + add (without ref)', () => {
      const before = `- button "Submit"`;
      const after = `- button "Submitted"`;
      const diff = computeDiff(before, after);
      expect(diff.removed.length).toBe(1);
      expect(diff.added.length).toBe(1);
      expect(diff.removed[0].name).toBe('Submit');
      expect(diff.added[0].name).toBe('Submitted');
    });

    it('should detect name change with same ref as changed', () => {
      const before = `- button "Submit" [ref=e1]`;
      const after = `- button "Submitted" [ref=e1]`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].before.name).toBe('Submit');
      expect(diff.changed[0].after.name).toBe('Submitted');
    });

    it('should detect no changes', () => {
      const before = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]`;
      const after = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]`;
      const diff = computeDiff(before, after);
      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(0);
      expect(diff.changed.length).toBe(0);
    });

    it('should detect multiple added elements', () => {
      const before = `- button "Submit" [ref=e1]`;
      const after = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]
- textbox "Name" [ref=e3]`;
      const diff = computeDiff(before, after);
      expect(diff.added.length).toBe(2);
    });

    it('should detect multiple removed elements', () => {
      const before = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]
- textbox "Name" [ref=e3]`;
      const after = `- button "Submit" [ref=e1]`;
      const diff = computeDiff(before, after);
      expect(diff.removed.length).toBe(2);
    });

    it('should detect mixed changes', () => {
      const before = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]
- paragraph: "Counter: 0"`;
      const after = `- button "Submitted" [ref=e1]
- paragraph: "Counter: 1"
- textbox "Name" [ref=e3]`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBeGreaterThanOrEqual(1);
      expect(diff.added.length).toBeGreaterThanOrEqual(1);
      expect(diff.removed.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle same role with different value', () => {
      const before = `- paragraph: "Hello"`;
      const after = `- paragraph: "World"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].before.value).toBe('Hello');
      expect(diff.changed[0].after.value).toBe('World');
    });
  });

  describe('formatDiff', () => {
    it('should format added element', () => {
      const diff: SnapshotDiff = {
        added: [{ role: 'button', name: 'Submit', ref: 'e1' }],
        removed: [],
        changed: [],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('+ button "Submit" [ref=e1]');
    });

    it('should format removed element', () => {
      const diff: SnapshotDiff = {
        added: [],
        removed: [{ role: 'button', name: 'Submit', ref: 'e1' }],
        changed: [],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('- button "Submit" [ref=e1]');
    });

    it('should format value change', () => {
      const diff: SnapshotDiff = {
        added: [],
        removed: [],
        changed: [{
          role: 'paragraph',
          name: '',
          before: { value: 'Counter: 0' },
          after: { value: 'Counter: 1' },
        }],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('- paragraph: "Counter: 0"\n+ paragraph: "Counter: 1"');
    });

    it('should format no changes', () => {
      const diff: SnapshotDiff = {
        added: [],
        removed: [],
        changed: [],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('(no changes detected)');
    });

    it('should format complex changes', () => {
      const diff: SnapshotDiff = {
        added: [{ role: 'textbox', name: 'Email', ref: 'e2' }],
        removed: [{ role: 'button', name: 'Cancel', ref: 'e3' }],
        changed: [{
          role: 'paragraph',
          name: '',
          before: { value: 'Counter: 0' },
          after: { value: 'Counter: 1' },
        }],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toContain('+ textbox "Email" [ref=e2]');
      expect(output).toContain('- button "Cancel" [ref=e3]');
      expect(output).toContain('- paragraph: "Counter: 0"');
      expect(output).toContain('+ paragraph: "Counter: 1"');
    });

    it('should format element without ref', () => {
      const diff: SnapshotDiff = {
        added: [{ role: 'paragraph', name: '' }],
        removed: [],
        changed: [],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('+ paragraph');
    });

    it('should format element with name but no ref', () => {
      const diff: SnapshotDiff = {
        added: [{ role: 'button', name: 'Click Me' }],
        removed: [],
        changed: [],
        scope: '',
      };
      const output = formatDiff(diff);
      expect(output).toBe('+ button "Click Me"');
    });
  });

  describe('special characters', () => {
    it('should handle unicode characters', () => {
      const before = `- paragraph: "中文"`;
      const after = `- paragraph: "English"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].before.value).toBe('中文');
      expect(diff.changed[0].after.value).toBe('English');
    });

    it('should handle emoji characters', () => {
      const before = `- paragraph: "Hello 🎉"`;
      const after = `- paragraph: "Hello 🚀"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
    });

    it('should handle special HTML characters', () => {
      const before = `- paragraph: "<script>alert(1)</script>"`;
      const after = `- paragraph: "safe"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
    });

    it('should handle empty value to filled value', () => {
      const before = `- textbox "Email" [ref=e1]`;
      const after = `- textbox "Email" [ref=e1] [value: "test@example.com"]`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
    });

    it('should handle filled value to empty value', () => {
      const before = `- textbox "Email" [ref=e1] [value: "test@example.com"]`;
      const after = `- textbox "Email" [ref=e1]`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle completely different snapshots', () => {
      const before = `- button "A" [ref=e1]`;
      const after = `- textbox "B" [ref=e2]`;
      const diff = computeDiff(before, after);
      expect(diff.removed.length).toBe(1);
      expect(diff.added.length).toBe(1);
    });

    it('should handle identical snapshots', () => {
      const text = `- button "Submit" [ref=e1]
- textbox "Email" [ref=e2]`;
      const diff = computeDiff(text, text);
      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(0);
      expect(diff.changed.length).toBe(0);
    });

    it('should handle whitespace-only lines', () => {
      const text = `- button "Submit" [ref=e1]
   
   
- textbox "Email" [ref=e2]`;
      const result = parseSnapshot(text);
      expect(result.size).toBe(2);
    });

    it('should handle very long values', () => {
      const longValue = 'a'.repeat(1000);
      const before = `- paragraph: ""`;
      const after = `- paragraph: "${longValue}"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].after.value).toBe(longValue);
    });

    it('should handle multiple paragraphs with same role', () => {
      const before = `- paragraph: "First"
- paragraph: "Second"`;
      const after = `- paragraph: "First"
- paragraph: "Third"`;
      const diff = computeDiff(before, after);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].after.value).toBe('Third');
    });
  });
});
