import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://blwddxfagdegakmzcied.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JcFwoTyMiyjH5I_9F0qVXA_2p_hBKJo';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PBKDF2 via Web Crypto (works in browser + Electron)
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 60000, hash: 'SHA-256' }, key, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function makeSalt() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface Player { id: string; username: string; created_at?: string; }
export interface World { id: string; name: string; mode: string; seed: number; last_played: string; save_data?: any; created_at?: string; }
export interface ServerInfo { id: string; owner_id?: string; name: string; host: string; mode: string; region: string; players: number; max_players: number; kind: string; ip?: string; seed?: number; world_id?: string; }
export interface FriendRel { relId: string; status: string; incoming: boolean; outgoing: boolean; friend: { id: string; username: string; presence: 'online'|'away'|'offline' }; }

export const Api = {
  checkUsername: async (username: string) => {
    const { data } = await db.from('players').select('id').eq('username_lower', username.trim().toLowerCase()).maybeSingle();
    return { available: !data };
  },
  register: async (username: string, password: string): Promise<Player> => {
    const uname = username.trim();
    if (uname.length < 3) throw new Error('Username must be at least 3 characters');
    const { data: ex } = await db.from('players').select('id').eq('username_lower', uname.toLowerCase()).maybeSingle();
    if (ex) throw new Error('Username already taken');
    const salt = makeSalt();
    const pw_hash = await hashPassword(password, salt);
    const { data, error } = await db.from('players').insert({
      username: uname, username_lower: uname.toLowerCase(), pw_hash, salt,
      presence: 'online', last_seen: new Date().toISOString(),
    }).select('id, username, created_at').single();
    if (error) throw new Error(error.message);
    return data;
  },
  login: async (username: string, password: string): Promise<Player> => {
    const { data, error } = await db.from('players')
      .select('id, username, pw_hash, salt, created_at')
      .eq('username_lower', username.trim().toLowerCase()).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Username not found');
    const pw_hash = await hashPassword(password, data.salt);
    if (pw_hash !== data.pw_hash) throw new Error('Wrong password');
    await db.from('players').update({ presence: 'online', last_seen: new Date().toISOString() }).eq('id', data.id);
    return { id: data.id, username: data.username, created_at: data.created_at };
  },
  logout: async (id: string) => { await db.from('players').update({ presence: 'offline' }).eq('id', id); },
  heartbeat: async (id: string) => { try { await db.from('players').update({ presence: 'online', last_seen: new Date().toISOString() }).eq('id', id); } catch {} },

  listWorlds: async (ownerId: string): Promise<World[]> => {
    const { data, error } = await db.from('worlds').select('id,name,mode,seed,last_played,save_data,created_at').eq('owner_id', ownerId).order('last_played', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  createWorld: async (ownerId: string, name: string, mode: string, seed?: number): Promise<World> => {
    const { data, error } = await db.from('worlds').insert({
      owner_id: ownerId, name: name.trim().slice(0, 40), mode: mode || 'survival',
      seed: seed != null ? seed : Math.floor(Math.random() * 1e9), last_played: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  saveWorld: async (id: string, save_data: any) => {
    const { data, error } = await db.from('worlds').update({ save_data, last_played: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  deleteWorld: async (id: string) => {
    const { error } = await db.from('worlds').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  listFriends: async (playerId: string): Promise<FriendRel[]> => {
    const { data, error } = await db.from('friend_relations')
      .select('id,status,requester_id,addressee_id')
      .or(`requester_id.eq.${playerId},addressee_id.eq.${playerId}`);
    if (error || !data) return [];
    const ids = [...new Set(data.flatMap((r: any) => [r.requester_id, r.addressee_id]).filter((x: string) => x !== playerId))];
    const { data: players } = await db.from('players').select('id,username,presence').in('id', ids);
    const pm = Object.fromEntries((players || []).map((p: any) => [p.id, p]));
    return data.map((r: any) => {
      const isReq = r.requester_id === playerId;
      const fid = isReq ? r.addressee_id : r.requester_id;
      const friend = pm[fid] || { id: fid, username: '?', presence: 'offline' };
      return { relId: r.id, status: r.status, incoming: !isReq && r.status === 'pending', outgoing: isReq && r.status === 'pending', friend };
    });
  },
  addFriend: async (playerId: string, username: string) => {
    const { data: target } = await db.from('players').select('id').eq('username_lower', username.toLowerCase()).maybeSingle();
    if (!target) throw new Error('Player not found');
    const { error } = await db.from('friend_relations').insert({ requester_id: playerId, addressee_id: target.id, status: 'pending' });
    if (error) throw new Error(error.message);
  },
  acceptFriend: async (relId: string) => {
    const { error } = await db.from('friend_relations').update({ status: 'accepted' }).eq('id', relId);
    if (error) throw new Error(error.message);
  },
  removeFriend: async (relId: string) => {
    const { error } = await db.from('friend_relations').delete().eq('id', relId);
    if (error) throw new Error(error.message);
  },

  myServers: async (ownerId: string): Promise<ServerInfo[]> => {
    const { data } = await db.from('game_servers').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
    return data || [];
  },
  listPublicServers: async (): Promise<ServerInfo[]> => {
    const { data } = await db.from('game_servers').select('*').eq('public', true).order('created_at', { ascending: false }).limit(50);
    return data || [];
  },
  serverByIp: async (ip: string): Promise<ServerInfo> => {
    const { data, error } = await db.from('game_servers').select('*').eq('ip', ip.trim()).maybeSingle();
    if (error || !data) throw new Error('No server found at that address');
    return data;
  },
  createServer: async (opts: { ownerId: string; name: string; host: string; mode: string; seed?: number; maxPlayers?: number; world_id?: string; ip?: string; isPublic?: boolean }): Promise<ServerInfo> => {
    const { data, error } = await db.from('game_servers').insert({
      owner_id: opts.ownerId, name: opts.name.trim().slice(0, 40), host: opts.host,
      mode: opts.mode, seed: opts.seed ?? Math.floor(Math.random() * 1e9),
      ip: opts.ip || '', world_id: opts.world_id || null,
      region: 'LAN', players: 1, max_players: opts.maxPlayers || 8,
      kind: 'local', public: opts.isPublic ?? false,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  updateServerIp: async (id: string, ip: string) => {
    await db.from('game_servers').update({ ip }).eq('id', id);
  },
  deleteServer: async (id: string) => {
    await db.from('game_servers').delete().eq('id', id);
  },
};
