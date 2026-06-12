#!/usr/bin/env node
// =============================================================
// 2Dcraft Local Server Host
// Run this on your PC. It opens a WebSocket server, registers
// your IP to Supabase so friends can see it in the server list,
// and relays messages between all connected players.
//
// Usage:
//   node server.js
//   node server.js --name "My Server" --port 25565 --public
// =============================================================

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { networkInterfaces } from 'os';
import readline from 'readline';

// ── config ────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://blwddxfagdegakmzcied.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JcFwoTyMiyjH5I_9F0qVXA_2p_hBKJo';
const DEFAULT_PORT     = 25565;

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const PORT      = parseInt(getArg('--port', DEFAULT_PORT));
const IS_PUBLIC = args.includes('--public');

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── helpers ───────────────────────────────────────────────────
function getLocalIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

async function getPublicIp() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    return j.ip;
  } catch { return null; }
}

// ── prompt ────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

console.log('\n╔══════════════════════════════════════╗');
console.log('║      2Dcraft Local Server Host       ║');
console.log('╚══════════════════════════════════════╝\n');

let serverName = getArg('--name', null);
let hostUsername = getArg('--user', null);
let serverId = null;

if (!serverName) serverName = await ask('Server name (default: My Server): ') || 'My Server';
if (!hostUsername) hostUsername = await ask('Your username (so friends can see who is hosting): ') || 'Host';

const modeInput = await ask('Game mode? [survival/creative] (default: survival): ');
const mode = modeInput === 'creative' ? 'creative' : 'survival';

const maxInput = await ask('Max players? (default: 8): ');
const maxPlayers = parseInt(maxInput) || 8;

const pubInput = await ask('Make server public (visible to all players)? [y/N]: ');
const isPublic = pubInput.toLowerCase() === 'y' || IS_PUBLIC;

console.log('\n⏳ Starting server...\n');

// ── WebSocket server ──────────────────────────────────────────
const clients = new Map(); // ws → { username, id }

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    name: serverName, host: hostUsername, mode, maxPlayers,
    players: clients.size, port: PORT,
  }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] Client connected: ${ip}`);
  clients.set(ws, { username: '?', ip });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // If client sends their username on join, record it
    if (msg.type === 'join') {
      clients.get(ws).username = msg.username || '?';
      console.log(`    → ${msg.username || '?'} joined`);
      // Tell everyone else
      broadcast(ws, JSON.stringify({ type: 'player_join', username: msg.username }));
      return;
    }

    // Relay everything else to all other clients
    broadcast(ws, raw.toString());
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    console.log(`[-] ${info?.username || '?'} disconnected`);
    clients.delete(ws);
    broadcast(null, JSON.stringify({ type: 'player_leave', username: info?.username }));
    updatePlayerCount();
  });

  ws.on('error', (e) => console.error('[WS error]', e.message));
  updatePlayerCount();
});

function broadcast(sender, msg) {
  for (const [ws] of clients) {
    if (ws !== sender && ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

async function updatePlayerCount() {
  if (serverId) {
    await db.from('game_servers').update({ players: clients.size }).eq('id', serverId).catch(() => {});
  }
}

// ── start listening ───────────────────────────────────────────
await new Promise((res, rej) => {
  httpServer.listen(PORT, '0.0.0.0', res);
  httpServer.on('error', rej);
});

const localIp  = getLocalIp();
const publicIp = await getPublicIp();
const displayIp = `${localIp}:${PORT}`;
const pubDisplayIp = publicIp ? `${publicIp}:${PORT}` : null;

// ── register to Supabase ──────────────────────────────────────
const seed = Math.floor(Math.random() * 1e9);
const { data: srv, error: srvErr } = await db.from('game_servers').insert({
  name: serverName, host: hostUsername, mode, seed,
  ip: displayIp, public_ip: pubDisplayIp || displayIp,
  region: 'LAN', players: 0, max_players: maxPlayers,
  kind: 'local', public: isPublic,
}).select().single();

if (srvErr) {
  console.error('⚠ Could not register to server list:', srvErr.message);
  console.log('  Server is still running — friends can join by IP manually.\n');
} else {
  serverId = srv.id;
  console.log('✅ Registered to server list!\n');
}

// ── print connection info ─────────────────────────────────────
console.log('╔══════════════════════════════════════════════════╗');
console.log(`║  Server "${serverName}" is running!`);
console.log('╠══════════════════════════════════════════════════╣');
console.log(`║  LAN IP (same WiFi):   ${displayIp.padEnd(25)}║`);
if (pubDisplayIp) {
console.log(`║  Public IP (internet): ${pubDisplayIp.padEnd(25)}║`);
}
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  Share the LAN IP with friends on your WiFi      ║');
if (pubDisplayIp) {
console.log('║  Share the Public IP for friends over internet    ║');
console.log('║  (you may need to forward port 25565 on router)   ║');
}
console.log('╚══════════════════════════════════════════════════╝');
console.log('\n  Press Ctrl+C to stop the server\n');

// ── heartbeat ─────────────────────────────────────────────────
const heartbeat = setInterval(async () => {
  if (serverId) {
    await db.from('game_servers').update({ last_heartbeat: new Date().toISOString(), players: clients.size }).eq('id', serverId).catch(() => {});
  }
}, 10000);

// ── cleanup on exit ───────────────────────────────────────────
async function cleanup() {
  console.log('\n\nShutting down...');
  clearInterval(heartbeat);
  if (serverId) await db.from('game_servers').delete().eq('id', serverId).catch(() => {});
  for (const [ws] of clients) ws.terminate();
  httpServer.close();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
