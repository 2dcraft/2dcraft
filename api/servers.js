import supabase from './db-client.js';

// Generate a fake-but-shareable LAN-style IP for a hosted local server.
function genIp() {
  return `192.168.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}:25565`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const ip = req.query.ip;
      if (ip) {
        // join-by-ip lookup
        const { data, error } = await supabase.from('game_servers').select('*').eq('ip', ip.trim()).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'No server found at that address' });
        return res.status(200).json(data);
      }
      // my hosted servers (by ownerId) OR public list
      const ownerId = req.query.ownerId;
      let q = supabase.from('game_servers').select('*').order('created_at', { ascending: false }).limit(50);
      if (ownerId) q = q.eq('owner_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ownerId, name, mode, seed, maxPlayers, world_id } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const ip = genIp();
      const { data, error } = await supabase.from('game_servers').insert({
        owner_id: ownerId || null,
        name: name.trim().slice(0, 40),
        host: req.body.host || 'You',
        mode: mode || 'survival',
        seed: seed != null ? seed : Math.floor(Math.random() * 1e9),
        ip,
        world_id: world_id || null,
        region: 'LAN',
        players: 1,
        max_players: maxPlayers || 8,
        kind: 'local',
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('game_servers').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('servers error', err);
    res.status(500).json({ error: err.message });
  }
}
