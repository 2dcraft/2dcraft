// =============================================================
// LAN Server bridge
// When running inside Electron the preload exposes window.electronLan.
// In the web build (Vercel) that object is absent, so all calls
// fall back gracefully to the cloud API flow.
// =============================================================

export interface LanServerInfo {
  id: string;
  name: string;
  host: string;
  mode: 'survival' | 'creative';
  seed: number;
  ip: string;
  port: number;
  players: number;
  max_players: number;
  kind: 'lan';
}

declare global {
  interface Window {
    electronLan?: {
      getLocalIp:     () => Promise<string>;
      startServer:    (info: Omit<LanServerInfo, 'ip'>) => Promise<LanServerInfo>;
      stopServer:     (id: string) => Promise<void>;
      listServers:    () => Promise<LanServerInfo[]>;
      joinServer:     (ip: string) => Promise<LanServerInfo>;
      onServerList:   (cb: (servers: LanServerInfo[]) => void) => () => void;
      onPlayerJoined: (cb: (data: { ip: string }) => void) => () => void;
      onPlayerLeft:   (cb: (data: { ip: string }) => void) => () => void;
    };
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.electronLan;

export async function getLocalIp(): Promise<string> {
  if (window.electronLan) return window.electronLan.getLocalIp();
  return '?';
}

export async function startLanServer(info: Omit<LanServerInfo, 'ip' | 'kind'>): Promise<LanServerInfo> {
  if (!window.electronLan) throw new Error('LAN hosting requires the 2Dcraft desktop app');
  return window.electronLan.startServer({ ...info, kind: 'lan' } as any);
}

export async function stopLanServer(id: string): Promise<void> {
  if (!window.electronLan) throw new Error('Not running in desktop app');
  return window.electronLan.stopServer(id);
}

export async function listLanServers(): Promise<LanServerInfo[]> {
  if (!window.electronLan) return [];
  return window.electronLan.listServers();
}

export async function joinLanServer(ip: string): Promise<LanServerInfo> {
  if (!window.electronLan) throw new Error('LAN joining requires the 2Dcraft desktop app');
  return window.electronLan.joinServer(ip);
}

export function onLanServerList(cb: (servers: LanServerInfo[]) => void): () => void {
  if (!window.electronLan) return () => {};
  return window.electronLan.onServerList(cb);
}

export function onPlayerJoined(cb: (data: { ip: string }) => void): () => void {
  if (!window.electronLan) return () => {};
  return window.electronLan.onPlayerJoined(cb);
}

export function onPlayerLeft(cb: (data: { ip: string }) => void): () => void {
  if (!window.electronLan) return () => {};
  return window.electronLan.onPlayerLeft(cb);
}
