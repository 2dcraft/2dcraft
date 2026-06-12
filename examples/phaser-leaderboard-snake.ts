/**
 * Fullstack Phaser 3 Snake Game with Leaderboard
 *
 * Demonstrates:
 * - Vercel serverless API routes for CRUD (api/scores.js)
 * - Supabase as a persistent data store
 * - Three-scene flow: Title → Game → GameOver
 * - localStorage for player name persistence
 *
 * Required API route (api/scores.js):
 * ```js
 * import supabase from './db-client.js';
 *
 * export default async function handler(req, res) {
 *   if (req.method === 'GET') {
 *     const { data, error } = await supabase
 *       .from('scores')
 *       .select('name, score, created_at')
 *       .order('score', { ascending: false })
 *       .limit(10);
 *     if (error) return res.status(500).json({ error: error.message });
 *     return res.status(200).json(data);
 *   }
 *
 *   if (req.method === 'POST') {
 *     const { name, score } = req.body;
 *     if (!name || score == null) return res.status(400).json({ error: 'name and score required' });
 *     const { error } = await supabase.from('scores').insert({ name, score });
 *     if (error) return res.status(500).json({ error: error.message });
 *     return res.status(201).json({ ok: true });
 *   }
 *
 *   return res.status(405).end();
 * }
 * ```
 *
 * Required Supabase table:
 * CREATE TABLE scores (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   name text NOT NULL,
 *   score integer NOT NULL,
 *   created_at timestamptz DEFAULT now()
 * );
 */

import Phaser from 'phaser';

const GRID_SIZE = 20;
const TICK_RATE_MS = 120;
const STORAGE_KEY = 'snake_player_name';

interface ScoreEntry {
  name: string;
  score: number;
  created_at: string;
}

// ─── Title Scene ────────────────────────────────────────────────────────────

class TitleScene extends Phaser.Scene {
  private nameInput = '';
  private leaderboard: ScoreEntry[] = [];
  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super('TitleScene');
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;

    this.add.text(centerX, 60, '🐍 SNAKE', {
      fontSize: '48px',
      color: '#4ade80',
    }).setOrigin(0.5);

    this.nameInput = localStorage.getItem(STORAGE_KEY) || '';

    this.add.text(centerX, 140, 'Enter your name:', {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const nameDisplay = this.add.text(centerX, 170, this.nameInput || '___', {
      fontSize: '24px',
      color: '#facc15',
    }).setOrigin(0.5);

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        this.nameInput = this.nameInput.slice(0, -1);
      } else if (event.key === 'Enter' && this.nameInput.length > 0) {
        localStorage.setItem(STORAGE_KEY, this.nameInput);
        this.scene.start('GameScene', { playerName: this.nameInput });
      } else if (event.key.length === 1 && this.nameInput.length < 12) {
        this.nameInput += event.key;
      }
      nameDisplay.setText(this.nameInput || '___');
    });

    this.add.text(centerX, 220, 'Press ENTER to start', {
      fontSize: '14px',
      color: '#94a3b8',
    }).setOrigin(0.5);

    this.loadingText = this.add.text(centerX, 280, 'Loading leaderboard...', {
      fontSize: '14px',
      color: '#64748b',
    }).setOrigin(0.5);

    this.fetchLeaderboard();
  }

  private async fetchLeaderboard() {
    try {
      const res = await fetch('/api/scores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.leaderboard = await res.json();
      this.displayLeaderboard();
    } catch {
      this.loadingText.setText('Could not load leaderboard');
    }
  }

  private displayLeaderboard() {
    const { width } = this.scale;
    const centerX = width / 2;
    this.loadingText.destroy();

    this.add.text(centerX, 280, '🏆 TOP SCORES', {
      fontSize: '16px',
      color: '#f59e0b',
    }).setOrigin(0.5);

    this.leaderboard.slice(0, 5).forEach((entry, i) => {
      this.add.text(centerX, 310 + i * 28, `${i + 1}. ${entry.name} — ${entry.score}`, {
        fontSize: '14px',
        color: '#e2e8f0',
      }).setOrigin(0.5);
    });
  }
}

