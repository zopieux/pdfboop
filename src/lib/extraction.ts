import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import type { DiscoveredAsset } from '../types';

/**
 * Discovers all unique assets in a PDF blob and maps them to pages.
 */
export const discoverAssets = async (
  blob: Blob,
): Promise<{ assets: DiscoveredAsset[]; assetUsage: Record<number, string[]> }> => {
  const assets: DiscoveredAsset[] = [];
  const assetUsage: Record<number, string[]> = {};
  const seenRefs = new Set<string>();

  const arrayBuffer = await blob.arrayBuffer();
  const { sharedPdfWorker } = await import('./worker');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer).slice(0),
    worker: sharedPdfWorker || undefined,
  });

  try {
    await loadingTask.promise;
  } catch (_e) {
    return { assets: [], assetUsage: {} };
  }

  const pdfLibDoc = await PDFDocument.load(new Uint8Array(arrayBuffer).slice(0));

  for (let i = 0; i < pdfLibDoc.getPageCount(); i++) {
    const pdfLibPage = pdfLibDoc.getPage(i);
    const pageRefs = new Set<string>();

    // Recursive resource collector
    const collectFromResources = (dict: PDFDict, depth = 0) => {
      if (depth > 10) return;

      const xObjects = pdfLibDoc.context.lookupMaybe(dict.get(PDFName.of('XObject')), PDFDict);
      if (!xObjects) return;

      for (const [_, ref] of xObjects.entries()) {
        if (!(ref instanceof PDFRef)) continue;
        const refStr = ref.toString();
        const obj = pdfLibDoc.context.lookup(ref);

        const subDict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
        if (!subDict) continue;

        const subtype = subDict.get(PDFName.of('Subtype'))?.toString();
        if (subtype === '/Image' || subtype === 'Image') {
          pageRefs.add(refStr);

          if (!seenRefs.has(refStr)) {
            seenRefs.add(refStr);
            const width =
              pdfLibDoc.context
                .lookupMaybe(
                  subDict.get(PDFName.of('Width')) || subDict.get(PDFName.of('W')),
                  PDFNumber,
                )
                ?.asNumber() || 0;
            const height =
              pdfLibDoc.context
                .lookupMaybe(
                  subDict.get(PDFName.of('Height')) || subDict.get(PDFName.of('H')),
                  PDFNumber,
                )
                ?.asNumber() || 0;
            assets.push({ ref: refStr, width, height });
          }
        } else if (subtype === '/Form' || subtype === 'Form') {
          const subRes = pdfLibDoc.context.lookupMaybe(
            subDict.get(PDFName.of('Resources')),
            PDFDict,
          );
          if (subRes) collectFromResources(subRes, depth + 1);
        }
      }
    };

    const resourcesObj = pdfLibPage.node.lookup(PDFName.of('Resources'));
    const resources = pdfLibDoc.context.lookupMaybe(resourcesObj, PDFDict);
    if (resources) collectFromResources(resources);

    assetUsage[i] = Array.from(pageRefs);
  }

  await loadingTask.destroy();
  return { assets, assetUsage };
};

/**
 * Deep clones a PDF object from srcDoc into dstDoc, tracking and copying all referenced objects.
 */
function cloneObject(
  srcDoc: PDFDocument,
  dstDoc: PDFDocument,
  srcRef: PDFRef,
  refMap: Map<string, PDFRef>,
): PDFRef {
  const srcRefStr = srcRef.toString();
  if (refMap.has(srcRefStr)) return refMap.get(srcRefStr)!;

  const dstRef = dstDoc.context.nextRef();
  refMap.set(srcRefStr, dstRef);

  const srcObj = srcDoc.context.lookup(srcRef);

  const cloneAny = (val: any): any => {
    if (val instanceof PDFRef) {
      return cloneObject(srcDoc, dstDoc, val, refMap);
    } else if (val instanceof PDFDict) {
      const newDict = dstDoc.context.obj({});
      for (const [key, v] of val.entries()) {
        newDict.set(key, cloneAny(v));
      }
      return newDict;
    } else if (val instanceof PDFArray) {
      const newArr = dstDoc.context.obj([]);
      for (let i = 0; i < val.size(); i++) {
        newArr.push(cloneAny(val.get(i)));
      }
      return newArr;
    } else if (val instanceof PDFStream) {
      const newDict = cloneAny(val.dict);
      const newStream = dstDoc.context.stream(val.getContents(), newDict);
      return newStream;
    }
    return val;
  };

  dstDoc.context.assign(dstRef, cloneAny(srcObj));
  return dstRef;
}

/**
 * Extracts a high-quality preview for an asset by rendering it in a temporary one-page PDF.
 */
export const extractAssetPreview = async (
  blob: Blob,
  refStr: string,
  limitScale?: number,
): Promise<string> => {
  let loadingTask: any = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const srcDoc = await PDFDocument.load(new Uint8Array(arrayBuffer).slice(0));

    const parts = refStr.split(' ');
    const srcRef = PDFRef.of(parseInt(parts[0], 10), parseInt(parts[1], 10));
    const assetObj = srcDoc.context.lookup(srcRef);
    if (!(assetObj instanceof PDFStream)) return '';

    const width =
      srcDoc.context
        .lookupMaybe(
          assetObj.dict.get(PDFName.of('Width')) || assetObj.dict.get(PDFName.of('W')),
          PDFNumber,
        )
        ?.asNumber() || 100;
    const height =
      srcDoc.context
        .lookupMaybe(
          assetObj.dict.get(PDFName.of('Height')) || assetObj.dict.get(PDFName.of('H')),
          PDFNumber,
        )
        ?.asNumber() || 100;

    const tempDoc = await PDFDocument.create();
    const refMap = new Map<string, PDFRef>();
    const tempRef = cloneObject(srcDoc, tempDoc, srcRef, refMap);

    const page = tempDoc.addPage([width, height]);
    page.node.set(
      PDFName.of('Resources'),
      tempDoc.context.obj({
        XObject: { AssetImg: tempRef },
      }),
    );

    const content = `q ${width} 0 0 ${height} 0 0 cm /AssetImg Do Q`;
    const contentBytes = new TextEncoder().encode(content);
    const contentStream = tempDoc.context.stream(contentBytes);
    const contentRef = tempDoc.context.register(contentStream);
    page.node.set(PDFName.of('Contents'), contentRef);

    const tempPdfBytes = await tempDoc.save();

    const { sharedPdfWorker } = await import('./worker');
    loadingTask = pdfjs.getDocument({
      data: tempPdfBytes,
      worker: sharedPdfWorker || undefined,
    });

    const pdf = await loadingTask.promise;
    const jsPage = await pdf.getPage(1);

    const scale = limitScale ?? Math.min(1.0, 300 / Math.max(width, height));
    const viewport = jsPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    await jsPage.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/webp', 0.8);

    await loadingTask.destroy();
    return dataUrl;
  } catch (e) {
    console.error('Failed to extract asset preview:', e);
    if (loadingTask) await loadingTask.destroy();
    return '';
  }
};
