import type { ItemId } from './blocks';

export interface Slot { item: ItemId | null; count: number; }

export function emptySlots(n: number): Slot[] { return Array.from({ length: n }, () => ({ item: null, count: 0 })); }

const MAX = 99;

// Move/merge/swap the whole stack from src slot into dst slot.
export function moveStack(src: Slot, dst: Slot) {
  if (!src.item) return;
  if (dst.item === null) { dst.item = src.item; dst.count = src.count; src.item = null; src.count = 0; return; }
  if (dst.item === src.item) {
    const can = Math.min(MAX - dst.count, src.count);
    dst.count += can; src.count -= can;
    if (src.count <= 0) { src.item = null; src.count = 0; }
    return;
  }
  // swap
  const ti = dst.item, tc = dst.count;
  dst.item = src.item; dst.count = src.count;
  src.item = ti; src.count = tc;
}

// Take half (right-click): split src into dst (dst must be empty or same item).
export function splitStack(src: Slot, dst: Slot) {
  if (!src.item || src.count <= 0) return;
  const half = Math.ceil(src.count / 2);
  if (dst.item === null) { dst.item = src.item; dst.count = half; src.count -= half; if (src.count <= 0) src.item = null; return; }
  if (dst.item === src.item) { const can = Math.min(MAX - dst.count, half); dst.count += can; src.count -= can; if (src.count <= 0) src.item = null; }
}

// Pick up one item (for incremental placement) — used by carried-stack drop.
export function dropOne(carried: Slot, dst: Slot): boolean {
  if (!carried.item) return false;
  if (dst.item === null) { dst.item = carried.item; dst.count = 1; carried.count -= 1; if (carried.count <= 0) carried.item = null; return true; }
  if (dst.item === carried.item && dst.count < MAX) { dst.count += 1; carried.count -= 1; if (carried.count <= 0) carried.item = null; return true; }
  return false;
}

export function addToSlots(slots: Slot[], item: ItemId, count = 1): number {
  let rem = count;
  for (const s of slots) { if (rem <= 0) break; if (s.item === item && s.count < MAX) { const c = Math.min(MAX - s.count, rem); s.count += c; rem -= c; } }
  for (const s of slots) { if (rem <= 0) break; if (s.item === null) { s.item = item; const c = Math.min(MAX, rem); s.count = c; rem -= c; } }
  return count - rem; // amount actually added
}
