import Phaser from 'phaser';
import { World, CHUNK } from './chunks';
import { buildTextures, TILE, blockTextureKey } from './textures';
import { BLOCKS, miningMultiplier, swordDamage, toolClass, isPlaceable, isShipItem, isRedstone, ALL_IDS, type BlockId, type ItemId } from './blocks';
import { Inventory } from './inventory';
import { sfx } from './audio';
import { SHIP_DEFS, makeShip, type ShipInstance, type ShipKind } from './ships';
import { RedstoneSim } from './redstone';

interface Mob {
  sprite: Phaser.GameObjects.Image;
  kind: 'pig' | 'cow' | 'chicken' | 'zombie' | 'slime' | 'skeleton' | 'villager';
  hostile: boolean;
  vx: number; vy: number; hp: number; wander: number; hurtFlash: number; bobT: number;
  homeX?: number; homeY?: number; // villagers wander near home
}

export interface Settings {
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  zoom: number; showGrid: boolean; mobCap: number; autosave: boolean;
  streamerMode: boolean;
}

export interface ShipPromptInfo {
  shipId: string; kind: ShipKind; name: string;
  drive: boolean; storage: boolean; enter: boolean;
  screenX: number; screenY: number; driving: boolean; inInterior?: boolean;
}

export interface TradePrompt { villagerId: number; screenX: number; screenY: number; }

export interface HudState {
  hp: number; maxHp: number; hunger: number; maxHunger: number;
  time: number; isNight: boolean; inventory: Inventory; nearTable: boolean;
  selected: number; alive: boolean; mode: 'survival' | 'creative';
  px: number; py: number;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  seed = 1;
  mode: 'survival' | 'creative' = 'survival';

  // chunk sprite streaming
  loadedChunks = new Map<string, Phaser.GameObjects.Container>();
  exploredChunks = new Set<string>();   // for minimap
  blockObjs = new Map<string, Phaser.GameObjects.GameObject>(); // "x,y" -> object/tree

  player!: Phaser.GameObjects.Image;
  playerDir: 'down' | 'up' | 'left' | 'right' = 'down';
  walkFrame = 0; walkPhase = 0; walkAnim = 0;
  px = 0; py = 0;

  inventory = new Inventory();
  mobs: Mob[] = [];
  villagers: Mob[] = [];
  drops: { sprite: Phaser.GameObjects.Image; item: ItemId; vx: number; vy: number; life: number }[] = [];

  hp = 100; maxHp = 100; hunger = 100; maxHunger = 100;
  daytime = 0.25;
  hungerAccum = 0; regenAccum = 0; damageAccum = 0; hurtCooldown = 0;

  mineTarget: { x: number; y: number; tree?: boolean } | null = null;
  mineProgress = 0;
  crackSprite!: Phaser.GameObjects.Image;
  nightOverlay!: Phaser.GameObjects.Rectangle;
  torchLights = new Map<string, Phaser.GameObjects.Image>();

  cursorTile = { x: 0, y: 0 };
  highlight!: Phaser.GameObjects.Image;

  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  pointerDown = false; rightDown = false; uiOpen = false;
  joystick = { dx: 0, dy: 0 };
  settings: Settings = { difficulty: 'normal', zoom: 1.8, showGrid: true, mobCap: 10, autosave: true, streamerMode: false };

  onHud?: (s: HudState) => void;
  onDeath?: () => void;
  onChat?: (msg: string, kind: 'system' | 'chat') => void;
  onShipPrompt?: (info: ShipPromptInfo | null) => void;
  onTradePrompt?: (info: TradePrompt | null) => void;
  onOpenStorage?: (shipId: string) => void;
  alive = true; spawnTile = { x: 0, y: 0 }; pendingSave: any;

  // ships
  ships: ShipInstance[] = [];
  shipSprites: Record<string, Phaser.GameObjects.Image> = {};
  wakeSprites: Record<string, Phaser.GameObjects.Image> = {};
  shipBob: Record<string, number> = {};       // per-ship bob phase
  shipWaveTimer: Record<string, number> = {}; // throttles wave-particle spawns
  drivingId: string | null = null; driveSpeed = 0; nearShipId: string | null = null;
  waterFX: Phaser.GameObjects.Image[] = [];
  waterFXTimer = 0;
  waterTiles: Phaser.GameObjects.Image[] = [];
  waterAnimT = 0; waterFrame = 0;
  interior: { shipId: string; kind: ShipKind; container: Phaser.GameObjects.Container; ix: number; iy: number } | null = null;
  exitZone: { x: number; y: number } | null = null; interiorEnterTime = 0;

  // redstone
  redstone = new RedstoneSim();
  redstoneAccum = 0;
  redstoneState = new Map<string, number>(); // "x,y" -> power for visuals
  pistonArms = new Map<string, { x: number; y: number }>(); // arm pos -> piston
  pistonFacing = new Map<string, [number, number]>();

  lastChunkKey = '';

  constructor() { super('GameScene'); }

  init(data: { seed: number; mode: 'survival' | 'creative'; save?: any; settings?: Partial<Settings> }) {
    this.seed = data.seed || 1;
    this.mode = data.mode || 'survival';
    this.pendingSave = data.save;
    if (data.settings) this.settings = { ...this.settings, ...data.settings };
  }

  create() {
    buildTextures(this);
    this.world = new World(this.seed);
    if (this.pendingSave?.overrides) this.world.loadOverrides(this.pendingSave.overrides);

    const spawn = this.world.findSpawn();
    this.spawnTile = { ...spawn };

    this.cameras.main.setBackgroundColor('#1a2a3a');

    this.player = this.add.image(0, 0, 'player_down_0').setDepth(700);
    this.nightOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1530, 0)
      .setOrigin(0).setDepth(900).setScrollFactor(0);
    this.scale.on('resize', (gs: Phaser.Structs.Size) => this.nightOverlay.setSize(gs.width, gs.height));
    this.highlight = this.add.image(0, 0, 'sel').setDepth(800).setOrigin(0).setVisible(false);
    this.crackSprite = this.add.image(0, 0, 'crack0').setDepth(801).setOrigin(0).setVisible(false);

    this.setupInput();

    if (this.pendingSave) this.applySave(this.pendingSave);
    else {
      this.inventory.add('wood_pick', 1); this.inventory.add('wood_axe', 1);
      this.inventory.add('planks', 16); this.inventory.add('torch', 8); this.inventory.add('crafting', 1);
      this.inventory.add('raft', 1);
      if (this.mode === 'creative') {
        (['stone', 'wood', 'glass', 'diamond_pick', 'diamond_sword', 'furnace', 'chest', 'door',
          'redstone', 'redstone_block', 'lever', 'button', 'plate', 'piston', 'sticky_piston', 'sound_block', 'relay',
          'raft', 'skiff', 'houseboat', 'galleon'] as ItemId[]).forEach(i => this.inventory.add(i, 64));
      }
    }

