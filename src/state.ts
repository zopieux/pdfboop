import { createSignal } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { CURRENT_VERSION } from './changelog';
import { resolveGeometry } from './lib/geo';
import { computeSelection } from './lib/selection';
import type {
  AbstractOperation,
  Anchor,
  Asset,
  EditorState,
  OriginalFile,
  Page,
  PageSize,
  ResizeMode,
  UserPreferences,
} from './types';

const INITIAL_PREFS: UserPreferences = {
  resizerMode: 'crop',
  resizerAnchor: 'center',
};

const loadPrefs = (): UserPreferences => {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage || typeof storage.getItem !== 'function') return INITIAL_PREFS;
  const saved = storage.getItem('pdfboop_prefs');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load prefs', e);
    }
  }
  return INITIAL_PREFS;
};

const savePrefs = (prefs: UserPreferences) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('pdfboop_prefs', JSON.stringify(prefs));
};

const getInitialState = (): EditorState => ({
  originals: [],
  operations: [],
  historyIndex: 0,
  pages: [],
  selection: [],
  assetSelection: [],
  zoom: 4,
  draggingKind: null,
  activeTab: 'files',
  resizerLinked: true,
  pickingAspectFor: undefined,
  ...loadPrefs(),
});

const [state, setState] = createStore<EditorState>(getInitialState());

const [lastOpenedVersion, setLastOpenedVersion] = createSignal<number>(
  typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
    ? parseInt(localStorage.getItem('pdfboop_last_version') || '0', 10)
    : 0,
);
const [bookmarkVersion, setBookmarkVersion] = createSignal<number | null>(null);
const [showChangelogModal, setShowChangelogModal] = createSignal<boolean>(false);

export const bumpOpenedVersion = () => {
  const prev = lastOpenedVersion();
  setBookmarkVersion(prev);

  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
    localStorage.setItem('pdfboop_last_version', CURRENT_VERSION.toString());
  }
  setLastOpenedVersion(CURRENT_VERSION);
  setShowChangelogModal(true);
};

