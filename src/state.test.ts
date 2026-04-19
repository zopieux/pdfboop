import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  state,
  setState,
  resetState,
  undo,
  redo,
  movePages,
  rotateCWSelected,
  flipHSelected,
  deleteSelected,
  recalculatePages,
  deleteOriginal,
  deleteUnusedOriginals,
  pushOperation,
} from './state';

// Mock local storage and caches
if (typeof global !== 'undefined') {
  (global as any).localStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
}

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.caches = {
    open: vi.fn().mockResolvedValue({
      put: vi.fn(),
      match: vi.fn(),
      delete: vi.fn(),
    }),
    delete: vi.fn(),
  };
} else {
  // @ts-ignore
  global.caches = {
    open: vi.fn().mockResolvedValue({
      put: vi.fn(),
      match: vi.fn(),
      delete: vi.fn(),
    }),
    delete: vi.fn(),
  };
}

describe('Editor State logic', () => {
  beforeEach(() => {
    resetState({
      originals: [
        {
          id: 'o1',
          name: 'test.pdf',
          size: 1000,
          type: 'pdf',
          pageCount: 3,
          color: 'red',
          evicted: false,
          pageRatios: [1.414, 1.414, 1.414],
          version: 0,
        },
      ],
      operations: [{ type: 'APPEND_ORIGINAL', originalId: 'o1', instanceId: 'inst' } as any],
      historyIndex: 1,
      selection: [],
    });
    recalculatePages(); // Build initial pages dynamically
  });

  it('initializes with correct state', () => {
    expect(state.pages.length).toBe(3);
    expect(state.selection).toEqual([]);
    expect(state.pages[0].id).toBe('inst_p0');
  });

  it('handles reordering via movePages', () => {
    setState('selection', ['inst_p2']);
    movePages(0);
    expect(state.pages[0].id).toBe('inst_p2');
    expect(state.pages[1].id).toBe('inst_p0');
    expect(state.pages[2].id).toBe('inst_p1');
  });

  it('handles undo/redo for operations', () => {
    setState('selection', ['inst_p0']);
    rotateCWSelected();
    expect(state.pages[0].ops.rotation).toBe(90);

    undo();
    expect(state.pages[0].ops.rotation).toBe(0);

    redo();
    expect(state.pages[0].ops.rotation).toBe(90);
  });

  it('handles flips', () => {
    setState('selection', ['inst_p1']);
    flipHSelected();
    expect(state.pages[1].ops.flipH).toBe(true);

    undo();
    expect(state.pages[1].ops.flipH).toBe(false);
  });

  it('handles deletions', () => {
    setState('selection', ['inst_p0', 'inst_p2']);
    deleteSelected();
    expect(state.pages.length).toBe(1);
    expect(state.pages[0].id).toBe('inst_p1');
    expect(state.selection).toEqual([]);

    undo();
    expect(state.pages.length).toBe(3);
    expect(state.pages[0].id).toBe('inst_p0');
    expect(state.pages[2].id).toBe('inst_p2');
  });

  it('supports multi-selection move', () => {
    setState('selection', ['inst_p0', 'inst_p2']);
    movePages(1); // Move p0, p2 to index 1 (after p1)
    expect(state.pages[0].id).toBe('inst_p1');
    expect(state.pages[1].id).toBe('inst_p0');
    expect(state.pages[2].id).toBe('inst_p2');
  });

  it('performs batch operations on multiple selected pages', () => {
    setState('selection', ['inst_p0', 'inst_p1']);
    rotateCWSelected();
    expect(state.pages[0].ops.rotation).toBe(90);
    expect(state.pages[1].ops.rotation).toBe(90);
    expect(state.pages[2].ops.rotation).toBe(0);

    undo();
    expect(state.pages[0].ops.rotation).toBe(0);
    expect(state.pages[1].ops.rotation).toBe(0);
  });

  it('deletes multiple selected pages at once', () => {
    setState('selection', ['inst_p0', 'inst_p2']);
    deleteSelected();
    expect(state.pages.length).toBe(1);
    expect(state.pages[0].id).toBe('inst_p1');
    expect(state.selection).toEqual([]);
  });

  it('evaluator gracefully mutes operations on non-existent pages (e.g. original replaced)', () => {
    setState('selection', ['inst_p2']);
    rotateCWSelected();
    setState('selection', ['inst_p2']);
    deleteSelected();

    expect(state.operations.length).toBe(3); // APPEND, ROTATE, DELETE

    // Modify original to have only 2 pages AFTER operations were recorded
    setState('originals', 0, 'pageCount', 2);
    recalculatePages();

    expect(state.pages.length).toBe(2);
    expect(state.pages[0].id).toBe('inst_p0');
    expect(state.pages[1].id).toBe('inst_p1');
  });
});

