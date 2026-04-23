import {
  concatTransformationMatrix,
  drawObject,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { state } from '../state';
import { resolveGeometry } from './geo';
import { getProcessedPdfBlob } from './processed';

export const generateProjectPdf = async () => {
  const outPdf = await PDFDocument.create();
  const currentOps = state.operations.slice(0, state.historyIndex);

  for (const page of state.pages) {
    if (!page.originalId) {
      const geo = resolveGeometry(page.originalSize, currentOps, page.id);
      outPdf.addPage([geo.canvasWidth, geo.canvasHeight]);
      continue;
    }

    const blob = await getProcessedPdfBlob(page.originalId, state.historyIndex);
    if (!blob) continue;

    const srcPdf = await PDFDocument.load(await blob.arrayBuffer());
    if (page.originalPageIndex < 0 || page.originalPageIndex >= srcPdf.getPageCount()) continue;
    const [copiedPage] = await outPdf.copyPages(srcPdf, [page.originalPageIndex]);
    const { width: origWidth, height: origHeight } = copiedPage.getSize();
    const origSize = { width: origWidth, height: origHeight };

    const geo = resolveGeometry(origSize, currentOps, page.id);
    const newPage = outPdf.addPage([geo.canvasWidth, geo.canvasHeight]);
    const embeddedPage = await outPdf.embedPage(copiedPage);

    // Register the XObject so we can reference it with drawObject().
    const xObjKey = newPage.node.newXObject('EmbeddedPdfPage', embeddedPage.ref);

    // Build the PDF CTM from our screen-space matrix.
    // Screen-space matrix (Y-down): V_paper = M · V_content
    // PDF CTM (Y-up): We need to convert by flipping Y on both sides.
    //
    // Let F = flip-Y matrix for canvas height H:
    //   F maps (x, y) → (x, H - y), i.e. F = [1, 0, 0, -1, 0, H]
    //
    // The PDF CTM is: F · M · F_content
    // where F_content flips Y in content space (height origH):
    //   F_content = [1, 0, 0, -1, 0, origH]
    //
    // Since M is our 3x3 matrix (using a,b,d,e for the 2x2 part and c,f for translation):
    //   M = [m.a, m.b, m.c]
    //       [m.d, m.e, m.f]
    //
    // F · M · F_content:
    //   Step 1: M' = M · F_content
    //     a' = m.a, b' = -m.b, tx' = m.b * origH + m.c
    //     d' = m.d, e' = -m.e, ty' = m.e * origH + m.f
    //
    //   Step 2: F · M'
    //     a'' = a',  b'' = b'',  tx'' = tx'
    //     d'' = -d', e'' = -e'', ty'' = H - ty'
    //
    const m = geo.matrix;
    const H = geo.canvasHeight;
    const oH = origHeight;

    // M · F_content
    const a1 = m.a;
    const b1 = -m.b;
    const tx1 = m.b * oH + m.c;
    const d1 = m.d;
    const e1 = -m.e;
    const ty1 = m.e * oH + m.f;

    // F · (M · F_content)
    // F = scale(1, -1) then translate(0, H) → [1, 0, 0, -1, 0, H]
    // Applying F to row vectors: x stays, y negates, ty becomes H - ty
    const ctmA = a1;
    const ctmB = -d1; // PDF CTM convention: [a, b, c, d, e, f] where b,c are the cross terms
    const ctmC = b1;
    const ctmD = -e1;
    const ctmE = tx1;
    const ctmF = H - ty1;

    // Apply CTM and draw the embedded page XObject.
    newPage.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(ctmA, ctmB, ctmC, ctmD, ctmE, ctmF),
      drawObject(xObjKey),
      popGraphicsState(),
    );
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
