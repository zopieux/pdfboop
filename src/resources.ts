import { createEffect, createMemo, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import { extractAssetPreview } from './lib/extraction';
import { getOriginalBlob, state } from './state';
import type { Asset } from './types';

const thumbnailCache = new Map<string, string>();

async function getThumbnail(originalId: string, ref: string): Promise<string> {
  const cacheKey = `${originalId}:${ref}`;
  if (thumbnailCache.has(cacheKey)) return thumbnailCache.get(cacheKey)!;

  const blob = await getOriginalBlob(originalId);
  if (!blob) return '';

  const preview = await extractAssetPreview(blob, ref);
  if (preview) thumbnailCache.set(cacheKey, preview);
  return preview;
}

/**
 * workspaceAssets is a globally reactive list of assets currently in use.
 * It is derived synchronously from state.pages to ensure high reactivity,
 * with thumbnails loaded asynchronously.
 */
export const workspaceAssets = createRoot(() => {
  // Store for asynchronous thumbnails to maintain high reactivity in the list structure
  const [thumbnails, setThumbnails] = createStore<Record<string, string>>({});

  // Synchronous derivation of used assets
  const assets = createMemo(() => {
    const list: Asset[] = [];
    const seenIds = new Set<string>();
    const firstUsage = new Map<string, number>();

    const pages = state.pages;
    const originals = state.originals;
    const ops = state.operations.slice(0, state.historyIndex);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const original = originals.find((o) => o.id === page.originalId);
      if (!original) continue;

      const pageRefs = original.assetUsage?.[page.originalPageIndex] || [];
      for (const ref of pageRefs) {
        const assetId = `${original.id}:${ref}`;

        // Check if deleted via operations
        const isDeleted = ops.some(
          (op) =>
            op.type === 'DELETE_IMAGE' &&
            op.originalId === original.id &&
            op.imageRefs.includes(ref),
        );
        if (isDeleted) continue;

        if (!seenIds.has(assetId)) {
          seenIds.add(assetId);
          firstUsage.set(assetId, i);
          const disc = original.assets?.find((a) => a.ref === ref);
          if (disc) {
            const cacheKey = `${original.id}:${ref}`;
            list.push({
              ...disc,
              id: assetId,
              originalId: original.id,
              previewUrl: thumbnails[cacheKey] || thumbnailCache.get(cacheKey) || '',
            });
          }
        }
      }
    }

    return list.sort((a, b) => (firstUsage.get(a.id) || 0) - (firstUsage.get(b.id) || 0));
  });

  // Background thumbnails loader
  createEffect(() => {
    const current = assets();
    for (const a of current) {
      const key = `${a.originalId}:${a.ref}`;
      if (!thumbnails[key] && !thumbnailCache.has(key)) {
        getThumbnail(a.originalId, a.ref).then((url) => {
          if (url) setThumbnails(key, url);
        });
      }
    }
  });

  return assets;
});
