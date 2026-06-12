# 2Dcraft — Desktop Edition

A native desktop build of 2Dcraft using **Electron**, with:
- ✅ Real LAN multiplayer — friends connect to your actual IP, no cloud relay needed
- ✅ Auto-discovery — servers on your network appear automatically in the server list
- ✅ Streamer Mode — hides all IP addresses in the UI so it's safe to go live
- ✅ Full offline play — worlds save locally

---

## Requirements

- **Node.js** 18+ (https://nodejs.org)
- **pnpm** — `npm install -g pnpm`

---

## Run in development

```bash
pnpm install
pnpm dev
```

This builds the Vite frontend into `dist/` then launches Electron pointing at it.

---

## Build installers

### macOS (.dmg — Intel + Apple Silicon)
```bash
pnpm dist:mac
```

### Windows (.exe installer)
```bash
pnpm dist:win
```

### Linux (.AppImage)
```bash
pnpm dist:linux
```

Installers land in `release/` (created by electron-builder).

---

## How LAN multiplayer works

1. You and your friends must be on the **same WiFi/LAN** (or use a VPN like Tailscale or ZeroTier for online play).
2. **Host:** go to Multiplayer → Host Local Server → fill in the name → click Create Server.
   - Electron starts a real WebSocket server on your machine.
   - Your LAN IP (e.g. `192.168.1.42:25565`) is shown — copy it.
3. **Friends:** open Multiplayer, type the IP into the "Join by IP" box → Join.
   - OR — if they're on the same network, your server will appear automatically in the **LAN — Nearby Servers** list within a few seconds. They just click Join.

No port-forwarding needed for LAN. For internet play, forward port `25565` (TCP) on your router, or use Tailscale.

---

## Streamer Mode

Settings → **Streamer Mode: On**

All IP addresses in the UI are masked (e.g. `192.168.***.***:25565`). Copying still copies the real IP so your friends can use it — it just never appears on screen.

---

## Project structure

```
electron/
  main.js      — Electron main process (window, LAN server, UDP discovery)
  preload.js   — Secure bridge between main and renderer
src/
  lib/
    lanServer.ts — Renderer-side LAN API (talks to preload)
  ui/ui.ts     — Game UI (server list, streamer mode, settings)
dist/          — Vite build output (generated, not committed)
```