describe('Original File deletion logic', () => {
  beforeEach(() => {
    resetState({
      originals: [
        {
          id: 'o1',
          name: 'test.pdf',
          size: 1000,
          type: 'pdf',
          pageCount: 3,
          color: 'red',
          evicted: false,
          pageRatios: [1.414, 1.414, 1.414],
          version: 0,
        },
      ],
      operations: [{ type: 'APPEND_ORIGINAL', originalId: 'o1', instanceId: 'inst' } as any],
      historyIndex: 1,
      selection: [],
    });
    recalculatePages();
  });

  it('deleteOriginal removes file, evicts cache, and deletes associated pages', async () => {
    // Setup another original
    setState('originals', (os) => [
      ...os,
      {
        id: 'o2',
        name: 'image.jpg',
        size: 500,
        type: 'image',
        pageCount: 1,
        color: 'blue',
        evicted: false,
        pageRatios: [0.75],
        version: 0,
      },
    ]);
    pushOperation({ type: 'APPEND_ORIGINAL', originalId: 'o2', instanceId: 'inst2' } as any);
    recalculatePages();

    expect(state.pages.length).toBe(4); // 3 (o1) + 1 (o2)

    await deleteOriginal('o1');

    expect(state.originals.length).toBe(1);
    expect(state.originals[0].id).toBe('o2');
    expect(state.pages.length).toBe(1);
    expect(state.pages[0].id).toBe('inst2_p0');
  });

  it('clears selection when deleted original affects selected pages', async () => {
    setState('selection', ['inst_p0', 'inst_p1']);
    
    await deleteOriginal('o1');
    
    expect(state.selection).toEqual([]);
  });

  it('deleteUnusedOriginals removes only unused files', async () => {
    // Setup another original (o2) which will be used
    setState('originals', (os) => [
      ...os,
      {
        id: 'o2',
        name: 'used.pdf',
        size: 500,
        type: 'pdf',
        pageCount: 1,
        color: 'blue',
        evicted: false,
        pageRatios: [1.414],
        version: 0,
      },
    ]);
    pushOperation({ type: 'APPEND_ORIGINAL', originalId: 'o2', instanceId: 'inst2' } as any);

    // Setup a third original (o3) which will NOT be used
    setState('originals', (os) => [
      ...os,
      {
        id: 'o3',
        name: 'unused.pdf',
        size: 300,
        type: 'pdf',
        pageCount: 1,
        color: 'green',
        evicted: false,
        pageRatios: [1.414],
        version: 0,
      },
    ]);
    
    // Now delete all pages belonging to o1 (making o1 unused)
    pushOperation({ type: 'DELETE', pageIds: ['inst_p0', 'inst_p1', 'inst_p2'] } as any);
    recalculatePages();

    expect(state.pages.length).toBe(1); // Only o2 page left
    expect(state.originals.length).toBe(3); // o1, o2, o3

    await deleteUnusedOriginals();

    expect(state.originals.length).toBe(1);
    expect(state.originals[0].id).toBe('o2');
    expect(state.pages.length).toBe(1);
  });
});
