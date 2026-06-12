import type { ItemId } from './blocks';
import { RECIPES } from './recipes';

export interface Slot { item: ItemId | null; count: number; }

export class Inventory {
  hotbar: Slot[] = Array.from({ length: 9 }, () => ({ item: null, count: 0 }));
  storage: Slot[] = Array.from({ length: 27 }, () => ({ item: null, count: 0 }));
  selected = 0;

  get all(): Slot[] { return [...this.hotbar, ...this.storage]; }

  selectedItem(): ItemId | null { return this.hotbar[this.selected].item; }

  total(item: ItemId): number {
    return this.all.reduce((s, sl) => s + (sl.item === item ? sl.count : 0), 0);
  }

  add(item: ItemId, count = 1): boolean {
    let remaining = count;
    // stack into existing
    for (const sl of [...this.hotbar, ...this.storage]) {
      if (remaining <= 0) break;
      if (sl.item === item && sl.count < 99) { const can = Math.min(99 - sl.count, remaining); sl.count += can; remaining -= can; }
    }
    // new slots
    for (const sl of [...this.hotbar, ...this.storage]) {
      if (remaining <= 0) break;
      if (sl.item === null) { sl.item = item; const can = Math.min(99, remaining); sl.count = can; remaining -= can; }
    }
    return remaining === 0;
  }

  remove(item: ItemId, count = 1): boolean {
    if (this.total(item) < count) return false;
    let remaining = count;
    for (const sl of [...this.hotbar, ...this.storage]) {
      if (remaining <= 0) break;
      if (sl.item === item) { const take = Math.min(sl.count, remaining); sl.count -= take; remaining -= take; if (sl.count <= 0) sl.item = null; }
    }
    return true;
  }

  consumeSelected(n = 1): boolean {
    const sl = this.hotbar[this.selected];
    if (!sl.item || sl.count < n) return false;
    sl.count -= n; if (sl.count <= 0) sl.item = null;
    return true;
  }

  // ---- generic slot access for drag & drop across containers ----
  // index space: 0-8 hotbar, 9-35 storage
  slotAt(i: number): Slot { return i < 9 ? this.hotbar[i] : this.storage[i - 9]; }

  canCraft(recipeIndex: number, nearTable: boolean): boolean {
    const r = RECIPES[recipeIndex];
    if (!r) return false;
    if (r.table && !nearTable) return false;
    return r.needs.every(n => this.total(n.item) >= n.n);
  }

  craft(recipeIndex: number, nearTable: boolean): boolean {
    if (!this.canCraft(recipeIndex, nearTable)) return false;
    const r = RECIPES[recipeIndex];
    for (const n of r.needs) this.remove(n.item, n.n);
    this.add(r.out, r.count);
    return true;
  }

  serialize() { return { hotbar: this.hotbar, storage: this.storage, selected: this.selected }; }
  load(data: any) {
    if (!data) return;
    if (data.hotbar) this.hotbar = data.hotbar;
    if (data.storage) this.storage = data.storage;
    if (typeof data.selected === 'number') this.selected = data.selected;
  }
}
