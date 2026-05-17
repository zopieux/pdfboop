import { createEffect, createMemo, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import { extractAssetPreview } from './lib/extraction';
import { getOriginalBlob, state } from './state';
import type { Asset } from './types';

// ─── Asset thumbnail cache with memory cap ────────────────────────────────────

/** Cap for all asset preview data-URLs stored in memory. */
const ASSET_CACHE_QUOTA_BYTES = 100 * 1024 * 1024;
/** Max simultaneous asset extractions. */
const MAX_CONCURRENT = 5;

/**
 * Simple byte-tracked cache for asset thumbnail data-URLs.
 * Entries are never evicted (assets are deliberately kept stable once loaded);
 * instead, new requests are refused once the quota is full so that the browser
 * is not asked to decode/store more data than can safely fit in RAM.
 */
class AssetThumbnailCache {
  private readonly store = new Map<string, string>();
  private usedBytes = 0;

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  /**
   * Try to insert a new data-URL.  Returns false and does NOT store anything
   * when the quota would be exceeded by this entry.
   */
  trySet(key: string, dataUrl: string): boolean {
    if (this.store.has(key)) return true; // already stored

    // Rough byte estimate: each UTF-16 char ≈ 1 byte for base64 ASCII.
    const bytes = dataUrl.length;
    if (this.usedBytes + bytes > ASSET_CACHE_QUOTA_BYTES) return false;

    this.store.set(key, dataUrl);
    this.usedBytes += bytes;
    return true;
  }

  /** Whether the next insertion would exceed the quota (conservative check). */
  get isFull(): boolean {
    return this.usedBytes >= ASSET_CACHE_QUOTA_BYTES;
  }

  get usedBytesValue(): number {
    return this.usedBytes;
  }
}

const thumbnailCache = new AssetThumbnailCache();

// ─── Concurrency-limited Asset Extraction Queue ────────────────────────────────

type AssetQueueItem = {
  originalId: string;
  ref: string;
  resolve: (res: { url: string; overLimit: boolean }) => void;
};

class AssetExtractionQueue {
  private queue: AssetQueueItem[] = [];
  private activeCount = 0;

  enqueue(originalId: string, ref: string): Promise<{ url: string; overLimit: boolean }> {
    return new Promise((resolve) => {
      this.queue.push({ originalId, ref, resolve });
      this.pump();
    });
  }

  private async pump() {
    if (this.activeCount >= MAX_CONCURRENT || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;
    this.activeCount++;

    try {
      const cacheKey = `${item.originalId}:${item.ref}`;

      if (thumbnailCache.has(cacheKey)) {
        item.resolve({ url: thumbnailCache.get(cacheKey) ?? '', overLimit: false });
        return;
      }

      if (thumbnailCache.isFull) {
        // Refuse to fetch if the cache is already at capacity.
        item.resolve({ url: '', overLimit: true });
        return;
      }

      const blob = await getOriginalBlob(item.originalId);
      if (!blob) {
        item.resolve({ url: '', overLimit: false });
        return;
      }

      const preview = await extractAssetPreview(blob, item.ref);
      if (!preview) {
        item.resolve({ url: '', overLimit: false });
        return;
      }

      const stored = thumbnailCache.trySet(cacheKey, preview);
      if (!stored) {
        item.resolve({ url: '', overLimit: true });
        return;
      }

      item.resolve({ url: preview, overLimit: false });
    } catch (err) {
      console.error('Asset extraction error in queue:', err);
      item.resolve({ url: '', overLimit: false });
    } finally {
      this.activeCount--;
      this.pump();
    }
  }
}

const assetExtractionQueue = new AssetExtractionQueue();

async function getThumbnail(
  originalId: string,
  ref: string,
): Promise<{ url: string; overLimit: boolean }> {
  return assetExtractionQueue.enqueue(originalId, ref);
}

// ─── Asset type with over-limit flag ─────────────────────────────────────────

/** An asset that could not be loaded because the memory cap was reached. */
export interface OverLimitAsset {
  id: string;
  overLimit: true;
}

export type WorkspaceAsset = Asset | OverLimitAsset;

// ─── Reactive workspace assets ────────────────────────────────────────────────

/**
 * workspaceAssets is a globally reactive list of assets currently in use.
 * It is derived synchronously from state.pages to ensure high reactivity,
 * with thumbnails loaded asynchronously.
 *
 * Assets that could not be loaded due to the 700 MB memory cap are returned
 * as `OverLimitAsset` entries with `overLimit: true`.
 */
export const workspaceAssets = createRoot(() => {
  // Keyed store for async thumbnails { cacheKey → url }
  const [thumbnails, setThumbnails] = createStore<Record<string, string>>({});
  // Keyed store for assets whose preview exceeded the cap { cacheKey → true }
  const [overLimitFlags, setOverLimitFlags] = createStore<Record<string, true>>({});

  // Synchronous derivation of used assets
  const assets = createMemo(() => {
    const list: WorkspaceAsset[] = [];
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

            if (overLimitFlags[cacheKey]) {
              list.push({ id: assetId, overLimit: true });
            } else {
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
    }

    return list.sort((a, b) => (firstUsage.get(a.id) || 0) - (firstUsage.get(b.id) || 0));
  });

  // Background thumbnails loader
  createEffect(() => {
    const current = assets();
    for (const a of current) {
      if ('overLimit' in a && a.overLimit) continue; // already known over-limit

      const fullAsset = a as Asset;
      const key = `${fullAsset.originalId}:${fullAsset.ref}`;
      if (thumbnails[key] || thumbnailCache.has(key) || overLimitFlags[key]) continue;

      getThumbnail(fullAsset.originalId, fullAsset.ref).then(({ url, overLimit }) => {
        if (overLimit) {
          setOverLimitFlags(key, true);
        } else if (url) {
          setThumbnails(key, url);
        }
      });
    }
  });

  return assets;
});
