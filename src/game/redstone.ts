import type { World } from './chunks';
import { isRedstone, isPowerSource, type BlockId } from './blocks';

// Lightweight redstone power simulation.
// Power sources emit a signal strength (1..15). Wire/relay carry it, losing 1
// per tile. A "relay" forwards the power onward (re-amplifying to its set
// output) so signals can travel far / branch. Pistons & sound blocks consume it.

const k = (x: number, y: number) => x + ',' + y;

export class RedstoneSim {
  // registered redstone blocks "x,y" -> type
  blocks = new Map<string, BlockId>();
  // lever on/off
  levers = new Map<string, boolean>();
  // timed sources (buttons / plates): expiry timestamp
  timed = new Map<string, { strength: number; until: number }>();
  // relay configured output strength (default 15)
  relayOut = new Map<string, number>();

  addBlock(x: number, y: number, b: BlockId) { if (isRedstone(b)) { this.blocks.set(k(x, y), b); if (b === 'relay' && !this.relayOut.has(k(x, y))) this.relayOut.set(k(x, y), 15); } }
  removeBlock(x: number, y: number) { const key = k(x, y); this.blocks.delete(key); this.levers.delete(key); this.timed.delete(key); this.relayOut.delete(key); }

  toggleLever(x: number, y: number): boolean { const key = k(x, y); const v = !this.levers.get(key); this.levers.set(key, v); return v; }
  setSource(x: number, y: number, strength: number, durationMs: number, now: number) { this.timed.set(k(x, y), { strength, until: now + durationMs }); }

  // Compute power for every redstone block. Returns map "x,y" -> power(0..15).
  simulate(world: World, now: number): Map<string, number> {
    const power = new Map<string, number>();
    // seed sources
    const queue: { x: number; y: number; p: number }[] = [];
    for (const [key, b] of this.blocks) {
      const [x, y] = key.split(',').map(Number);
      let src = 0;
      if (b === 'redstone_block') src = 15;
      else if (b === 'lever') src = this.levers.get(key) ? 15 : 0;
      else if (b === 'button' || b === 'plate') { const t = this.timed.get(key); src = t && t.until > now ? t.strength : 0; }
      if (src > 0) { power.set(key, src); queue.push({ x, y, p: src }); }
      else if (!power.has(key)) power.set(key, 0);
    }
    if (this.timed.size) for (const [key, t] of [...this.timed]) if (t.until <= now) this.timed.delete(key);

    // BFS propagation through wire/relay (4-neighbours)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy, nk = k(nx, ny);
        const nb = world.blockAt(nx, ny);
        if (!isRedstone(nb)) continue;
        if (isPowerSource(nb)) continue; // sources don't receive
        let np: number;
        if (nb === 'relay') {
          // relay forwards a fixed configured output if it receives any power
          if (cur.p <= 0) continue;
          np = this.relayOut.get(nk) ?? 15;
        } else {
          np = cur.p - 1; // wire & component loss
        }
        if (np <= 0) continue;
        const existing = power.get(nk) ?? 0;
        if (np > existing) { power.set(nk, np); if (nb === 'redstone' || nb === 'relay') queue.push({ x: nx, y: ny, p: np }); else power.set(nk, np); }
      }
    }
    // ensure pistons/sound blocks adjacent to powered wire get power
    for (const [key, b] of this.blocks) {
      if (b === 'piston' || b === 'sticky_piston' || b === 'sound_block') {
        const [x, y] = key.split(',').map(Number);
        let best = power.get(key) ?? 0;
        for (const [dx, dy] of dirs) { const p = power.get(k(x + dx, y + dy)) ?? 0; if (p > best) best = p; }
        power.set(key, best);
      }
    }
    return power;
  }

  setRelayOutput(x: number, y: number, strength: number) { this.relayOut.set(k(x, y), Math.max(1, Math.min(15, strength))); }
}
