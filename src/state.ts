import { createEffect } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { EditorState, Page, OriginalFile, PageOperation, AbstractOperation, Asset } from './types';
import { computeSelection } from './lib/selection';

const [state, setState] = createStore<EditorState>({
  originals: [],
  operations: [],
  historyIndex: 0,
  pages: [],
  selection: [],
  assetSelection: [],
  zoom: 4,
  workspaceRatio: 1.414, // A4 ratio
  draggingKind: null,
  activeTab: 'files',
});

export { state, setState };
// Core Evaluator
export const evaluateTimeline = (originals: OriginalFile[], ops: AbstractOperation[]): Page[] => {
  let pages: Page[] = [];

  for (const op of ops) {
    switch (op.type) {
      case 'APPEND_ORIGINAL': {
        const orig = originals.find((o) => o.id === op.originalId);
        if (orig) {
          const newPages: Page[] = [];
          for (let i = 0; i < orig.pageCount; i++) {
            newPages.push({
              id: `${op.instanceId}_p${i}`,
              originalId: orig.id,
              originalPageIndex: i,
              ops: { rotation: 0, flipH: false, flipV: false },
            });
          }
          pages.push(...newPages);
        }
        break;
      }
      case 'ADD_BLANK': {
        const clampedIndex = Math.min(Math.max(0, op.index), pages.length);
        pages.splice(clampedIndex, 0, {
          id: op.pageId,
          originalId: '',
          originalPageIndex: -1,
          ops: { rotation: 0, flipH: false, flipV: false },
        });
        break;
      }
      case 'DELETE': {
        pages = pages.filter((p) => !op.pageIds.includes(p.id));
        break;
      }
      case 'MOVE': {
        const toMove = pages.filter((p) => op.pageIds.includes(p.id));
        pages = pages.filter((p) => !op.pageIds.includes(p.id));
        const clampedIndex = Math.min(Math.max(0, op.targetIndex), pages.length);
        pages.splice(clampedIndex, 0, ...toMove);
        break;
      }
      case 'TRANSFORM': {
        pages = pages.map((p) => {
          if (!op.pageIds.includes(p.id)) return p;
          const root = { ...p, ops: { ...p.ops } };
          if (op.operation === 'rotateCW') root.ops.rotation = (root.ops.rotation + 90) % 360;
          if (op.operation === 'rotateCCW')
            root.ops.rotation = (root.ops.rotation - 90 + 360) % 360;
          if (op.operation === 'flipH') root.ops.flipH = !root.ops.flipH;
          if (op.operation === 'flipV') root.ops.flipV = !root.ops.flipV;
          return root;
        });
        break;
      }
      case 'REPLACE_IMAGE':
      case 'DELETE_IMAGE':
        // These affect the PDF content, handled by evaluateTimeline as well
        break;
    }
  }

  return pages;
};

export const recalculatePages = () => {
  const currentOps = state.operations.slice(0, state.historyIndex);
  const newPages = evaluateTimeline(unwrap(state.originals), unwrap(currentOps));
  setState('pages', reconcile(newPages, { key: 'id' }));
  setState('selection', (s) => s.filter((id) => newPages.some((p) => p.id === id)));
  // Also clean up asset selection if assets might have been removed
  // (though assets are tied to originals/ops, we check if they are still relevant)
  // We can't easily check asset validity here without workspaceAssets, 
  // but we can at least filter by existing originals for now.
  setState('assetSelection', (s) => s.filter((id) => {
    const originalId = id.split(':')[0];
    return state.originals.some(o => o.id === originalId);
  }));

  // Update workspace ratio based on the first non-blank page (the "trend setter")
  const trendSetter = newPages.find((p) => p.originalId !== '');
  if (trendSetter) {
    const orig = state.originals.find((o) => o.id === trendSetter.originalId);
    if (orig?.pageRatios?.[trendSetter.originalPageIndex] !== undefined) {
      let ratio = orig.pageRatios[trendSetter.originalPageIndex];
      // Invert ratio if page is rotated 90 or 270 degrees
      if (trendSetter.ops.rotation % 180 !== 0) {
        ratio = 1 / ratio;
      }
      setState('workspaceRatio', ratio);
    }
  } else {
    setState('workspaceRatio', 1.414); // Back to A4 default if empty or only blanks
  }

  saveState();
};

export const pushOperation = (op: AbstractOperation) => {
  setState(
    produce((s) => {
      s.operations.splice(s.historyIndex); // truncate
      s.operations.push(op);
      s.historyIndex++;
    }),
  );
  recalculatePages();
};

// Undo/Redo logic
export const undo = () => {
  if (state.historyIndex > 0) {
    setState('historyIndex', state.historyIndex - 1);
    recalculatePages();
  }
};

export const redo = () => {
  if (state.historyIndex < state.operations.length) {
    setState('historyIndex', state.historyIndex + 1);
    recalculatePages();
  }
};

