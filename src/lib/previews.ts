import * as pdfjs from 'pdfjs-dist';
import { state } from '../state';
import type { Page } from '../types';
import { resolveGeometry } from './geo';
import { type RenderPriority, renderQueue, thumbnailCache } from './previewCache';
import { getProcessedPdfBlob } from './processed';
import { sharedPdfWorker } from './worker';

/**
 * Render a PRISTINE page from a PDF blob to an offscreen canvas.
 * No rotation/flip is applied — that's handled at draw time via the geometry matrix.
 */
const renderBasePageToCanvas = async (
  blob: Blob,
  pageIndex: number,
  targetWidth: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement | null> => {
  const loadingTask = pdfjs.getDocument({
    data: await blob.arrayBuffer(),
    worker: sharedPdfWorker || undefined,
  });

  if (signal) {
    signal.addEventListener('abort', () => loadingTask.destroy().catch(() => {}), { once: true });
  }

  try {
    const pdf = await loadingTask.promise;
    if (signal?.aborted) return null;

    // PDF.js uses 1-based indexing
    const pdfPage = await pdf.getPage(pageIndex + 1);
    if (signal?.aborted) return null;

    const unscaledViewport = pdfPage.getViewport({ scale: 1.0 });
    const desiredWidth = targetWidth * (window.devicePixelRatio || 1);
    const scale = desiredWidth / unscaledViewport.width;
    // Cap to avoid runaway memory (max 4× or 3000 px)
    const finalScale = Math.min(scale, 3000 / unscaledViewport.width, 4);

    const viewport = pdfPage.getViewport({ scale: finalScale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
    if (signal) {
      signal.addEventListener('abort', () => renderTask.cancel(), { once: true });
    }
    await renderTask.promise;
    return canvas;
  } catch (e: any) {
    if (
      e?.name === 'RenderingCancelledException' ||
      e?.message?.includes('Worker was destroyed') ||
      e?.message?.includes('Transport destroyed') ||
      e?.message?.includes('Loading aborted')
    ) {
      return null;
    }
    console.error('Base PDF render error:', e);
    return null;
  }
};

/**
 * Apply a cached base canvas onto a display canvas, applying the page's
 * geometry (rotation / flip) via the resolved transform matrix.
 */
const applyBaseToCanvas = (
  baseCanvas: HTMLCanvasElement,
  displayCanvas: HTMLCanvasElement,
  page: Page,
  targetWidth: number,
): void => {
  const ctx = displayCanvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const geo = resolveGeometry(
    page.originalSize,
    state.operations.slice(0, state.historyIndex),
    page.id,
  );

  displayCanvas.width = Math.round(targetWidth * dpr);
  displayCanvas.height = Math.round(targetWidth * (geo.canvasHeight / geo.canvasWidth) * dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

  // bitmap → originalSize scale
  const bsx = page.originalSize.width / baseCanvas.width;
  const bsy = page.originalSize.height / baseCanvas.height;
  // paper → canvas pixel scale
  const psx = displayCanvas.width / geo.canvasWidth;
  const psy = displayCanvas.height / geo.canvasHeight;

  const m = geo.matrix;
  ctx.save();
  ctx.setTransform(
    psx * m.a * bsx,
    psy * m.d * bsx,
    psx * m.b * bsy,
    psy * m.e * bsy,
    psx * m.c,
    psy * m.f,
  );
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.restore();
};

/** Compute the cache key for a page's base (pristine) canvas. */
export const computePreviewKey = (page: Page, bucket: number): string => {
  const structuralOps = state.operations
    .slice(0, state.historyIndex)
    .filter(
      (op) =>
        (op.type === 'REPLACE_IMAGE' || op.type === 'DELETE_IMAGE') &&
        op.originalId === page.originalId,
    );
  const original = state.originals.find((o) => o.id === page.originalId);
  const version = original?.version ?? 0;
  return `${page.originalId}:${page.originalPageIndex}:${bucket}:${version}:${JSON.stringify(structuralOps)}`;
};

/**
 * Two size buckets:
 * - Small/medium zoom → 500 px (CSS upscaling at thumbnail sizes is fine)
 * - Large zoom (user wants detail) → 1500 px
 */
export const getBucket = (targetWidth: number): number => (targetWidth < 600 ? 500 : 1500);

/**
 * Request a preview render for `page`, drawing the result into `displayCanvas`.
 * Uses the render queue (priority-ordered, max 2 concurrent) and the LRU cache.
 *
 * Returns a cancel function; call it in onCleanup.
 */
export const renderPreview = (
  page: Page,
  displayCanvas: HTMLCanvasElement,
  targetWidth: number,
  priority: RenderPriority = 'visible',
  pinned = false,
  signal?: AbortSignal,
): (() => void) => {
  const ctx = displayCanvas.getContext('2d');
  if (!ctx) return () => {};

  // Blank pages — render synchronously, no queue needed
  if (!page.originalId) {
    const dpr = window.devicePixelRatio || 1;
    const geo = resolveGeometry(
      page.originalSize,
      state.operations.slice(0, state.historyIndex),
      page.id,
    );
    displayCanvas.width = Math.round(targetWidth * dpr);
    displayCanvas.height = Math.round(displayCanvas.width * (geo.canvasHeight / geo.canvasWidth));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    return () => {};
  }

  const bucket = getBucket(targetWidth);
  const key = computePreviewKey(page, bucket);

  // Build the render function (called lazily by the queue)
  const renderFn = async (): Promise<HTMLCanvasElement | null> => {
    const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
    if (!blob || signal?.aborted) return null;
    return renderBasePageToCanvas(blob, page.originalPageIndex, bucket, signal);
  };

  const onDone = (baseCanvas: HTMLCanvasElement) => {
    if (signal?.aborted) return;
    applyBaseToCanvas(baseCanvas, displayCanvas, page, targetWidth);
  };

  // If we already have a cached base canvas, apply it immediately
  // (renderQueue.request also does this, but doing it here avoids a microtask)
  const cached = thumbnailCache.get(key);
  if (cached) {
    applyBaseToCanvas(cached, displayCanvas, page, targetWidth);
    return () => {};
  }

  renderQueue.request(key, priority, renderFn, onDone, pinned);
  return () => renderQueue.cancel(key, onDone);
};

/**
 * Speculatively warm the cache for a page without a display canvas.
 * Safe to call for pages not currently mounted in the virtualiser.
 */
export const warmupPreview = (
  page: Page,
  targetWidth: number,
  priority: RenderPriority = 'speculative',
  pinned = false,
): (() => void) => {
  if (!page.originalId) return () => {};

  const bucket = getBucket(targetWidth);
  const key = computePreviewKey(page, bucket);
  if (thumbnailCache.has(key)) return () => {}; // already warm

  const renderFn = async (): Promise<HTMLCanvasElement | null> => {
    const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
    if (!blob) return null;
    return renderBasePageToCanvas(blob, page.originalPageIndex, bucket);
  };

  const noop = () => {};
  renderQueue.request(key, priority, renderFn, noop, pinned);
  return () => renderQueue.cancel(key, noop);
};