export {
  bookmarkVersion,
  lastOpenedVersion,
  setLastOpenedVersion,
  setShowChangelogModal,
  setState,
  showChangelogModal,
  state,
};
// Core Evaluator — geometry ops (TRANSFORM, RESIZE, CROP) stay in the timeline
// and are resolved on demand via resolveGeometry(). Only structural ops are
// evaluated here to produce the page list.
export const evaluateTimeline = (originals: OriginalFile[], ops: AbstractOperation[]): Page[] => {
  let pages: Page[] = [];

  for (const op of ops) {
    switch (op.type) {
      case 'APPEND_ORIGINAL': {
        const orig = originals.find((o) => o.id === op.originalId);
        if (orig) {
          for (let i = 0; i < orig.pageCount; i++) {
            pages.push({
              id: `${op.instanceId}_p${i}`,
              originalId: orig.id,
              originalPageIndex: i,
              originalSize: orig.pageSizes[i],
            });
          }
        }
        break;
      }
      case 'ADD_BLANK': {
        const clampedIndex = Math.min(Math.max(0, op.index), pages.length);
        pages.splice(clampedIndex, 0, {
          id: op.pageId,
          originalId: '',
          originalPageIndex: -1,
          originalSize: op.originalSize,
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
      // TRANSFORM, RESIZE, CROP: geometry ops — resolved on demand.
      // REPLACE_IMAGE, DELETE_IMAGE: PDF content ops — handled by processed.ts.
    }
  }

  return pages;
};

export const recalculatePages = () => {
  const currentOps = state.operations.slice(0, state.historyIndex);
  const newPages = evaluateTimeline(unwrap(state.originals), unwrap(currentOps));
  setState('pages', reconcile(newPages, { key: 'id' }));
  setState('selection', (s) => s.filter((id) => newPages.some((p) => p.id === id)));
  setState('assetSelection', (s) =>
    s.filter((id) => {
      const originalId = id.split(':')[0];
      return state.originals.some((o) => o.id === originalId);
    }),
  );
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
  delete (stateToSave as any).pickingAspectFor;
  delete (stateToSave as any).pages;
  // resizerLinked IS saved in pdfboop_state as it is workspace-scoped
  delete (stateToSave as any).resizerMode;
  delete (stateToSave as any).resizerAnchor;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pdfboop_state', JSON.stringify(stateToSave));
  }
};

export const loadState = () => {
  if (typeof localStorage === 'undefined') return;
  const saved = localStorage.getItem('pdfboop_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.operations) {
        // Ensure we don't load selection state even if it was accidentally saved
        delete parsed.selection;
        delete parsed.assetSelection;
        delete parsed.draggingKind;
        delete parsed.pickingAspectFor;
        delete parsed.pages;

        setState(
          reconcile({
            ...getInitialState(),
            ...parsed,
            ...loadPrefs(),
            selection: [],
            assetSelection: [],
            draggingKind: null,
            pickingAspectFor: undefined,
            pages: [],
          }),
        );

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
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('pdfboop_state');
  }
  setState(
    reconcile({
      ...getInitialState(),
      resizerMode: state.resizerMode,
      resizerAnchor: state.resizerAnchor,
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
  setState('originals', (os) => os.filter((o) => o.id !== id));

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

  setState('originals', (os) => os.filter((o) => !ids.includes(o.id)));

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
  setState(reconcile({ ...getInitialState(), ...initial }));
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

export const addPageAt = (index: number, size?: PageSize) => {
  const finalSize = size || { width: 595.28, height: 595.28 * Math.SQRT2 }; // A4
  pushOperation({
    type: 'ADD_BLANK',
    pageId: crypto.randomUUID(),
    index,
    originalSize: finalSize,
  });
};

export const reuploadOriginal = async (
  id: string,
  blob: Blob,
  metadata: { name: string; size: number },
  pageCount?: number,
) => {
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
    shift,
  );
  setState('selection', reconcile(newSelection));
};

export const selectAllPages = () => {
  setState(
    'selection',
    state.pages.map((p) => p.id),
  );
};

export const selectPagesByOriginal = (originalId: string, add = false) => {
  const targetIds = state.pages.filter((p) => p.originalId === originalId).map((p) => p.id);
  if (add) {
    setState('selection', (s) => [...new Set([...s, ...targetIds])]);
  } else {
    setState('selection', targetIds);
  }
};

// Asset selection
export const selectAsset = (id: string, allIds: string[], multi = false, shift = false) => {
  const newSelection = computeSelection(
    unwrap(state.assetSelection),
    allIds,
    id,
    allIds.indexOf(id),
    multi,
    shift,
  );
  setState('assetSelection', newSelection);
};

export const clearAssetSelection = () => setState('assetSelection', []);

export const resizeSelected = (targetSize?: { width: number; height: number }) => {
  if (state.selection.length === 0) return;
  if (targetSize) {
    pushOperation({
      type: 'RESIZE',
      pageIds: [...state.selection],
      targetSize,
      resizeMode: state.resizerMode,
      anchor: state.resizerAnchor,
    });
  } else {
    resetGeometrySelected();
  }
};

export const resetGeometrySelected = () => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'RESET_GEOMETRY', pageIds: [...state.selection] });
};

export const setResizerMode = (mode: ResizeMode) => {
  setState('resizerMode', mode);
  savePrefs({ resizerMode: mode, resizerAnchor: state.resizerAnchor });
};

export const setResizerAnchor = (anchor: Anchor) => {
  setState('resizerAnchor', anchor);
  savePrefs({ resizerMode: state.resizerMode, resizerAnchor: anchor });
};

export const setResizerLinked = (linked: boolean) => {
  setState('resizerLinked', linked);
  saveState();
};

export const resizeSelectedToRatio = (ratio: number) => {
  if (state.selection.length === 0) return;
  setState('resizerLinked', true); // Linking is implied when choosing a ratio
  pushOperation({
    type: 'RESIZE',
    pageIds: [...state.selection],
    targetRatio: ratio,
    resizeMode: state.resizerMode,
    anchor: state.resizerAnchor,
  });
};

export const startPickMode = () => {
  if (state.selection.length === 0) return;
  setState('pickingAspectFor', [...state.selection]);
};

export const cancelPickMode = () => {
  setState('pickingAspectFor', undefined);
};

export const applyCropSelected = (crop: any) => {
  if (state.selection.length === 0) return;
  pushOperation({ type: 'CROP', pageIds: [...state.selection], crop });
  setState('pickingAspectFor', undefined);
};

export const selectSameSize = (width: number, height: number) => {
  const ops = state.operations.slice(0, state.historyIndex);
  const ids = state.pages
    .filter((p) => {
      const geo = resolveGeometry(p.originalSize, ops, p.id);
      return Math.abs(geo.canvasWidth - width) < 0.1 && Math.abs(geo.canvasHeight - height) < 0.1;
    })
    .map((p) => p.id);
  setState('selection', ids);
};

export const selectSameAspect = (aspect: number) => {
  const ops = state.operations.slice(0, state.historyIndex);
  const ids = state.pages
    .filter((p) => {
      const geo = resolveGeometry(p.originalSize, ops, p.id);
      const a = geo.canvasHeight / geo.canvasWidth;
      return Math.abs(a - aspect) < 0.001;
    })
    .map((p) => p.id);
  setState('selection', ids);
};

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

  window.addEventListener(
    'drop',
    () => {
      setState('draggingKind', null);
    },
    { capture: true },
  );
}
