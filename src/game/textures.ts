// Procedural pixel-art texture factory. Minecraft-flavoured palette, drawn in
// code so the whole game shares one cohesive look. TILE = 32px world tiles.

import Phaser from 'phaser';

export const TILE = 32;

type PxFn = (x: number, y: number, c: string | number, w?: number, h?: number) => void;

function blockTile(
  scene: Phaser.Scene, key: string, base: string, light: string, dark: string,
  opts: { topGrass?: string; speckle?: string[]; border?: string } = {},
) {
  const N = 16, scale = TILE / N;
  const tex = scene.textures.createCanvas(key, TILE, TILE);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = base; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = light; ctx.fillRect(0, 0, TILE, scale);
  ctx.fillStyle = dark; ctx.fillRect(0, TILE - scale, TILE, scale);
  let seed = 0; for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const spk = opts.speckle || [light, dark];
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * N), y = Math.floor(rng() * N);
    ctx.fillStyle = spk[Math.floor(rng() * spk.length)];
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  ctx.globalAlpha = 1;
  if (opts.topGrass) {
    ctx.fillStyle = opts.topGrass; ctx.fillRect(0, 0, TILE, scale * 4);
    ctx.fillStyle = light;
    for (let i = 0; i < N; i += 2) ctx.fillRect(i * scale, scale * 4, scale, scale);
    ctx.fillStyle = opts.topGrass;
    for (let i = 1; i < N; i += 3) ctx.fillRect(i * scale, scale * 4, scale, scale);
  }
  ctx.strokeStyle = opts.border || 'rgba(0,0,0,0.20)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  tex.refresh();
}

function oreTile(scene: Phaser.Scene, key: string, oreColor: string, oreLight: string) {
  blockTile(scene, key, '#6b6b72', '#82828a', '#4a4a50', { border: 'rgba(0,0,0,0.30)' });
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  const N = 16, scale = TILE / N;
  const blobs = [[4, 5], [10, 4], [6, 10], [11, 11], [3, 12]];
  for (const [bx, by] of blobs) {
    ctx.fillStyle = oreColor; ctx.fillRect(bx * scale, by * scale, scale * 2, scale * 2);
    ctx.fillStyle = oreLight; ctx.fillRect(bx * scale, by * scale, scale, scale);
  }
  tex.refresh();
}

function pixelCanvas(scene: Phaser.Scene, key: string, w: number, h: number, scale: number, draw: (px: PxFn) => void) {
  const tex = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const px: PxFn = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c; ctx.fillRect(x * scale, y * scale, ww * scale, hh * scale); };
  draw(px);
  tex.refresh();
}

