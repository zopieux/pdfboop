import { describe, expect, it } from 'vitest';
import type { AbstractOperation, PageSize } from '../types';
import { resolveGeometry } from './geo';

const A4: PageSize = { width: 100, height: 141.4 };
const SQUARE: PageSize = { width: 100, height: 100 };
const _LANDSCAPE: PageSize = { width: 200, height: 100 };
const PAGE_ID = 'p1';

/** Build a TRANSFORM op targeting our test page. */
const transform = (operation: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV'): AbstractOperation => ({
  type: 'TRANSFORM',
  pageIds: [PAGE_ID],
  operation,
});

/** Build a RESIZE op targeting our test page. */
const resize = (width: number, height: number): AbstractOperation => ({
  type: 'RESIZE',
  pageIds: [PAGE_ID],
  targetSize: { width, height },
});

/** Build a CROP op targeting our test page. */
const crop = (x: number, y: number, w: number, h: number): AbstractOperation => ({
  type: 'CROP',
  pageIds: [PAGE_ID],
  crop: { x, y, width: w, height: h },
});

describe('resolveGeometry', () => {
  describe('identity / no ops', () => {
    it('returns original size with identity matrix when no ops', () => {
      const geo = resolveGeometry(A4, [], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
      // Identity-like matrix: a=1, e=1, rest 0 (modulo translation from center)
      // Actually the matrix maps from content (0,0) to paper (0,0) via center offset,
      // so it should be a pure scale-1 + translate(0,0):
      // The matrix should map (0,0) -> (0,0) and (100,141.4) -> (100,141.4)
      const m = geo.matrix;
      const x0 = m.a * 0 + m.b * 0 + m.c;
      const y0 = m.d * 0 + m.e * 0 + m.f;
      expect(x0).toBeCloseTo(0);
      expect(y0).toBeCloseTo(0);
      const x1 = m.a * 100 + m.b * 141.4 + m.c;
      const y1 = m.d * 100 + m.e * 141.4 + m.f;
      expect(x1).toBeCloseTo(100);
      expect(y1).toBeCloseTo(141.4);
    });

    it('ignores ops targeting other pages', () => {
      const ops: AbstractOperation[] = [
        { type: 'TRANSFORM', pageIds: ['other'], operation: 'rotateCW' },
      ];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
    });
  });

  describe('single rotation', () => {
    it('rotates CW: swaps dimensions', () => {
      const geo = resolveGeometry(A4, [transform('rotateCW')], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(141.4);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('rotates CCW: swaps dimensions', () => {
      const geo = resolveGeometry(A4, [transform('rotateCCW')], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(141.4);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('180° rotation: preserves dimensions', () => {
      const ops = [transform('rotateCW'), transform('rotateCW')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
    });

    it('360° rotation: identity', () => {
      const ops = Array(4).fill(transform('rotateCW'));
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
    });
  });

  describe('single flip', () => {
    it('flipH: preserves dimensions', () => {
      const geo = resolveGeometry(A4, [transform('flipH')], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
    });

    it('flipV: preserves dimensions', () => {
      const geo = resolveGeometry(A4, [transform('flipV')], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(141.4);
    });

    it('double flipH: cancels', () => {
      const ops = [transform('flipH'), transform('flipH')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      const m = geo.matrix;
      // Should be identity-like
      expect(m.a * 100 + m.b * 0 + m.c).toBeCloseTo(100);
      expect(m.d * 100 + m.e * 0 + m.f).toBeCloseTo(0);
    });
  });

  describe('single resize', () => {
    it('resizes to larger canvas', () => {
      const geo = resolveGeometry(A4, [resize(200, 300)], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(200);
      expect(geo.canvasHeight).toBeCloseTo(300);
    });

    it('resizes to square (letterboxes)', () => {
      const geo = resolveGeometry(A4, [resize(100, 100)], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });
  });

  describe('single crop', () => {
    it('crops to center region', () => {
      const geo = resolveGeometry(A4, [crop(25, 25, 50, 50)], PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(50);
      expect(geo.canvasHeight).toBeCloseTo(50);
    });
  });

  describe('chained operations — the critical tests', () => {
    it('rotate then resize differs from resize then rotate', () => {
      const rotateFirst = resolveGeometry(A4, [transform('rotateCW'), resize(200, 300)], PAGE_ID);
      const resizeFirst = resolveGeometry(A4, [resize(200, 300), transform('rotateCW')], PAGE_ID);

      // rotate→resize: rotated page (141.4×100) gets fit into 200×300
      // resize→rotate: original (100×141.4) gets fit into 200×300, then rotated → 300×200
      expect(rotateFirst.canvasWidth).toBeCloseTo(200);
      expect(rotateFirst.canvasHeight).toBeCloseTo(300);
      expect(resizeFirst.canvasWidth).toBeCloseTo(300);
      expect(resizeFirst.canvasHeight).toBeCloseTo(200);
    });

    it('rotate → resize → rotate', () => {
      const ops = [transform('rotateCW'), resize(200, 200), transform('rotateCW')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      // After CW: 141.4×100, fit into 200×200 → 200×200 canvas, then CW again → 200×200
      expect(geo.canvasWidth).toBeCloseTo(200);
      expect(geo.canvasHeight).toBeCloseTo(200);
    });

    it('resize → crop', () => {
      const ops = [resize(200, 200), crop(50, 50, 100, 100)];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('crop → resize → crop compounds correctly', () => {
      const ops = [
        crop(10, 10, 80, 80), // 80×80 canvas
        resize(200, 200), // fit into 200×200
        crop(50, 50, 100, 100), // crop again
      ];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(100);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('flipH + rotateCW', () => {
      const ops = [transform('flipH'), transform('rotateCW')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(141.4);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('rotateCW + flipH', () => {
      const ops = [transform('rotateCW'), transform('flipH')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);
      expect(geo.canvasWidth).toBeCloseTo(141.4);
      expect(geo.canvasHeight).toBeCloseTo(100);
    });

    it('scale + rotate preserves content within frame', () => {
      // Key bug case: after scale+rotate, content should still be fully
      // within the canvas bounds.
      const ops = [resize(200, 300), transform('rotateCW')];
      const geo = resolveGeometry(A4, ops, PAGE_ID);

      // Transform eight corners of original content and verify all are within canvas
      const m = geo.matrix;
      const corners = [
        [0, 0],
        [A4.width, 0],
        [A4.width, A4.height],
        [0, A4.height],
      ];
      for (const [cx, cy] of corners) {
        const px = m.a * cx + m.b * cy + m.c;
        const py = m.d * cx + m.e * cy + m.f;
        expect(px).toBeGreaterThanOrEqual(-0.01);
        expect(py).toBeGreaterThanOrEqual(-0.01);
        expect(px).toBeLessThanOrEqual(geo.canvasWidth + 0.01);
        expect(py).toBeLessThanOrEqual(geo.canvasHeight + 0.01);
      }
    });

    it('rotate + scale preserves content within frame', () => {
      const ops = [transform('rotateCW'), resize(200, 300)];
      const geo = resolveGeometry(A4, ops, PAGE_ID);

      const m = geo.matrix;
      const corners = [
        [0, 0],
        [A4.width, 0],
        [A4.width, A4.height],
        [0, A4.height],
      ];
      for (const [cx, cy] of corners) {
        const px = m.a * cx + m.b * cy + m.c;
        const py = m.d * cx + m.e * cy + m.f;
        expect(px).toBeGreaterThanOrEqual(-0.01);
        expect(py).toBeGreaterThanOrEqual(-0.01);
        expect(px).toBeLessThanOrEqual(geo.canvasWidth + 0.01);
        expect(py).toBeLessThanOrEqual(geo.canvasHeight + 0.01);
      }
    });
  });

  describe('matrix correctness', () => {
    it('identity maps corners correctly', () => {
      const geo = resolveGeometry(SQUARE, [], PAGE_ID);
      const m = geo.matrix;
      // (0,0) → (0,0), (100,100) → (100,100)
      expect(m.a * 0 + m.b * 0 + m.c).toBeCloseTo(0);
      expect(m.d * 0 + m.e * 0 + m.f).toBeCloseTo(0);
      expect(m.a * 100 + m.b * 100 + m.c).toBeCloseTo(100);
      expect(m.d * 100 + m.e * 100 + m.f).toBeCloseTo(100);
    });

    it('90° CW maps corners correctly', () => {
      const geo = resolveGeometry(SQUARE, [transform('rotateCW')], PAGE_ID);
      const m = geo.matrix;
      // After CW rotation of a 100×100 square, canvas is still 100×100
      // Original (0,0) → top-right → (100, 0) in screen space
      // Original (100,0) → bottom-right → (100, 100) in screen space
      const x0 = m.a * 0 + m.b * 0 + m.c;
      const y0 = m.d * 0 + m.e * 0 + m.f;
      expect(x0).toBeCloseTo(100);
      expect(y0).toBeCloseTo(0);
    });
  });
});
