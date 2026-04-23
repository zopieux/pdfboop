import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveGeometry } from './lib/geo';
import {
  deleteOriginal,
  deleteSelected,
  deleteUnusedOriginals,
  flipHSelected,
  movePages,
  pushOperation,
  recalculatePages,
  redo,
  resetState,
  resizeSelected,
  rotateCWSelected,
  selectSameAspect,
  selectSameSize,
  setState,
  state,
  undo,
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
  // @ts-expect-error
  window.caches = {
    open: vi.fn().mockResolvedValue({
      put: vi.fn(),
      match: vi.fn(),
      delete: vi.fn(),
    }),
    delete: vi.fn(),
  };
} else {
  // @ts-expect-error
  global.caches = {
    open: vi.fn().mockResolvedValue({
      put: vi.fn(),
      match: vi.fn(),
      delete: vi.fn(),
    }),
    delete: vi.fn(),
  };
}

/** Helper: get resolved geometry for a page by index in current state. */
const geoOf = (pageIndex: number) => {
  const page = state.pages[pageIndex];
  return resolveGeometry(page.originalSize, state.operations.slice(0, state.historyIndex), page.id);
};

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
          pageRatios: [Math.SQRT2, Math.SQRT2, Math.SQRT2],
          pageSizes: [
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
          ],
          version: 0,
          assets: [],
          assetUsage: {},
          assetQualities: {},
          assetScales: {},
        },
      ],
      operations: [{ type: 'APPEND_ORIGINAL', originalId: 'o1', instanceId: 'inst' } as any],
      historyIndex: 1,
      selection: [],
    });
    recalculatePages();
  });

  it('initializes with correct state', () => {
    expect(state.pages.length).toBe(3);
    expect(state.selection).toEqual([]);
    expect(state.pages[0].id).toBe('inst_p0');
    expect(state.pages[0].originalSize).toEqual({ width: 100, height: 141.4 });
  });

  it('handles reordering via movePages', () => {
    setState('selection', ['inst_p2']);
    movePages(0);
    expect(state.pages[0].id).toBe('inst_p2');
    expect(state.pages[1].id).toBe('inst_p0');
    expect(state.pages[2].id).toBe('inst_p1');
  });

  it('handles undo/redo for rotation', () => {
    setState('selection', ['inst_p0']);
    rotateCWSelected();
    // After 90° CW rotation of 100×141.4, paper swaps to 141.4×100
    let geo = geoOf(0);
    expect(geo.canvasWidth).toBeCloseTo(141.4);
    expect(geo.canvasHeight).toBeCloseTo(100);

    undo();
    geo = geoOf(0);
    expect(geo.canvasWidth).toBeCloseTo(100);
    expect(geo.canvasHeight).toBeCloseTo(141.4);

    redo();
    geo = geoOf(0);
    expect(geo.canvasWidth).toBeCloseTo(141.4);
    expect(geo.canvasHeight).toBeCloseTo(100);
  });

  it('handles flips', () => {
    setState('selection', ['inst_p1']);
    flipHSelected();
    // Flip doesn't change canvas size, but the matrix should reflect the flip
    const geo = geoOf(1);
    expect(geo.canvasWidth).toBeCloseTo(100);
    expect(geo.canvasHeight).toBeCloseTo(141.4);
    // Matrix a should be negative (flipped horizontally)
    expect(geo.matrix.a).toBeLessThan(0);

    undo();
    const geo2 = geoOf(1);
    expect(geo2.matrix.a).toBeGreaterThan(0);
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
    movePages(1);
    expect(state.pages[0].id).toBe('inst_p1');
    expect(state.pages[1].id).toBe('inst_p0');
    expect(state.pages[2].id).toBe('inst_p2');
  });

  it('performs batch operations on multiple selected pages', () => {
    setState('selection', ['inst_p0', 'inst_p1']);
    rotateCWSelected();

    const geo0 = geoOf(0);
    const geo1 = geoOf(1);
    const geo2 = geoOf(2);
    expect(geo0.canvasWidth).toBeCloseTo(141.4);
    expect(geo1.canvasWidth).toBeCloseTo(141.4);
    expect(geo2.canvasWidth).toBeCloseTo(100); // untouched

    undo();
    expect(geoOf(0).canvasWidth).toBeCloseTo(100);
    expect(geoOf(1).canvasWidth).toBeCloseTo(100);
  });

  it('deletes multiple selected pages at once', () => {
    setState('selection', ['inst_p0', 'inst_p2']);
    deleteSelected();
    expect(state.pages.length).toBe(1);
    expect(state.pages[0].id).toBe('inst_p1');
    expect(state.selection).toEqual([]);
  });

  it('evaluator gracefully mutes operations on non-existent pages', () => {
    setState('selection', ['inst_p2']);
    rotateCWSelected();
    setState('selection', ['inst_p2']);
    deleteSelected();

    expect(state.operations.length).toBe(3);

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
          pageRatios: [Math.SQRT2, Math.SQRT2, Math.SQRT2],
          pageSizes: [
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
          ],
          version: 0,
          assets: [],
          assetUsage: {},
          assetQualities: {},
          assetScales: {},
        },
      ],
      operations: [{ type: 'APPEND_ORIGINAL', originalId: 'o1', instanceId: 'inst' } as any],
      historyIndex: 1,
      selection: [],
    });
    recalculatePages();
  });

  it('deleteOriginal removes file, evicts cache, and deletes associated pages', async () => {
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
        pageSizes: [{ width: 100, height: 75 }],
        version: 0,
        assets: [],
        assetUsage: {},
        assetQualities: {},
        assetScales: {},
      },
    ]);
    pushOperation({ type: 'APPEND_ORIGINAL', originalId: 'o2', instanceId: 'inst2' } as any);
    recalculatePages();

    expect(state.pages.length).toBe(4);

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
        pageRatios: [Math.SQRT2],
        pageSizes: [{ width: 100, height: 141.4 }],
        version: 0,
        assets: [],
        assetUsage: {},
        assetQualities: {},
        assetScales: {},
      },
    ]);
    pushOperation({ type: 'APPEND_ORIGINAL', originalId: 'o2', instanceId: 'inst2' } as any);

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
        pageRatios: [Math.SQRT2],
        pageSizes: [{ width: 100, height: 141.4 }],
        version: 0,
        assets: [],
        assetUsage: {},
        assetQualities: {},
        assetScales: {},
      },
    ]);

    pushOperation({ type: 'DELETE', pageIds: ['inst_p0', 'inst_p1', 'inst_p2'] } as any);
    recalculatePages();

    expect(state.pages.length).toBe(1);
    expect(state.originals.length).toBe(3);

    await deleteUnusedOriginals();

    expect(state.originals.length).toBe(1);
    expect(state.originals[0].id).toBe('o2');
    expect(state.pages.length).toBe(1);
  });
});