export function buildTextures(scene: Phaser.Scene) {
  // terrain
  blockTile(scene, 'tile_grass', '#8a6440', '#9a7450', '#6b4d2e', { topGrass: '#5fbf52' });
  blockTile(scene, 'tile_dirt', '#8a6440', '#9a7450', '#6b4d2e');
  blockTile(scene, 'tile_sand', '#e6d28a', '#f2e0a0', '#cdb568');
  blockTile(scene, 'tile_snow', '#e7eef6', '#ffffff', '#c2cfdd');
  blockTile(scene, 'tile_stone', '#8a8a93', '#a0a0a8', '#666670', { border: 'rgba(0,0,0,0.30)' });
  blockTile(scene, 'tile_planks', '#bd8a52', '#d29c64', '#946a3c');
  blockTile(scene, 'tile_glass', '#bfe9f5', '#e0f6fc', '#9cd0e0', { border: 'rgba(255,255,255,0.5)' });

  // planks: add plank seams
  (() => {
    const tex = scene.textures.get('tile_planks') as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext(); const s = TILE / 16;
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(0, 5 * s, TILE, s * 0.5); ctx.fillRect(0, 10 * s, TILE, s * 0.5);
    ctx.fillRect(8 * s, 0, s * 0.5, 5 * s); ctx.fillRect(4 * s, 5 * s, s * 0.5, 5 * s); ctx.fillRect(11 * s, 10 * s, s * 0.5, 6 * s);
    tex.refresh();
  })();

  // water — simple flat old-style water, no waves or foam.
  pixelCanvas(scene, 'tile_water', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        // very subtle two-tone so it reads as water but stays clean & flat
        const c = (x + y) % 8 < 4 ? '#2f7fc9' : '#2c79c0';
        px(x, y, c);
      }
    }
  });

  // ores
  oreTile(scene, 'tile_coal', '#26262c', '#43434c');
  oreTile(scene, 'tile_iron', '#d0a884', '#ecc8a2');
  oreTile(scene, 'tile_gold', '#f7d652', '#fff3a0');

  // tree trunk (top-down log centre, surrounded by transparent so canopy overlays)
  pixelCanvas(scene, 'tile_wood', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#7a5230');
    for (let i = 0; i < 16; i += 3) px(i, 0, '#5e3d22', 1, 16);
    px(6, 0, '#8f6238', 2, 16);
  });

  // leaves block
  pixelCanvas(scene, 'tile_leaves', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#3a9446');
    let seed = 99; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    for (let i = 0; i < 46; i++) px(Math.floor(rng() * 16), Math.floor(rng() * 16), rng() > 0.5 ? '#46a652' : '#2c7a38');
    px(5, 4, '#5fbf52', 2, 2); px(9, 8, '#5fbf52', 2, 2);
  });

  // ---- A WHOLE TREE sprite (trunk + round canopy), 2 tiles tall, drawn as one object ----
  // 32 wide x 48 tall (1 tile wide trunk, 2 tiles of canopy above the base)
  buildTreeSprite(scene);

  // crafting table
  pixelCanvas(scene, 'tile_crafting', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#9a6c3e');
    px(1, 1, '#7a5230', 14, 14);
    px(2, 2, '#caa05e', 12, 12);
    px(7, 2, '#5e3d22', 1, 12);
    px(2, 7, '#5e3d22', 12, 1);
    // tiny tools on top
    px(3, 3, '#cfcfd6', 2, 1); px(4, 4, '#8f6238', 1, 2);
    px(10, 10, '#8f6238', 1, 3); px(9, 9, '#cfcfd6', 3, 1);
  });

  // furnace
  pixelCanvas(scene, 'tile_furnace', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#7a7a82');
    px(1, 1, '#5c5c64', 14, 14);
    px(4, 3, '#2a2a30', 8, 6);
    px(5, 5, '#ff8a3c', 6, 3); px(6, 6, '#ffd27a', 4, 1);
    px(4, 11, '#9a9aa2', 8, 2);
  });

  // chest
  pixelCanvas(scene, 'tile_chest', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#9a6c3e');
    px(1, 1, '#7a5230', 14, 14);
    px(2, 2, '#b9854e', 12, 5);
    px(2, 8, '#a8743e', 12, 6);
    px(7, 6, '#f5d652', 2, 3); px(7, 7, '#5e3d22', 2, 1);
  });

  // torch
  pixelCanvas(scene, 'tile_torch', 16, 16, TILE / 16, (px) => {
    px(7, 7, '#7a5230', 2, 7);
    px(6, 3, '#ffb43c', 4, 5);
    px(7, 4, '#ffe08a', 2, 3);
    px(7, 2, '#fff6cf', 2, 1);
  });

  // flower / sapling / cactus
  pixelCanvas(scene, 'tile_flower', 16, 16, TILE / 16, (px) => {
    px(7, 9, '#2f8f3a', 2, 5);
    px(6, 5, '#e85d8a', 4, 4);
    px(7, 6, '#ffe08a', 2, 2);
  });

  // ---- redstone & mechanism blocks ----
  pixelCanvas(scene, 'tile_door', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#8a5a30');
    px(1, 0, '#6e4a26', 14, 16); px(2, 1, '#a8743e', 12, 14);
    px(3, 2, '#6e4a26', 5, 5); px(9, 2, '#6e4a26', 5, 5); px(3, 9, '#6e4a26', 5, 5); px(9, 9, '#6e4a26', 5, 5);
    px(11, 7, '#3a3a3a', 2, 2); // handle
  });
  pixelCanvas(scene, 'tile_door_open', 16, 16, TILE / 16, (px) => {
    px(0, 0, '#6e4a26', 3, 16); px(13, 0, '#6e4a26', 3, 16); // door swung to sides
  });
  pixelCanvas(scene, 'tile_redstone', 16, 16, TILE / 16, (px) => {
    px(7, 0, '#7a1010', 2, 16); px(0, 7, '#7a1010', 16, 2);
    px(7, 7, '#a01818', 2, 2);
  });
  pixelCanvas(scene, 'tile_redstone_block', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#b51c1c');
    px(0, 0, '#e23b3b', 16, 1); px(0, 15, '#7a1010', 16, 1);
    px(3, 3, '#e23b3b', 2, 2); px(10, 8, '#e23b3b', 2, 2); px(6, 11, '#e23b3b', 2, 2);
  });
  pixelCanvas(scene, 'tile_lever', 16, 16, TILE / 16, (px) => {
    px(5, 9, '#6b6b6b', 6, 5); px(6, 10, '#8b8b8b', 4, 3); // base
    px(8, 3, '#8a5a30', 2, 7); px(7, 2, '#d64541', 4, 3); // handle + knob
  });
  pixelCanvas(scene, 'tile_button', 16, 16, TILE / 16, (px) => {
    px(5, 6, '#8a8a93', 6, 4); px(6, 7, '#b0b0b8', 4, 2);
  });
  pixelCanvas(scene, 'tile_plate', 16, 16, TILE / 16, (px) => {
    px(2, 5, '#9a9aa2', 12, 6); px(3, 6, '#c0c0c8', 10, 4);
  });
  pixelCanvas(scene, 'tile_piston', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#8a8a93');
    px(0, 0, '#a0a0a8', 16, 1); px(0, 15, '#5c5c64', 16, 1);
    px(12, 1, '#6e4a26', 4, 14); px(13, 2, '#8a5a30', 2, 12); // wood face on +x side
    px(2, 5, '#5c5c64', 7, 6);
  });
  pixelCanvas(scene, 'tile_sticky_piston', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#8a8a93');
    px(0, 0, '#a0a0a8', 16, 1); px(0, 15, '#5c5c64', 16, 1);
    px(12, 1, '#3a9446', 4, 14); px(13, 2, '#5fbf52', 2, 12); // green sticky face
    px(2, 5, '#5c5c64', 7, 6);
  });
  pixelCanvas(scene, 'tile_piston_arm', 16, 16, TILE / 16, (px) => {
    px(0, 5, '#8a5a30', 16, 6); px(0, 6, '#a8743e', 16, 4); px(13, 4, '#6e4a26', 3, 8);
  });
  pixelCanvas(scene, 'tile_sound_block', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#5a3d8a');
    px(0, 0, '#7a5daa', 16, 1); px(0, 15, '#3a2560', 16, 1);
    px(5, 4, '#ffe08a', 6, 2); px(4, 6, '#ffe08a', 2, 6); px(6, 8, '#ffe08a', 5, 2); // music note
    px(8, 10, '#ffe08a', 3, 3);
  });
  pixelCanvas(scene, 'tile_relay', 16, 16, TILE / 16, (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, '#9a9aa2');
    px(0, 0, '#c0c0c8', 16, 1); px(0, 15, '#6c6c74', 16, 1);
    px(2, 7, '#7a1010', 4, 2); px(10, 7, '#a01818', 4, 2); // in/out wire
    px(6, 4, '#d64541', 4, 4); // arrow/diode
    px(7, 5, '#ff7a7e', 2, 2);
  });

  // mining crack frames (more stages = smoother)
  for (let f = 0; f < 5; f++) {
    const tex = scene.textures.createCanvas('crack' + f, TILE, TILE);
    if (!tex) continue;
    const ctx = tex.getContext();
    ctx.strokeStyle = 'rgba(10,10,10,' + (0.30 + f * 0.13) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(TILE / 2, 2); ctx.lineTo(TILE / 2 - 4 - f * 2, TILE / 2); ctx.lineTo(TILE / 2 + 2, TILE - 2);
    if (f > 1) { ctx.moveTo(2, TILE / 2); ctx.lineTo(TILE / 2, TILE / 2 - 3 - f); ctx.lineTo(TILE - 2, TILE / 2 + f); }
    if (f > 2) { ctx.moveTo(TILE - 4, 4); ctx.lineTo(TILE / 2 + 2, TILE / 2 - 2); }
    ctx.stroke();
    tex.refresh();
  }

  buildPlayer(scene);
  buildMobs(scene);
  buildItemIcons(scene);
  buildShips(scene);

  pixelCanvas(scene, 'dot', 8, 8, 1, (px) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, '#ffffff'); });

  // ---- water detail textures ----
  // soft round foam blob (additive)
  (() => {
    const N = 16; const tex = scene.textures.createCanvas('foam', N, N); if (!tex) return;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(220,240,255,0.4)'); g.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, N, N); tex.refresh();
  })();
  // a small white ripple ring
  (() => {
    const N = 24; const tex = scene.textures.createCanvas('ripple', N, N); if (!tex) return;
    const ctx = tex.getContext(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(N / 2, N / 2, N / 2 - 3, 0, Math.PI * 2); ctx.stroke(); tex.refresh();
  })();
  // tiny sparkle (4-point)
  pixelCanvas(scene, 'sparkle', 8, 8, 2, (px) => { px(3, 0, '#ffffff', 2, 8); px(0, 3, '#ffffff', 8, 2); });
  // a single foam dash (for directional bow waves)
  pixelCanvas(scene, 'wavedash', 8, 4, 2, (px) => { px(0, 1, '#dff0ff', 8, 2); px(1, 0, '#ffffff', 6, 1); });
  // selection highlight texture (rounded-ish square ring)
  (() => {
    const tex = scene.textures.createCanvas('sel', TILE, TILE);
    if (!tex) return; const ctx = tex.getContext();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
    tex.refresh();
  })();
}

