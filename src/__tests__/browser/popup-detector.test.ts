import { describe, it, expect } from 'vitest';
import {
  detectPopups,
  detectContainerExpansion,
  detectPopupsFromDiff,
} from '../../browser/popup-detector.js';
import type { PopupCandidate } from '../../browser/popup-detector.js';
import type { ElementInfo } from '../../diff.js';

function candidate(role: string, name?: string, ref?: string): PopupCandidate {
  return { role, name, ref };
}

describe('detectPopups', () => {
  it('detects a dialog', () => {
    const tips = detectPopups([candidate('dialog', 'Confirm Delete')]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('modal');
    expect(tips[0].text).toContain('Confirm Delete');
  });

  it('detects a listbox with child options', () => {
    const tips = detectPopups([
      candidate('listbox', 'Choose color'),
      candidate('option', 'Red'),
      candidate('option', 'Blue'),
      candidate('option', 'Green'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('dropdown');
    expect(tips[0].popup.childCount).toBe(3);
  });

  it('skips noise roles', () => {
    const tips = detectPopups([candidate('text', 'some text')]);
    expect(tips).toHaveLength(0);
  });

  it('respects MAX_TIPS limit', () => {
    const added: PopupCandidate[] = [];
    for (let i = 0; i < 5; i++) {
      added.push(candidate('dialog', `Dialog ${i}`));
    }
    const tips = detectPopups(added);
    expect(tips.length).toBeLessThanOrEqual(3);
  });
});

describe('detectContainerExpansion', () => {
  it('does not detect a single child', () => {
    const tips = detectContainerExpansion([candidate('option', 'Only one')]);
    expect(tips).toHaveLength(0);
  });

  it('detects 3 consecutive options as expansion', () => {
    const tips = detectContainerExpansion([
      candidate('option', 'Red'),
      candidate('option', 'Green'),
      candidate('option', 'Blue'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('dropdown');
    expect(tips[0].popup.childCount).toBe(3);
    expect(tips[0].popup.name).toBe('Red');
  });

  it('detects menuitem cluster', () => {
    const tips = detectContainerExpansion([
      candidate('menuitem', 'Copy'),
      candidate('menuitem', 'Paste'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.childCount).toBe(2);
  });

  it('detects multiple separate clusters', () => {
    const tips = detectContainerExpansion([
      candidate('option', 'A'),
      candidate('option', 'B'),
      candidate('button', 'Submit'),
      candidate('menuitem', 'X'),
      candidate('menuitem', 'Y'),
      candidate('menuitem', 'Z'),
    ]);
    expect(tips).toHaveLength(2);
    expect(tips[0].popup.childCount).toBe(2);
    expect(tips[1].popup.childCount).toBe(3);
  });

  it('ignores non-child roles between clusters', () => {
    const tips = detectContainerExpansion([
      candidate('button', 'Click'),
      candidate('option', 'A'),
      candidate('option', 'B'),
      candidate('option', 'C'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.childCount).toBe(3);
  });
});

describe('detectPopups - container expansion integration', () => {
  it('no double-counting when parent is detected with children', () => {
    const tips = detectPopups([
      candidate('listbox', 'Colors'),
      candidate('option', 'Red'),
      candidate('option', 'Green'),
      candidate('option', 'Blue'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('dropdown');
    expect(tips[0].popup.role).toBe('listbox');
    expect(tips[0].popup.childCount).toBe(3);
  });

  it('detects both dialog and separate option expansion', () => {
    const tips = detectPopups([
      candidate('dialog', 'Settings'),
      candidate('option', 'Option A'),
      candidate('option', 'Option B'),
      candidate('option', 'Option C'),
    ]);
    expect(tips).toHaveLength(2);
    expect(tips[0].popup.type).toBe('modal');
    expect(tips[1].popup.type).toBe('dropdown');
    expect(tips[1].popup.childCount).toBe(3);
  });

  it('detects bare option expansion when no parent exists', () => {
    const tips = detectPopups([
      candidate('option', 'Alpha'),
      candidate('option', 'Beta'),
      candidate('option', 'Gamma'),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('dropdown');
    expect(tips[0].popup.childCount).toBe(3);
  });

  it('tooltip-type expansions are silent', () => {
    const tips = detectPopups([candidate('tooltip', 'Hover info')]);
    expect(tips).toHaveLength(0);
  });

  it('child-only tooltip elements produce no tips', () => {
    const tips = detectPopups([candidate('option', 'A')]);
    expect(tips).toHaveLength(0);
  });
});

describe('detectPopupsFromDiff', () => {
  it('converts ElementInfo and detects popups', () => {
    const added: ElementInfo[] = [{ role: 'dialog', name: 'Confirm', ref: 'ref1' }];
    const tips = detectPopupsFromDiff(added);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.type).toBe('modal');
  });

  it('accepts optional existingContainers parameter', () => {
    const added: ElementInfo[] = [{ role: 'listbox', name: 'Pick' }];
    const existing: ElementInfo[] = [{ role: 'listbox', name: 'Pick', ref: 'existing-ref' }];
    const tips = detectPopupsFromDiff(added, existing);
    expect(tips).toHaveLength(1);
  });

  it('detects container expansion from ElementInfo diff', () => {
    const added: ElementInfo[] = [
      { role: 'option', name: 'First' },
      { role: 'option', name: 'Second' },
      { role: 'option', name: 'Third' },
    ];
    const tips = detectPopupsFromDiff(added);
    expect(tips).toHaveLength(1);
    expect(tips[0].popup.childCount).toBe(3);
  });
});
