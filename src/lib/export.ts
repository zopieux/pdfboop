import { PDFDocument, degrees } from 'pdf-lib';
import { state } from '../state';
import { getProcessedPdfBlob } from './processed'; // Dependency!

export const generateProjectPdf = async () => {
  const outPdf = await PDFDocument.create();
  for (const page of state.pages) {
    if (!page.originalId) {
      const width = 595.28;
      const height = width * (state.workspaceRatio || 1.414);
      const blankPage = outPdf.addPage([width, height]);
      if (page.ops.rotation !== 0) blankPage.setRotation(degrees(page.ops.rotation));
      continue;
    }
    const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
    if (!blob) continue;
    const original = state.originals.find((o) => o.id === page.originalId);
    if (!original) continue;

    const srcPdf = await PDFDocument.load(await blob.arrayBuffer());
    if (page.originalPageIndex < 0 || page.originalPageIndex >= srcPdf.getPageCount()) continue;
    const [copiedPage] = await outPdf.copyPages(srcPdf, [page.originalPageIndex]);
    const { width, height } = copiedPage.getSize();
    if (page.ops.flipH || page.ops.flipV) {
      const newPage = outPdf.addPage([width, height]);
      const embeddedPage = await outPdf.embedPage(copiedPage);
      newPage.drawPage(embeddedPage, {
        x: page.ops.flipH ? width : 0,
        y: page.ops.flipV ? height : 0,
        width: width * (page.ops.flipH ? -1 : 1),
        height: height * (page.ops.flipV ? -1 : 1),
      });
      if (page.ops.rotation !== 0) newPage.setRotation(degrees(page.ops.rotation));
    } else {
      if (page.ops.rotation !== 0)
        copiedPage.setRotation(degrees(copiedPage.getRotation().angle + page.ops.rotation));
      outPdf.addPage(copiedPage);
    }
  }
  return await outPdf.save();
};

export const exportProject = async () => {
  const bytes = await generateProjectPdf();
  const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pdfboop_export.pdf';
  a.click();
  URL.revokeObjectURL(url);
};
