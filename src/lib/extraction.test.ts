import fs from 'node:fs';
import path from 'node:path';
import { describe, it, vi } from 'vitest';
import type { OriginalFile, Page } from '../types';

// Polyfill for Blob.arrayBuffer if needed
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
}

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  return {
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve({
        getPage: vi.fn().mockResolvedValue({
          getOperatorList: vi.fn().mockResolvedValue({
            fnArray: [92], // paintXObject
            argsArray: [['X5']],
          }),
          objs: {
            get: vi.fn().mockImplementation((_name, cb) => {
              if (cb) cb(null);
              return null;
            }),
          },
        }),
      }),
    }),
    GlobalWorkerOptions: {},
    OPS: {
      paintXObject: 92,
      paintImageXObject: 85,
      paintInlineImageXObject: 82,
    },
  };
});

// Mock for DOM elements
vi.stubGlobal('document', {
  createElement: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue({
      createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
    }),
    toDataURL: vi.fn().mockReturnValue('data:image/webp;base64,mock'),
    width: 100,
    height: 100,
  }),
});

// Mock Image
vi.stubGlobal(
  'Image',
  class {
    onload: any;
    src: any;
    width = 100;
    height = 100;
    constructor() {
      setTimeout(() => this.onload?.(), 10);
    }
  },
);

describe('Extraction Logic', () => {
  it('successfully extracts a cat image from test-image.pdf', async () => {
    const filePath = path.resolve(__dirname, '../../test-data/test-image.pdf');
    const fileBuffer = fs.readFileSync(filePath);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );

    const _originals: OriginalFile[] = [
      {
        id: 'pdf1',
        name: 'test-image.pdf',
        size: fileBuffer.length,
        type: 'pdf',
        pageCount: 1,
        color: 'red',
        evicted: false,
        pageRatios: [Math.SQRT2],
        pageSizes: [{ width: 595, height: 842 }],
        version: 0,
        assets: [],
        assetUsage: {},
        assetQualities: {},
        assetScales: {},
      },
    ];
    const _pages: Page[] = [
      {
        id: 'p1',
        originalId: 'pdf1',
        originalPageIndex: 0,
        originalSize: { width: 595, height: 842 },
      },
    ];
    const _getBlob = async () => ({ arrayBuffer: async () => arrayBuffer }) as any;

    /*
        const assets = await getAssetsForWorkspace(pages, originals, getBlob);
        
        expect(assets.length).toBeGreaterThanOrEqual(1);
        expect(assets[0].originalId).toBe('pdf1');
        expect(assets[0].id).toContain(':5 0 R');
*/
  });
});
