import { createNoise2D } from 'simplex-noise';
import type { BlockId } from './blocks';

// =====================================================================
// Infinite procedural world via chunk streaming.
// World coordinates are unbounded integers (effectively 1e6 x 1e6+).
// Tiles are generated on demand and cached per chunk. Edits are stored
// sparsely in an override map so only changes are saved.
// =====================================================================

export const CHUNK = 16;            // tiles per chunk side
export const WORLD_LIMIT = 1_000_000; // soft coordinate clamp (each axis +/-)

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

export interface Tile { ground: BlockId; block: BlockId; tree: boolean; }

export interface ChunkData {
  cx: number; cy: number;
  ground: BlockId[];  // CHUNK*CHUNK
  block: BlockId[];
  tree: boolean[];
  village?: VillageInfo | null;
}

export interface VillageInfo {
  cx: number; cy: number;     // chunk coords
  centerX: number; centerY: number; // world tile coords
  houses: { x: number; y: number; w: number; h: number }[];
  villagers: { x: number; y: number }[];
}

const key = (cx: number, cy: number) => cx + ',' + cy;

export class World {
  seed: number;
  private elev: ReturnType<typeof createNoise2D>;
  private moist: ReturnType<typeof createNoise2D>;
  private ore: ReturnType<typeof createNoise2D>;
  private river: ReturnType<typeof createNoise2D>;
  private chunks = new Map<string, ChunkData>();
  // sparse edits: "x,y" -> block override
  overrides = new Map<string, BlockId>();
  treeOverrides = new Map<string, boolean>(); // explicit tree removal/add
  villages: VillageInfo[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const r1 = mulberry32(this.seed);
    const r2 = mulberry32(this.seed ^ 0x12345);
    const r3 = mulberry32(this.seed ^ 0xabcde);
    const r4 = mulberry32(this.seed ^ 0x9e377);
    this.elev = createNoise2D(() => r1());
    this.moist = createNoise2D(() => r2());
    this.ore = createNoise2D(() => r3());
    this.river = createNoise2D(() => r4());
  }

  // ---- core sampling ----
  private elevAt(x: number, y: number): number {
    return this.elev(x / 90, y / 90) * 0.55 +
      this.elev(x / 38, y / 38) * 0.3 +
      this.elev(x / 16, y / 16) * 0.15;
  }

  // river field: near 0 = on a river. Uses ridged noise -> long winding channels.
  private riverAt(x: number, y: number): number {
    const n = this.river(x / 120, y / 120) + this.river(x / 260, y / 260) * 0.6;
    return Math.abs(n) / 1.6; // 0 at channel centre
  }

  private genTile(x: number, y: number): Tile {
    const e = this.elevAt(x, y);
    const m = this.moist(x / 110, y / 110);
    const rv = this.riverAt(x, y);

    let ground: BlockId; let block: BlockId = 'air'; let tree = false;

    if (e < -0.34) ground = 'water';
    else if (e < -0.24) ground = 'sand';
    else if (e > 0.5) {
      ground = e > 0.66 ? 'snow' : 'stone';
      block = e > 0.55 ? 'stone' : 'air';
      const o = this.ore(x / 9, y / 9);
      if (block === 'stone') {
        if (o > 0.88) block = 'diamond';
        else if (o > 0.78) block = 'gold';
        else if (o > 0.62) block = 'iron';
        else if (o > 0.44) block = 'coal';
      }
    } else if (e > 0.34) {
      ground = 'stone';
      const o = this.ore(x / 8, y / 8);
      if (o > 0.84 && hash2(x, y, this.seed) > 0.5) block = 'diamond';
      else if (o > 0.72 && hash2(x, y, this.seed + 1) > 0.5) block = o > 0.85 ? 'iron' : 'coal';
    } else {
      ground = m > 0.12 ? 'grass' : (m < -0.32 ? 'sand' : 'grass');
      if (ground === 'grass') {
        const h = hash2(x, y, this.seed + 7);
        if (h > 0.91) tree = true;
        else if (h > 0.87) block = 'flower';
      }
    }

    // carve rivers (override land with water + sandy banks)
    if (rv < 0.018 && ground !== 'water') { ground = 'water'; block = 'air'; tree = false; }
    else if (rv < 0.045 && ground !== 'water' && (ground === 'grass' || ground === 'stone' || ground === 'snow')) { ground = 'sand'; if (block !== 'air' && (block === 'stone' || block === 'coal' || block === 'iron' || block === 'gold' || block === 'diamond')) block = 'air'; tree = false; }

    return { ground, block, tree };
  }

