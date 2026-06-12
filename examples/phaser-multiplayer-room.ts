/**
 * Fullstack Phaser 3 Multiplayer Room Demo
 *
 * Demonstrates:
 * - Room creation/joining via Vercel serverless API routes
 * - Supabase Realtime Broadcast for player position sync
 * - URL-based room sharing (e.g. ?room=abc123)
 * - Multiple player cursors rendered in real-time
 *
 * Required API route (api/rooms.js):
 * ```js
 * import supabase from './db-client.js';
 * import crypto from 'crypto';
 *
 * export default async function handler(req, res) {
 *   if (req.method === 'POST') {
 *     const roomId = crypto.randomBytes(4).toString('hex');
 *     const { error } = await supabase.from('rooms').insert({
 *       id: roomId,
 *       created_at: new Date().toISOString(),
 *     });
 *     if (error) return res.status(500).json({ error: error.message });
 *     return res.status(201).json({ roomId });
 *   }
 *
 *   if (req.method === 'GET') {
 *     const { id } = req.query;
 *     if (!id) return res.status(400).json({ error: 'room id required' });
 *     const { data, error } = await supabase
 *       .from('rooms')
 *       .select('id, created_at')
 *       .eq('id', id)
 *       .single();
 *     if (error || !data) return res.status(404).json({ error: 'room not found' });
 *     return res.status(200).json(data);
 *   }
 *
 *   return res.status(405).end();
 * }
 * ```
 *
 * Required Supabase table:
 * CREATE TABLE rooms (
 *   id text PRIMARY KEY,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * Supabase client (src/lib/supabase.ts):
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * export const supabase = createClient(
 *   import.meta.env.VITE_SUPABASE_URL,
 *   import.meta.env.VITE_SUPABASE_ANON_KEY
 * );
 * ```
 */

import Phaser from 'phaser';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL || '',
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''
);

const COLORS = [0x4ade80, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa, 0x34d399, 0xfb923c, 0xe879f9];
const PLAYER_RADIUS = 12;
const BROADCAST_INTERVAL_MS = 50;

interface PlayerState {
  id: string;
  x: number;
  y: number;
  color: number;
}

// ─── Lobby Scene ────────────────────────────────────────────────────────────

class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    this.add.text(centerX, centerY - 100, '🎮 MULTIPLAYER ROOMS', {
      fontSize: '32px',
      color: '#60a5fa',
    }).setOrigin(0.5);

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      this.add.text(centerX, centerY, `Joining room: ${roomParam}...`, {
        fontSize: '16px',
        color: '#94a3b8',
      }).setOrigin(0.5);
      this.joinRoom(roomParam);
      return;
    }

    const createBtn = this.add.text(centerX, centerY, '[ CREATE ROOM ]', {
      fontSize: '20px',
      color: '#4ade80',
      backgroundColor: '#1e293b',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    createBtn.on('pointerdown', () => this.createRoom());

    this.add.text(centerX, centerY + 60, 'Or join via URL: ?room=<id>', {
      fontSize: '14px',
      color: '#64748b',
    }).setOrigin(0.5);
  }

  private async createRoom() {
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { roomId } = await res.json();
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      window.history.replaceState({}, '', url.toString());
      this.scene.start('RoomScene', { roomId });
    } catch (err) {
      console.warn('Failed to create room:', err);
    }
  }

  private async joinRoom(roomId: string) {
    try {
      const res = await fetch(`/api/rooms?id=${roomId}`);
      if (!res.ok) throw new Error('Room not found');
      this.scene.start('RoomScene', { roomId });
    } catch {
      this.add.text(this.scale.width / 2, this.scale.height / 2 + 40, 'Room not found!', {
        fontSize: '16px',
        color: '#ef4444',
      }).setOrigin(0.5);
    }
  }
}

// ─── Room Scene ─────────────────────────────────────────────────────────────

class RoomScene extends Phaser.Scene {
  private roomId = '';
  private playerId = '';
  private playerColor = 0;
  private channel: RealtimeChannel | null = null;
  private players: Map<string, PlayerState> = new Map();
  private graphics!: Phaser.GameObjects.Graphics;
  private localX = 0;
  private localY = 0;
  private broadcastTimer = 0;

  constructor() {
    super('RoomScene');
  }

  init(data: { roomId: string }) {
    this.roomId = data.roomId;
    this.playerId = crypto.randomUUID().slice(0, 8);
    this.playerColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  create() {
    const { width, height } = this.scale;
    this.localX = width / 2;
    this.localY = height / 2;
    this.graphics = this.add.graphics();

    this.add.text(8, 8, `Room: ${this.roomId}`, {
      fontSize: '14px',
      color: '#94a3b8',
    });

    const shareUrl = window.location.href;
    this.add.text(8, 28, `Share: ${shareUrl}`, {
      fontSize: '11px',
      color: '#64748b',
    });

    this.add.text(width / 2, height - 20, 'Move your mouse to broadcast position', {
      fontSize: '12px',
      color: '#475569',
    }).setOrigin(0.5);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.localX = pointer.x;
      this.localY = pointer.y;
    });

    this.subscribeToRoom();
  }

  private subscribeToRoom() {
    this.channel = supabase.channel(`room-${this.roomId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player_move' }, ({ payload }) => {
        const state = payload as PlayerState;
        if (state.id !== this.playerId) {
          this.players.set(state.id, state);
        }
      })
      .on('broadcast', { event: 'player_leave' }, ({ payload }) => {
        this.players.delete(payload.id);
      })
      .subscribe();
  }

  update(_time: number, delta: number) {
    this.broadcastTimer += delta;
    if (this.broadcastTimer >= BROADCAST_INTERVAL_MS) {
      this.broadcastTimer = 0;
      this.broadcastPosition();
    }
    this.draw();
  }

  private broadcastPosition() {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_move',
      payload: {
        id: this.playerId,
        x: this.localX,
        y: this.localY,
        color: this.playerColor,
      } satisfies PlayerState,
    });
  }

  private draw() {
    this.graphics.clear();

    // Draw remote players
    this.players.forEach((player) => {
      this.graphics.fillStyle(player.color, 0.7);
      this.graphics.fillCircle(player.x, player.y, PLAYER_RADIUS);
      this.graphics.lineStyle(2, player.color, 1);
      this.graphics.strokeCircle(player.x, player.y, PLAYER_RADIUS);
    });

    // Draw local player
    this.graphics.fillStyle(this.playerColor, 1);
    this.graphics.fillCircle(this.localX, this.localY, PLAYER_RADIUS);
    this.graphics.lineStyle(2, 0xffffff, 0.8);
    this.graphics.strokeCircle(this.localX, this.localY, PLAYER_RADIUS);

    // Player count
    const count = this.players.size + 1;
    this.graphics.fillStyle(0x000000, 0);
    // Text is handled by Phaser.GameObjects.Text, not graphics
  }

  shutdown() {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player_leave',
        payload: { id: this.playerId },
      });
      supabase.removeChannel(this.channel);
      this.channel = null;
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
  scene: [LobbyScene, RoomScene],
});
