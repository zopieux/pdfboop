import { PDFDocument, PDFRef, PDFName, PDFStream } from 'pdf-lib';
import { state, getOriginalBlob, originalAssetCache } from '../state';
import type { AbstractOperation } from '../types';
import { compressImageBlob } from './compression';

const processedPdfCache = new Map<string, Blob>();

export const getProcessedPdfBlob = async (originalId: string, historyIndex: number) => {
  const original = state.originals.find((o) => o.id === originalId);
  if (!original) return null;

  // 1. Identify ops that structurally change this PDF
  const structuralOps = state.operations.slice(0, historyIndex).filter(
    (op) =>
      (op.type === 'REPLACE_IMAGE' || op.type === 'DELETE_IMAGE') &&
      op.originalId === originalId,
  );
  
  // 2. Create a stable cache key including structural ops AND qualities
  const qualities = original.assetQualities || {};
  const cacheKey = `${originalId}:${original.version}:${JSON.stringify(structuralOps)}:${JSON.stringify(qualities)}`;
  
  if (processedPdfCache.has(cacheKey)) {
    return processedPdfCache.get(cacheKey)!;
  }

  // 3. Load original
  const rawBlob = await getOriginalBlob(originalId);
  if (!rawBlob) return null;

  const buffer = await rawBlob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);

  // 4. Apply structural ops
  for (const op of structuralOps) {
    if (op.type === 'REPLACE_IMAGE') {
      const replaceOp = op as Extract<AbstractOperation, { type: 'REPLACE_IMAGE' }>;
      for (let i = 0; i < replaceOp.imageRefs.length; i++) {
        const ref = replaceOp.imageRefs[i];
        const blobId = replaceOp.newBlobIds[i] || replaceOp.newBlobIds[0];
        const newBlob = await getOriginalBlob(blobId);
        if (newBlob) {
          const bytes = new Uint8Array(await newBlob.arrayBuffer());
          const isPng = newBlob.type === 'image/png';
          await replaceImageAtRef(pdfDoc, ref, bytes, isPng);
        }
      }
    } else if (op.type === 'DELETE_IMAGE') {
      const deleteOp = op as Extract<AbstractOperation, { type: 'DELETE_IMAGE' }>;
      for (const ref of deleteOp.imageRefs) {
        await deleteImageAtRef(pdfDoc, ref);
      }
    }
  }

  // 5. Apply asset qualities (compression)
  for (const [refStr, quality] of Object.entries(qualities)) {
    if (quality < 100) {
      await applyQualityToImage(pdfDoc, originalId, refStr, quality / 100);
    }
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  processedPdfCache.set(cacheKey, blob);
  
  // Cleanup old entries for this specific original
  for (const key of processedPdfCache.keys()) {
    if (key.startsWith(`${originalId}:`) && key !== cacheKey) {
      processedPdfCache.delete(key);
    }
  }

  return blob;
};

async function applyQualityToImage(pdfDoc: PDFDocument, originalId: string, refStr: string, quality: number) {
  try {
    const parts = refStr.split(' ');
    const ref = PDFRef.of(parseInt(parts[0]), parseInt(parts[1]));
    const obj = pdfDoc.context.lookup(ref);
    if (!(obj instanceof PDFStream)) return;

    let blob: Blob | null = null;
    let width: number | undefined;
    let height: number | undefined;

    // 1. Try to use the high-quality extracted version from the cache
    const cached = originalAssetCache.get(`${originalId}:${refStr}`);
    if (cached) {
      blob = cached.blob;
      width = cached.width;
      height = cached.height;
    } else {
      // 2. Fallback to extracting from stream directly (only works for JPEGs reliably in browser)
      let contents: Uint8Array;
      if (typeof (obj as any).getContents === 'function') {
        contents = (obj as any).getContents();
      } else {
        contents = (obj as any).contents;
      }
      if (!contents) return;

      const filter = obj.dict.get(PDFName.of('Filter'))?.toString();
      if (filter?.includes('DCTDecode')) {
        blob = new Blob([contents], { type: 'image/jpeg' });
      }
    }

    if (!blob) return;

    const compressedBlob = await compressImageBlob(blob, quality, width, height).catch(() => null);
    if (!compressedBlob) return;

    const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());
    await replaceImageAtRef(pdfDoc, refStr, compressedBytes, false); 
  } catch (e) {
    // Silent fail to avoid UI noise if some weird PDF stream is encountered
  }
}

export const replaceImageAtRef = async (
  pdfDoc: PDFDocument,
  imageRefStr: string,
  newImageBytes: Uint8Array,
  isPng: boolean,
) => {
  const parts = imageRefStr.split(' ');
  const imageRef = PDFRef.of(parseInt(parts[0]), parseInt(parts[1]));
  const newImage = isPng
    ? await pdfDoc.embedPng(newImageBytes)
    : await pdfDoc.embedJpg(newImageBytes);
  await newImage.embed();
  const newObj = pdfDoc.context.lookup(newImage.ref);
  if (newObj) pdfDoc.context.assign(imageRef, newObj);
};

export const deleteImageAtRef = async (pdfDoc: PDFDocument, imageRefStr: string) => {
  const parts = imageRefStr.split(' ');
  const imageRef = PDFRef.of(parseInt(parts[0]), parseInt(parts[1]));
  const transparentPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0x60, 0x00, 0x02, 0x00,
    0x00, 0x05, 0x00, 0x01, 0x0d, 0x26, 0xe5, 0x2e, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
  const newImage = await pdfDoc.embedPng(transparentPng);
  await newImage.embed();
  const newObj = pdfDoc.context.lookup(newImage.ref);
  if (newObj) pdfDoc.context.assign(imageRef, newObj);
};
