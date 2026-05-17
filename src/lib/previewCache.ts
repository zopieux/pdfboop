/**
 * Byte-accurate LRU cache + priority render queue for page preview canvases.
 *
 * Memory model: each cached canvas costs width × height × 4 bytes (RGBA).
 * Total quota: QUOTA_BYTES.
 * Eviction: true LRU — most-recently-accessed entries survive longest.
 * Pinning: first/last pages are pinned; they're only evicted as a last resort.
 */

/** Cache memory quota. */
const QUOTA_BYTES = 700 * 1024 * 1024;
/** Max simultaneous PDF.js renders. */
const MAX_CONCURRENT = 2;

// ─── LRU Cache ────────────────────────────────────────────────────────────────

interface CacheEntry {
  canvas: HTMLCanvasElement;
  bytes: number;
  pinned: boolean;
}

class LruCache {
  // Map preserves insertion order; we move entries to the end on access,
  // so iteration order = LRU order (oldest = eviction candidate at front).
  private readonly entries = new Map<string, CacheEntry>();
  private usedBytes = 0;

  get(key: string): HTMLCanvasElement | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Refresh position (move to end = most recently used)
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.canvas;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(key: string, canvas: HTMLCanvasElement, pinned = false): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.usedBytes -= existing.bytes;
      this.entries.delete(key);
    }
    const bytes = canvas.width * canvas.height * 4;
    this.usedBytes += bytes;
    this.entries.set(key, { canvas, bytes, pinned });
    this.evict();
  }

  /** Update pinned status for a set of keys; unpin everything else. */
  updatePins(pinnedKeys: ReadonlySet<string>): void {
    for (const [key, entry] of this.entries) {
      entry.pinned = pinnedKeys.has(key);
    }
  }

  private evict(): void {
    if (this.usedBytes <= QUOTA_BYTES) return;

    // Pass 1: evict unpinned LRU entries
    for (const [key, entry] of this.entries) {
      if (this.usedBytes <= QUOTA_BYTES) break;
      if (!entry.pinned) {
        this.usedBytes -= entry.bytes;
        this.entries.delete(key);
      }
    }

    // Pass 2: last resort — evict pinned entries too
    for (const [key, entry] of this.entries) {
      if (this.usedBytes <= QUOTA_BYTES) break;
      this.usedBytes -= entry.bytes;
      this.entries.delete(key);
    }
  }

  get memoryBytes(): number {
    return this.usedBytes;
  }
  get size(): number {
    return this.entries.size;
  }
}

export const thumbnailCache = new LruCache();

// ─── Render Queue ─────────────────────────────────────────────────────────────

export type RenderPriority = 'visible' | 'speculative';
type DoneCallback = (canvas: HTMLCanvasElement) => void;

interface QueueEntry {
  key: string;
  priority: RenderPriority;
  renderFn: () => Promise<HTMLCanvasElement | null>;
  callbacks: Set<DoneCallback>;
  pinned: boolean;
}

class RenderQueue {
  /** Pending entries not yet started, keyed by cache key. */
  private readonly pending = new Map<string, QueueEntry>();
  /**
   * Active (currently rendering) entries.
   * We keep callbacks here so late registrations can still receive the result.
   */
  private readonly active = new Map<string, Set<DoneCallback>>();
  private runningCount = 0;

  /**
   * Request a preview render.
   * - Cache hit → onDone called synchronously with the cached canvas.
   * - Already rendering → callback added to the active entry.
   * - Already pending → callback added; priority upgraded if needed.
   * - Otherwise → new entry queued.
   */
  request(
    key: string,
    priority: RenderPriority,
    renderFn: () => Promise<HTMLCanvasElement | null>,
    onDone: DoneCallback,
    pinned = false,
  ): void {
    // Immediate cache hit
    const cached = thumbnailCache.get(key);
    if (cached) {
      onDone(cached);
      return;
    }

    // Already rendering — attach callback
    const activeCallbacks = this.active.get(key);
    if (activeCallbacks) {
      activeCallbacks.add(onDone);
      return;
    }

    // Already queued — upgrade priority, attach callback
    const existing = this.pending.get(key);
    if (existing) {
      existing.callbacks.add(onDone);
      if (priority === 'visible') existing.priority = 'visible';
      return;
    }

    // New request
    this.pending.set(key, { key, priority, renderFn, callbacks: new Set([onDone]), pinned });
    this.pump();
  }

  /**
   * Remove a specific callback from a pending entry.
   * If no callbacks remain the entry is dropped (render cancelled).
   * Active renders are NOT cancelled mid-flight (their result still populates the cache).
   */
  cancel(key: string, onDone: DoneCallback): void {
    const entry = this.pending.get(key);
    if (!entry) return;
    entry.callbacks.delete(onDone);
    if (entry.callbacks.size === 0) {
      this.pending.delete(key);
    }
  }

  /**
   * Promote pending entries whose keys are in the visible set to 'visible' priority.
   * Call this whenever the virtualiser's rendered rows change.
   */
  setVisibleKeys(keys: ReadonlySet<string>): void {
    for (const [key, entry] of this.pending) {
      if (keys.has(key) && entry.priority !== 'visible') {
        entry.priority = 'visible';
      }
    }
    this.pump();
  }

  private pump(): void {
    while (this.runningCount < MAX_CONCURRENT) {
      const entry = this.dequeue();
      if (!entry) break;
      this.run(entry);
    }
  }

  private dequeue(): QueueEntry | undefined {
    // Visible entries first (FIFO within each tier)
    for (const [, entry] of this.pending) {
      if (entry.priority === 'visible') {
        this.pending.delete(entry.key);
        return entry;
      }
    }
    const first = this.pending.values().next().value;
    if (first) this.pending.delete(first.key);
    return first;
  }

  private run(entry: QueueEntry): void {
    this.runningCount++;
    this.active.set(entry.key, entry.callbacks);

    entry
      .renderFn()
      .then((canvas) => {
        this.runningCount--;
        const cbs = this.active.get(entry.key);
        this.active.delete(entry.key);
        if (canvas) {
          thumbnailCache.set(entry.key, canvas, entry.pinned);
          if (cbs) {
            for (const cb of cbs) {
              cb(canvas);
            }
          }
        }
        this.pump();
      })
      .catch(() => {
        this.runningCount--;
        this.active.delete(entry.key);
        this.pump();
      });
  }

  get pendingCount(): number {
    return this.pending.size;
  }
  get activeCount(): number {
    return this.active.size;
  }
}

export const renderQueue = new RenderQueue();
