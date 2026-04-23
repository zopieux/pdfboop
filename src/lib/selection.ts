export function computeSelection(
  current: string[],
  allIds: string[],
  clickedId: string,
  clickedIndex: number,
  multi: boolean,
  shift: boolean,
): string[] {
  if (multi) {
    if (current.includes(clickedId)) {
      return current.filter((id) => id !== clickedId);
    } else {
      return [...current, clickedId];
    }
  }

  if (shift && current.length > 0) {
    const lastId = current[current.length - 1];
    const lastIdx = allIds.indexOf(lastId);
    if (lastIdx !== -1) {
      const start = Math.min(lastIdx, clickedIndex);
      const end = Math.max(lastIdx, clickedIndex);
      const range = allIds.slice(start, end + 1);
      return [...new Set([...current, ...range])];
    }
  }

  return [clickedId];
}