describe('Resizing logic', () => {
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
          pageRatios: [Math.SQRT2, Math.SQRT2, Math.SQRT2],
          pageSizes: [
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
            { width: 100, height: 141.4 },
          ],
          version: 0,
          assets: [],
          assetUsage: {},
          assetQualities: {},
          assetScales: {},
        },
      ],
      operations: [{ type: 'APPEND_ORIGINAL', originalId: 'o1', instanceId: 'inst' } as any],
      historyIndex: 1,
      selection: [],
    });
    recalculatePages();
  });

  it('handles resizing via resizeSelected', () => {
    setState('selection', ['inst_p0']);
    resizeSelected({ width: 200, height: 300 });
    const geo = geoOf(0);
    expect(geo.canvasWidth).toBeCloseTo(200);
    expect(geo.canvasHeight).toBeCloseTo(300);

    undo();
    const geo2 = geoOf(0);
    expect(geo2.canvasWidth).toBeCloseTo(100);
    expect(geo2.canvasHeight).toBeCloseTo(141.4);

    redo();
    const geo3 = geoOf(0);
    expect(geo3.canvasWidth).toBeCloseTo(200);
    expect(geo3.canvasHeight).toBeCloseTo(300);
  });

  it('handles multiple page resizing at once', () => {
    setState('selection', ['inst_p0', 'inst_p1']);
    resizeSelected({ width: 50, height: 50 });

    expect(geoOf(0).canvasWidth).toBeCloseTo(50);
    expect(geoOf(1).canvasWidth).toBeCloseTo(50);
    expect(geoOf(2).canvasWidth).toBeCloseTo(100); // untouched
  });

  it('selectSameSize correctly filters pages', () => {
    selectSameSize(100, 141.4);
    expect(state.selection).toEqual(['inst_p0', 'inst_p1', 'inst_p2']);

    setState('selection', ['inst_p0']);
    resizeSelected({ width: 50, height: 50 });

    selectSameSize(50, 50);
    expect(state.selection).toEqual(['inst_p0']);

    selectSameSize(100, 141.4);
    expect(state.selection).toEqual(['inst_p1', 'inst_p2']);
  });

  it('selectSameAspect correctly filters pages', () => {
    selectSameAspect(Math.SQRT2);
    expect(state.selection).toEqual(['inst_p0', 'inst_p1', 'inst_p2']);

    setState('selection', ['inst_p0']);
    resizeSelected({ width: 100, height: 100 }); // aspect 1.0

    selectSameAspect(1.0);
    // After letterboxing 100×141.4 into 100×100, the canvas is 100×100
    // but the aspect ratio of the canvas IS 1.0
    expect(state.selection).toEqual(['inst_p0']);

    selectSameAspect(Math.SQRT2);
    expect(state.selection).toEqual(['inst_p1', 'inst_p2']);
  });
});