// Persistence
export const saveState = () => {
  // Defensive: explicitly remove volatile properties before saving
  const raw = unwrap(state);
  const stateToSave = { ...raw };
  delete (stateToSave as any).selection;
  delete (stateToSave as any).assetSelection;
  delete (stateToSave as any).draggingKind;
  delete (stateToSave as any).pages; // Computed property, don't save to avoid stale state
  
  localStorage.setItem('pdfboop_state', JSON.stringify(stateToSave));
};

export const loadState = () => {
  const saved = localStorage.getItem('pdfboop_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.operations) {
        // Ensure we don't load selection state even if it was accidentally saved
        delete parsed.selection;
        delete parsed.assetSelection;
        delete parsed.draggingKind;
        delete parsed.pages; // Always re-evaluate pages from operations

        setState(reconcile({
          activeTab: 'files',
          ...parsed,
          selection: [],
          assetSelection: [],
          draggingKind: null,
          pages: [],
        }));
        
        recalculatePages(); // Compute pages from loaded operations
        checkCacheAvailability();
      } else {
        clearWorkspace();
      }
    } catch (e) {
      console.error('Failed to load state', e);
    }
  }
};

export const setActiveTab = (tab: 'files' | 'assets') => {
  setState('activeTab', tab);
  saveState();
};

export const clearWorkspace = async () => {
  localStorage.removeItem('pdfboop_state');
  setState(
    reconcile({
      originals: [],
      operations: [],
      historyIndex: 0,
      pages: [],
      selection: [],
      assetSelection: [],
      zoom: 4,
      workspaceRatio: 1.414,
      draggingKind: null,
      activeTab: 'files',
    }),
  );
  await caches.delete('pdfboop-originals');
};

export const checkCacheAvailability = async () => {
  const cache = await caches.open('pdfboop-originals');
  const ids = state.originals.map((o) => o.id);
  const availability = await Promise.all(
    ids.map(async (id) => {
      const resp = await cache.match(id);
      return !!resp;
    }),
  );

  setState(
    'originals',
    produce((os) => {
      os.forEach((o, i) => {
        o.evicted = !availability[i];
      });
    }),
  );
};

export const deleteOriginal = async (id: string) => {
  setState(
    'originals',
    (os) => os.filter((o) => o.id !== id),
  );

  // Clean up cache
  try {
    const cache = await caches.open('pdfboop-originals');
    await cache.delete(id);
  } catch (e) {
    console.warn('Failed to delete from cache', e);
  }

  recalculatePages();
};

export const deleteUnusedOriginals = async () => {
  const usedIds = new Set(state.pages.map((p) => p.originalId));
  const toDelete = state.originals.filter((o) => !usedIds.has(o.id));

  if (toDelete.length === 0) return;

  const ids = toDelete.map((o) => o.id);

  setState(
    'originals',
    (os) => os.filter((o) => !ids.includes(o.id)),
  );

  // Clean up cache
  try {
    const cache = await caches.open('pdfboop-originals');
    await Promise.all(ids.map((id) => cache.delete(id)));
  } catch (e) {
    console.warn('Failed to delete from cache', e);
  }

  recalculatePages();
};

// Color palette for origins (24 colors)
const palette = ['#9c3816', '#169c70', '#9c6416', '#64169c', '#16389c', '#9c1638', '#2d169c'];

export const getOriginColor = (index: number) => palette[index % palette.length];

// Cache API for blobs
export const cacheOriginal = async (id: string, blob: Blob, skipCheck = false) => {
  const cache = await caches.open('pdfboop-originals');
  await cache.put(id, new Response(await blob.arrayBuffer()));
  if (!skipCheck) {
    await checkCacheAvailability();
  }
};

export const getOriginalBlob = async (id: string) => {
  const cache = await caches.open('pdfboop-originals');
  const response = await cache.match(id);
  return response ? await response.blob() : null;
};

// Utilities for testing
export const resetState = (initial?: Partial<EditorState>) => {
  setState(
    reconcile({
      originals: [],
      operations: [],
      historyIndex: 0,
      pages: [],
      selection: [],
      assetSelection: [],
      zoom: 4,
      workspaceRatio: 1.414,
      draggingKind: null,
      activeTab: 'files',
      ...initial,
    }),
  );
};

// Mutations
export const rotateCWSelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'TRANSFORM', pageIds: [...state.selection], operation: 'rotateCW' });
};

export const rotateCCWSelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'TRANSFORM', pageIds: [...state.selection], operation: 'rotateCCW' });
};

export const flipHSelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'TRANSFORM', pageIds: [...state.selection], operation: 'flipH' });
};

export const flipVSelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'TRANSFORM', pageIds: [...state.selection], operation: 'flipV' });
};

export const movePages = (targetIndex: number) => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'MOVE', pageIds: [...state.selection], targetIndex });
};