// A full tree object: round green canopy (3 tiles wide) sitting on a trunk.
function buildTreeSprite(scene: Phaser.Scene) {
  // Canvas is 96 wide (3 tiles) x 112 tall. Origin will be set so trunk base sits on its tile.
  const W = 48, H = 56, scale = 2;
  const tex = scene.textures.createCanvas('tree', W * scale, H * scale);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const px: PxFn = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c; ctx.fillRect(x * scale, y * scale, ww * scale, hh * scale); };
  // trunk (bottom centre)
  px(22, 40, '#5e3d22', 4, 16);
  px(22, 40, '#7a5230', 2, 16);
  px(25, 42, '#4a2f18', 1, 14);
  // canopy: layered circle of leaves
  const cx = 24, cy = 22, r = 17;
  let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      const d = Math.sqrt(xx * xx + yy * yy);
      if (d <= r) {
        let c = '#3a9446';
        if (d > r - 3) c = '#2c7a38';
        else if (rng() > 0.7) c = '#46a652';
        else if (rng() > 0.85) c = '#2c7a38';
        px(cx + xx, cy + yy, c);
      }
    }
  }
  // highlights
  for (let i = 0; i < 26; i++) px(cx - 8 + Math.floor(rng() * 10), cy - 8 + Math.floor(rng() * 10), '#5fbf52');
  // shadow under canopy
  px(cx - 6, cy + r - 2, 'rgba(0,0,0,0.12)', 12, 3);
  tex.refresh();
}

function buildPlayer(scene: Phaser.Scene) {
  // 3 walk frames per direction (0 idle, 1 left-step, 2 right-step) -> smoother walk.
  const dirs = ['down', 'up', 'left', 'right'];
  for (const d of dirs) {
    for (let frame = 0; frame < 3; frame++) {
      pixelCanvas(scene, `player_${d}_${frame}`, 16, 16, 2, (px) => drawPlayer(px, d, frame));
    }
  }
}

