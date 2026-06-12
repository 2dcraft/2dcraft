import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const ownerId = req.query.ownerId;
      if (!ownerId) return res.status(400).json({ error: 'ownerId required' });
      const { data, error } = await supabase
        .from('worlds').select('id, name, mode, seed, last_played, save_data, created_at')
        .eq('owner_id', ownerId).order('last_played', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ownerId, name, mode, seed } = req.body || {};
      if (!ownerId || !name) return res.status(400).json({ error: 'ownerId and name required' });
      const { data, error } = await supabase.from('worlds').insert({
        owner_id: ownerId, name: name.trim().slice(0, 40), mode: mode || 'survival',
        seed: seed != null ? seed : Math.floor(Math.random() * 1e9),
        last_played: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, save_data } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('worlds')
        .update({ save_data, last_played: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('worlds').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('worlds error', err);
    res.status(500).json({ error: err.message });
  }
}
