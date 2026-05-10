import type { AbstractOperation, PageSize } from '../types';

export interface Matrix3x3 {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
  i: number;
}

const Identity: Matrix3x3 = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0, g: 0, h: 0, i: 1 };

function multiply(m1: Matrix3x3, m2: Matrix3x3): Matrix3x3 {
  return {
    a: m1.a * m2.a + m1.b * m2.d + m1.c * m2.g,
    b: m1.a * m2.b + m1.b * m2.e + m1.c * m2.h,
    c: m1.a * m2.c + m1.b * m2.f + m1.c * m2.i,
    d: m1.d * m2.a + m1.e * m2.d + m1.f * m2.g,
    e: m1.d * m2.b + m1.e * m2.e + m1.f * m2.h,
    f: m1.d * m2.c + m1.e * m2.f + m1.f * m2.i,
    g: m1.g * m2.a + m1.h * m2.d + m1.i * m2.g,
    h: m1.g * m2.b + m1.h * m2.e + m1.i * m2.h,
    i: m1.g * m2.c + m1.h * m2.f + m1.i * m2.i,
  };
}

function translate(x: number, y: number): Matrix3x3 {
  return { ...Identity, c: x, f: y };
}

function scale(sx: number, sy: number): Matrix3x3 {
  return { ...Identity, a: sx, e: sy };
}

function rotate(deg: number): Matrix3x3 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { ...Identity, a: c, b: -s, d: s, e: c };
}

export interface ResolvedGeometry {
  canvasWidth: number;
  canvasHeight: number;
  matrix: Matrix3x3;
}

/**
 * Resolve the final geometry for a page by replaying all applicable
 * operations in order. Pure function — no global state access.
 *
 * @param originalSize - The coordinate space of the source content (PDF points or pixel space).
 * @param ops - The ordered slice of operations to replay.
 * @param pageId - The page ID to filter operations by.
 */
export function resolveGeometry(
  originalSize: PageSize,
  ops: AbstractOperation[],
  pageId: string,
): ResolvedGeometry {
  let width = originalSize.width;
  let height = originalSize.height;

  // Content box relative to the evolving paper
  let cx = 0,
    cy = 0;
  let cw = width,
    ch = height;
  let rot = 0;
  let fh = false,
    fv = false;

  let nw = originalSize.width;
  let nh = originalSize.height;

  for (const op of ops) {
    // Filter: only ops that target this page
    const targets = (op as any).pageIds as string[] | undefined;
    if (targets && !targets.includes(pageId)) continue;

    switch (op.type) {
      case 'TRANSFORM': {
        if (op.operation === 'rotateCW' || op.operation === 'rotateCCW') {
          const shift = op.operation === 'rotateCW' ? 90 : 270;
          rot = (rot + shift) % 360;
          // Paper rotates: swap dimensions
          const oldW = width;
          width = height;
          height = oldW;

          const oldNW = nw;
          nw = nh;
          nh = oldNW;

          // Content box in new paper coordinates (90° CW):
          // newX = newPaperW - (oldY + oldH), newY = oldX
          const nx = width - (cy + ch);
          const ny = cx;
          const nw_ = ch;
          const nh_ = cw;
          cx = nx;
          cy = ny;
          cw = nw_;
          ch = nh_;
        } else if (op.operation === 'flipH') {
          fh = !fh;
          cx = width - (cx + cw);
        } else if (op.operation === 'flipV') {
          fv = !fv;
          cy = height - (cy + ch);
        }
        break;
      }
      case 'RESIZE': {
        let tw = op.targetSize?.width || width;
        let th = op.targetSize?.height || height;

        if (op.targetRatio) {
          const isLandscape = width > height;
          const ratio = isLandscape ? 1 / op.targetRatio : op.targetRatio;
          const currentRatio = height / width;

          if (op.resizeMode === 'crop') {
            if (ratio > currentRatio) {
              tw = height / ratio;
              th = height;
            } else {
              tw = width;
              th = width * ratio;
            }
          } else {
            if (ratio > currentRatio) {
              tw = width;
              th = width * ratio;
            } else {
              tw = height / ratio;
              th = height;
            }
          }
        }

        // Fit current paper into new paper
        // 'pad' (default) uses min to fit entire content
        // 'crop' uses max to cover the entire target area
        const s =
          op.resizeMode === 'crop'
            ? Math.max(tw / width, th / height)
            : Math.min(tw / width, th / height);

        let dx = (tw - width * s) / 2;
        let dy = (th - height * s) / 2;

        if (op.anchor === 'top-left' || op.anchor === 'left' || op.anchor === 'bottom-left') {
          dx = 0;
        } else if (
          op.anchor === 'top-right' ||
          op.anchor === 'right' ||
          op.anchor === 'bottom-right'
        ) {
          dx = tw - width * s;
        }

        if (op.anchor === 'top-left' || op.anchor === 'top' || op.anchor === 'top-right') {
          dy = 0;
        } else if (
          op.anchor === 'bottom-left' ||
          op.anchor === 'bottom' ||
          op.anchor === 'bottom-right'
        ) {
          dy = th - height * s;
        }

        cx = cx * s + dx;
        cy = cy * s + dy;
        cw *= s;
        ch *= s;
        width = tw;
        height = th;
        break;
      }
      case 'CROP': {
        if (!op.crop) break;
        cx -= op.crop.x;
        cy -= op.crop.y;
        width = op.crop.width;
        height = op.crop.height;
        break;
      }
      case 'RESET_GEOMETRY': {
        width = nw;
        height = nh;
        cx = 0;
        cy = 0;
        cw = nw;
        ch = nh;
        break;
      }
    }
  }

  // Build matrix: maps from original-content-space to paper-space
  // V_paper = M · V_content
  let m = Identity;

  // 1. Translate to the center of the content box on paper
  m = multiply(m, translate(cx + cw / 2, cy + ch / 2));

  // 2. Cumulative rotation and flips around that center
  m = multiply(m, rotate(rot));
  m = multiply(m, scale(fh ? -1 : 1, fv ? -1 : 1));

  // 3. Scale original content to fill the content box
  // If rotated 90/270, width↔height swap in mapping
  const is90 = rot % 180 !== 0;
  const sw = cw / (is90 ? originalSize.height : originalSize.width);
  const sh = ch / (is90 ? originalSize.width : originalSize.height);
  m = multiply(m, scale(sw, sh));

  // 4. Center the content at its own origin
  m = multiply(m, translate(-originalSize.width / 2, -originalSize.height / 2));

  return { canvasWidth: width, canvasHeight: height, matrix: m };
}
