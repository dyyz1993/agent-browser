/**
 * SnapshotStore - In-memory store for snapshot data with stable selectors.
 *
 * Each snapshot gets a unique sequential ID (snap_1, snap_2, ...).
 * Elements within each snapshot have stable CSS selectors and XPaths
 * that can be retrieved later by snapshot_id + ref/index.
 */

export interface SnapshotElement {
  /** Ref ID (e.g., "e1") */
  ref: string;
  /** Display index (1-based, e.g., 1, 2, 3) */
  index: number;
  /** ARIA role (e.g., "button", "link", "textbox") */
  role: string;
  /** Accessible name (e.g., "Submit") */
  name?: string;
  /** Stable CSS selector (e.g., "#su", "input[name='wd']") */
  cssSelector: string;
  /** Stable XPath (e.g., "//*[@id='su']") */
  xpath: string;
}

export interface SnapshotEntry {
  /** Unique snapshot ID (e.g., "snap_3") */
  id: string;
  /** Creation timestamp */
  timestamp: number;
  /** Page URL at snapshot time */
  url: string;
  /** Iframe path if snapshot was taken inside an iframe */
  framePath?: string;
  /** Elements keyed by ref ID (e.g., "e1" -> SnapshotElement) */
  elements: Map<string, SnapshotElement>;
  /** Whether stable selectors have been generated for this snapshot */
  selectorsGenerated: boolean;
}

export class SnapshotStore {
  private static readonly MAX_SNAPSHOTS = 100;
  private snapshots: Map<string, SnapshotEntry> = new Map();
  private counter: number = 0;

  /**
   * Create a new snapshot entry.
   * @returns The generated snapshot ID (e.g., "snap_3")
   */
  create(url: string, elements: SnapshotElement[], framePath?: string): string {
    const id = `snap_${++this.counter}`;

    if (this.snapshots.size >= SnapshotStore.MAX_SNAPSHOTS) {
      const firstKey = this.snapshots.keys().next().value;
      if (firstKey) {
        this.snapshots.delete(firstKey);
      }
    }

    const elementMap = new Map(elements.map((e) => [e.ref, e]));
    this.snapshots.set(id, {
      id,
      timestamp: Date.now(),
      url,
      framePath,
      elements: elementMap,
      selectorsGenerated: false,
    });
    return id;
  }

  /**
   * Get a snapshot entry by ID.
   */
  get(id: string): SnapshotEntry | undefined {
    return this.snapshots.get(id);
  }

  /**
   * Get a specific element from a snapshot by ref or index.
   *
   * @param snapId - Snapshot ID (e.g., "snap_3")
   * @param refOrIndex - Either a ref like "e1" or "@e1", or an index like "1"
   * @returns The SnapshotElement or undefined
   */
  getElement(snapId: string, refOrIndex: string): SnapshotElement | undefined {
    const entry = this.snapshots.get(snapId);
    if (!entry) return undefined;

    // Strip @ prefix if present (e.g., "@e1" -> "e1")
    const cleaned = refOrIndex.startsWith('@') ? refOrIndex.slice(1) : refOrIndex;

    // Try as ref first (e.g., "e1")
    if (entry.elements.has(cleaned)) {
      return entry.elements.get(cleaned);
    }

    // Try as index (e.g., "1")
    const index = parseInt(cleaned, 10);
    if (!isNaN(index)) {
      for (const el of entry.elements.values()) {
        if (el.index === index) return el;
      }
    }

    return undefined;
  }

  /**
   * Get all elements from a snapshot as an array, sorted by index.
   */
  getElements(snapId: string): SnapshotElement[] | undefined {
    const entry = this.snapshots.get(snapId);
    if (!entry) return undefined;
    return Array.from(entry.elements.values()).sort((a, b) => a.index - b.index);
  }

  /**
   * Get the current counter value (for testing/debugging).
   */
  getCounter(): number {
    return this.counter;
  }

  /**
   * Reset the store: clear all snapshots and reset counter to 0.
   * Useful for test isolation.
   */
  reset(): void {
    this.counter = 0;
    this.snapshots.clear();
  }

  /**
   * Check if a snapshot exists.
   */
  has(id: string): boolean {
    return this.snapshots.has(id);
  }

  /**
   * Mark selectors as generated for a snapshot.
   */
  markSelectorsGenerated(id: string): void {
    const entry = this.snapshots.get(id);
    if (entry) entry.selectorsGenerated = true;
  }

  /**
   * Check if selectors have been generated for a snapshot.
   */
  isSelectorsGenerated(id: string): boolean {
    return this.snapshots.get(id)?.selectorsGenerated ?? false;
  }
}