function drawPlayer(px: PxFn, d: string, frame: number) {
  // shared body
  const skin = '#f0c088', hair = '#5b3a1a', shirt = '#3478e0', shirtDark = '#2358b0', pants = '#33415c', shoe = '#2a2f3a';
  // For side directions, draw a clear profile so left/right walking reads well.
  if (d === 'left' || d === 'right') {
    const flip = d === 'left';
    const m = (x: number) => flip ? 15 - x : x; // mirror helper (column)
    const P = (x: number, y: number, c: string, w = 1, h = 1) => {
      if (flip) px(15 - x - (w - 1), y, c, w, h); else px(x, y, c, w, h);
    };
    void m;
    // legs swing based on frame
    const front = frame === 1 ? 2 : frame === 2 ? -1 : 0;
    const back = frame === 1 ? -1 : frame === 2 ? 2 : 0;
    P(6, 12, pants, 2, 3); P(6, 15 + (back > 0 ? -1 : 0), shoe, 2 + (back > 0 ? 1 : 0), 1);
    P(8, 12, pants, 2, 3); P(8 + (front > 0 ? 1 : 0), 15, shoe, 2, 1);
    // body
    P(6, 7, shirt, 5, 5); P(6, 7, shirtDark, 1, 5);
    // arm swinging (one visible from side)
    const armY = 7 + (frame === 1 ? 1 : 0);
    P(9, armY, skin, 2, 4);
    // head profile
    P(6, 2, skin, 5, 5);
    P(6, 1, hair, 6, 3); P(5, 2, hair, 1, 3);
    // nose + eye facing forward (right side of head when facing right)
    P(10, 5, skin, 1, 1);
    P(9, 4, '#222', 1, 1);
    return;
  }
  // down / up: front & back view, symmetric
  // legs
  const lLeft = frame === 1 ? 1 : 0, lRight = frame === 2 ? 1 : 0;
  px(5, 12, pants, 2, 3 - lLeft); px(5, 15 - lLeft, shoe, 2, 1);
  px(9, 12, pants, 2, 3 - lRight); px(9, 15 - lRight, shoe, 2, 1);
  // body
  px(5, 7, shirt, 6, 5);
  px(5, 7, shirtDark, 1, 5);
  // arms swing opposite to legs
  const aL = frame === 2 ? 1 : 0, aR = frame === 1 ? 1 : 0;
  px(4, 7 + aL, skin, 1, 3); px(11, 7 + aR, skin, 1, 3);
  // head
  px(5, 2, skin, 6, 5);
  px(5, 1, hair, 6, 3);
  if (d === 'down') {
    px(6, 4, '#222', 1, 1); px(9, 4, '#222', 1, 1); // eyes
    px(7, 6, '#c98a6a', 2, 1); // mouth
  } else {
    // up: back of head all hair
    px(5, 2, hair, 6, 4);
  }
}

function buildMobs(scene: Phaser.Scene) {
  pixelCanvas(scene, 'mob_pig', 16, 16, 2, (px) => {
    px(4, 5, '#f0a3b8', 8, 7); px(3, 7, '#f0a3b8', 1, 3); px(12, 7, '#f0a3b8', 1, 3);
    px(5, 5, '#ffc0d0', 6, 2); px(6, 7, '#5a2030', 1, 1); px(9, 7, '#5a2030', 1, 1);
    px(7, 8, '#d97a93', 2, 2); px(6, 12, '#e07a98', 1, 2); px(9, 12, '#e07a98', 1, 2);
  });
  pixelCanvas(scene, 'mob_cow', 16, 16, 2, (px) => {
    px(4, 5, '#efefef', 8, 7); px(3, 7, '#efefef', 1, 3); px(12, 7, '#efefef', 1, 3);
    px(5, 5, '#3a3a3a', 2, 2); px(9, 7, '#3a3a3a', 2, 3); px(6, 7, '#222', 1, 1); px(9, 5, '#222', 1, 1);
    px(7, 9, '#f0a3b8', 2, 2); px(6, 12, '#cfcfcf', 1, 2); px(9, 12, '#cfcfcf', 1, 2);
  });
  pixelCanvas(scene, 'mob_chicken', 16, 16, 2, (px) => {
    px(6, 5, '#fafafa', 5, 6); px(6, 4, '#fafafa', 3, 2); px(10, 5, '#fafafa', 2, 2);
    px(11, 6, '#f2b53c', 1, 1); px(8, 5, '#222', 1, 1); px(6, 3, '#e5484d', 2, 1);
    px(7, 11, '#f2b53c', 1, 2); px(9, 11, '#f2b53c', 1, 2);
  });
  pixelCanvas(scene, 'mob_zombie', 16, 16, 2, (px) => {
    px(5, 7, '#3a6b4a', 6, 5); px(5, 12, '#2a3a5a', 2, 3); px(9, 12, '#2a3a5a', 2, 3);
    px(5, 2, '#5a8f5a', 6, 5); px(4, 2, '#3a5a3a', 6, 2); px(6, 5, '#1a2a1a', 1, 1); px(9, 5, '#1a2a1a', 1, 1);
    px(4, 7, '#5a8f5a', 1, 4); px(11, 7, '#5a8f5a', 1, 4); px(7, 6, '#1a2a1a', 2, 1);
  });
  pixelCanvas(scene, 'mob_slime', 16, 16, 2, (px) => {
    px(4, 6, '#5ad06a', 8, 7); px(4, 5, '#5ad06a', 8, 2); px(5, 5, '#7ae08a', 6, 1);
    px(6, 9, '#2a8f3a', 1, 1); px(9, 9, '#2a8f3a', 1, 1); px(7, 11, '#2a8f3a', 2, 1); px(4, 12, '#3aa84a', 8, 1);
  });
  pixelCanvas(scene, 'mob_villager', 16, 16, 2, (px) => {
    px(5, 7, '#6b4a2b', 6, 6); px(5, 12, '#4a3320', 6, 3); // brown robe
    px(5, 2, '#caa07a', 6, 5); // head
    px(4, 1, '#3a2a1a', 8, 2); // brow
    px(6, 5, '#222', 1, 1); px(9, 5, '#222', 1, 1);
    px(7, 6, '#9a6c5a', 2, 3); // big nose
    px(4, 7, '#caa07a', 1, 4); px(11, 7, '#caa07a', 1, 4); // arms crossed
  });
  pixelCanvas(scene, 'mob_skeleton', 16, 16, 2, (px) => {
    px(5, 2, '#e8e8e8', 6, 5); px(6, 4, '#222', 1, 1); px(9, 4, '#222', 1, 1); px(7, 6, '#888', 2, 1);
    px(6, 7, '#e8e8e8', 4, 5); px(5, 8, '#cfcfcf', 1, 3); px(10, 8, '#cfcfcf', 1, 3);
    px(6, 12, '#d8d8d8', 2, 3); px(9, 12, '#d8d8d8', 2, 3);
  });
}