    this.px = (this.spawnTile.x + 0.5) * TILE;
    this.py = (this.spawnTile.y + 0.5) * TILE;
    this.player.setPosition(this.px, this.py);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.settings.zoom);

    this.streamChunks(true);
    this.spawnInitialMobs();
    this.emitHud();
    this.systemMsg('Welcome to 2Dcraft! Infinite world. /help for commands.');
  }

  systemMsg(m: string) { this.onChat && this.onChat(m, 'system'); }

  // ============== CHUNK STREAMING ==============
  chunkKey(cx: number, cy: number) { return cx + ',' + cy; }

  streamChunks(force = false) {
    const pcx = Math.floor(this.px / TILE / CHUNK), pcy = Math.floor(this.py / TILE / CHUNK);
    const k = pcx + ',' + pcy;
    if (!force && k === this.lastChunkKey) return;
    this.lastChunkKey = k;
    const R = 3; // chunk radius around player
    const want = new Set<string>();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cy = pcy + dy, ck = this.chunkKey(cx, cy);
      want.add(ck);
      if (!this.loadedChunks.has(ck)) this.buildChunkSprites(cx, cy);
      this.exploredChunks.add(ck);
    }
    // unload distant
    for (const [ck, cont] of this.loadedChunks) {
      if (!want.has(ck)) { cont.destroy(); this.loadedChunks.delete(ck); this.cleanupChunkObjs(ck); }
    }
  }

  cleanupChunkObjs(ck: string) {
    const [cx, cy] = ck.split(',').map(Number);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const wk = (x0 + lx) + ',' + (y0 + ly);
      const o = this.blockObjs.get(wk); if (o) { o.destroy(); this.blockObjs.delete(wk); }
      const t = this.torchLights.get(wk); if (t) { t.destroy(); this.torchLights.delete(wk); }
    }
  }

  buildChunkSprites(cx: number, cy: number) {
    const ck = this.chunkKey(cx, cy);
    const cont = this.add.container(0, 0).setDepth(0);
    this.loadedChunks.set(ck, cont);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly;
      const g = this.world.groundAt(x, y);
      const gs = this.add.image(x * TILE, y * TILE, blockTextureKey(g)).setOrigin(0).setDepth(0);
      cont.add(gs);
      // water is static now — no per-tile animation tracking
      if (this.settings.showGrid) {
        const grid = this.add.rectangle(x * TILE, y * TILE, TILE, TILE).setOrigin(0).setStrokeStyle(1, 0x000000, 0.07).setDepth(1);
        cont.add(grid);
      }
      const b = this.world.blockAt(x, y);
      if (b !== 'air') this.spawnBlockObj(x, y, b);
      if (this.world.treeAt(x, y)) this.spawnTreeObj(x, y);
    }
  }

  spawnBlockObj(x: number, y: number, b: BlockId) {
    const wk = x + ',' + y;
    const old = this.blockObjs.get(wk); if (old) old.destroy();
    const img = this.add.image(x * TILE, y * TILE, blockTextureKey(b === 'door_open' ? 'door_open' : b)).setOrigin(0);
    img.setDepth(b === 'leaves' ? 500 : (b === 'torch' || b === 'door' || b === 'door_open' ? 600 : 10));
    this.blockObjs.set(wk, img);
    if (b === 'torch') this.addTorchLight(x, y);
    if (isRedstone(b)) this.updateRedstoneVisual(x, y);
    return img;
  }

  spawnTreeObj(x: number, y: number) {
    const wk = 'tree:' + x + ',' + y;
    if (this.blockObjs.has(wk)) return;
    const img = this.add.image((x + 0.5) * TILE, (y + 1) * TILE, 'tree').setOrigin(0.5, 1).setScale(1.15);
    img.setDepth(700 + ((y + 1) * TILE) * 0.01);
    this.blockObjs.set(wk, img);
  }

  refreshTile(x: number, y: number) {
    const wk = x + ',' + y;
    const o = this.blockObjs.get(wk); if (o) { o.destroy(); this.blockObjs.delete(wk); }
    const t = this.torchLights.get(wk); if (t) { t.destroy(); this.torchLights.delete(wk); }
    const b = this.world.blockAt(x, y);
    // only render if its chunk is loaded
    const ck = this.chunkKey(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    if (!this.loadedChunks.has(ck)) return;
    if (b !== 'air') this.spawnBlockObj(x, y, b);
  }

  addTorchLight(x: number, y: number) {
    const light = this.add.image((x + 0.5) * TILE, (y + 0.5) * TILE, 'dot').setDepth(895).setScale(14).setTint(0xffcf6a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.torchLights.set(x + ',' + y, light);
  }

  spawnInitialMobs() {
    for (let i = 0; i < Math.min(this.settings.mobCap + 2, 14); i++) {
      const t = this.findGrassNear(this.spawnTile.x, this.spawnTile.y, 30);
      if (!t) continue;
      const kinds: Mob['kind'][] = ['pig', 'cow', 'chicken'];
      this.createMob(kinds[i % 3], (t.x + 0.5) * TILE, (t.y + 0.5) * TILE, false);
    }
  }

  findGrassNear(tx: number, ty: number, rad: number): { x: number; y: number } | null {
    for (let i = 0; i < 60; i++) {
      const x = tx + Phaser.Math.Between(-rad, rad), y = ty + Phaser.Math.Between(-rad, rad);
      if (this.world.groundAt(x, y) !== 'water' && this.world.blockAt(x, y) === 'air' && !this.world.treeAt(x, y)) return { x, y };
    }
    return null;
  }

  createMob(kind: Mob['kind'], x: number, y: number, hostile: boolean, home?: { x: number; y: number }) {
    const sprite = this.add.image(x, y, 'mob_' + kind).setDepth(680);
    const hp = hostile ? (kind === 'skeleton' ? 16 : 20) : 10;
    const m: Mob = { sprite, kind, hostile, vx: 0, vy: 0, hp, wander: 0, hurtFlash: 0, bobT: Math.random() * 6 };
    if (home) { m.homeX = home.x; m.homeY = home.y; }
    if (kind === 'villager') this.villagers.push(m); else this.mobs.push(m);
  }

  // spawn villagers for villages near the player
  ensureVillagers() {
    for (const v of this.world.villages) {
      for (const vg of v.villagers) {
        const id = 'vg:' + vg.x + ',' + vg.y;
        if ((this as any)[id]) continue;
        const d = Phaser.Math.Distance.Between(vg.x * TILE, vg.y * TILE, this.px, this.py);
        if (d < TILE * CHUNK * 3) {
          (this as any)[id] = true;
          this.createMob('villager', (vg.x + 0.5) * TILE, (vg.y + 0.5) * TILE, false, { x: vg.x, y: vg.y });
        }
      }
    }
  }

  // ============== INPUT ==============
  setupInput() {
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D'),
      UP: kb.addKey('UP'), DOWN: kb.addKey('DOWN'), LEFT: kb.addKey('LEFT'), RIGHT: kb.addKey('RIGHT'),
    };
    for (let i = 1; i <= 9; i++) kb.addKey(String(i)).on('down', () => { if (!this.uiOpen) this.selectSlot(i - 1); });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateCursor(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.uiOpen) return;
      this.updateCursor(p);
      if (p.rightButtonDown()) { this.rightDown = true; this.tryInteractOrPlace(); }
      else { this.pointerDown = true; }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonReleased()) this.rightDown = false; else this.pointerDown = false;
      this.mineTarget = null; this.mineProgress = 0; this.crackSprite.setVisible(false);
    });
    this.game.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  updateCursor(p: Phaser.Input.Pointer) { this.cursorTile = { x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) }; }
  setUiOpen(v: boolean) { this.uiOpen = v; this.pointerDown = false; this.rightDown = false; this.mineTarget = null; this.crackSprite.setVisible(false); }
  setJoystick(dx: number, dy: number) { this.joystick = { dx, dy }; }
  selectSlot(i: number) { if (i < 0 || i > 8) return; this.inventory.selected = i; sfx('click', 1.4); this.emitHud(); }
  applySettings(s: Partial<Settings>) {
    const gridChanged = s.showGrid !== undefined && s.showGrid !== this.settings.showGrid;
    this.settings = { ...this.settings, ...s };
    this.cameras.main.setZoom(this.interior ? this.settings.zoom * 0.85 : this.settings.zoom);
    if (gridChanged) { for (const [, c] of this.loadedChunks) c.destroy(); this.loadedChunks.clear(); for (const [, o] of this.blockObjs) o.destroy(); this.blockObjs.clear(); for (const [, t] of this.torchLights) t.destroy(); this.torchLights.clear(); this.streamChunks(true); }
  }

  // ============== UPDATE ==============
  update(_t: number, delta: number) {
    if (!this.alive) return;
    const dt = delta / 1000;
    if (this.interior) { this.updateInterior(dt); this.updateDayNight(dt); this.updateSurvival(delta); return; }

    if (this.drivingId) this.updateDriving(dt);
    else { this.handleMovement(dt); this.updateHighlight(); this.updateMining(delta); }

    this.streamChunks();
    this.ensureVillagers();
    this.updateMobs(dt);
    this.updateVillagers(dt);
    this.updateDrops(dt);
    this.updateDayNight(dt);
    this.updateSurvival(delta);
    this.updateRedstone(delta);
    this.updateIdleShips();
    this.updateWaterFX(dt);
    this.updateShipPrompt();
    this.updateTradePrompt();
    this.player.setDepth(700 + this.py * 0.01);
  }

  // Gentle bob for ships you're not currently driving.
  updateIdleShips() {
    for (const s of this.ships) {
      if (s.id === this.drivingId) continue;
      if (!this.shipSprites[s.id]) continue;
      const onWater = this.world.groundAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) === 'water';
      this.refreshShipSprite(s, onWater ? 3 : 0);
      const wake = this.wakeSprites[s.id];
      if (wake) wake.setAlpha(onWater ? 0.14 : 0.05);
    }
  }

  // Water is now flat & static — no shimmer frames or ambient sparkles/ripples.
  updateWaterFX(_dt: number) { /* intentionally empty: simple old-style water */ }

  handleMovement(dt: number) {
    if (this.uiOpen) { this.player.setTexture(`player_${this.playerDir}_0`); return; }
    let dx = 0, dy = 0; const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    dx += this.joystick.dx; dy += this.joystick.dy;

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      let speed = this.mode === 'creative' ? 200 : 135;
      const ct = this.tileAt(this.px, this.py);
      if (ct && this.world.groundAt(ct.x, ct.y) === 'water' && this.mode !== 'creative') speed = 75;
      const nx = this.px + dx * speed * dt, ny = this.py + dy * speed * dt;
      if (!this.collides(nx, this.py)) this.px = nx;
      if (!this.collides(this.px, ny)) this.py = ny;
      if (Math.abs(dx) > Math.abs(dy)) this.playerDir = dx < 0 ? 'left' : 'right'; else this.playerDir = dy < 0 ? 'up' : 'down';
      this.walkAnim += dt * 9;
      const cyc = Math.floor(this.walkAnim) % 4;
      this.walkFrame = cyc === 0 ? 0 : cyc === 1 ? 1 : cyc === 2 ? 0 : 2;
      const phase = Math.floor(this.walkAnim);
      if (phase !== this.walkPhase && (this.walkFrame === 1 || this.walkFrame === 2)) { this.walkPhase = phase; sfx('step', Phaser.Math.FloatBetween(0.9, 1.1)); }
      // pressure plate trigger
      this.checkPlate();
    } else { this.walkFrame = 0; this.walkAnim = 0; }
    this.player.setTexture(`player_${this.playerDir}_${this.walkFrame}`);
    this.player.setPosition(Math.round(this.px), Math.round(this.py));
  }

  checkPlate() {
    const t = this.tileAt(this.px, this.py); if (!t) return;
    if (this.world.blockAt(t.x, t.y) === 'plate') this.redstone.setSource(t.x, t.y, 15, 800, this.time.now);
  }

  tileAt(px: number, py: number) { return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) }; }

  isSolidAt(x: number, y: number): boolean {
    if (this.world.treeAt(x, y)) return true;
    const b = this.world.blockAt(x, y);
    return b !== 'air' && BLOCKS[b].solid;
  }

  collides(px: number, py: number): boolean {
    const r = 7;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]] as [number, number][]) {
      const t = this.tileAt(px + ox, py + oy);
      if (this.isSolidAt(t.x, t.y)) return true;
    }
    return false;
  }

  updateHighlight() {
    if (this.uiOpen) { this.highlight.setVisible(false); return; }
    const { x, y } = this.cursorTile;
    this.highlight.setVisible(true).setPosition(x * TILE, y * TILE);
  }

  reach() { return this.mode === 'creative' ? TILE * 7 : TILE * 4.2; }

  updateMining(delta: number) {
    if (this.uiOpen || !this.pointerDown) return;
    const { x, y } = this.cursorTile;
    const dist = Phaser.Math.Distance.Between(this.px, this.py, (x + 0.5) * TILE, (y + 0.5) * TILE);
    if (dist > this.reach()) return;
    const mob = this.mobAt((x + 0.5) * TILE, (y + 0.5) * TILE);
    if (mob && dist < TILE * 3.5) { this.hitMob(mob); this.pointerDown = false; return; }

    const isTree = this.world.treeAt(x, y);
    const b = this.world.blockAt(x, y);
    if (!isTree && (b === 'air' || !BLOCKS[b].mineable)) { this.mineTarget = null; this.crackSprite.setVisible(false); return; }
    if (!this.mineTarget || this.mineTarget.x !== x || this.mineTarget.y !== y) { this.mineTarget = { x, y, tree: isTree }; this.mineProgress = 0; }

    let hardness: number, mult: number;
    if (isTree) { hardness = 700; mult = toolClass(this.inventory.selectedItem()) === 'axe' ? miningMultiplier(this.inventory.selectedItem(), BLOCKS.wood) : 1.3; }
    else { hardness = BLOCKS[b].hardness; mult = miningMultiplier(this.inventory.selectedItem(), BLOCKS[b]); }
    if (this.mode === 'creative') hardness = 1;
    this.mineProgress += delta * mult;
    const frac = this.mineProgress / hardness;
    this.crackSprite.setVisible(true).setPosition(x * TILE, y * TILE).setTexture('crack' + Math.min(4, Math.floor(frac * 5)));
    if (frac >= 1) { if (isTree) this.breakTree(x, y); else this.breakBlock(x, y); this.mineTarget = null; this.mineProgress = 0; this.crackSprite.setVisible(false); }
  }

  breakTree(x: number, y: number) {
    if (!this.world.treeAt(x, y)) return;
    this.world.setTree(x, y, false);
    const wk = 'tree:' + x + ',' + y; const spr = this.blockObjs.get(wk) as Phaser.GameObjects.Image | undefined;
    if (spr) { this.spawnBreakParticles((x + 0.5) * TILE, y * TILE, 'leaves'); this.tweens.add({ targets: spr, scaleY: 0, alpha: 0, y: spr.y + 6, duration: 220, onComplete: () => spr.destroy() }); this.blockObjs.delete(wk); }
    for (let i = 0; i < Phaser.Math.Between(3, 5); i++) this.spawnDrop('wood', (x + 0.5) * TILE, (y + 0.4) * TILE);
    for (let i = 0; i < Phaser.Math.Between(1, 3); i++) this.spawnDrop('stick', (x + 0.5) * TILE, (y + 0.2) * TILE);
    for (let i = 0; i < Phaser.Math.Between(1, 2); i++) this.spawnDrop('leaves', (x + 0.5) * TILE, y * TILE);
    if (Math.random() < 0.4) this.spawnDrop('apple', (x + 0.5) * TILE, (y + 0.3) * TILE);
    sfx('break', 0.7); this.cameras.main.shake(90, 0.003);
  }

  breakBlock(x: number, y: number) {
    const b = this.world.blockAt(x, y);
    if (b === 'air' || b === 'piston_arm') return;
    const def = BLOCKS[b];
    let drop = def.drops;
    if ((b === 'iron' || b === 'gold') && toolClass(this.inventory.selectedItem()) !== 'pick') drop = undefined;
    if (b === 'diamond' && !['iron_pick', 'diamond_pick'].includes(this.inventory.selectedItem() as string)) drop = undefined;
    this.world.setBlock(x, y, 'air');
    const wk = x + ',' + y; const o = this.blockObjs.get(wk);
    if (o) { this.spawnBreakParticles((x + 0.5) * TILE, (y + 0.5) * TILE, b); o.destroy(); this.blockObjs.delete(wk); }
    if (b === 'torch') { const t = this.torchLights.get(wk); if (t) { t.destroy(); this.torchLights.delete(wk); } }
    if (isRedstone(b)) { this.redstone.removeBlock(x, y); this.redstoneState.delete(wk); }
    if (drop) this.spawnDrop(drop, (x + 0.5) * TILE, (y + 0.5) * TILE);
    sfx('break', Phaser.Math.FloatBetween(0.8, 1.2)); this.cameras.main.shake(50, 0.0018);
  }

  spawnBreakParticles(x: number, y: number, b: BlockId) {
    const tint = ({ grass: 0x5fbf52, dirt: 0x8a6440, stone: 0x8a8a93, wood: 0x7a5230, leaves: 0x3a9446, sand: 0xe6d28a, coal: 0x26262c, iron: 0xd0a884, gold: 0xf7d652, diamond: 0x5ad6e0 } as any)[b] || 0xffffff;
    for (let i = 0; i < 8; i++) {
      const p = this.add.image(x, y, 'dot').setDepth(750).setScale(Phaser.Math.FloatBetween(0.6, 1.8)).setTint(tint);
      const a = Math.random() * Math.PI * 2, sp = Phaser.Math.Between(20, 75);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp, alpha: 0, scale: 0, duration: 400, onComplete: () => p.destroy() });
    }
  }

  tryInteractOrPlace() {
    if (this.uiOpen || this.drivingId || this.interior) return;
    const { x, y } = this.cursorTile;
    const dist = Phaser.Math.Distance.Between(this.px, this.py, (x + 0.5) * TILE, (y + 0.5) * TILE);
    const cur = this.world.blockAt(x, y);

    // interact with redstone / doors first (within reach)
    if (dist <= this.reach()) {
      if (cur === 'lever') { this.toggleLever(x, y); return; }
      if (cur === 'button') { this.redstone.setSource(x, y, 15, 700, this.time.now); this.pulseVisual(x, y); sfx('click', 1.3); return; }
      if (cur === 'door' || cur === 'door_open') { this.toggleDoor(x, y); return; }
    }

    const item = this.inventory.selectedItem();
    if (item && isShipItem(item)) {
      if (this.mode === 'creative' || this.inventory.consumeSelected(1)) { this.deployShip(item as ShipKind); this.emitHud(); }
      return;
    }
    if (!item || !isPlaceable(item)) { if (item) this.eatSelected(); return; }
    if (cur !== 'air' || this.world.treeAt(x, y)) return;
    const pt = this.tileAt(this.px, this.py);
    if (pt.x === x && pt.y === y && BLOCKS[item as BlockId]?.solid) return;
    if (dist > this.reach()) return;
    if (this.mode !== 'creative' && !this.inventory.consumeSelected(1)) return;
    this.world.setBlock(x, y, item as BlockId);
    this.spawnBlockObj(x, y, item as BlockId);
    if (isRedstone(item as BlockId)) this.redstone.addBlock(x, y, item as BlockId);
    sfx('click', 0.9); this.emitHud();
  }

  // ============== DOORS ==============
  toggleDoor(x: number, y: number) {
    const cur = this.world.blockAt(x, y);
    const next: BlockId = cur === 'door' ? 'door_open' : 'door';
    this.world.setBlock(x, y, next);
    this.refreshTile(x, y);
    sfx('break', cur === 'door' ? 1.4 : 1.1);
  }

  toggleLever(x: number, y: number) {
    const on = this.redstone.toggleLever(x, y);
    this.pulseVisual(x, y);
    sfx('click', on ? 1.5 : 1.0);
  }

  pulseVisual(x: number, y: number) {
    const o = this.blockObjs.get(x + ',' + y) as Phaser.GameObjects.Image | undefined;
    if (o) this.tweens.add({ targets: o, scale: 1.15, duration: 80, yoyo: true });
  }

  // ============== REDSTONE ==============
  updateRedstone(delta: number) {
    this.redstoneAccum += delta;
    if (this.redstoneAccum < 90) return; // ~11Hz tick
    this.redstoneAccum = 0;
    const now = this.time.now;
    const powered = this.redstone.simulate(this.world, now);

    // apply effects: pistons, doors auto, sound blocks
    for (const [wk, power] of powered) {
      const prev = this.redstoneState.get(wk) || 0;
      const [x, y] = wk.split(',').map(Number);
      const b = this.world.blockAt(x, y);
      if (power > 0 && prev === 0) {
        if (b === 'piston' || b === 'sticky_piston') this.extendPiston(x, y, b === 'sticky_piston');
        if (b === 'sound_block') this.playSoundBlock(power);
      } else if (power === 0 && prev > 0) {
        if (b === 'piston' || b === 'sticky_piston') this.retractPiston(x, y, b === 'sticky_piston');
      }
      this.redstoneState.set(wk, power);
    }
    // clear states for unpowered redstone we tracked
    for (const [wk, prev] of this.redstoneState) {
      if (!powered.has(wk) && prev > 0) {
        const [x, y] = wk.split(',').map(Number);
        const b = this.world.blockAt(x, y);
        if (b === 'piston' || b === 'sticky_piston') this.retractPiston(x, y, b === 'sticky_piston');
        this.redstoneState.set(wk, 0);
      }
    }
    this.updateWireVisuals(powered);
  }

  updateWireVisuals(powered: Map<string, number>) {
    // tint redstone wire/relay by power
    for (const [wk, o] of this.blockObjs) {
      if (wk.startsWith('tree:')) continue;
      const [x, y] = wk.split(',').map(Number);
      const b = this.world.blockAt(x, y);
      if (b === 'redstone' || b === 'relay' || b === 'lever' || b === 'button' || b === 'plate') {
        const p = powered.get(wk) || 0;
        const img = o as Phaser.GameObjects.Image;
        if (b === 'redstone') img.setTint(Phaser.Display.Color.GetColor(80 + p * 11, 10, 10));
        else if (p > 0) img.setTint(0xff5555); else img.clearTint();
      }
    }
  }

  // piston pushes in the first open cardinal direction (prefers +x). The chosen
  // direction is remembered per-piston so retract reverses correctly.
  pistonDir(x: number, y: number): [number, number] {
    const stored = this.pistonFacing.get(x + ',' + y);
    if (stored) return stored;
    const opts: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const [dx, dy] of opts) { const b = this.world.blockAt(x + dx, y + dy); if (b === 'air' && !this.world.treeAt(x + dx, y + dy)) { this.pistonFacing.set(x + ',' + y, [dx, dy]); return [dx, dy]; } }
    this.pistonFacing.set(x + ',' + y, [1, 0]); return [1, 0];
  }
  extendPiston(x: number, y: number, _sticky: boolean) {
    const [dx, dy] = this.pistonDir(x, y);
    const fx = x + dx, fy = y + dy;
    const front = this.world.blockAt(fx, fy);
    const armKey = fx + ',' + fy;
    if (front === 'air' && !this.world.treeAt(fx, fy)) {
      this.world.setBlock(fx, fy, 'piston_arm');
      this.pistonArms.set(armKey, { x, y });
      const img = this.add.image(fx * TILE, fy * TILE, 'tile_piston_arm').setOrigin(0).setDepth(11);
      this.blockObjs.set(armKey, img);
      sfx('click', 0.6);
    } else if (front !== 'piston_arm' && front !== 'air' && BLOCKS[front]?.solid) {
      // push the block one tile forward if space
      const px2 = fx + dx, py2 = fy + dy;
      if (this.world.blockAt(px2, py2) === 'air' && !this.world.treeAt(px2, py2)) {
        this.world.setBlock(px2, py2, front); this.refreshTile(px2, py2);
        this.world.setBlock(fx, fy, 'piston_arm'); this.pistonArms.set(armKey, { x, y });
        const img = this.add.image(fx * TILE, fy * TILE, 'tile_piston_arm').setOrigin(0).setDepth(11);
        const oldFront = this.blockObjs.get(armKey); if (oldFront) oldFront.destroy();
        this.blockObjs.set(armKey, img);
        sfx('click', 0.5);
      }
    }
  }
  retractPiston(x: number, y: number, _sticky: boolean) {
    const [dx, dy] = this.pistonDir(x, y);
    const fx = x + dx, fy = y + dy; const armKey = fx + ',' + fy;
    if (this.world.blockAt(fx, fy) === 'piston_arm') {
      this.world.setBlock(fx, fy, 'air');
      const o = this.blockObjs.get(armKey); if (o) { o.destroy(); this.blockObjs.delete(armKey); }
      this.pistonArms.delete(armKey);
      sfx('click', 0.4);
    }
  }

  playSoundBlock(power: number) {
    // pitch depends on signal strength (1..15)
    const rate = 0.5 + (power / 15) * 1.8;
    sfx('pickup', rate);
  }

  // ============== SHIPS (unchanged mechanics) ==============
  dirFromAngle(a: number): 'right' | 'left' | 'up' | 'down' {
    // normalize to [-PI, PI]
    let ang = Math.atan2(Math.sin(a), Math.cos(a));
    if (ang >= -Math.PI / 4 && ang < Math.PI / 4) return 'right';
    if (ang >= Math.PI / 4 && ang < 3 * Math.PI / 4) return 'down';
    if (ang >= -3 * Math.PI / 4 && ang < -Math.PI / 4) return 'up';
    return 'left';
  }

  createShipSprite(ship: ShipInstance) {
    const dir = this.dirFromAngle(ship.angle);
    const spr = this.add.image(ship.x, ship.y, 'ship_' + ship.kind + '_' + dir).setDepth(650).setOrigin(0.5);
    this.shipSprites[ship.id] = spr;
    // soft shadow blob beneath (sells the floating-above-water look)
    const wake = this.add.image(ship.x, ship.y, 'foam').setDepth(11).setScale(SHIP_DEFS[ship.kind].w * 1.4).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setTint(0xeaf6ff);
    this.wakeSprites[ship.id] = wake;
    this.shipBob[ship.id] = Math.random() * Math.PI * 2;
    this.shipWaveTimer[ship.id] = 0;
    this.refreshShipSprite(ship, 0);
  }

  // Update a (possibly idle) ship's directional texture, gentle bob, and depth.
  refreshShipSprite(ship: ShipInstance, moving: number) {
    const spr = this.shipSprites[ship.id]; if (!spr) return;
    const dir = this.dirFromAngle(ship.angle);
    const texKey = 'ship_' + ship.kind + '_' + dir;
    if (spr.texture.key !== texKey) spr.setTexture(texKey);
    this.shipBob[ship.id] += (moving > 4 ? 0.12 : 0.05);
    const bob = Math.sin(this.shipBob[ship.id]) * (moving > 4 ? 3 : 1.6);
    const tilt = Math.sin(this.shipBob[ship.id] * 0.5) * 0.02; // tiny rock
    spr.setPosition(ship.x, ship.y + bob).setRotation(tilt);
    // depth-sort like trees so the player draws in front when below the boat
    spr.setDepth(640 + ship.y * 0.01);
    // soft shadow under the boat tracks the bob inversely (kept — sells floating)
    const wake = this.wakeSprites[ship.id];
    if (wake) { wake.setPosition(ship.x, ship.y + 6 - bob * 0.4); }
    // (no foam/wave spray — water stays clean per request; bounce is kept)
  }
  deployShip(kind: ShipKind) {
    const ang = ({ down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 } as any)[this.playerDir];
    const ship = makeShip(kind, this.px + Math.cos(ang) * TILE * 1.6, this.py + Math.sin(ang) * TILE * 1.6);
    ship.angle = ang; this.ships.push(ship); this.createShipSprite(ship);
    sfx('click', 0.7); this.systemMsg(`Deployed a ${SHIP_DEFS[kind].name}. Stand near it for options.`);
  }
  nearestShip(): ShipInstance | null {
    let best: ShipInstance | null = null, bd = Infinity;
    for (const s of this.ships) {
      const def = SHIP_DEFS[s.kind];
      const reach = TILE * (Math.max(def.w, def.h) * 0.5 + 1.6);
      const d = Phaser.Math.Distance.Between(this.px, this.py, s.x, s.y);
      if (d < reach && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  updateShipPrompt() {
    if (!this.onShipPrompt) return;
    if (this.drivingId) {
      const s = this.ships.find(x => x.id === this.drivingId)!; const def = SHIP_DEFS[s.kind];
      const sp = this.worldToScreen(s.x, s.y - def.h * TILE * 0.4);
      this.onShipPrompt({ shipId: s.id, kind: s.kind, name: def.name, drive: true, storage: def.caps.storage > 0, enter: def.caps.enter, screenX: sp.x, screenY: sp.y, driving: true });
      this.nearShipId = s.id; return;
    }
    const s = this.nearestShip();
    if (!s) { if (this.nearShipId) { this.nearShipId = null; this.onShipPrompt(null); } return; }
    const def = SHIP_DEFS[s.kind]; const sp = this.worldToScreen(s.x, s.y - def.h * TILE * 0.5);
    this.nearShipId = s.id;
    this.onShipPrompt({ shipId: s.id, kind: s.kind, name: def.name, drive: def.caps.drive, storage: def.caps.storage > 0, enter: def.caps.enter, screenX: sp.x, screenY: sp.y, driving: false });
  }
  worldToScreen(wx: number, wy: number) { const cam = this.cameras.main; return { x: (wx - cam.worldView.x) * cam.zoom, y: (wy - cam.worldView.y) * cam.zoom }; }

  startDriving(shipId: string) {
    const s = this.ships.find(x => x.id === shipId); if (!s) return;
    this.drivingId = shipId; this.driveSpeed = 0; this.player.setVisible(false); sfx('click', 0.8);
    this.systemMsg(`Driving ${SHIP_DEFS[s.kind].name}. WASD to steer.`);
  }
  stopDriving() {
    if (!this.drivingId) return;
    const s = this.ships.find(x => x.id === this.drivingId); this.drivingId = null; this.driveSpeed = 0; this.player.setVisible(true);
    if (s) { const off = SHIP_DEFS[s.kind].w * TILE * 0.5 + 10; this.px = s.x + Math.cos(s.angle + Math.PI / 2) * off; this.py = s.y + Math.sin(s.angle + Math.PI / 2) * off; this.player.setPosition(this.px, this.py); }
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }
  updateDriving(dt: number) {
    const s = this.ships.find(x => x.id === this.drivingId); if (!s) { this.drivingId = null; this.player.setVisible(true); return; }
    const def = SHIP_DEFS[s.kind];
    if (this.uiOpen) { this.driveSpeed *= 0.96; this.cameras.main.centerOn(s.x, s.y); return; }
    const k = this.keys; let thrust = 0, turn = 0;
    if (k.W.isDown || k.UP.isDown) thrust += 1;
    if (k.S.isDown || k.DOWN.isDown) thrust -= 1;
    if (k.A.isDown || k.LEFT.isDown) turn -= 1;
    if (k.D.isDown || k.RIGHT.isDown) turn += 1;
    thrust += -this.joystick.dy; turn += this.joystick.dx;
    s.angle += turn * def.turn * dt * (0.4 + Math.min(1, Math.abs(this.driveSpeed) / def.speed) * 0.6);
    this.driveSpeed += thrust * def.speed * 2 * dt;
    this.driveSpeed = Phaser.Math.Clamp(this.driveSpeed, -def.speed * 0.5, def.speed); this.driveSpeed *= 0.985;
    const nx = s.x + Math.cos(s.angle) * this.driveSpeed * dt, ny = s.y + Math.sin(s.angle) * this.driveSpeed * dt;
    if (!this.shipCollides(nx, s.y)) s.x = nx; else this.driveSpeed *= -0.3;
    if (!this.shipCollides(s.x, ny)) s.y = ny; else this.driveSpeed *= -0.3;
    // directional sprite + bob + directional waves
    this.refreshShipSprite(s, Math.abs(this.driveSpeed));
    const wake = this.wakeSprites[s.id];
    if (wake) wake.setAlpha(0.12 + Math.min(0.4, Math.abs(this.driveSpeed) / def.speed * 0.4));
    this.cameras.main.centerOn(s.x, s.y);
    this.streamChunksAround(s.x, s.y);
    if (Math.abs(this.driveSpeed) > 5 && Math.random() < 0.04) sfx('step', 0.6);
  }
  streamChunksAround(wx: number, wy: number) { const ox = this.px, oy = this.py; this.px = wx; this.py = wy; this.streamChunks(); this.px = ox; this.py = oy; }
  shipCollides(px: number, py: number): boolean { const t = this.tileAt(px, py); const b = this.world.blockAt(t.x, t.y); return b !== 'air' && BLOCKS[b].solid && b !== 'leaves'; }

  // ---- interiors ----
  enterShip(shipId: string) {
    const s = this.ships.find(x => x.id === shipId); if (!s) return;
    const def = SHIP_DEFS[s.kind]; if (!def.caps.enter || !def.rooms) return;
    if (this.drivingId) this.stopDriving();
    const W = def.interiorW! * TILE, H = def.interiorH! * TILE;
    const ox = 8, oy = 8; const container = this.add.container(ox, oy).setDepth(1500);
    const backdrop = this.add.rectangle(ox - 4000, oy - 4000, 12000, 12000, 0x14100a).setOrigin(0).setDepth(1490); container.add(backdrop);
    const floor = this.add.rectangle(0, 0, W, H, 0x3a2a1a).setOrigin(0).setStrokeStyle(6, 0x14100a); container.add(floor);
    for (const r of def.rooms) {
      const rr = this.add.rectangle(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE, r.color).setOrigin(0).setStrokeStyle(3, 0x2a1a0e); container.add(rr);
      const label = this.add.text(r.x * TILE + 6, r.y * TILE + 6, r.name, { fontFamily: 'monospace', fontSize: '11px', color: '#e8d8b8' }); container.add(label);
      for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if ((xx + yy) % 4 === 0) container.add(this.add.rectangle((r.x + xx) * TILE, (r.y + yy) * TILE, TILE, TILE, 0xffffff, 0.03).setOrigin(0));
    }
    container.add([this.add.rectangle(0, 0, W, 8, 0x2a1a0e).setOrigin(0), this.add.rectangle(0, H - 8, W, 8, 0x2a1a0e).setOrigin(0), this.add.rectangle(0, 0, 8, H, 0x2a1a0e).setOrigin(0), this.add.rectangle(W - 8, 0, 8, H, 0x2a1a0e).setOrigin(0)]);
    const chestRooms = def.rooms.filter(r => /storage|cargo|hold|armory|quarters/i.test(r.name));
    for (const r of (chestRooms.length ? chestRooms : [def.rooms[0]])) {
      const cx = (r.x + r.w - 1) * TILE, cy = (r.y + 1) * TILE;
      const chest = this.add.image(cx + ox, cy + oy, 'tile_chest').setDepth(1501).setInteractive({ useHandCursor: true });
      chest.on('pointerdown', () => this.onOpenStorage && this.onOpenStorage(s.id)); (chest as any).rel = { x: cx, y: cy }; container.add(chest);
    }
    const exX = W / 2, exY = H - 24;
    container.add([this.add.rectangle(exX + ox, exY + oy, 40, 16, 0x5fbf52).setStrokeStyle(2, 0x2c5e2a), this.add.text(exX + ox - 22, exY + oy - 24, 'EXIT', { fontFamily: 'monospace', fontSize: '11px', color: '#bfffb0' })]);
    this.exitZone = { x: exX, y: exY };
    const firstRoom = def.rooms[0];
    this.interior = { shipId: s.id, kind: s.kind, container, ix: (firstRoom.x + firstRoom.w / 2) * TILE, iy: (firstRoom.y + firstRoom.h / 2) * TILE };
    this.player.setVisible(true).setDepth(1600); this.cameras.main.stopFollow(); this.cameras.main.setZoom(this.settings.zoom * 0.85);
    this.interiorEnterTime = this.time.now; this.positionInteriorPlayer();
    this.systemMsg(`Boarded the ${def.name}. Walk to the green EXIT door to leave.`);
  }
  positionInteriorPlayer() { if (!this.interior) return; const c = this.interior.container; this.player.setPosition(c.x + this.interior.ix, c.y + this.interior.iy); this.cameras.main.centerOn(this.player.x, this.player.y); }
  updateInterior(dt: number) {
    if (!this.interior) return;
    if (this.uiOpen) { this.player.setTexture(`player_${this.playerDir}_0`); return; }
    const def = SHIP_DEFS[this.interior.kind]; const W = def.interiorW! * TILE, H = def.interiorH! * TILE;
    let dx = 0, dy = 0; const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1; if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1; if (k.S.isDown || k.DOWN.isDown) dy += 1;
    dx += this.joystick.dx; dy += this.joystick.dy;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len; const sp = 120;
      this.interior.ix = Phaser.Math.Clamp(this.interior.ix + dx * sp * dt, 14, W - 14);
      this.interior.iy = Phaser.Math.Clamp(this.interior.iy + dy * sp * dt, 14, H - 14);
      if (Math.abs(dx) > Math.abs(dy)) this.playerDir = dx < 0 ? 'left' : 'right'; else this.playerDir = dy < 0 ? 'up' : 'down';
      this.walkAnim += dt * 9; const cyc = Math.floor(this.walkAnim) % 4; this.walkFrame = cyc === 0 ? 0 : cyc === 1 ? 1 : cyc === 2 ? 0 : 2;
    } else { this.walkFrame = 0; this.walkAnim = 0; }
    this.player.setTexture(`player_${this.playerDir}_${this.walkFrame}`); this.positionInteriorPlayer();
    if (this.exitZone && this.time.now - this.interiorEnterTime > 600 && Phaser.Math.Distance.Between(this.interior.ix, this.interior.iy, this.exitZone.x, this.exitZone.y) < 28) this.exitShip();
    let nearChest = false;
    for (const ch of this.interior.container.list) { const rel = (ch as any).rel; if (rel && Phaser.Math.Distance.Between(this.interior.ix, this.interior.iy, rel.x, rel.y) < 40) nearChest = true; }
    if (this.onShipPrompt) { const sp = this.worldToScreen(this.player.x, this.player.y - 40); this.onShipPrompt({ shipId: this.interior.shipId, kind: this.interior.kind, name: nearChest ? 'Chest — Open Storage' : 'Inside ' + def.name, drive: false, storage: nearChest, enter: false, inInterior: true, screenX: sp.x, screenY: sp.y, driving: false }); }
  }
  exitShip() {
    if (!this.interior) return;
    const s = this.ships.find(x => x.id === this.interior!.shipId);
    this.interior.container.destroy(); this.interior = null; this.exitZone = null; this.player.setDepth(700);
    this.cameras.main.setZoom(this.settings.zoom);
    if (s) { const off = SHIP_DEFS[s.kind].w * TILE * 0.5 + 12; this.px = s.x + Math.cos(s.angle + Math.PI / 2) * off; this.py = s.y + Math.sin(s.angle + Math.PI / 2) * off; this.player.setPosition(this.px, this.py); }
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12); this.streamChunks(true); this.systemMsg('Left the ship.');
  }
  getShip(id: string) { return this.ships.find(s => s.id === id); }
  uiDrive(shipId: string) { if (this.drivingId === shipId) this.stopDriving(); else this.startDriving(shipId); }
  uiEnter(shipId: string) { this.enterShip(shipId); }
  uiExitShip() { this.exitShip(); }
  shipStorage(shipId: string) { const s = this.getShip(shipId); return s ? { slots: s.storage, name: SHIP_DEFS[s.kind].name } : null; }

  // ============== DROPS ==============
  spawnDrop(item: ItemId, x: number, y: number) {
    const tool = ['stick', 'wood_pick', 'stone_pick', 'iron_pick', 'diamond_pick', 'wood_axe', 'stone_axe', 'iron_axe', 'wood_shovel', 'stone_shovel', 'iron_shovel', 'wood_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'apple', 'meat', 'coal', 'iron', 'gold', 'diamond', 'raft', 'skiff', 'houseboat', 'galleon'].includes(item);
    const key = tool ? 'item_' + item : 'tile_' + item;
    const spr = this.add.image(x, y, this.textures.exists(key) ? key : 'tile_dirt').setDepth(720).setScale(0.5);
    this.tweens.add({ targets: spr, y: y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const a = Math.random() * Math.PI * 2; this.drops.push({ sprite: spr, item, vx: Math.cos(a) * 34, vy: Math.sin(a) * 34, life: 0 });
  }
  updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.life += dt; d.sprite.x += d.vx * dt; d.sprite.y += d.vy * dt; d.vx *= 0.88; d.vy *= 0.88;
      const dist = Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, this.px, this.py);
      if (d.life > 0.35 && dist < TILE * 1.6) {
        if (dist > TILE * 0.5) { const a = Math.atan2(this.py - d.sprite.y, this.px - d.sprite.x); d.sprite.x += Math.cos(a) * 120 * dt; d.sprite.y += Math.sin(a) * 120 * dt; }
        else if (this.inventory.add(d.item, 1)) { sfx('pickup', 1.2); d.sprite.destroy(); this.drops.splice(i, 1); this.emitHud(); }
      }
      if (d.life > 180) { d.sprite.destroy(); this.drops.splice(i, 1); }
    }
  }

  // ============== MOBS ==============
  mobAt(x: number, y: number): Mob | null {
    for (const m of [...this.mobs, ...this.villagers]) if (Phaser.Math.Distance.Between(x, y, m.sprite.x, m.sprite.y) < TILE * 0.8) return m;
    return null;
  }
  hitMob(m: Mob) {
    if (m.kind === 'villager') { this.systemMsg('The villager dislikes that! Right-click to trade instead.'); }
    const dmg = swordDamage(this.inventory.selectedItem()); m.hp -= dmg; m.hurtFlash = 0.16;
    const a = Math.atan2(m.sprite.y - this.py, m.sprite.x - this.px); m.vx += Math.cos(a) * 140; m.vy += Math.sin(a) * 140;
    sfx('break', 1.5); this.cameras.main.shake(40, 0.003);
    if (m.hp <= 0) {
      if (m.kind === 'pig' || m.kind === 'cow') this.spawnDrop('meat', m.sprite.x, m.sprite.y);
      if (m.kind === 'chicken' && Math.random() < 0.7) this.spawnDrop('meat', m.sprite.x, m.sprite.y);
      if (m.kind === 'skeleton') this.spawnDrop('stick', m.sprite.x, m.sprite.y);
      m.sprite.destroy();
      const arr = m.kind === 'villager' ? this.villagers : this.mobs; arr.splice(arr.indexOf(m), 1);
    }
  }
  difficultyDamage() { return ({ peaceful: 0, easy: 0.25, normal: 0.45, hard: 0.8 } as any)[this.settings.difficulty]; }
  updateMobs(dt: number) {
    const isNight = this.daytime > 0.72 || this.daytime < 0.18; const peaceful = this.settings.difficulty === 'peaceful';
    const hostiles = this.mobs.filter(m => m.hostile).length;
    if (isNight && !peaceful && hostiles < this.settings.mobCap && Math.random() < 0.012) {
      const t = this.findGrassNear(Math.floor(this.px / TILE), Math.floor(this.py / TILE), 18);
      if (t) { const d = Phaser.Math.Distance.Between((t.x + 0.5) * TILE, (t.y + 0.5) * TILE, this.px, this.py); if (d > TILE * 8) { const r = Math.random(); this.createMob(r < 0.45 ? 'zombie' : r < 0.8 ? 'slime' : 'skeleton', (t.x + 0.5) * TILE, (t.y + 0.5) * TILE, true); } }
    }
    if (!isNight || peaceful) for (let i = this.mobs.length - 1; i >= 0; i--) { const m = this.mobs[i]; if (m.hostile && Math.random() < 0.005) { m.sprite.destroy(); this.mobs.splice(i, 1); } }
    // despawn far mobs
    for (let i = this.mobs.length - 1; i >= 0; i--) { const m = this.mobs[i]; if (Phaser.Math.Distance.Between(m.sprite.x, m.sprite.y, this.px, this.py) > TILE * CHUNK * 4) { m.sprite.destroy(); this.mobs.splice(i, 1); } }

    for (const m of this.mobs) {
      m.wander -= dt; m.bobT += dt;
      if (m.hostile) {
        const dist = Phaser.Math.Distance.Between(m.sprite.x, m.sprite.y, this.px, this.py);
        if (dist < TILE * 10) { const a = Math.atan2(this.py - m.sprite.y, this.px - m.sprite.x); const sp = m.kind === 'slime' ? 26 : m.kind === 'skeleton' ? 36 : 44; m.vx += Math.cos(a) * sp * dt * 6; m.vy += Math.sin(a) * sp * dt * 6; if (dist < TILE * 0.9 && !this.drivingId && !this.interior) this.damagePlayer(this.difficultyDamage()); }
        else if (m.wander <= 0) { m.wander = Phaser.Math.FloatBetween(1, 2.5); const a = Math.random() * Math.PI * 2; m.vx = Math.cos(a) * 22; m.vy = Math.sin(a) * 22; }
      } else if (m.wander <= 0) { m.wander = Phaser.Math.FloatBetween(1.5, 4); if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2; m.vx = Math.cos(a) * 20; m.vy = Math.sin(a) * 20; } else { m.vx = 0; m.vy = 0; } }
      this.moveMob(m, dt);
    }
  }
  updateVillagers(dt: number) {
    for (let i = this.villagers.length - 1; i >= 0; i--) {
      const m = this.villagers[i];
      if (Phaser.Math.Distance.Between(m.sprite.x, m.sprite.y, this.px, this.py) > TILE * CHUNK * 4) { const id = 'vg:' + Math.round(m.sprite.x / TILE - 0.5) + ',' + Math.round(m.sprite.y / TILE - 0.5); (this as any)[id] = false; m.sprite.destroy(); this.villagers.splice(i, 1); continue; }
      m.wander -= dt; m.bobT += dt;
      if (m.wander <= 0) {
        m.wander = Phaser.Math.FloatBetween(1.5, 3.5);
        // wander near home
        const hx = (m.homeX ?? 0) * TILE, hy = (m.homeY ?? 0) * TILE;
        const toHome = Phaser.Math.Distance.Between(m.sprite.x, m.sprite.y, hx, hy);
        if (toHome > TILE * 5) { const a = Math.atan2(hy - m.sprite.y, hx - m.sprite.x); m.vx = Math.cos(a) * 18; m.vy = Math.sin(a) * 18; }
        else if (Math.random() < 0.7) { const a = Math.random() * Math.PI * 2; m.vx = Math.cos(a) * 14; m.vy = Math.sin(a) * 14; } else { m.vx = 0; m.vy = 0; }
      }
      this.moveMob(m, dt);
    }
  }
  moveMob(m: Mob, dt: number) {
    const nx = m.sprite.x + m.vx * dt, ny = m.sprite.y + m.vy * dt;
    if (!this.mobCollides(nx, m.sprite.y)) m.sprite.x = nx; else m.vx *= -0.5;
    if (!this.mobCollides(m.sprite.x, ny)) m.sprite.y = ny; else m.vy *= -0.5;
    m.vx *= 0.86; m.vy *= 0.86; m.sprite.setFlipX(m.vx < -2);
    if (Math.abs(m.vx) + Math.abs(m.vy) > 6) m.sprite.y += Math.sin(m.bobT * 12) * 0.3;
    if (m.hurtFlash > 0) { m.hurtFlash -= dt; m.sprite.setTint(0xff5555); } else m.sprite.clearTint();
    m.sprite.setDepth(670 + m.sprite.y * 0.01);
  }
  mobCollides(px: number, py: number): boolean { const t = this.tileAt(px, py); return this.isSolidAt(t.x, t.y); }

  // villager trading
  updateTradePrompt() {
    if (!this.onTradePrompt || this.drivingId || this.interior) { this.onTradePrompt && this.onTradePrompt(null); return; }
    let near: Mob | null = null, bd = Infinity;
    for (const v of this.villagers) { const d = Phaser.Math.Distance.Between(v.sprite.x, v.sprite.y, this.px, this.py); if (d < TILE * 2.2 && d < bd) { bd = d; near = v; } }
    if (!near) { this.onTradePrompt(null); return; }
    const sp = this.worldToScreen(near.sprite.x, near.sprite.y - 30);
    this.onTradePrompt({ villagerId: this.villagers.indexOf(near), screenX: sp.x, screenY: sp.y });
  }
  doTrade(give: ItemId, giveN: number, get: ItemId, getN: number): boolean {
    if (this.inventory.total(give) < giveN) { this.systemMsg(`You need ${giveN} ${give}.`); return false; }
    this.inventory.remove(give, giveN); this.inventory.add(get, getN); sfx('pickup', 1.1); this.emitHud(); return true;
  }

  // ============== DAY/NIGHT & SURVIVAL ==============
  updateDayNight(dt: number) {
    this.daytime = (this.daytime + dt / 360) % 1;
    let dark: number; const t = this.daytime;
    if (t < 0.2) dark = Phaser.Math.Linear(0.82, 0.08, t / 0.2);
    else if (t < 0.7) dark = 0.08;
    else if (t < 0.85) dark = Phaser.Math.Linear(0.08, 0.82, (t - 0.7) / 0.15);
    else dark = 0.82;
    this.nightOverlay.setAlpha(this.interior ? 0 : dark); this.nightOverlay.fillColor = dark > 0.5 ? 0x0a1530 : 0x1a2438;
    for (const [, l] of this.torchLights) { l.setAlpha(dark * Phaser.Math.FloatBetween(0.6, 0.9)); l.setScale(14 + Math.sin(this.time.now / 120 + l.x) * 1.5); }
  }
  updateSurvival(delta: number) {
    if (this.mode === 'creative') return;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - delta);
    this.hungerAccum += delta;
    if (this.hungerAccum > 6500) { this.hungerAccum = 0; this.hunger = Math.max(0, this.hunger - 2); this.emitHud(); }
    if (this.hunger <= 0) { this.damageAccum += delta; if (this.damageAccum > 2000) { this.damageAccum = 0; this.damagePlayer(3); } }
    if (this.hunger > 70 && this.hp < this.maxHp) { this.regenAccum += delta; if (this.regenAccum > 3000) { this.regenAccum = 0; this.hp = Math.min(this.maxHp, this.hp + 3); this.emitHud(); } }
  }
  damagePlayer(amount: number) {
    if (!this.alive || this.mode === 'creative' || amount <= 0 || this.hurtCooldown > 0) return;
    this.hurtCooldown = 500; this.hp = Math.max(0, this.hp - amount); this.player.setTint(0xff6666); this.time.delayedCall(120, () => this.player.clearTint()); this.emitHud();
    if (this.hp <= 0 && this.alive) this.die();
  }
  die() { this.alive = false; this.cameras.main.shake(300, 0.01); this.onDeath && this.onDeath(); }
  respawn() {
    this.alive = true; this.hp = this.maxHp; this.hunger = Math.max(40, this.hunger);
    if (this.interior) { this.interior.container.destroy(); this.interior = null; }
    this.drivingId = null; this.player.setVisible(true);
    this.px = (this.spawnTile.x + 0.5) * TILE; this.py = (this.spawnTile.y + 0.5) * TILE; this.daytime = 0.25;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12); this.cameras.main.setZoom(this.settings.zoom);
    this.player.setPosition(this.px, this.py).clearTint(); this.streamChunks(true); this.emitHud();
  }
  eatSelected() {
    const item = this.inventory.selectedItem(); const food: Record<string, number> = { apple: 18, meat: 30 };
    if (item && food[item] !== undefined && this.hunger < this.maxHunger) { this.inventory.consumeSelected(1); this.hunger = Math.min(this.maxHunger, this.hunger + food[item]); sfx('pickup', 0.9); this.emitHud(); }
  }

  // ============== CRAFTING ==============
  isNearTable(): boolean {
    const pt = this.tileAt(this.px, this.py);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.world.blockAt(pt.x + dx, pt.y + dy) === 'crafting') return true;
    return this.mode === 'creative';
  }
  craft(i: number): boolean { const ok = this.inventory.craft(i, this.isNearTable()); if (ok) { sfx('pickup', 1.1); this.emitHud(); } return ok; }

  // ============== COMMANDS ==============
  runCommand(raw: string): void {
    const parts = raw.trim().replace(/^\//, '').split(/\s+/); const cmd = (parts[0] || '').toLowerCase(); const arg = (i: number) => parts[i];
    switch (cmd) {
      case 'help': this.systemMsg('Cmds: /give <item> [n], /ship <type>, /tp <x> <y>, /time <day|night|noon>, /gamemode <s|c>, /heal, /feed, /clear, /kill, /difficulty <..>, /seed, /spawn'); break;
      case 'give': { const item = arg(1) as ItemId; const n = parseInt(arg(2) || '1') || 1; if (!item) { this.systemMsg('Usage: /give <item> [n]'); break; } if (!ALL_IDS.includes(item)) { this.systemMsg(`Unknown item: ${item}`); break; } this.inventory.add(item, Math.min(999, n)); this.emitHud(); this.systemMsg(`Gave ${n}x ${item}`); break; }
      case 'ship': case 'boat': { const kind = (arg(1) || 'raft').toLowerCase(); if (!['raft', 'skiff', 'houseboat', 'galleon'].includes(kind)) { this.systemMsg('Usage: /ship <raft|skiff|houseboat|galleon>'); break; } this.deployShip(kind as ShipKind); break; }
      case 'tp': { const x = parseInt(arg(1)), y = parseInt(arg(2)); if (isNaN(x) || isNaN(y)) { this.systemMsg('Usage: /tp <x> <y>'); break; } this.px = x * TILE; this.py = y * TILE; this.player.setPosition(this.px, this.py); this.streamChunks(true); this.systemMsg(`Teleported to ${x}, ${y}`); break; }
      case 'spawn': this.px = (this.spawnTile.x + 0.5) * TILE; this.py = (this.spawnTile.y + 0.5) * TILE; this.player.setPosition(this.px, this.py); this.streamChunks(true); this.systemMsg('Teleported to spawn'); break;
      case 'time': { const w = (arg(1) || '').toLowerCase(); if (w === 'day' || w === 'morning') this.daytime = 0.25; else if (w === 'noon') this.daytime = 0.5; else if (w === 'night') this.daytime = 0.8; else if (w === 'dusk') this.daytime = 0.72; else { this.systemMsg('Usage: /time <day|noon|dusk|night>'); break; } this.systemMsg(`Time set to ${w}`); break; }
      case 'gamemode': case 'gm': { const w = (arg(1) || '').toLowerCase(); if (w.startsWith('c')) { this.mode = 'creative'; this.systemMsg('Mode: creative'); } else if (w.startsWith('s')) { this.mode = 'survival'; this.systemMsg('Mode: survival'); } else { this.systemMsg('Usage: /gamemode <survival|creative>'); break; } this.emitHud(); break; }
      case 'heal': this.hp = this.maxHp; this.emitHud(); this.systemMsg('Health restored'); break;
      case 'feed': this.hunger = this.maxHunger; this.emitHud(); this.systemMsg('Hunger restored'); break;
      case 'kill': this.die(); break;
      case 'clear': { let n = 0; for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].hostile) { this.mobs[i].sprite.destroy(); this.mobs.splice(i, 1); n++; } this.systemMsg(`Removed ${n} hostile mobs`); break; }
      case 'difficulty': { const w = (arg(1) || '').toLowerCase(); if (['peaceful', 'easy', 'normal', 'hard'].includes(w)) { this.settings.difficulty = w as any; this.systemMsg(`Difficulty: ${w}`); } else this.systemMsg('Usage: /difficulty <peaceful|easy|normal|hard>'); break; }
      case 'seed': this.systemMsg(`Seed: ${this.seed}`); break;
      default: this.systemMsg(`Unknown: /${cmd} — try /help`);
    }
  }

  emitHud() {
    this.onHud && this.onHud({ hp: this.hp, maxHp: this.maxHp, hunger: this.hunger, maxHunger: this.maxHunger, time: this.daytime, isNight: this.daytime > 0.72 || this.daytime < 0.18, inventory: this.inventory, nearTable: this.isNearTable(), selected: this.inventory.selected, alive: this.alive, mode: this.mode, px: Math.floor(this.px / TILE), py: Math.floor(this.py / TILE) });
  }

  // minimap query: sample a downscaled grid of ground colors around player
  sampleMinimap(radiusTiles: number, step: number): { colors: number[][]; w: number; h: number; px: number; py: number } {
    const pcx = Math.floor(this.px / TILE), pcy = Math.floor(this.py / TILE);
    const cols: number[][] = []; const n = Math.floor((radiusTiles * 2) / step);
    for (let j = 0; j < n; j++) { cols[j] = []; for (let i = 0; i < n; i++) { const x = pcx - radiusTiles + i * step, y = pcy - radiusTiles + j * step; cols[j][i] = this.minimapColor(x, y); } }
    return { colors: cols, w: n, h: n, px: pcx, py: pcy };
  }
  minimapColor(x: number, y: number): number {
    const b = this.world.blockAt(x, y);
    if (b === 'wood' || this.world.treeAt(x, y)) return 0x2c7a38;
    if (b === 'planks' || b === 'door' || b === 'door_open') return 0x9a6c3e; // villages
    if (b === 'stone' || b === 'coal' || b === 'iron' || b === 'gold' || b === 'diamond') return 0x7d7d86;
    const g = this.world.groundAt(x, y);
    return ({ water: 0x2f7fc9, sand: 0xe6d28a, grass: 0x5fbf52, snow: 0xe7eef6, stone: 0x8a8a93, dirt: 0x8a6440 } as any)[g] || 0x5fbf52;
  }
  villageMarkers(): { x: number; y: number }[] { return this.world.villages.map(v => ({ x: v.centerX, y: v.centerY })); }
  shipMarkers(): { x: number; y: number }[] { return this.ships.map(s => ({ x: Math.floor(s.x / TILE), y: Math.floor(s.y / TILE) })); }

  // ============== SAVE / LOAD ==============
  serialize() {
    return {
      v: 4, overrides: this.world.serializeOverrides(),
      player: { x: this.px, y: this.py, hp: this.hp, hunger: this.hunger, daytime: this.daytime, mode: this.mode },
      inventory: this.inventory.serialize(),
      ships: this.ships.map(s => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, angle: s.angle, storage: s.storage })),
    };
  }
  applySave(save: any) {
    if (save.overrides) this.world.loadOverrides(save.overrides);
    if (save.player) {
      this.spawnTile = { x: Math.floor(save.player.x / TILE), y: Math.floor(save.player.y / TILE) };
      this.px = save.player.x; this.py = save.player.y; this.hp = save.player.hp ?? 100; this.hunger = save.player.hunger ?? 100; this.daytime = save.player.daytime ?? 0.25; if (save.player.mode) this.mode = save.player.mode;
    }
    if (save.inventory) this.inventory.load(save.inventory);
    if (save.ships) for (const sd of save.ships) { const ship: ShipInstance = { id: sd.id, kind: sd.kind, x: sd.x, y: sd.y, angle: sd.angle ?? 0, storage: sd.storage || [] }; this.ships.push(ship); this.createShipSprite(ship); }
    // register redstone overrides
    for (const [k, b] of this.world.overrides) { if (isRedstone(b)) { const [x, y] = k.split(',').map(Number); this.redstone.addBlock(x, y, b); } }
  }

  updateRedstoneVisual(x: number, y: number) { void x; void y; }
}
