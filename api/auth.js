import supabase from './db-client.js';
import crypto from 'crypto';

function hash(pw, salt) {
  return crypto.pbkdf2Sync(pw, salt, 60000, 32, 'sha256').toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = (req.query && req.query.action) || (req.body && req.body.action);

    // Check username availability
    if (req.method === 'GET' && action === 'check') {
      const uname = (req.query.username || '').trim().toLowerCase();
      if (uname.length < 3) return res.status(200).json({ available: false, reason: 'too_short' });
      const { data, error } = await supabase
        .from('players').select('id').eq('username_lower', uname).maybeSingle();
      if (error) throw error;
      return res.status(200).json({ available: !data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const username = (body.username || '').trim();
      const password = body.password || '';
      const unameLower = username.toLowerCase();

      if (action === 'register') {
        if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Letters, numbers and _ only' });

        const { data: exists } = await supabase
          .from('players').select('id').eq('username_lower', unameLower).maybeSingle();
        if (exists) return res.status(409).json({ error: 'Username already taken' });

        const salt = crypto.randomBytes(16).toString('hex');
        const pw_hash = hash(password, salt);
        const id = crypto.randomUUID();
        const { data, error } = await supabase.from('players').insert({
          id, username, username_lower: unameLower, salt, pw_hash, online: true, last_seen: new Date().toISOString(),
        }).select('id, username, created_at').single();
        if (error) throw error;
        return res.status(201).json({ player: data });
      }

      if (action === 'login') {
        const { data: player, error } = await supabase
          .from('players').select('*').eq('username_lower', unameLower).maybeSingle();
        if (error) throw error;
        if (!player) return res.status(401).json({ error: 'Account not found' });
        const candidate = hash(password, player.salt);
        if (candidate !== player.pw_hash) return res.status(401).json({ error: 'Incorrect password' });
        await supabase.from('players').update({ online: true, last_seen: new Date().toISOString() }).eq('id', player.id);
        return res.status(200).json({ player: { id: player.id, username: player.username, created_at: player.created_at } });
      }

      if (action === 'logout') {
        const { id } = body;
        if (id) await supabase.from('players').update({ online: false, last_seen: new Date().toISOString() }).eq('id', id);
        return res.status(200).json({ ok: true });
      }

      if (action === 'heartbeat') {
        const { id } = body;
        if (id) await supabase.from('players').update({ online: true, last_seen: new Date().toISOString() }).eq('id', id);
        return res.status(200).json({ ok: true });
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('auth error', err);
    res.status(500).json({ error: err.message });
  }
}