function buildItemIcons(scene: Phaser.Scene) {
  pixelCanvas(scene, 'item_stick', 16, 16, 4, (px) => { for (let i = 0; i < 8; i++) px(11 - i, 4 + i, '#8f6238', 2, 2); px(10, 3, '#a8743e', 1, 1); });

  const pick = (handle: string, head: string, hl: string) => (px: PxFn) => {
    for (let i = 0; i < 8; i++) px(10 - i, 4 + i, handle, 2, 2);
    // arched head
    px(2, 2, head, 3, 2); px(2, 2, head, 2, 3);
    px(11, 2, head, 3, 2); px(13, 2, head, 2, 3);
    px(5, 1, head, 6, 2); px(5, 1, hl, 6, 1);
  };
  pixelCanvas(scene, 'item_wood_pick', 16, 16, 4, pick('#8f6238', '#bd8a52', '#d29c64'));
  pixelCanvas(scene, 'item_stone_pick', 16, 16, 4, pick('#8f6238', '#9a9aa2', '#c0c0c8'));
  pixelCanvas(scene, 'item_iron_pick', 16, 16, 4, pick('#8f6238', '#dadae2', '#ffffff'));
  pixelCanvas(scene, 'item_diamond_pick', 16, 16, 4, pick('#6f5a3a', '#5ad6e0', '#a8f4fa'));

  const axe = (handle: string, head: string, hl: string) => (px: PxFn) => {
    for (let i = 0; i < 8; i++) px(10 - i, 4 + i, handle, 2, 2);
    px(8, 1, head, 4, 5); px(11, 2, head, 2, 3); px(8, 1, hl, 3, 1);
  };
  pixelCanvas(scene, 'item_wood_axe', 16, 16, 4, axe('#8f6238', '#bd8a52', '#d29c64'));
  pixelCanvas(scene, 'item_stone_axe', 16, 16, 4, axe('#8f6238', '#9a9aa2', '#c0c0c8'));
  pixelCanvas(scene, 'item_iron_axe', 16, 16, 4, axe('#8f6238', '#dadae2', '#ffffff'));

  const shovel = (handle: string, head: string, hl: string) => (px: PxFn) => {
    for (let i = 0; i < 7; i++) px(10 - i, 3 + i, handle, 2, 2);
    px(2, 9, head, 4, 4); px(3, 10, hl, 2, 1);
  };
  pixelCanvas(scene, 'item_wood_shovel', 16, 16, 4, shovel('#8f6238', '#bd8a52', '#d29c64'));
  pixelCanvas(scene, 'item_stone_shovel', 16, 16, 4, shovel('#8f6238', '#9a9aa2', '#c0c0c8'));
  pixelCanvas(scene, 'item_iron_shovel', 16, 16, 4, shovel('#8f6238', '#dadae2', '#ffffff'));

  const sword = (blade: string, hl: string, guard = '#8f6238') => (px: PxFn) => {
    for (let i = 0; i < 9; i++) px(11 - i, 2 + i, blade, 2, 2);
    px(10, 1, hl, 2, 2);
    px(3, 10, guard, 4, 2); px(2, 11, '#5e3d22', 2, 3); px(7, 11, '#5e3d22', 2, 3);
  };
  pixelCanvas(scene, 'item_wood_sword', 16, 16, 4, sword('#d29c64', '#e7c39c'));
  pixelCanvas(scene, 'item_stone_sword', 16, 16, 4, sword('#c0c0c8', '#e8e8f0'));
  pixelCanvas(scene, 'item_iron_sword', 16, 16, 4, sword('#dadae2', '#ffffff'));
  pixelCanvas(scene, 'item_diamond_sword', 16, 16, 4, sword('#5ad6e0', '#a8f4fa'));

  pixelCanvas(scene, 'item_apple', 16, 16, 4, (px) => {
    px(5, 5, '#e5484d', 6, 7); px(6, 4, '#e5484d', 4, 2); px(7, 2, '#5e3d22', 1, 3); px(9, 2, '#4eaf52', 2, 2); px(6, 6, '#ff7a7e', 2, 2);
  });
  pixelCanvas(scene, 'item_meat', 16, 16, 4, (px) => {
    px(5, 6, '#b9603a', 6, 5); px(4, 7, '#b9603a', 8, 3); px(9, 5, '#e8e8e8', 2, 3); px(6, 7, '#d97a4a', 3, 2);
  });
  pixelCanvas(scene, 'item_coal', 16, 16, 4, (px) => {
    px(5, 5, '#26262c', 6, 6); px(4, 6, '#26262c', 8, 4); px(6, 6, '#43434c', 2, 2);
  });
  pixelCanvas(scene, 'item_iron', 16, 16, 4, (px) => {
    px(5, 5, '#d0a884', 6, 6); px(4, 6, '#d0a884', 8, 4); px(6, 6, '#ecc8a2', 2, 2);
  });
  pixelCanvas(scene, 'item_gold', 16, 16, 4, (px) => {
    px(5, 5, '#f7d652', 6, 6); px(4, 6, '#f7d652', 8, 4); px(6, 6, '#fff3a0', 2, 2);
  });
  pixelCanvas(scene, 'item_diamond', 16, 16, 4, (px) => {
    px(6, 3, '#5ad6e0', 4, 2); px(4, 5, '#5ad6e0', 8, 4); px(6, 9, '#5ad6e0', 4, 2); px(7, 5, '#a8f4fa', 2, 2);
  });
  pixelCanvas(scene, 'item_stick_bone', 16, 16, 4, (px) => { px(6, 3, '#e8e8e8', 4, 10); px(5, 2, '#fff', 2, 2); px(9, 2, '#fff', 2, 2); px(5, 12, '#fff', 2, 2); px(9, 12, '#fff', 2, 2); });

  // ship icons (little side-on boats)
  pixelCanvas(scene, 'item_raft', 16, 16, 4, (px) => {
    px(3, 9, '#9a6c3e', 10, 3); for (let i = 3; i < 13; i += 2) px(i, 9, '#6e4a26', 1, 3);
    px(2, 10, '#5a8fde', 12, 2);
  });
  pixelCanvas(scene, 'item_skiff', 16, 16, 4, (px) => {
    px(2, 9, '#b9854e', 12, 4); px(2, 12, '#8f6238', 12, 1);
    px(6, 5, '#7a5230', 4, 4); px(7, 6, '#f5d652', 1, 1); // crate
    px(1, 13, '#5a8fde', 14, 1);
  });
  pixelCanvas(scene, 'item_houseboat', 16, 16, 4, (px) => {
    px(2, 10, '#c79a5e', 12, 3); px(2, 13, '#8f6238', 12, 1);
    px(5, 4, '#9a6c3e', 7, 6); px(6, 5, '#b9854e', 5, 4);
    px(6, 6, '#aee0ef', 2, 2); px(9, 6, '#aee0ef', 2, 2); // windows
    px(1, 14, '#5a8fde', 14, 1);
  });
  pixelCanvas(scene, 'item_galleon', 16, 16, 4, (px) => {
    px(1, 10, '#a8743e', 14, 4); px(1, 13, '#6e4a26', 14, 1);
    px(7, 1, '#5e3d22', 1, 9); px(4, 2, '#f2e8d0', 5, 5); px(8, 3, '#f2e8d0', 5, 4); // sail/mast
    px(3, 6, '#9a6c3e', 9, 4); // cabin
    px(0, 14, '#5a8fde', 16, 1);
  });
}

