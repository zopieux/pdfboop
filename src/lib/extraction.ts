import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { state, originalAssetCache } from '../state';
import type { Page, OriginalFile, Asset } from '../types';

/**
 * Pure extraction logic that finds images painted on the active workspace pages.
 */
export const getAssetsForWorkspace = async (
  pages: Page[],
  originals: OriginalFile[],
  getProcessedPdfBlob: (id: string) => Promise<Blob | null>,
): Promise<Asset[]> => {
  const assets: Asset[] = [];
  const seenIds = new Set<string>();

  // Group workspace pages by original file to avoid redundant PDF loading
  const originalToPages = new Map<string, Set<number>>();
  for (const page of pages) {
    if (!page.originalId) continue;
    if (!originalToPages.has(page.originalId)) {
      originalToPages.set(page.originalId, new Set());
    }
    originalToPages.get(page.originalId)!.add(page.originalPageIndex);
  }

  for (const [originalId, pageIndices] of originalToPages.entries()) {
    const original = originals.find((o) => o.id === originalId);
    if (!original) continue;

    // Everything is a PDF now (images are wrapped upon upload)
    const blob = await getProcessedPdfBlob(original.id);
    if (!blob) continue;
    
    const arrayBuffer = await blob.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const { sharedPdfWorker } = await import('./worker');
    const loadingTask = pdfjs.getDocument({ 
      data: pdfBytes.slice(0),
      worker: sharedPdfWorker || undefined 
    });
    const pdf = await loadingTask.promise;
    const pdfLibDoc = await PDFDocument.load(pdfBytes.slice(0));

    for (const pageIndex of pageIndices) {
      if (pageIndex < 0 || pageIndex >= pdfLibDoc.getPageCount()) continue;
      
      const pdfPage = await pdf.getPage(pageIndex + 1);
      const pdfLibPage = pdfLibDoc.getPage(pageIndex);
      
      const resourcesDict = pdfLibPage.node.lookup(PDFName.of('Resources'), PDFDict);
      if (!resourcesDict) continue;

      const ops = await pdfPage.getOperatorList();
      const paintedNames = new Set<string>();
      
      const OPS = (pdfjs as any).OPS || {};
      const imageSubtypes = new Set([OPS.paintXObject, OPS.paintImageXObject, OPS.paintInlineImageXObject]);

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (imageSubtypes.has(fn)) {
          const args = ops.argsArray[i];
          if (args && typeof args[0] === 'string') {
            paintedNames.add(args[0]);
          }
        }
      }

      // Pre-extract all images from PDF.js for this page to allow dimension matching
      const pdfJsImages: Array<{ name: string; width: number; height: number; data: any }> = [];
      for (const name of paintedNames) {
        try {
          // Use the callback-based get to wait for resolution without polling
          const imgObj: any = await new Promise((resolve) => {
            try {
              const res = (pdfPage.objs as any).get(name, (obj: any) => resolve(obj));
              if (res) resolve(res);
            } catch { resolve(null); }
            setTimeout(() => resolve(null), 5000); // 5s safety
          }) || ((pdfPage as any).commonObjs?.get(name));

          if (imgObj) {
            const data = imgObj.data || imgObj.bitmap;
            if (data) {
              pdfJsImages.push({ name, width: imgObj.width, height: imgObj.height, data });
            }
          }
        } catch (e) {}
      }

      const imageRefsToExtract = new Map<string, string>();
      const seenDicts = new Set<any>();
      const collectImages = (dict: PDFDict) => {
        if (seenDicts.has(dict)) return;
        seenDicts.add(dict);

        const xObjects = pdfLibDoc.context.lookupMaybe(dict.get(PDFName.of('XObject')), PDFDict);
        if (!xObjects) return;
        for (const [name, ref] of xObjects.entries()) {
          const refStr = ref.toString();
          const obj = pdfLibDoc.context.lookup(ref);
          let subDict: PDFDict | undefined;
          
          const isStream = obj && (typeof (obj as any).getContents === 'function' || !!(obj as any).contents);
          if (obj instanceof PDFDict) subDict = obj;
          else if (isStream) subDict = (obj as any).dict;
          
          if (!subDict) continue;

          const subtype = subDict.get(PDFName.of('Subtype'));
          const subtypeStr = (subtype as any)?.asString?.() || subtype?.toString?.();

          if (subtypeStr === 'Image' || subtypeStr === '/Image') {
            const rName = name.asString().replace(/^\//, '');
            imageRefsToExtract.set(refStr, rName);
          } else if (subtypeStr === 'Form' || subtypeStr === '/Form') {
            const subRes = pdfLibDoc.context.lookupMaybe(subDict.get(PDFName.of('Resources')), PDFDict);
            if (subRes) collectImages(subRes);
          }
        }
      };
      
      if (resourcesDict) collectImages(resourcesDict);

      for (const [ref, imgName] of imageRefsToExtract.entries()) {
        const id = `${original.id}:${ref}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        let asset: Asset | null = null;
        
        // 1. Try PDF-Lib direct extraction for JPEGs
        const parts = ref.split(' ');
        const obj = pdfLibDoc.context.lookup(PDFRef.of(parseInt(parts[0]), parseInt(parts[1])));
        const isStream = obj && (typeof (obj as any).getContents === 'function' || !!(obj as any).contents);
        
        if (isStream) {
          const filter = (obj as any).dict?.get(PDFName.of('Filter'));
          const filterStr = (filter as any)?.asString?.() || filter?.toString?.();
          
          const isDCT = filterStr === 'DCTDecode' || filterStr === '/DCTDecode' || filterStr === 'DCT' || filterStr === '/DCT' ||
                        (Array.isArray(filter) && filter.some((f: any) => {
                          const fs = f?.asString?.() || f?.toString?.();
                          return fs === 'DCTDecode' || fs === '/DCTDecode' || fs === 'DCT' || fs === '/DCT';
                        }));
          
          if (isDCT) {
            try {
              const dict = (obj as any)?.dict || (obj instanceof PDFDict ? obj : null);
              if (!dict) throw new Error('Object has no dictionary');

              const width = dict.get(PDFName.of('Width'))?.asNumber() || 
                            dict.get(PDFName.of('W'))?.asNumber();
              const height = dict.get(PDFName.of('Height'))?.asNumber() || 
                             dict.get(PDFName.of('H'))?.asNumber();
              
              let contents: Uint8Array;
              if (typeof (obj as any).getContents === 'function') {
                contents = (obj as any).getContents();
              } else {
                contents = (obj as any).contents;
              }

              if (!contents) throw new Error('Stream has no contents');

              const previewUrl = await blobToDataURL(new Blob([contents as any], { type: 'image/jpeg' }));
              const dimensions = (width && height) 
                ? { width, height } 
                : await getImageDimensions(previewUrl);

              asset = {
                id,
                originalId: original.id,
                imageRef: ref,
                previewUrl,
                width: dimensions.width,
                height: dimensions.height,
              };
            } catch (e) {
              console.warn(`Failed to extract JPEG from ${ref}:`, e);
            }
          }
        }

        // 2. Fallback to PDF.js for other types
        if (!asset) {
          try {
            const width = (obj as any)?.dict?.get(PDFName.of('Width'))?.asNumber() || 
                         (obj as any)?.dict?.get(PDFName.of('W'))?.asNumber();
            const height = (obj as any)?.dict?.get(PDFName.of('Height'))?.asNumber() || 
                          (obj as any)?.dict?.get(PDFName.of('H'))?.asNumber();

            // Try exact name match first
            let bestMatch = pdfJsImages.find(img => img.name === imgName || img.name === `/${imgName}`);
            
            // If not found (likely due to pdf.js mangling), match by dimensions
            if (!bestMatch && width && height) {
              bestMatch = pdfJsImages.find(img => img.width === width && img.height === height);
            }

            if (bestMatch) {
              asset = {
                id,
                originalId: original.id,
                imageRef: ref,
                previewUrl: imageDataToDataURL(bestMatch.data, bestMatch.width, bestMatch.height),
                width: bestMatch.width,
                height: bestMatch.height,
              };
            }
          } catch (e) {
            console.warn(`Fallback extraction failed for ${ref}:`, e);
          }
        }

        if (asset) {
          assets.push(asset);
          
          // If this is the 100% version, cache it as a source for future compression
          if (!original.assetQualities?.[ref] || original.assetQualities[ref] === 100) {
            const cacheKey = `${original.id}:${ref}`;
            if (!originalAssetCache.has(cacheKey)) {
              // Convert the extracted preview back to a blob for the compression lib to use
              fetch(asset.previewUrl)
                .then(r => r.blob())
                .then(blob => {
                  originalAssetCache.set(cacheKey, {
                    blob,
                    width: asset.width,
                    height: asset.height
                  });
                })
                .catch(() => {});
            }
          }
        }
      }
    }
  }

  return assets;
};

// --- Helpers ---

const blobToDataURL = (blob: Blob): Promise<string> => 
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => reject(new Error('Image dimensions timeout')), 5000);
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image for dimensions'));
    };
    img.src = url;
  });

const imageDataToDataURL = (data: any, width: number, height: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  if (data instanceof ImageBitmap || (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap)) {
    ctx.drawImage(data, 0, 0);
  } else {
    const imageData = ctx.createImageData(width, height);
    if (data.data) {
        imageData.data.set(data.data);
    } else {
        imageData.data.set(data);
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL('image/webp', 0.8);
};
