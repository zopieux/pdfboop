import { describe, it, expect } from 'vitest';
import { rotate90CW, rotate90CCW, flipH, flipV } from './ops';
import { PageOperation } from '../types';

describe('Page Operations', () => {
  const initialOps: PageOperation = {
    rotation: 0,
    flipH: false,
    flipV: false,
  };

  it('rotates CW correctly', () => {
    let ops = rotate90CW(initialOps);
    expect(ops.rotation).toBe(90);
    ops = rotate90CW(ops);
    expect(ops.rotation).toBe(180);
    ops = rotate90CW(ops);
    expect(ops.rotation).toBe(270);
    ops = rotate90CW(ops);
    expect(ops.rotation).toBe(0);
  });

  it('rotates CCW correctly', () => {
    let ops = rotate90CCW(initialOps);
    expect(ops.rotation).toBe(270);
    ops = rotate90CCW(ops);
    expect(ops.rotation).toBe(180);
    ops = rotate90CCW(ops);
    expect(ops.rotation).toBe(90);
    ops = rotate90CCW(ops);
    expect(ops.rotation).toBe(0);
  });

  it('flips horizontally correctly', () => {
    let ops = flipH(initialOps);
    expect(ops.flipH).toBe(true);
    ops = flipH(ops);
    expect(ops.flipH).toBe(false);
  });

  it('flips vertically correctly', () => {
    let ops = flipV(initialOps);
    expect(ops.flipV).toBe(true);
    ops = flipV(ops);
    expect(ops.flipV).toBe(false);
  });
});
