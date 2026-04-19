import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateProjectPdf } from './export';
import { state, resetState } from '../state';
import * as stateModule from '../state';

if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Mock getOriginalBlob
vi.mock('../state', async () => {
  const actual = await vi.importActual('../state');
  return {
    ...actual,
    getOriginalBlob: vi.fn(),
  };
});

// Polyfill caches
const cachesMock = {
  open: vi.fn().mockResolvedValue({
    put: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
  }),
  delete: vi.fn().mockResolvedValue(true),
  has: vi.fn().mockResolvedValue(true),
  keys: vi.fn().mockResolvedValue([]),
};
vi.stubGlobal('caches', cachesMock);

// Polyfill localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};
vi.stubGlobal('localStorage', localStorageMock);

async function createPdf(pageCount: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([100, 200]);
  }
  return await pdfDoc.save();
}

describe('PDF Manipulation (Real Files)', () => {
  beforeEach(() => {
    resetState();
  });

  it('rotates a real PDF page', async () => {
    const pdfData = await createPdf(1);
    const pdfBlob = new Blob([pdfData] as any, { type: 'application/pdf' });

    // Setup state
    resetState({
      originals: [
        {
          id: 'o1',
          name: 'test.pdf',
          size: pdfData.length,
          type: 'pdf',
          pageCount: 1,
          color: 'red',
          evicted: false,
          pageRatios: [2], // 200/100
          version: 0,
        },
      ],
      pages: [
        {
          id: 'p1',
          originalId: 'o1',
          originalPageIndex: 0,
          ops: { rotation: 90, flipH: false, flipV: false },
        },
      ],
    });

    // Mock blob retrieval
    vi.mocked(stateModule.getOriginalBlob).mockResolvedValue(pdfBlob);

    const resultBytes = await generateProjectPdf();
    const resultDoc = await PDFDocument.load(resultBytes);

    expect(resultDoc.getPageCount()).toBe(1);
    const page = resultDoc.getPage(0);
    expect(page.getRotation().angle).toBe(90);
  });

  it('merges multiple PDF pages with different rotations', async () => {
    const pdfData = await createPdf(1);
    const pdfBlob = new Blob([pdfData] as any, { type: 'application/pdf' });

    resetState({
      originals: [
        {
          id: 'o1',
          name: 'test.pdf',
          size: pdfData.length,
          type: 'pdf',
          pageCount: 1,
          color: 'red',
          evicted: false,
          pageRatios: [2], // 200/100
          version: 0,
        },
      ],
      pages: [
        {
          id: 'p1',
          originalId: 'o1',
          originalPageIndex: 0,
          ops: { rotation: 0, flipH: false, flipV: false },
        },
        {
          id: 'p2',
          originalId: 'o1',
          originalPageIndex: 0,
          ops: { rotation: 180, flipH: false, flipV: false },
        },
      ],
    });

    vi.mocked(stateModule.getOriginalBlob).mockResolvedValue(pdfBlob);

    const resultBytes = await generateProjectPdf();
    const resultDoc = await PDFDocument.load(resultBytes);

    expect(resultDoc.getPageCount()).toBe(2);
    expect(resultDoc.getPage(0).getRotation().angle).toBe(0);
    expect(resultDoc.getPage(1).getRotation().angle).toBe(180);
  });

  it('embeds an image as a PDF page', async () => {
    // 1x1 black PNG
    const imgData = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const imgBlob = new Blob([imgData] as any, { type: 'image/png' });

    resetState({
      originals: [
        {
          id: 'o2',
          name: 'test.png',
          size: imgData.length,
          type: 'image',
          pageCount: 1,
          color: 'blue',
          evicted: false,
          pageRatios: [1],
          version: 0,
        },
      ],
      pages: [
        {
          id: 'p1',
          originalId: 'o2',
          originalPageIndex: 0,
          ops: { rotation: 0, flipH: false, flipV: false },
        },
      ],
    });

    // In the real app, we wrap images in PDF. Let's mock that.
    const pdfWithImage = await PDFDocument.create();
    const img = await pdfWithImage.embedPng(imgData);
    pdfWithImage.addPage([img.width, img.height]).drawImage(img);
    const pdfBlob = new Blob([await pdfWithImage.save()] as any, { type: 'application/pdf' });

    vi.mocked(stateModule.getOriginalBlob).mockResolvedValue(pdfBlob);

    const resultBytes = await generateProjectPdf();
    const resultDoc = await PDFDocument.load(resultBytes);

    expect(resultDoc.getPageCount()).toBe(1);
    const page = resultDoc.getPage(0);
    // Note: pdf-lib uses dimensions based on points, if it's 1x1 pixel it will be small
    expect(page.getWidth()).toBeGreaterThan(0);
  });

  it('handles blank pages', async () => {
    resetState({
      pages: [
        {
          id: 'p1',
          originalId: '', // Blank
          originalPageIndex: -1,
          ops: { rotation: 0, flipH: false, flipV: false },
        },
      ],
      workspaceRatio: 1.0, // Square page for testing
    });

    const resultBytes = await generateProjectPdf();
    const resultDoc = await PDFDocument.load(resultBytes);

    expect(resultDoc.getPageCount()).toBe(1);
    const page = resultDoc.getPage(0);
    expect(page.getWidth()).toBe(595.28);
    expect(page.getHeight()).toBe(595.28);
  });

  it('handles user workflow: delete pages then replace with shorter PDF', async () => {
    const pdf3Bytes = await createPdf(3);
    const pdf1Bytes = await createPdf(1);

    const pdf3Blob = new Blob([pdf3Bytes] as any, { type: 'application/pdf' });
    const pdf1Blob = new Blob([pdf1Bytes] as any, { type: 'application/pdf' });

    vi.mocked(stateModule.getOriginalBlob).mockResolvedValue(pdf3Blob);

    resetState({
      originals: [
        {
          id: 'o1',
          name: 'test.pdf',
          size: pdf3Bytes.length,
          type: 'pdf',
          pageCount: 3,
          color: 'red',
          evicted: false,
          pageRatios: [2, 2, 2],
          version: 0,
        },
      ],
      operations: [
        {
          type: 'APPEND_ORIGINAL',
          originalId: 'o1',
          instanceId: 'inst1',
        } as any,
      ],
      historyIndex: 1,
    });
    stateModule.recalculatePages();

    expect(state.pages.length).toBe(3);
    const p2 = state.pages[1].id;
    const p3 = state.pages[2].id;
    stateModule.pushOperation({ type: 'DELETE', pageIds: [p2, p3] });
    expect(state.pages.length).toBe(1);

    // Replace original pdf with a pdf that has only one page.
    vi.mocked(stateModule.getOriginalBlob).mockResolvedValue(pdf1Blob);
    await stateModule.reuploadOriginal(
      'o1',
      new Blob([pdf1Bytes] as any, { type: 'application/pdf' }),
      { name: 'test.pdf', size: pdf1Bytes.length },
      1,
    );

    expect(state.pages.length).toBe(1);

    const resultBytes = await generateProjectPdf();
    const resultDoc = await PDFDocument.load(resultBytes);
    expect(resultDoc.getPageCount()).toBe(1);
  });
});
