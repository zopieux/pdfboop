import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';

/**
 * Compresses an image blob to a target quality (0-1).
 */
export const compressImageBlob = async (blob: Blob, quality: number, width?: number, height?: number): Promise<Blob> => {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    // If quality is very low, we could also downscale, 
    // but the user only mentioned "quality" slider.
    // The previous implementation used DPI. 
    // Let's stick to quality for now as requested.
    canvas.width = width || img.width;
    canvas.height = height || img.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};
