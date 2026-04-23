import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export let sharedPdfWorker: pdfjs.PDFWorker | null = null;

if (typeof window !== 'undefined' && !import.meta.env.VITEST) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  sharedPdfWorker = new pdfjs.PDFWorker();
}
