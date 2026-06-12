import Phaser from 'phaser';
import WebFont from 'webfontloader';
import { GameScene, type Settings } from './game/GameScene';
import type { World } from './lib/api';
import { initUI, updateHud, onWorldStarted, showDeath, pushChat, showShipPrompt, openShipStorage, showTradePrompt } from './ui/ui';

WebFont.load({ custom: { families: ['PressStart'] }, google: { families: ['Inter:400,600,700,800'] } });

let game: Phaser.Game | null = null;
let scene: GameScene | null = null;

function ensureGame(): Phaser.Game {
  if (game) return game;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0a1018',
    pixelArt: true,
    roundPixels: true,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  return game;
}

function startWorld(world: World, settings: Settings) {
  const g = ensureGame();
  if (g.scene.getScene('GameScene')) g.scene.remove('GameScene');
  const gs = new GameScene();
  g.scene.add('GameScene', gs, false);

  gs.onHud = (s) => updateHud(s);
  gs.onDeath = () => showDeath();
  gs.onChat = (m, k) => pushChat(k === 'system' ? `<span>${m}</span>` : m, k);
  gs.onShipPrompt = (info) => showShipPrompt(info);
  gs.onOpenStorage = (shipId) => openShipStorage(shipId);
  gs.onTradePrompt = (info) => showTradePrompt(info);

  g.scene.start('GameScene', {
    seed: world.seed,
    mode: (world.mode as 'survival' | 'creative') || 'survival',
    save: world.save_data,
    settings,
  });
  scene = gs;
  setTimeout(() => onWorldStarted(), 60);
}

initUI({
  startWorld,
  getScene: () => scene,
  getGame: () => game,
});
