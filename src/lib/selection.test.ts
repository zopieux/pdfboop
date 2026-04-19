
import { describe, it, expect } from 'vitest';
import { computeSelection } from './selection';

describe('computeSelection utility', () => {
  const allIds = ['a', 'b', 'c', 'd', 'e'];

  it('selects a single item when no modifiers are used', () => {
    const current = ['a'];
    const result = computeSelection(current, allIds, 'c', 2, false, false);
    expect(result).toEqual(['c']);
  });

  it('toggles an item with multi-select (ctrl)', () => {
    const current = ['a', 'b'];
    // Toggle off
    expect(computeSelection(current, allIds, 'a', 0, true, false)).toEqual(['b']);
    // Toggle on
    expect(computeSelection(current, allIds, 'c', 2, true, false)).toEqual(['a', 'b', 'c']);
  });

  it('selects a range with shift key', () => {
    const current = ['b'];
    // Select range from b to d
    const result = computeSelection(current, allIds, 'd', 3, false, true);
    expect(result).toEqual(['b', 'c', 'd']);
  });

  it('handles backwards range selection with shift', () => {
    const current = ['d'];
    // Select range from d back to b
    const result = computeSelection(current, allIds, 'b', 1, false, true);
    expect(result).toEqual(['d', 'b', 'c']); // Order doesn't strictly matter for UI but Set union order is preserved
    // Actually, order might matter if we use the last item as pivot.
    // In our implementation: start=1, end=3, range=['b', 'c', 'd']
    // [...new Set(['d', 'b', 'c', 'd'])] -> ['d', 'b', 'c']
  });

  it('combines current selection with range selection', () => {
    const current = ['a', 'e'];
    // Shift click 'c'
    // Last item 'e' is pivot. Range 'c' to 'e' is ['c', 'd', 'e']
    // Result: ['a', 'e', 'c', 'd']
    const result = computeSelection(current, allIds, 'c', 2, false, true);
    expect(result).toContain('a');
    expect(result).toContain('c');
    expect(result).toContain('d');
    expect(result).toContain('e');
    expect(result.length).toBe(4);
  });
});
