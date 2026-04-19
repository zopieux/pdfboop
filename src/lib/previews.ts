import * as pdfjs from 'pdfjs-dist';
import { state } from '../state';
import { Page } from '../types';
import { getProcessedPdfBlob } from './processed';
import { sharedPdfWorker } from './worker';
import { PDFDocument, degrees } from 'pdf-lib';
import { vars } from '../theme';

// Relocating applyOpsToPdf here if it's only used by preview and export...
// Actually applyOpsToPdf was in pdf.ts. Let's import it from processed?
// wait, applyOpsToPdf isn't exported from processed.ts. Let's put it here and export it.
export const applyOpsToPdf = async (
  buffer: ArrayBuffer,
  pageIndex: number,
  ops: { flipH: boolean; flipV: boolean; rotation: number },
): Promise<Uint8Array | null> => {
  const srcDoc = await PDFDocument.load(buffer);
  const outDoc = await PDFDocument.create();
  if (pageIndex < 0 || pageIndex >= srcDoc.getPageCount()) return null;
  const [copiedPage] = await outDoc.copyPages(srcDoc, [pageIndex]);
  const { width, height } = copiedPage.getSize();

  if (ops.flipH || ops.flipV) {
    const newPage = outDoc.addPage([width, height]);
    const embeddedPage = await outDoc.embedPage(copiedPage);
    newPage.drawPage(embeddedPage, {
      x: ops.flipH ? width : 0,
      y: ops.flipV ? height : 0,
      width: width * (ops.flipH ? -1 : 1),
      height: height * (ops.flipV ? -1 : 1),
    });
    if (ops.rotation !== 0) newPage.setRotation(degrees(ops.rotation));
  } else {
    if (ops.rotation !== 0) {
      const currentRotation = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees(currentRotation + ops.rotation));
    }
    outDoc.addPage(copiedPage);
  }
  return await outDoc.save();
};

const thumbnailCache = new Map<string, HTMLCanvasElement>();

/**
 * Internal helper to render a PRISTINE page from a PDF blob to a canvas
 * without any rotation/flip operations applied.
 */
const renderBasePageToCanvas = async (
  blob: Blob,
  pageIndex: number,
  targetWidth: number,
  signal?: AbortSignal
): Promise<HTMLCanvasElement | null> => {
  const loadingTask = pdfjs.getDocument({ 
    data: await blob.arrayBuffer(),
    worker: sharedPdfWorker || undefined 
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
  signal?: AbortSignal
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Handle blank pages
  if (!page.originalId) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(targetWidth * dpr);
    canvas.height = Math.round(canvas.width * (state.workspaceRatio || 1.414));
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // 2. Resolve the structurally-correct blob
  const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
  if (!blob || signal?.aborted) return;

  // 3. Check/Update thumbnail cache for the PRISTINE base page
  const structuralOps = state.operations.slice(0, state.historyIndex).filter(
    (op) =>
      (op.type === 'REPLACE_IMAGE' || op.type === 'DELETE_IMAGE') &&
      op.originalId === page.originalId,
  );
  
  // Bucket targetWidth to avoid constant re-rendering during smooth resizing
  const bucket = targetWidth < 300 ? 250 : targetWidth < 600 ? 500 : targetWidth < 1200 ? 1000 : 2000;
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

  // 4. Draw the base thumbnail onto the target canvas with FAST 2D transforms
  const { rotation, flipH, flipV } = page.ops;
  const is90 = rotation % 180 !== 0;
  
  canvas.width = is90 ? baseCanvas.height : baseCanvas.width;
  canvas.height = is90 ? baseCanvas.width : baseCanvas.height;
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(baseCanvas, -baseCanvas.width / 2, -baseCanvas.height / 2);
  ctx.restore();
};