  // ---- village generation (deterministic per chunk) ----
  private genVillage(cx: number, cy: number, ground: BlockId[], block: BlockId[], tree: boolean[]): VillageInfo | null {
    // villages are rare; ~1 in 14 chunks on flat grassland
    if (hash2(cx, cy, this.seed ^ 0xdead) > 0.07) return null;
    // verify centre is grassy land
    const wx0 = cx * CHUNK, wy0 = cy * CHUNK;
    const ccx = wx0 + CHUNK / 2, ccy = wy0 + CHUNK / 2;
    if (this.genTile(ccx, ccy).ground !== 'grass') return null;

    const vr = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ this.seed);
    const houses: { x: number; y: number; w: number; h: number }[] = [];
    const villagers: { x: number; y: number }[] = [];
    const count = 2 + Math.floor(vr() * 3);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < count * 3 && houses.length < count; i++) {
      const hw = 4 + Math.floor(vr() * 2), hh = 4 + Math.floor(vr() * 2);
      const hx = wx0 + 1 + Math.floor(vr() * (CHUNK - hw - 2));
      const hy = wy0 + 1 + Math.floor(vr() * (CHUNK - hh - 2));
      // no overlap
      if (placed.some(p => hx < p.x + p.w + 1 && hx + hw + 1 > p.x && hy < p.y + p.h + 1 && hy + hh + 1 > p.y)) continue;
      // must be on land (sample corner)
      if (this.genTile(hx, hy).ground === 'water') continue;
      placed.push({ x: hx, y: hy, w: hw, h: hh });
      houses.push({ x: hx, y: hy, w: hw, h: hh });
    }
    if (houses.length === 0) return null;

    // stamp houses into this chunk's arrays with varied materials
    const idx = (lx: number, ly: number) => ly * CHUNK + lx;
    const setG = (gx: number, gy: number, g: BlockId) => { const lx = gx - wx0, ly = gy - wy0; if (lx >= 0 && ly >= 0 && lx < CHUNK && ly < CHUNK) ground[idx(lx, ly)] = g; };
    const setB = (gx: number, gy: number, b: BlockId) => { const lx = gx - wx0, ly = gy - wy0; if (lx >= 0 && ly >= 0 && lx < CHUNK && ly < CHUNK) { block[idx(lx, ly)] = b; tree[idx(lx, ly)] = false; } };

    for (let hi = 0; hi < houses.length; hi++) {
      const h = houses[hi];
      // per-house palette pick
      const style = Math.floor(hash2(h.x, h.y, this.seed ^ 0xbeef) * 3); // 0 planks, 1 stone+planks, 2 sand/cottage
      const wall: BlockId = style === 1 ? 'stone' : style === 2 ? 'sand' : 'planks';
      const floor: BlockId = style === 1 ? 'stone' : 'planks';
      const post: BlockId = 'wood';

      for (let yy = 0; yy < h.h; yy++) for (let xx = 0; xx < h.w; xx++) {
        const gx = h.x + xx, gy = h.y + yy;
        setG(gx, gy, floor);
        const isEdge = xx === 0 || yy === 0 || xx === h.w - 1 || yy === h.h - 1;
        const isCorner = (xx === 0 || xx === h.w - 1) && (yy === 0 || yy === h.h - 1);
        if (!isEdge) { setB(gx, gy, 'air'); continue; }
        if (isCorner) { setB(gx, gy, post); continue; }       // log corner posts
        // windows: glass on the sides at mid height
        const midY = Math.floor(h.h / 2);
        if ((xx === 0 || xx === h.w - 1) && yy === midY) { setB(gx, gy, 'glass'); continue; }
        if (yy === 0 && (xx === 1 || xx === h.w - 2) && h.w >= 5) { setB(gx, gy, 'glass'); continue; }
        setB(gx, gy, wall);
      }

      // door on bottom-middle
      const dx = h.x + Math.floor(h.w / 2), dy = h.y + h.h - 1;
      setB(dx, dy, 'door');
      // path / step in front of the door
      setG(dx, h.y + h.h, 'planks');

      // interior furniture
      setB(h.x + 1, h.y + 1, 'crafting');
      if (h.w >= 5) setB(h.x + h.w - 2, h.y + 1, 'chest');
      if (h.h >= 5) setB(h.x + 1, h.y + h.h - 2, 'furnace');
      // corner torches (light)
      setB(h.x + 1, h.y + 1 + (h.h >= 5 ? 1 : 0), 'air');
      setB(h.x + h.w - 2, h.y + h.h - 2, 'torch');

      // villager standing just outside the door
      villagers.push({ x: dx, y: h.y + h.h + 1 });
    }

    // village square decorations: a few torches + flowers + a path between houses
    const decoR = mulberry32((cx * 40503) ^ (cy * 91019) ^ this.seed);
    for (let d = 0; d < 6; d++) {
      const tx = wx0 + 1 + Math.floor(decoR() * (CHUNK - 2));
      const ty = wy0 + 1 + Math.floor(decoR() * (CHUNK - 2));
      const i = idx(tx - wx0, ty - wy0);
      if (block[i] === 'air' && ground[i] === 'grass') block[i] = decoR() > 0.5 ? 'torch' : 'flower';
    }

    return { cx, cy, centerX: ccx, centerY: ccy, houses, villagers };
  }

  getChunk(cx: number, cy: number): ChunkData {
    const k = key(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;
    const ground: BlockId[] = new Array(CHUNK * CHUNK);
    const block: BlockId[] = new Array(CHUNK * CHUNK);
    const tree: boolean[] = new Array(CHUNK * CHUNK);
    const wx0 = cx * CHUNK, wy0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const t = this.genTile(wx0 + lx, wy0 + ly);
      const i = ly * CHUNK + lx;
      ground[i] = t.ground; block[i] = t.block; tree[i] = t.tree;
    }
    const village = this.genVillage(cx, cy, ground, block, tree);
    if (village && !this.villages.some(v => v.cx === cx && v.cy === cy)) this.villages.push(village);
    c = { cx, cy, ground, block, tree, village };
    this.chunks.set(k, c);
    return c;
  }

  // ---- world-space accessors (apply overrides) ----
  groundAt(x: number, y: number): BlockId {
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, ly = ((y % CHUNK) + CHUNK) % CHUNK;
    return c.ground[ly * CHUNK + lx];
  }
  blockAt(x: number, y: number): BlockId {
    const ov = this.overrides.get(x + ',' + y);
    if (ov !== undefined) return ov;
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, ly = ((y % CHUNK) + CHUNK) % CHUNK;
    return c.block[ly * CHUNK + lx];
  }
  treeAt(x: number, y: number): boolean {
    const tov = this.treeOverrides.get(x + ',' + y);
    if (tov !== undefined) return tov;
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, ly = ((y % CHUNK) + CHUNK) % CHUNK;
    return c.tree[ly * CHUNK + lx];
  }
  setBlock(x: number, y: number, b: BlockId) { this.overrides.set(x + ',' + y, b); }
  setTree(x: number, y: number, v: boolean) { this.treeOverrides.set(x + ',' + y, v); }

  // ---- spawn search ----
  findSpawn(): { x: number; y: number } {
    // spiral out from 0,0 for grass near water
    let fallback: { x: number; y: number } | null = null;
    for (let r = 0; r < 80; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = dx, y = dy;
        if (this.groundAt(x, y) === 'grass' && this.blockAt(x, y) === 'air' && !this.treeAt(x, y)) {
          if (!fallback) fallback = { x, y };
          for (let sy = -4; sy <= 4; sy++) for (let sx = -4; sx <= 4; sx++) {
            if (this.groundAt(x + sx, y + sy) === 'water') return { x, y };
          }
        }
      }
    }
    return fallback || { x: 0, y: 0 };
  }

  serializeOverrides() {
    return {
      blocks: Array.from(this.overrides.entries()),
      trees: Array.from(this.treeOverrides.entries()),
    };
  }
  loadOverrides(data: any) {
    if (!data) return;
    if (data.blocks) for (const [k, v] of data.blocks) this.overrides.set(k, v);
    if (data.trees) for (const [k, v] of data.trees) this.treeOverrides.set(k, v);
  }
}