// ─── Game Scene ─────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
  private snake: { x: number; y: number }[] = [];
  private food = { x: 0, y: 0 };
  private direction = { x: 1, y: 0 };
  private nextDirection = { x: 1, y: 0 };
  private score = 0;
  private playerName = '';
  private tickTimer = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private graphics!: Phaser.GameObjects.Graphics;
  private cols = 0;
  private rows = 0;

  constructor() {
    super('GameScene');
  }

  init(data: { playerName: string }) {
    this.playerName = data.playerName;
  }

  create() {
    const { width, height } = this.scale;
    this.cols = Math.floor(width / GRID_SIZE);
    this.rows = Math.floor(height / GRID_SIZE);
    this.graphics = this.add.graphics();

    this.snake = [
      { x: Math.floor(this.cols / 2), y: Math.floor(this.rows / 2) },
    ];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.score = 0;
    this.tickTimer = 0;
    this.spawnFood();

    this.scoreText = this.add.text(8, 8, 'Score: 0', {
      fontSize: '16px',
      color: '#ffffff',
    });

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':    if (this.direction.y === 0) this.nextDirection = { x: 0, y: -1 }; break;
        case 'ArrowDown':  if (this.direction.y === 0) this.nextDirection = { x: 0, y: 1 }; break;
        case 'ArrowLeft':  if (this.direction.x === 0) this.nextDirection = { x: -1, y: 0 }; break;
        case 'ArrowRight': if (this.direction.x === 0) this.nextDirection = { x: 1, y: 0 }; break;
      }
    });
  }

  update(_time: number, delta: number) {
    this.tickTimer += delta;
    if (this.tickTimer < TICK_RATE_MS) return;
    this.tickTimer = 0;

    this.direction = { ...this.nextDirection };
    const head = this.snake[0];
    const newHead = { x: head.x + this.direction.x, y: head.y + this.direction.y };

    if (
      newHead.x < 0 || newHead.x >= this.cols ||
      newHead.y < 0 || newHead.y >= this.rows ||
      this.snake.some(s => s.x === newHead.x && s.y === newHead.y)
    ) {
      this.scene.start('GameOverScene', { score: this.score, playerName: this.playerName });
      return;
    }

    this.snake.unshift(newHead);

    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score += 10;
      this.scoreText.setText(`Score: ${this.score}`);
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.draw();
  }

  private spawnFood() {
    let pos: { x: number; y: number };
    do {
      pos = {
        x: Phaser.Math.Between(0, this.cols - 1),
        y: Phaser.Math.Between(0, this.rows - 1),
      };
    } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    this.food = pos;
  }

  private draw() {
    this.graphics.clear();

    this.graphics.fillStyle(0xef4444);
    this.graphics.fillRect(this.food.x * GRID_SIZE, this.food.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);

    this.snake.forEach((seg, i) => {
      this.graphics.fillStyle(i === 0 ? 0x4ade80 : 0x22c55e);
      this.graphics.fillRect(seg.x * GRID_SIZE, seg.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
    });
  }
}

// ─── Game Over Scene ────────────────────────────────────────────────────────

class GameOverScene extends Phaser.Scene {
  private score = 0;
  private playerName = '';

  constructor() {
    super('GameOverScene');
  }

  init(data: { score: number; playerName: string }) {
    this.score = data.score;
    this.playerName = data.playerName;
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    this.add.text(centerX, centerY - 80, 'GAME OVER', {
      fontSize: '36px',
      color: '#ef4444',
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 30, `Score: ${this.score}`, {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const statusText = this.add.text(centerX, centerY + 10, 'Submitting score...', {
      fontSize: '14px',
      color: '#94a3b8',
    }).setOrigin(0.5);

    this.submitScore(statusText);

    this.add.text(centerX, centerY + 60, 'Press SPACE to play again', {
      fontSize: '14px',
      color: '#64748b',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-SPACE', () => {
      this.scene.start('GameScene', { playerName: this.playerName });
    });
  }

  private async submitScore(statusText: Phaser.GameObjects.Text) {
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.playerName, score: this.score }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      statusText.setText('Score submitted! ✓');
    } catch {
      statusText.setText('Failed to submit score');
    }
  }
}

// ─── Game Config ────────────────────────────────────────────────────────────

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene, GameOverScene],
});
