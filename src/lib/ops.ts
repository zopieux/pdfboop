import { PageOperation } from '../types';

export const rotate90CW = (ops: PageOperation): PageOperation => ({
  ...ops,
  rotation: (ops.rotation + 90) % 360,
});

export const rotate90CCW = (ops: PageOperation): PageOperation => ({
  ...ops,
  rotation: (ops.rotation - 90 + 360) % 360,
});

export const flipH = (ops: PageOperation): PageOperation => ({
  ...ops,
  flipH: !ops.flipH,
});

export const flipV = (ops: PageOperation): PageOperation => ({
  ...ops,
  flipV: !ops.flipV,
});