// Top-down ship sprites (point right by default, origin centre). Pixel scale 2.
function buildShips(scene: Phaser.Scene) {
  const hx = (n: number) => '#' + n.toString(16).padStart(6, '0');
  // High-detail top-down hull builder. Smooth boat silhouette pointing +x (right),
  // wooden planking, dark trim outline, inner deck, and optional detail painter.
  const hull = (key: string, lenT: number, widT: number, hullN: number, deckN: number, trimN: number, draw?: (paint: { px: PxFn; L: number; W: number; cy: number; halfAt: (x: number) => number }) => void) => {
    const L = lenT * 16, W = widT * 16, scale = 2;
    const tex = scene.textures.createCanvas(key, L * scale, W * scale);
    if (!tex) return;
    const ctx = tex.getContext(); ctx.imageSmoothingEnabled = false;
    const px: PxFn = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = typeof c === 'number' ? hx(c as unknown as number) : c; ctx.fillRect(x * scale, y * scale, ww * scale, hh * scale); };
    const cy = W / 2;
    const hullC = hx(hullN), hullDark = hx(Math.max(0, hullN - 0x181410)), deck = hx(deckN), trim = hx(trimN);

    // smooth hull half-width profile: pointed bow (right), rounded stern (left)
    const halfAt = (x: number) => {
      const t = x / (L - 1);
      let half = (W / 2) - 0.5;
      // bow taper (right 30%)
      if (t > 0.7) half *= Math.cos((t - 0.7) / 0.3 * (Math.PI / 2));
      // stern round (left 14%)
      if (t < 0.14) half *= Math.sqrt(Math.max(0, t / 0.14));
      return half;
    };

    // 1) hull fill with outline + shading
    for (let x = 0; x < L; x++) {
      const half = halfAt(x); if (half < 0.5) continue;
      const h = Math.floor(half);
      for (let dy = -h; dy <= h; dy++) {
        const y = Math.floor(cy + dy);
        const edge = dy >= h - 1 || dy <= -h + 1 || x === 0;
        // bottom side a touch darker (faux 3D)
        px(x, y, edge ? trim : (dy > 1 ? hullDark : hullC));
      }
    }
    // 2) inner deck (inset ~3px)
    for (let x = 3; x < L - 4; x++) {
      const half = halfAt(x) - 2.5; if (half < 0.5) continue;
      const h = Math.floor(half);
      for (let dy = -h; dy <= h; dy++) px(x, Math.floor(cy + dy), deck);
    }
    // 3) plank seams along deck
    for (let x = 5; x < L - 5; x += 4) {
      const half = halfAt(x) - 3; if (half < 0.5) continue;
      const h = Math.floor(half);
      for (let dy = -h; dy <= h; dy++) px(x, Math.floor(cy + dy), trim);
    }
    if (draw) draw({ px, L, W, cy, halfAt });
    tex.refresh();
  };

  const railing = (px: PxFn, L: number, cy: number, halfAt: (x: number) => number, color: number) => {
    for (let x = 2; x < L - 3; x++) { const h = Math.floor(halfAt(x) - 1.5); if (h < 1) continue; px(x, Math.floor(cy - h), color); px(x, Math.floor(cy + h), color); }
  };

  // ---- RAFT: lashed-log raft with a paddle ----
  hull('ship_raft', 2, 2, 0x8a5a30, 0xb98f5e, 0x4a2f18, ({ px, L }) => {
    for (let i = 3; i < L - 2; i += 3) px(i, 3, 0x6e4a26, 1, 26); // log seams
    px(2, 14, 0x4a2f18, L - 4, 2); px(2, 16, 0x4a2f18, L - 4, 1); // rope lashings
    px(L - 7, 12, 0x8f6238, 6, 2); px(L - 3, 11, 0xcaa07a, 3, 4); // paddle/oar
  });

  // ---- SKIFF: tidy rowboat, bench, storage crate, oars ----
  hull('ship_skiff', 3, 2, 0x9a6638, 0xcd9a60, 0x5e3d22, ({ px, L, cy, halfAt }) => {
    railing(px, L, cy, halfAt, 0x6e4a26);
    px(10, cy - 7, 0x6e4a26, 2, 14); px(22, cy - 6, 0x6e4a26, 2, 12); // thwarts/benches
    px(30, cy - 6, 0x7a5230, 9, 12); px(31, cy - 5, 0xa8743e, 7, 10); px(34, cy - 1, 0xf5d652, 2, 2); // crate + latch
    px(4, cy - 11, 0x8f6238, 16, 2); px(4, cy + 9, 0x8f6238, 16, 2); // oars
    px(L - 6, cy - 3, 0x6e4a26, 5, 6); // tiller seat
  });

  // ---- HOUSEBOAT: cabin with shingled roof, windows, deck, helm wheel ----
  hull('ship_houseboat', 4, 3, 0x8a5a30, 0xc79a5e, 0x5e3d22, ({ px, L, W, cy, halfAt }) => {
    railing(px, L, cy, halfAt, 0x6e4a26);
    // cabin block
    const cxs = 14, cys = cy - 16, cw = 30, chh = 32;
    px(cxs, cys, 0x6e4a26, cw, chh); px(cxs + 1, cys + 1, 0xb9854e, cw - 2, chh - 2);
    // shingled roof rows
    for (let r = 0; r < chh - 4; r += 4) px(cxs + 2, cys + 2 + r, 0x9a6c3e, cw - 4, 2);
    // windows (glass)
    px(cxs + 4, cys + 6, 0xaee0ef, 6, 6); px(cxs + 4, cys + 6, 0xd6f3fb, 3, 3);
    px(cxs + 20, cys + 6, 0xaee0ef, 6, 6); px(cxs + 20, cys + 6, 0xd6f3fb, 3, 3);
    px(cxs + 4, cys + 20, 0xaee0ef, 6, 6); px(cxs + 20, cys + 20, 0xaee0ef, 6, 6);
    // door (front, toward bow)
    px(cxs + cw, cys + chh / 2 - 5, 0x4a2f18, 4, 10); px(cxs + cw + 1, cys + chh / 2 - 4, 0x8a5a30, 2, 8);
    // chimney
    px(cxs + 12, cys - 4, 0x7d7d86, 5, 6); px(cxs + 12, cys - 6, 0x5c5c64, 5, 2);
    // helm wheel (stern)
    px(6, cy - 4, 0x4a2f18, 2, 8); px(4, cy - 6, 0x8f6238, 6, 2); px(4, cy + 4, 0x8f6238, 6, 2); px(5, cy - 3, 0x6e4a26, 4, 6);
    void W;
  });

  // ---- GALLEON: multi-deck warship, masts with furled sails, cannons, castles ----
  hull('ship_galleon', 6, 4, 0x6e4a26, 0xb9854e, 0x3a2410, ({ px, L, W, cy, halfAt }) => {
    railing(px, L, cy, halfAt, 0x4a2f18);
    // raised quarterdeck (stern, left) and forecastle (bow, right)
    px(6, cy - 14, 0x8a5a30, 16, 28); px(8, cy - 12, 0xc79a5e, 12, 24); // stern castle
    for (let r = 0; r < 24; r += 4) px(9, cy - 12 + r, 0x9a6c3e, 10, 2);
    px(10, cy - 8, 0xaee0ef, 4, 4); px(10, cy + 4, 0xaee0ef, 4, 4); // captain windows
    // central cargo grates
    for (let gx = 30; gx < 64; gx += 9) for (let gy = -12; gy <= 8; gy += 9) { px(gx, cy + gy, 0x4a2f18, 6, 6); px(gx + 1, cy + gy + 1, 0x2a1a0e, 4, 4); for (let s = 1; s < 4; s++) px(gx + s * 1.4, cy + gy + 1, 0x6e4a26, 0.6, 4); }
    // two masts with crossed yards + furled sail
    for (const mx of [34, 56]) {
      px(mx - 1, cy - 16, 0x4a2f18, 3, 32); // mast vertical shadow ring
      px(mx, 6 * 0 + cy - 16, 0x6e4a26, 1, 32);
      px(mx - 10, cy - 1, 0x5e3d22, 22, 2); // yard
      px(mx - 9, cy - 4, 0xf2e8d0, 20, 3); // furled sail (cream)
      px(mx - 1, cy - 1, 0x8a5a30, 3, 3); // mast base ring
    }
    // bowsprit (pointed front)
    px(L - 8, cy - 1, 0x6e4a26, 8, 2); px(L - 2, cy - 2, 0x4a2f18, 2, 4);
    // cannons along sides
    for (let cx = 26; cx < 64; cx += 12) { px(cx, cy - Math.floor(halfAt(cx)) + 1, 0x2a2a30, 4, 2); px(cx, cy + Math.floor(halfAt(cx)) - 2, 0x2a2a30, 4, 2); }
    void W;
  });

  // Build 4 oriented + faux-3D variants for each ship from its base "points-right" sprite.
  for (const kind of ['raft', 'skiff', 'houseboat', 'galleon']) {
    buildShipOrientations(scene, 'ship_' + kind);
  }
}

