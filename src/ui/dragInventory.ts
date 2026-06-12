import { moveStack, splitStack, type Slot } from '../game/slots';
import { ITEM_NAMES, type ItemId } from '../game/blocks';
import { itemTextureKey } from '../game/textures';
import type Phaser from 'phaser';

// A "carried" stack the player is holding with the cursor while rearranging.
const carried: Slot = { item: null, count: 0 };
let getGame: (() => Phaser.Game | null) | null = null;
let onChange: (() => void) | null = null;
let cursorEl: HTMLElement | null = null;
const texCache: Record<string, string> = {};

export function initDrag(gameGetter: () => Phaser.Game | null) { getGame = gameGetter; }

function texUrl(item: ItemId): string {
  if (texCache[item]) return texCache[item];
  const g = getGame?.(); if (!g) return '';
  const tex = g.textures.get(itemTextureKey(item)); if (!tex) return '';
  try { const s = tex.getSourceImage() as HTMLCanvasElement; if (s && (s as any).toDataURL) { const u = s.toDataURL(); texCache[item] = u; return u; } } catch { /* */ }
  return '';
}

function ensureCursor() {
  if (!cursorEl) {
    cursorEl = document.createElement('div');
    cursorEl.id = 'carryCursor';
    cursorEl.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;width:40px;height:40px;display:none;transform:translate(-50%,-50%);image-rendering:pixelated';
    document.body.appendChild(cursorEl);
    window.addEventListener('mousemove', (e) => { if (cursorEl && cursorEl.style.display !== 'none') { cursorEl.style.left = e.clientX + 'px'; cursorEl.style.top = e.clientY + 'px'; } });
  }
  return cursorEl;
}

function renderCarry() {
  const c = ensureCursor();
  if (carried.item) {
    c.style.display = 'block';
    c.innerHTML = `<img src="${texUrl(carried.item)}" style="width:100%;height:100%;image-rendering:pixelated" /><span style="position:absolute;bottom:-2px;right:0;font-size:13px;font-weight:800;color:#fff;text-shadow:2px 2px 0 #000;font-family:'PressStart',monospace">${carried.count > 1 ? carried.count : ''}</span>`;
  } else c.style.display = 'none';
}

// Build an interactive grid of slots into `host`. `slots` is the backing array.
export function buildGrid(host: HTMLElement, slots: Slot[], cols: number, change: () => void, cellPx = 44) {
  onChange = change;
  (host as any)._cellPx = cellPx; (host as any)._cols = cols; (host as any)._slots = slots;
  host.innerHTML = '';
  host.style.display = 'grid';
  host.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  host.style.gap = '3px';
  host.style.justifyContent = 'start';
  for (let i = 0; i < slots.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    const sl = slots[i];
    cell.innerHTML = (sl.item ? `<img src="${texUrl(sl.item)}" title="${ITEM_NAMES[sl.item] || sl.item}" />` : '') + (sl.item && sl.count > 1 ? `<span class="cnt">${sl.count}</span>` : '');
    cell.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 2) { // right click = split / drop one
        if (carried.item) { /* drop one */ dropOneInto(sl); }
        else splitStack(sl, carried);
      } else { // left click = pick up / place whole
        if (carried.item) moveStack(carried, sl); else moveStack(sl, carried);
      }
      renderCarry();
      rerender(host, slots, cols);
      onChange?.();
    });
    cell.addEventListener('contextmenu', e => e.preventDefault());
    host.appendChild(cell);
  }
  renderCarry();
}

function dropOneInto(dst: Slot) {
  if (!carried.item) return;
  if (dst.item === null) { dst.item = carried.item; dst.count = 1; carried.count--; if (carried.count <= 0) carried.item = null; }
  else if (dst.item === carried.item && dst.count < 99) { dst.count++; carried.count--; if (carried.count <= 0) carried.item = null; }
}

function rerender(host: HTMLElement, slots: Slot[], cols: number) { buildGrid(host, slots, cols, onChange || (() => {}), (host as any)._cellPx ?? 44); }

// Return carried items to a backing array (call when closing a panel so nothing is lost).
export function returnCarried(slots: Slot[]) {
  if (!carried.item) return;
  // try to merge / place
  for (const s of slots) { if (!carried.item) break; if (s.item === carried.item && s.count < 99) { const c = Math.min(99 - s.count, carried.count); s.count += c; carried.count -= c; if (carried.count <= 0) carried.item = null; } }
  for (const s of slots) { if (!carried.item) break; if (s.item === null) { s.item = carried.item; s.count = carried.count; carried.item = null; carried.count = 0; } }
  renderCarry();
}

export function hasCarried() { return !!carried.item; }
