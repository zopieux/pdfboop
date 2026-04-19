import { PDFDocument, PDFRef, PDFName, PDFStream } from 'pdf-lib';
import { state, getOriginalBlob } from '../state';
import { AbstractOperation } from '../types';
import { compressImageBlob } from './compression';
import { extractAssetPreview } from './extraction';

const processedPdfCache = new Map<string, Blob>();

export const getProcessedPdfBlob = async (originalId: string, historyIndex: number) => {
  const original = state.originals.find((o) => o.id === originalId);
  if (!original) return null;

  const structuralOps = state.operations.slice(0, historyIndex).filter(
    (op) =>
      (op.type === 'REPLACE_IMAGE' || op.type === 'DELETE_IMAGE') &&
      op.originalId === originalId,
  );
  
  const qualities = original.assetQualities || {};
  const scales = original.assetScales || {};
  const cacheKey = `${originalId}:${original.version}:${JSON.stringify(structuralOps)}:${JSON.stringify(qualities)}:${JSON.stringify(scales)}`;
  
  if (processedPdfCache.has(cacheKey)) {
    return processedPdfCache.get(cacheKey)!;
  }

  const rawBlob = await getOriginalBlob(originalId);
  if (!rawBlob) return null;

  if (structuralOps.length === 0 && Object.keys(qualities).length === 0 && Object.keys(scales).length === 0) {
    return rawBlob;
  }

  const buffer = await rawBlob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer.slice(0));
  const originalDoc = await PDFDocument.load(buffer.slice(0)); 

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

  const allRefs = new Set([...Object.keys(qualities), ...Object.keys(scales)]);
  for (const refStr of allRefs) {
    const q = (qualities[refStr] ?? 100) / 100;
    const s = scales[refStr] ?? 1.0;
    if (q < 1.0 || s < 0.99) {
      await applyTransformsToImage(pdfDoc, originalDoc, refStr, q, s, rawBlob);
    }
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  processedPdfCache.set(cacheKey, blob);
  
  for (const key of processedPdfCache.keys()) {
    if (key.startsWith(`${originalId}:`) && key !== cacheKey) {
      processedPdfCache.delete(key);
    }
  }

  return blob;
};

async function applyTransformsToImage(
  pdfDoc: PDFDocument, 
  originalDoc: PDFDocument, 
  refStr: string, 
  quality: number, 
  scale: number,
  originalBlob: Blob
) {
  try {
    const parts = refStr.split(' ');
    const ref = PDFRef.of(parseInt(parts[0]), parseInt(parts[1]));
    
    const srcObj = originalDoc.context.lookup(ref);
    if (!(srcObj instanceof PDFStream)) return;

    let width = srcObj.dict.get(PDFName.of('Width'))?.asNumber() || srcObj.dict.get(PDFName.of('W'))?.asNumber();
    let height = srcObj.dict.get(PDFName.of('Height'))?.asNumber() || srcObj.dict.get(PDFName.of('H'))?.asNumber();
    if (!width || !height) return;

    // We use the same rendering-based extraction as the preview to get DECODED pixels
    // but at 100% scale to avoid quality loss during the intermediate step.
    const decodedDataUrl = await extractAssetPreview(originalBlob, refStr, 1.0);
    if (!decodedDataUrl) return;

    const res = await fetch(decodedDataUrl);
    const decodedBlob = await res.blob();

    // Destination object in the doc we are building
    const destObj = pdfDoc.context.lookup(ref);
    if (!(destObj instanceof PDFStream)) return;

    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const compressedBlob = await compressImageBlob(decodedBlob, quality, targetW, targetH).catch(() => null);
    if (!compressedBlob) return;

    const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());
    
    if (scale >= 0.99) {
      await replaceImageAtRef(pdfDoc, refStr, compressedBytes, false);
    } else {
      const innerImage = await pdfDoc.embedJpg(compressedBytes);
      const innerRef = innerImage.ref;

      destObj.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
      destObj.dict.set(PDFName.of('BBox'), pdfDoc.context.obj([0, 0, 1, 1]));
      destObj.dict.set(PDFName.of('Resources'), pdfDoc.context.obj({
        XObject: { 'Img': innerRef }
      }));
      
      const offset = (1 - scale) / 2;
      const contentStr = `${scale.toFixed(4)} 0 0 ${scale.toFixed(4)} ${offset.toFixed(4)} ${offset.toFixed(4)} cm /Img Do`;
      const contentBytes = new TextEncoder().encode(contentStr);
      
      destObj.contents = contentBytes;
      destObj.dict.set(PDFName.of('Length'), pdfDoc.context.obj(contentBytes.length));
      destObj.dict.delete(PDFName.of('Filter'));
      destObj.dict.delete(PDFName.of('Width'));
      destObj.dict.delete(PDFName.of('Height'));
      destObj.dict.delete(PDFName.of('ColorSpace'));
      destObj.dict.delete(PDFName.of('BitsPerComponent'));
    }
  } catch (e) {
    // Silent fail
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