export const moveSelection = (direction: -1 | 1) => {
  if (state.selection.length === 0) return;
  const indices = state.selection
    .map((id) => state.pages.findIndex((p) => p.id === id))
    .sort((a, b) => a - b);
  const minIdx = indices[0];
  const maxIdx = indices[indices.length - 1];

  if (direction === -1 && minIdx > 0) {
    movePages(minIdx - 1);
  } else if (direction === 1 && maxIdx < state.pages.length - 1) {
    movePages(minIdx + 1);
  }
};

export const deleteSelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'DELETE', pageIds: [...state.selection] });
};

export const addPageAt = (index: number) => {
  pushOperation({ type: 'ADD_BLANK', pageId: crypto.randomUUID(), index });
};

export const reuploadOriginal = async (id: string, blob: Blob, metadata: { name: string; size: number }, pageCount?: number) => {
  await cacheOriginal(id, blob, true);

  setState(
    'originals',
    (o) => o.id === id,
    produce((o) => {
      o.name = metadata.name;
      o.size = metadata.size;
      o.evicted = false;
      if (typeof pageCount === 'number') {
        o.pageCount = pageCount;
      }
      o.version++;
    }),
  );

recalculatePages(); // Trigger re-render of previews
};

// Selection helpers
export const selectPage = (id: string, allIds: string[], multi = false, shift = false) => {
  const newSelection = computeSelection(
    unwrap(state.selection),
    allIds,
    id,
    allIds.indexOf(id),
    multi,
    shift
  );
  setState('selection', reconcile(newSelection));
};

// Asset selection
export const selectAsset = (id: string, allIds: string[], multi = false, shift = false) => {
  const newSelection = computeSelection(
    unwrap(state.assetSelection),
    allIds,
    id,
    allIds.indexOf(id),
    multi,
    shift
  );
  setState('assetSelection', newSelection);
};

export const clearAssetSelection = () => setState('assetSelection', []);

export const deleteSelectedAssets = (assets: Asset[]) => {
  const byOriginal: Record<string, string[]> = {};
  for (const assetId of state.assetSelection) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    if (!byOriginal[asset.originalId]) byOriginal[asset.originalId] = [];
    byOriginal[asset.originalId].push(asset.ref);
  }

  for (const [originalId, refs] of Object.entries(byOriginal)) {
    pushOperation({
      type: 'DELETE_IMAGE',
      originalId,
      imageRefs: refs,
    });
  }
  clearAssetSelection();
};

export const replaceSelectedAssets = async (assets: Asset[], newBlobs: Blob[]) => {
  const byOriginal: Record<string, string[]> = {};
  for (const assetId of state.assetSelection) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    if (!byOriginal[asset.originalId]) byOriginal[asset.originalId] = [];
    byOriginal[asset.originalId].push(asset.ref);
  }

  const blob = newBlobs[0];
  const blobId = crypto.randomUUID();
  await cacheOriginal(blobId, blob);

  for (const [originalId, refs] of Object.entries(byOriginal)) {
    pushOperation({
      type: 'REPLACE_IMAGE',
      originalId,
      imageRefs: refs,
      newBlobIds: [blobId], // Apply same blob to all for now
    });
  }
  clearAssetSelection();
};

export const setAssetQuality = (originalId: string, imageRef: string, quality: number) => {
  setState(
    'originals',
    (o) => o.id === originalId,
    produce((o) => {
      if (!o.assetQualities) o.assetQualities = {};
      o.assetQualities[imageRef] = quality;
      // Increment version to trigger re-renders and cache invalidation
      o.version++;
    }),
  );
};

export const setAssetScale = (originalId: string, imageRef: string, scale: number) => {
  setState(
    'originals',
    (o) => o.id === originalId,
    produce((o) => {
      if (!o.assetScales) o.assetScales = {};
      o.assetScales[imageRef] = Math.max(0.01, Math.min(1.0, scale));
      // Increment version to trigger re-renders and cache invalidation
      o.version++;
    }),
  );
};

// Global drag handling
if (typeof window !== 'undefined') {
  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      const items = Array.from(e.dataTransfer.items);
      const isPdf = items.some((i) => i.type === 'application/pdf');
      const isImg = items.some((i) => i.type.startsWith('image/'));

      if (isPdf) setState('draggingKind', 'pdf');
      else if (isImg) setState('draggingKind', 'image');
      else setState('draggingKind', 'file');
    }
  });

  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      // Ensure state is set if dragenter missed it or if it needs refreshing
      if (!state.draggingKind) {
        const items = Array.from(e.dataTransfer.items);
        const isPdf = items.some((i) => i.type === 'application/pdf');
        const isImg = items.some((i) => i.type.startsWith('image/'));
        if (isPdf) setState('draggingKind', 'pdf');
        else if (isImg) setState('draggingKind', 'image');
        else setState('draggingKind', 'file');
      }
    }
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      setState('draggingKind', null);
    }
  });

  window.addEventListener('drop', () => {
    setState('draggingKind', null);
  }, { capture: true });
}