// Take a base ship texture (drawn pointing RIGHT) and produce 4 directional
// textures (ship_<kind>_right/left/up/down) each with a top highlight + bottom
// drop-shadow rim so they read as raised 3D blocks, just like the trees.
function buildShipOrientations(scene: Phaser.Scene, baseKey: string) {
  const base = scene.textures.get(baseKey);
  if (!base) return;
  const srcImg = base.getSourceImage() as HTMLCanvasElement;
  const sw = srcImg.width, sh = srcImg.height;

  const make = (dir: 'right' | 'left' | 'up' | 'down') => {
    // up/down are rotated 90deg so dimensions swap
    const vertical = dir === 'up' || dir === 'down';
    const w = vertical ? sh : sw;
    const h = vertical ? sw : sh;
    // pad for the drop shadow
    const pad = 6;
    const tex = scene.textures.createCanvas(baseKey + '_' + dir, w + pad * 2, h + pad * 2);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(w / 2 + pad, h / 2 + pad);
    if (dir === 'left') ctx.scale(-1, 1);
    else if (dir === 'down') ctx.rotate(Math.PI / 2);
    else if (dir === 'up') ctx.rotate(-Math.PI / 2);
    ctx.drawImage(srcImg, -sw / 2, -sh / 2);
    ctx.restore();

    // ---- faux-3D rim: sample alpha, darken bottom edge, lighten top edge ----
    const W = w + pad * 2, H = h + pad * 2;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const A = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3];
    // build a "height shadow": copy of ship shifted down -> drop shadow underneath
    const shadow = scene.textures.createCanvas('__tmpshadow', W, H);
    const sctx = shadow!.getContext();
    sctx.drawImage(tex.getSourceImage() as HTMLCanvasElement, 0, 4); // shift down 4px
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = 'rgba(0,0,0,0.28)';
    sctx.fillRect(0, 0, W, H);
    // composite shadow under ship: redraw onto a fresh canvas
    const final = ctx;
    final.save();
    final.globalCompositeOperation = 'destination-over';
    final.drawImage(shadow!.getSourceImage() as HTMLCanvasElement, 0, 0);
    final.restore();
    scene.textures.remove('__tmpshadow');

    // top highlight & bottom shade along the silhouette edges
    const img2 = final.getImageData(0, 0, W, H);
    const d2 = img2.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d2[i + 3] < 40) continue;
      const topEdge = A(x, y - 1) < 40;     // nothing above -> rim light
      const botEdge = A(x, y + 1) < 40;     // nothing below -> rim shadow
      if (topEdge) { d2[i] = Math.min(255, d2[i] + 55); d2[i + 1] = Math.min(255, d2[i + 1] + 55); d2[i + 2] = Math.min(255, d2[i + 2] + 55); }
      else if (botEdge) { d2[i] = d2[i] * 0.6; d2[i + 1] = d2[i + 1] * 0.6; d2[i + 2] = d2[i + 2] * 0.6; }
    }
    final.putImageData(img2, 0, 0);
    tex.refresh();
  };
  make('right'); make('left'); make('up'); make('down');
}

const TOOL_FOOD = [
  'stick', 'wood_pick', 'stone_pick', 'iron_pick', 'diamond_pick',
  'wood_axe', 'stone_axe', 'iron_axe', 'wood_shovel', 'stone_shovel', 'iron_shovel',
  'wood_sword', 'stone_sword', 'iron_sword', 'diamond_sword',
  'apple', 'meat', 'coal', 'iron', 'gold', 'diamond',
  'raft', 'skiff', 'houseboat', 'galleon',
];

export function blockTextureKey(id: string): string { return 'tile_' + id; }
export function itemTextureKey(id: string): string {
  return TOOL_FOOD.includes(id) ? 'item_' + id : 'tile_' + id;
}
