import * as pdfjs from 'pdfjs-dist';
import { state } from '../state';
import type { Page } from '../types';
import { resolveGeometry } from './geo';
import { getProcessedPdfBlob } from './processed';
import { sharedPdfWorker } from './worker';

const thumbnailCache = new Map<string, HTMLCanvasElement>();

/**
 * Internal helper to render a PRISTINE page from a PDF blob to a canvas
 * without any rotation/flip operations applied.
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

    // Calculate scale to match targetWidth * devicePixelRatio
    const unscaledViewport = pdfPage.getViewport({ scale: 1.0 });
    const desiredWidth = targetWidth * (window.devicePixelRatio || 1);
    const scale = desiredWidth / unscaledViewport.width;

    // Cap scale to avoid excessive memory usage (e.g. max 4x or 3000px)
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

export const renderPreview = async (
  page: Page,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  signal?: AbortSignal,
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Handle blank pages
  if (!page.originalId) {
    const dpr = window.devicePixelRatio || 1;
    const geo = resolveGeometry(
      page.originalSize,
      state.operations.slice(0, state.historyIndex),
      page.id,
    );
    canvas.width = Math.round(targetWidth * dpr);
    canvas.height = Math.round(canvas.width * (geo.canvasHeight / geo.canvasWidth));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // 2. Resolve the structurally-correct blob
  const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
  if (!blob || signal?.aborted) return;

  // 3. Check/Update thumbnail cache for the PRISTINE base page
  const structuralOps = state.operations
    .slice(0, state.historyIndex)
    .filter(
      (op) =>
        (op.type === 'REPLACE_IMAGE' || op.type === 'DELETE_IMAGE') &&
        op.originalId === page.originalId,
    );

  // Bucket targetWidth to avoid constant re-rendering during smooth resizing
  const bucket =
    targetWidth < 300 ? 250 : targetWidth < 600 ? 500 : targetWidth < 1200 ? 1000 : 2000;
  const original = state.originals.find((o) => o.id === page.originalId);
  const version = original?.version ?? 0;
  const cacheKey = `${page.originalId}:${page.originalPageIndex}:${bucket}:${version}:${JSON.stringify(structuralOps)}`;

  let baseCanvas: HTMLCanvasElement | null | undefined = thumbnailCache.get(cacheKey);
  if (!baseCanvas) {
    baseCanvas = await renderBasePageToCanvas(blob, page.originalPageIndex, bucket, signal);
    if (baseCanvas) {
      thumbnailCache.set(cacheKey, baseCanvas);
      // Prune cache if it gets too large (e.g. > 100 entries)
      if (thumbnailCache.size > 100) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey) thumbnailCache.delete(firstKey);
      }
    }
  }

  if (!baseCanvas || signal?.aborted) return;

  // 4. Draw the base thumbnail onto the target canvas
  const dpr = window.devicePixelRatio || 1;

  // Resolve geometry in the page's TRUE coordinate space (PDF points / image pixels),
  // exactly as export does. This ensures the matrix matches the recorded operations.
  const geo = resolveGeometry(
    page.originalSize,
    state.operations.slice(0, state.historyIndex),
    page.id,
  );

  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetWidth * (geo.canvasHeight / geo.canvasWidth) * dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The matrix maps from page.originalSize coords → paper coords (geo.canvasWidth × geo.canvasHeight).
  // The bitmap is in baseCanvas pixel coords (baseCanvas.width × baseCanvas.height).
  // We need: bitmap coords → page.originalSize coords → paper coords → canvas pixel coords.
  //
  // bitmap → originalSize scale:
  const bsx = page.originalSize.width / baseCanvas.width;
  const bsy = page.originalSize.height / baseCanvas.height;
  // paper → canvas pixel scale:
  const psx = canvas.width / geo.canvasWidth;
  const psy = canvas.height / geo.canvasHeight;

  // Combined: canvas_pixel = P · M · B · bitmap
  // Where B = scale(bsx, bsy), M = geo.matrix, P = scale(psx, psy)
  // Since all are linear:  T = P · M · B
  // T.a = psx * m.a * bsx,  T.b = psx * m.b * bsy, T.c = psx * m.c
  // T.d = psy * m.d * bsx,  T.e = psy * m.e * bsy, T.f = psy * m.f
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
