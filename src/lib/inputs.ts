import { PDFDocument } from 'pdf-lib';
import { cacheOriginal, state, setState, pushOperation, getOriginColor, reuploadOriginal } from '../state';
import { discoverAssets } from './extraction';

export const convertToJpg = async (file: Blob | File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/jpeg', 0.95);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};

export const wrapImageInPdf = async (file: File | Blob): Promise<Blob> => {
  const jpgBlob = await convertToJpg(file);
  const data = await jpgBlob.arrayBuffer();
  
  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(data);

  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, {
    x: 0,
    y: 0,
    width: img.width,
    height: img.height,
  });
  
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
};

export const processUpload = async (files: FileList) => {
  for (const file of Array.from(files)) {
    const id = crypto.randomUUID();
    const isActuallyPdf = file.type === 'application/pdf';
    
    let blobToCache: Blob = file;
    let pageCount = 0;
    const pageRatios: number[] = [];

    if (isActuallyPdf) {
      const data = await file.arrayBuffer();
      const pdf = await PDFDocument.load(data);
      pageCount = pdf.getPageCount();
      for (let i = 0; i < pageCount; i++) {
        const p = pdf.getPage(i);
        const { width, height } = p.getSize();
        pageRatios.push(height / width);
      }
    } else if (file.type.startsWith('image/')) {
      const jpgBlob = await convertToJpg(file);
      const img = new Image();
      const url = URL.createObjectURL(jpgBlob);
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = url;
      });
      pageRatios.push(img.height / img.width);
      URL.revokeObjectURL(url);

      blobToCache = await wrapImageInPdf(jpgBlob);
      pageCount = 1;
    } else {
      continue;
    }

    await cacheOriginal(id, blobToCache);

    // DISCOVERY
    const { assets, assetUsage } = await discoverAssets(blobToCache);

    const original = {
      id,
      name: file.name,
      size: file.size,
      type: (isActuallyPdf ? 'pdf' : 'image') as 'pdf' | 'image',
      pageCount,
      color: getOriginColor(state.originals.length),
      evicted: false,
      pageRatios,
      version: 0,
      assets,
      assetUsage,
      assetQualities: {},
      assetScales: {},
    };

    setState('originals', (o) => [...o, original]);
    
    if (state.pages.length === 0 && pageRatios.length > 0) {
      setState('workspaceRatio', pageRatios[0]);
    }

    pushOperation({ type: 'APPEND_ORIGINAL', originalId: id, instanceId: crypto.randomUUID() } as any);
  }
};

export const handleReupload = async (id: string, file: File) => {
  const isActuallyPdf = file.type === 'application/pdf';
  let fileToCache: File | Blob = file;
  let pageCount = 1;
  const pageRatios: number[] = [];

  if (isActuallyPdf) {
    const data = await file.arrayBuffer();
    const pdf = await PDFDocument.load(data);
    pageCount = pdf.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const p = pdf.getPage(i);
      const { width, height } = p.getSize();
      pageRatios.push(height / width);
    }
  } else if (file.type.startsWith('image/')) {
    const jpgBlob = await convertToJpg(file);
    const img = new Image();
    const url = URL.createObjectURL(jpgBlob);
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = url;
    });
    pageRatios.push(img.height / img.width);
    URL.revokeObjectURL(url);
    fileToCache = await wrapImageInPdf(jpgBlob);
    pageCount = 1;
  }

  // DISCOVERY on re-upload
  const { assets, assetUsage } = await discoverAssets(fileToCache);

  await reuploadOriginal(id, fileToCache, { name: file.name, size: file.size }, pageCount);
  
  setState('originals', (o) => o.id === id, (o) => ({
    ...o,
    pageRatios,
    assets,
    assetUsage,
  }));
};
