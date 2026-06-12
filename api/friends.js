import supabase from './db-client.js';

function onlineStatus(p) {
  if (!p) return 'offline';
  if (!p.online) return 'offline';
  const last = p.last_seen ? new Date(p.last_seen).getTime() : 0;
  const mins = (Date.now() - last) / 60000;
  if (mins > 5) return 'offline';
  if (mins > 2) return 'away';
  return 'online';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const playerId = req.query.playerId;
      if (!playerId) return res.status(400).json({ error: 'playerId required' });
      const { data: rels, error } = await supabase
        .from('friends').select('*').or(`a.eq.${playerId},b.eq.${playerId}`);
      if (error) throw error;

      const otherIds = (rels || []).map(r => (r.a === playerId ? r.b : r.a));
      let players = [];
      if (otherIds.length) {
        const { data: ps } = await supabase
          .from('players').select('id, username, online, last_seen').in('id', otherIds);
        players = ps || [];
      }
      const result = (rels || []).map(r => {
        const otherId = r.a === playerId ? r.b : r.a;
        const p = players.find(x => x.id === otherId);
        return {
          relId: r.id,
          status: r.status,
          incoming: r.status === 'pending' && r.b === playerId,
          outgoing: r.status === 'pending' && r.a === playerId,
          friend: p ? { id: p.id, username: p.username, presence: onlineStatus(p) } : { id: otherId, username: 'unknown', presence: 'offline' },
        };
      });
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'add') {
        const { playerId, username } = body;
        const target = (username || '').trim().toLowerCase();
        const { data: tgt } = await supabase.from('players').select('id, username').eq('username_lower', target).maybeSingle();
        if (!tgt) return res.status(404).json({ error: 'No player with that username' });
        if (tgt.id === playerId) return res.status(400).json({ error: "You can't add yourself" });
        const { data: existing } = await supabase.from('friends').select('id, status')
          .or(`and(a.eq.${playerId},b.eq.${tgt.id}),and(a.eq.${tgt.id},b.eq.${playerId})`).maybeSingle();
        if (existing) return res.status(409).json({ error: existing.status === 'accepted' ? 'Already friends' : 'Request already exists' });
        const { error } = await supabase.from('friends').insert({ a: playerId, b: tgt.id, status: 'pending' });
        if (error) throw error;
        return res.status(201).json({ ok: true, username: tgt.username });
      }

      if (action === 'accept') {
        const { relId } = body;
        const { error } = await supabase.from('friends').update({ status: 'accepted' }).eq('id', relId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (req.method === 'DELETE') {
      const relId = req.query.relId || (req.body && req.body.relId);
      if (!relId) return res.status(400).json({ error: 'relId required' });
      const { error } = await supabase.from('friends').delete().eq('id', relId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('friends error', err);
    res.status(500).json({ error: err.message });
  }
}
