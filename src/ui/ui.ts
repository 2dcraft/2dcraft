import { Api, type Player, type World, type ServerInfo, type FriendRel } from '../lib/api';
import { Icons } from './icons';
import { initAudio, sfx } from '../game/audio';
import { RECIPES } from '../game/recipes';
import { ITEM_NAMES, type ItemId } from '../game/blocks';
import { itemTextureKey } from '../game/textures';
import { buildGrid, initDrag, returnCarried } from './dragInventory';
import type { GameScene, HudState, Settings, ShipPromptInfo, TradePrompt } from '../game/GameScene';
import type Phaser from 'phaser';

const app = document.getElementById('app')!;

function saveSession(p: Player) { localStorage.setItem('tdc_player', JSON.stringify(p)); }
function loadSession(): Player | null { try { return JSON.parse(localStorage.getItem('tdc_player') || 'null'); } catch { return null; } }
function clearSession() { localStorage.removeItem('tdc_player'); }

function loadSettings(): Settings {
  try { const s = JSON.parse(localStorage.getItem('tdc_settings') || 'null'); if (s) return s; } catch { /* */ }
  return { difficulty: 'normal', zoom: 1.8, showGrid: true, mobCap: 10, autosave: true, streamerMode: false };
}
function persistSettings(s: Settings) { localStorage.setItem('tdc_settings', JSON.stringify(s)); }

let currentPlayer: Player | null = loadSession();
let settings: Settings = loadSettings();
let heartbeat: number | null = null;

export interface UICallbacks {
  startWorld: (world: World, settings: Settings) => void;
  getScene: () => GameScene | null;
  getGame: () => Phaser.Game | null;
}
let cb: UICallbacks;

export function initUI(callbacks: UICallbacks) {
  cb = callbacks;
  initDrag(callbacks.getGame);
  installHotbarKeys();
  if (currentPlayer) { startHeartbeat(); showHub(); }
  else showAuth();
}

// DOM-level number keys for hotbar (works regardless of canvas focus)
function installHotbarKeys() {
  window.addEventListener('keydown', (e) => {
    if (!app.classList.contains('hidden')) return; // only in-game
    if (chatOpen) return;
    if (e.key >= '1' && e.key <= '9') { cb.getScene()?.selectSlot(parseInt(e.key) - 1); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleInventory(); }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); openChat(); }
    if (e.key === '/') { e.preventDefault(); openChat('/'); }
    if (e.key === 'Escape') { if (invOpen) toggleInventory(true); else if (settingsOpen) closeIngameSettings(); else if (storageOpen) closeStorage(); else if (tradeOpen) closeTrade(); }
  });
  // scroll wheel to change hotbar slot
  window.addEventListener('wheel', (e) => {
    if (!app.classList.contains('hidden') || invOpen || chatOpen) return;
    const sc = cb.getScene(); if (!sc) return;
    const cur = sc.inventory.selected;
    const next = (cur + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    sc.selectSlot(next);
  }, { passive: true });
}

// ---------- toasts ----------
let toastWrap: HTMLElement;
function toast(msg: string, kind: 'good' | 'bad' | '' = '') {
  if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
  const t = document.createElement('div'); t.className = `toast ${kind === 'bad' ? 'bad' : ''}`;
  t.textContent = msg;
  toastWrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 220); }, 2400);
}

function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function hashSeed(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 1000000000; }

// ============================================================
// AUTH
// ============================================================
function showAuth() {
  app.classList.remove('hidden');
  let mode: 'login' | 'register' = 'register';
  let unameOk = false;

  function render() {
    app.innerHTML = `
      <div class="scene"><div class="scene-inner"><div style="width:100%;max-width:380px">
        <div class="title-logo"><div class="pixel">2Dcraft</div><div class="sub">TOP-DOWN SANDBOX SURVIVAL</div></div>
        <div class="mc-panel mc-card">
          <div class="mc-tabs">
            <div class="t ${mode === 'login' ? 'active' : ''}" data-m="login">Sign In</div>
            <div class="t ${mode === 'register' ? 'active' : ''}" data-m="register">Register</div>
          </div>
          <form id="authForm">
            <div class="mc-field" id="unameField">
              <label>Username</label>
              <input class="mc-input" id="uname" autocomplete="off" placeholder="${mode === 'register' ? 'Pick a unique name' : 'Your username'}" maxlength="16" />
              <div class="mc-hint" id="unameHint">${mode === 'register' ? '3–16 chars · letters, numbers, _' : ''}</div>
            </div>
            <div class="mc-field">
              <label>Password</label>
              <input class="mc-input" id="pword" type="password" placeholder="${mode === 'register' ? 'At least 6 characters' : 'Enter password'}" maxlength="64" />
            </div>
            <button class="mc-btn primary" id="authBtn" type="submit">${mode === 'register' ? 'Create & Play' : 'Sign In'}</button>
          </form>
          <div class="mc-divider">OR</div>
          <button class="mc-btn" id="guestBtn">${Icons.play} Play as Guest</button>
          <div class="mc-foot">${mode === 'register' ? 'Have an account? <a data-m="login">Sign in</a>' : 'New? <a data-m="register">Create account</a>'}</div>
        </div>
      </div></div></div>`;

    app.querySelectorAll('[data-m]').forEach(el => el.addEventListener('click', () => { mode = (el as HTMLElement).dataset.m as any; unameOk = false; sfx('click'); render(); }));

    const uname = app.querySelector('#uname') as HTMLInputElement;
    const pword = app.querySelector('#pword') as HTMLInputElement;
    const field = app.querySelector('#unameField') as HTMLElement;
    const hint = app.querySelector('#unameHint') as HTMLElement;
    const btn = app.querySelector('#authBtn') as HTMLButtonElement;

    let timer: any;
    if (mode === 'register') uname.addEventListener('input', () => {
      const v = uname.value.trim(); field.className = 'mc-field'; unameOk = false; clearTimeout(timer);
      if (!v) { hint.className = 'mc-hint'; hint.textContent = '3–16 chars · letters, numbers, _'; return; }
      if (!/^[a-zA-Z0-9_]+$/.test(v)) { field.className = 'mc-field bad'; hint.className = 'mc-hint bad'; hint.innerHTML = `${Icons.x} Only letters, numbers, _`; return; }
      if (v.length < 3) { field.className = 'mc-field bad'; hint.className = 'mc-hint bad'; hint.innerHTML = `${Icons.x} Too short (min 3)`; return; }
      hint.className = 'mc-hint'; hint.innerHTML = `<span class="spinner"></span> Checking…`;
      timer = setTimeout(async () => {
        try {
          const r = await Api.checkUsername(v);
          if (uname.value.trim() !== v) return;
          if (r.available) { unameOk = true; field.className = 'mc-field ok'; hint.className = 'mc-hint ok'; hint.innerHTML = `${Icons.check} "${esc(v)}" is available!`; }
          else { unameOk = false; field.className = 'mc-field bad'; hint.className = 'mc-hint bad'; hint.innerHTML = `${Icons.x} "${esc(v)}" is already taken`; }
        } catch { hint.className = 'mc-hint'; hint.textContent = 'Could not check now'; }
      }, 380);
    });

    (app.querySelector('#guestBtn') as HTMLElement).addEventListener('click', async () => {
      initAudio(); sfx('click');
      const name = 'Player' + Math.floor(1000 + Math.random() * 9000);
      try { const r = await Api.register(name, 'guest-' + Math.random().toString(36).slice(2)); currentPlayer = r.player; saveSession(r.player); startHeartbeat(); showHub(); }
      catch (e: any) { toast(e.message || 'Could not start', 'bad'); }
    });

    (app.querySelector('#authForm') as HTMLFormElement).addEventListener('submit', async (e) => {
      e.preventDefault(); initAudio(); sfx('click');
      const u = uname.value.trim(), p = pword.value;
      if (mode === 'register' && !unameOk) { toast('Choose an available username', 'bad'); return; }
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> …';
      try {
        const r = mode === 'register' ? await Api.register(u, p) : await Api.login(u, p);
        currentPlayer = r.player; saveSession(r.player); startHeartbeat(); showHub();
      } catch (err: any) {
        btn.disabled = false; btn.innerHTML = mode === 'register' ? 'Create & Play' : 'Sign In';
        if (/taken/i.test(err.message)) { field.className = 'mc-field bad'; hint.className = 'mc-hint bad'; hint.innerHTML = `${Icons.x} ${esc(err.message)}`; }
        toast(err.message || 'Failed', 'bad');
      }
    });
  }
  render();
}

function startHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  const ping = () => { if (currentPlayer) Api.heartbeat(currentPlayer.id); };
  ping(); heartbeat = window.setInterval(ping, 60000);
}

// ============================================================
// HUB
// ============================================================
type HubTab = 'worlds' | 'servers' | 'friends' | 'settings';
let hubTab: HubTab = 'worlds';
let friendsData: FriendRel[] = [];

function showHub() { app.classList.remove('hidden'); renderHub(); refreshFriends(); }
function presenceCls(p: string) { return p === 'online' ? '' : p === 'away' ? 'away' : 'off'; }

function renderHub() {
  if (!currentPlayer) return showAuth();
  const initial = currentPlayer.username.slice(0, 1).toUpperCase();
  const pending = friendsData.filter(f => f.incoming).length;
  app.innerHTML = `
    <div class="scene"><div class="scene-inner"><div class="mc-panel hub">
      <div class="hub-top">
        <div class="who"><div class="avatar">${initial}</div><div><div class="nm">${esc(currentPlayer.username)}</div><div class="st"><span class="dot"></span> Online</div></div></div>
        <button class="mc-btn sm" id="logoutBtn">${Icons.logout} Sign Out</button>
      </div>
      <div class="mc-tabs">
        <div class="t ${hubTab === 'worlds' ? 'active' : ''}" data-t="worlds">Worlds</div>
        <div class="t ${hubTab === 'servers' ? 'active' : ''}" data-t="servers">Multiplayer</div>
        <div class="t ${hubTab === 'friends' ? 'active' : ''}" data-t="friends">Friends${pending ? ` (${pending})` : ''}</div>
        <div class="t ${hubTab === 'settings' ? 'active' : ''}" data-t="settings">Settings</div>
      </div>
      <div class="hub-body"><div class="hub-main" id="hubMain"></div></div>
    </div></div></div>`;

  app.querySelectorAll('[data-t]').forEach(el => el.addEventListener('click', () => { hubTab = (el as HTMLElement).dataset.t as HubTab; sfx('click'); renderHub(); }));
  (app.querySelector('#logoutBtn') as HTMLElement).addEventListener('click', async () => {
    sfx('click'); if (currentPlayer) await Api.logout(currentPlayer.id).catch(() => {});
    clearSession(); currentPlayer = null; if (heartbeat) clearInterval(heartbeat); showAuth();
  });

  const main = app.querySelector('#hubMain') as HTMLElement;
  if (hubTab === 'worlds') renderWorlds(main);
  else if (hubTab === 'servers') renderServers(main);
  else if (hubTab === 'friends') renderFriends(main);
  else renderSettings(main);
}

// ----- worlds -----
async function renderWorlds(main: HTMLElement) {
  main.innerHTML = `<div class="sec-head"><div><h2>My Worlds</h2><p>Continue or create a new world</p></div>
    <button class="mc-btn primary sm" id="newW">${Icons.plus} New</button></div><div class="list" id="wl"><div class="empty"><span class="spinner"></span></div></div>`;
  (main.querySelector('#newW') as HTMLElement).addEventListener('click', () => { sfx('click'); openCreateWorld(); });
  const wl = main.querySelector('#wl') as HTMLElement;
  try {
    const worlds = await Api.listWorlds(currentPlayer!.id);
    if (!worlds.length) { wl.innerHTML = `<div class="empty">${Icons.worlds}<div style="margin-top:8px">No worlds yet — create your first!</div></div>`; return; }
    wl.innerHTML = '';
    for (const w of worlds) {
      const edits = w.save_data?.changes?.length || 0;
      const row = document.createElement('div'); row.className = 'lrow world-row';
      row.innerHTML = `
        <div class="ic-box" style="color:${w.mode === 'creative' ? '#5a8fde' : '#3e8b3a'}">${Icons.globe}</div>
        <div class="grow"><div class="t1">${esc(w.name)} <span class="pill ${w.mode}">${w.mode}</span></div><div class="t2">Seed ${w.seed} · ${edits} edits · played ${timeAgo(w.last_played)}</div></div>
        <div class="actions"><button class="iconbtn red" title="Delete">${Icons.trash}</button></div>`;
      row.addEventListener('click', () => { sfx('click'); enterWorld(w); });
      (row.querySelector('.iconbtn') as HTMLElement).addEventListener('click', async (e) => { e.stopPropagation(); sfx('click'); if (confirm(`Delete "${w.name}"?`)) { await Api.deleteWorld(w.id); toast('World deleted'); renderWorlds(main); } });
      wl.appendChild(row);
    }
  } catch (e: any) { wl.innerHTML = `<div class="empty">Failed: ${esc(e.message)}</div>`; }
}

function openCreateWorld(onDone?: (w: World) => void) {
  let mode: 'survival' | 'creative' = 'survival';
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="mc-panel modal">
    <div class="mc-h">Create World</div>
    <div class="mc-field"><label>World Name</label><input class="mc-input" id="wn" placeholder="My World" maxlength="40" value="World ${Math.floor(Math.random() * 900 + 100)}" /></div>
    <label style="font-size:11px;color:#3f3f3f;font-weight:700;font-family:'PressStart',monospace">Game Mode</label>
    <div class="seg"><div class="opt active" data-mode="survival">Survival</div><div class="opt" data-mode="creative">Creative</div></div>
    <div class="mc-field"><label>Seed (optional)</label><input class="mc-input" id="ws" placeholder="Random" /></div>
    <div class="mc-row"><button class="mc-btn" id="cx">Cancel</button><button class="mc-btn primary" id="ok">${Icons.play} Generate</button></div>
  </div>`;
  document.body.appendChild(bg);
  bg.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => { bg.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('active')); el.classList.add('active'); mode = (el as HTMLElement).dataset.mode as any; sfx('hover'); }));
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  (bg.querySelector('#cx') as HTMLElement).addEventListener('click', () => { sfx('click'); bg.remove(); });
  (bg.querySelector('#ok') as HTMLElement).addEventListener('click', async () => {
    const name = (bg.querySelector('#wn') as HTMLInputElement).value.trim() || 'New World';
    const ss = (bg.querySelector('#ws') as HTMLInputElement).value.trim();
    const seed = ss ? (/^\d+$/.test(ss) ? parseInt(ss) % 1e9 : hashSeed(ss)) : Math.floor(Math.random() * 1e9);
    sfx('click');
    try { const w = await Api.createWorld(currentPlayer!.id, name, mode, seed); bg.remove(); if (onDone) onDone(w); else enterWorld(w); }
    catch (e: any) { toast(e.message || 'Failed', 'bad'); }
  });
}

// ----- multiplayer: local host + join by IP -----
async function renderServers(main: HTMLElement) {
  main.innerHTML = `
    <div class="sec-head"><div><h2>Multiplayer</h2><p>Host a local server on your PC, or join one by IP</p></div></div>
    <div class="list" style="margin-bottom:14px">
      <div class="lrow" style="background:#a9c6a0">
        <div class="ic-box" style="color:#3e8b3a">${Icons.home}</div>
        <div class="grow">
          <div class="t1">Host a Local Server</div>
          <div class="t2">Download the server script, run it on your PC, then share your IP with friends</div>
        </div>
        <button class="mc-btn primary sm" id="dlBtn">${Icons.download ?? '⬇'} Download Server</button>
      </div>
    </div>
    <div class="add-bar">
      <input class="mc-input" id="ipInput" placeholder="Join by IP  (e.g. 192.168.1.10:25565)" />
      <button class="mc-btn sm" id="joinIp">${Icons.link} Join</button>
    </div>
    <div class="sec-head" style="margin-top:10px"><div><h2 style="font-size:11px">Public Servers</h2><div style="font-size:9px;color:#666;margin-top:2px">Servers open to everyone</div></div></div>
    <div class="list" id="pubList"><div class="empty"><span class="spinner"></span></div></div>
    <div class="sec-head" style="margin-top:6px"><div><h2 style="font-size:11px">My Hosted Servers</h2></div></div>
    <div class="list" id="srvList"><div class="empty"><span class="spinner"></span></div></div>`;

  // Download server script
  (main.querySelector('#dlBtn') as HTMLElement).addEventListener('click', () => {
    sfx('click');
    window.open('https://github.com/2dcraft/server/releases/latest', '_blank');
    toast('Opening server download page!', 'good');
  });

  // Join by IP
  const ipInput = main.querySelector('#ipInput') as HTMLInputElement;
  const doJoin = async () => {
    const ip = ipInput.value.trim(); if (!ip) return; sfx('click');
    try {
      // Try to look up in DB first, then just connect directly
      let serverInfo: any;
      try { serverInfo = await Api.serverByIp(ip); } catch { serverInfo = { name: ip, mode: 'survival', seed: hashSeed(ip), host: '?' }; }
      const w = await Api.createWorld(currentPlayer!.id, (serverInfo.name || ip) + ' (joined)', serverInfo.mode || 'survival', serverInfo.seed ?? hashSeed(ip));
      enterWorld(w, `Connected to ${maskIp(ip)}`);
    } catch (e: any) { toast(e.message || 'Could not connect', 'bad'); }
  };
  (main.querySelector('#joinIp') as HTMLElement).addEventListener('click', doJoin);
  ipInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

  // Public server list
  const pubList = main.querySelector('#pubList') as HTMLElement;
  try {
    const pubServers = await Api.listPublicServers();
    if (!pubServers.length) { pubList.innerHTML = `<div class="empty">No public servers running right now</div>`; }
    else {
      pubList.innerHTML = '';
      for (const s of pubServers) {
        const row = document.createElement('div'); row.className = 'lrow';
        row.innerHTML = `
          <div class="ic-box" style="color:#3e8b3a">${Icons.servers}</div>
          <div class="grow">
            <div class="t1">${esc(s.name)} <span class="pill ${s.mode}">${s.mode}</span></div>
            <div class="t2">Host: <b>${esc(s.host)}</b> · IP: <b style="color:#2a5a2a">${esc(maskIp(s.ip || ''))}</b> · ${s.players ?? 0}/${s.max_players} players</div>
          </div>
          <button class="mc-btn sm" data-act="join">${Icons.play} Join</button>`;
        (row.querySelector('[data-act="join"]') as HTMLElement).addEventListener('click', async () => {
          sfx('click');
          try {
            const w = await Api.createWorld(currentPlayer!.id, s.name + ' (joined)', s.mode, s.seed);
            enterWorld(w, `On ${s.host}'s server`);
          } catch (e: any) { toast(e.message || 'Could not join', 'bad'); }
        });
        pubList.appendChild(row);
      }
    }
  } catch { pubList.innerHTML = `<div class="empty">Could not load public servers</div>`; }

  // My hosted servers
  const list = main.querySelector('#srvList') as HTMLElement;
  try {
    const servers = await Api.myServers(currentPlayer!.id);
    if (!servers.length) { list.innerHTML = `<div class="empty">No hosted servers — run the server script on your PC and it appears here.</div>`; return; }
    list.innerHTML = '';
    for (const s of servers) {
      const row = document.createElement('div'); row.className = 'lrow';
      row.innerHTML = `
        <div class="ic-box" style="color:#3e8b3a">${Icons.servers}</div>
        <div class="grow"><div class="t1">${esc(s.name)} <span class="pill ${s.mode}">${s.mode}</span></div>
          <div class="t2">IP: <b style="color:#2a5a2a">${esc(maskIp(s.ip || ''))}</b> · ${s.players ?? 0}/${s.max_players} players</div></div>
        <div class="actions">
          <button class="iconbtn" title="Copy IP" data-act="copy">${Icons.copy}</button>
          <button class="iconbtn" title="Play" data-act="play">${Icons.play}</button>
          <button class="iconbtn red" title="Delete" data-act="del">${Icons.trash}</button>
        </div>`;
      (row.querySelector('[data-act="copy"]') as HTMLElement).addEventListener('click', () => { navigator.clipboard?.writeText(s.ip || ''); toast('IP copied!', 'good'); sfx('click'); });
      (row.querySelector('[data-act="play"]') as HTMLElement).addEventListener('click', async () => {
        sfx('click');
        const worlds = await Api.listWorlds(currentPlayer!.id);
        const w = s.world_id ? worlds.find(x => x.id === s.world_id) : null;
        if (w) enterWorld(w, `Joining ${s.name} @ ${maskIp(s.ip || '')}`);
        else { const nw = await Api.createWorld(currentPlayer!.id, s.name + ' (joined)', s.mode, s.seed); enterWorld(nw, `Joining ${s.name}`); }
      });
      (row.querySelector('[data-act="del"]') as HTMLElement).addEventListener('click', async () => { sfx('click'); if (confirm(`Remove "${s.name}" from list?`)) { await Api.deleteServer(s.id); renderServers(main); } });
      list.appendChild(row);
    }
  } catch (e: any) { list.innerHTML = `<div class="empty">Failed to load: ${esc(e.message)}</div>`; }
}

function renderFriends(main: HTMLElement) {
  const accepted = friendsData.filter(f => f.status === 'accepted');
  const incoming = friendsData.filter(f => f.incoming);
  const outgoing = friendsData.filter(f => f.outgoing);
  const online = accepted.filter(f => f.friend.presence !== 'offline');
  main.innerHTML = `
    <div class="sec-head"><div><h2>Friends</h2><p>${online.length} of ${accepted.length} online</p></div></div>
    <div class="add-bar"><input class="mc-input" id="ai" placeholder="Add friend by username" maxlength="16" /><button class="mc-btn sm" id="ab">${Icons.invite} Add</button></div>
    ${incoming.length ? `<div style="font-size:10px;color:#3f3f3f;font-family:'PressStart',monospace;margin:6px 0">REQUESTS</div><div class="list" id="inc"></div>` : ''}
    ${outgoing.length ? `<div style="font-size:10px;color:#777;font-family:'PressStart',monospace;margin:14px 0 6px">PENDING SENT</div><div class="list" id="out"></div>` : ''}
    <div style="font-size:10px;color:#3f3f3f;font-family:'PressStart',monospace;margin:14px 0 6px">ALL FRIENDS</div>
    <div class="list" id="fr"></div>`;
  const ai = main.querySelector('#ai') as HTMLInputElement;
  const add = async () => { const u = ai.value.trim(); if (!u) return; sfx('click'); try { const r = await Api.addFriend(currentPlayer!.id, u); toast(`Request sent to ${r.username}`, 'good'); ai.value = ''; await refreshFriends(); } catch (e: any) { toast(e.message, 'bad'); } };
  (main.querySelector('#ab') as HTMLElement).addEventListener('click', add);
  ai.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  const inc = main.querySelector('#inc') as HTMLElement | null;
  if (inc) for (const f of incoming) inc.appendChild(friendRow(f, [
    { cls: '', icon: Icons.check, t: 'Accept', fn: async () => { sfx('click'); await Api.acceptFriend(f.relId); toast(`Now friends with ${f.friend.username}`, 'good'); await refreshFriends(); } },
    { cls: 'red', icon: Icons.x, t: 'Decline', fn: async () => { sfx('click'); await Api.removeFriend(f.relId); await refreshFriends(); } },
  ]));
  const out = main.querySelector('#out') as HTMLElement | null;
  if (out) for (const f of outgoing) out.appendChild(friendRow(f, [{ cls: 'red', icon: Icons.x, t: 'Cancel', fn: async () => { sfx('click'); await Api.removeFriend(f.relId); await refreshFriends(); } }], 'Pending…'));

  const fr = main.querySelector('#fr') as HTMLElement;
  if (!accepted.length) { fr.innerHTML = `<div class="empty">${Icons.friends}<div style="margin-top:8px">No friends yet</div></div>`; }
  accepted.sort((a, b) => (a.friend.presence === 'offline' ? 1 : 0) - (b.friend.presence === 'offline' ? 1 : 0));
  for (const f of accepted) fr.appendChild(friendRow(f, [
    { cls: '', icon: Icons.invite, t: 'Invite', fn: () => { sfx('click'); f.friend.presence === 'offline' ? toast(`${f.friend.username} is offline`) : toast(`Invite sent to ${f.friend.username}!`, 'good'); } },
    { cls: 'red', icon: Icons.trash, t: 'Remove', fn: async () => { sfx('click'); if (confirm(`Remove ${f.friend.username}?`)) { await Api.removeFriend(f.relId); await refreshFriends(); } } },
  ]));
}

function friendRow(f: FriendRel, actions: { cls: string; icon: string; t: string; fn: () => void }[], sub?: string) {
  const row = document.createElement('div'); row.className = 'lrow';
  const init = f.friend.username.slice(0, 1).toUpperCase();
  const p = f.friend.presence;
  const txt = sub || (p === 'online' ? 'Online now' : p === 'away' ? 'Away' : 'Offline');
  row.innerHTML = `<div class="ic-box" style="position:relative;background:#3e8b3a;color:#fff;font-family:'PressStart',monospace">${init}<span class="dot ${presenceCls(p)}" style="position:absolute;bottom:-2px;right:-2px;border:2px solid #b3b3b3"></span></div>
    <div class="grow"><div class="t1">${esc(f.friend.username)}</div><div class="t2">${txt}</div></div><div class="actions"></div>`;
  const act = row.querySelector('.actions') as HTMLElement;
  for (const a of actions) { const b = document.createElement('button'); b.className = `iconbtn ${a.cls}`; b.title = a.t; b.innerHTML = a.icon; b.addEventListener('click', a.fn); act.appendChild(b); }
  return row;
}

function maskIp(ip: string): string {
  if (!settings.streamerMode) return ip;
  // Replace the last two octets/segments with *** so it's clearly hidden
  return ip.replace(/(\d+\.\d+)\.\d+\.\d+(:\d+)?$/, '$1.***.***$2')
           .replace(/(\w+:\w+:\w+:\w+):\w+:\w+(:\d+)?$/, '$1:****:****$2');
}

// ----- settings (in hub) -----
function renderSettings(main: HTMLElement) {
  main.innerHTML = `<div class="sec-head"><div><h2>Settings</h2><p>Applied to new worlds & current game</p></div></div><div id="setBody"></div>`;
  buildSettingsControls(main.querySelector('#setBody') as HTMLElement, () => { persistSettings(settings); cb.getScene()?.applySettings(settings); });
}

function buildSettingsControls(el: HTMLElement, onChange: () => void) {
  const chips = (key: keyof Settings, opts: { v: any; l: string }[]) =>
    `<div class="set-ctl">${opts.map(o => `<div class="chip ${settings[key] === o.v ? 'active' : ''}" data-k="${key}" data-v="${o.v}">${o.l}</div>`).join('')}</div>`;
  el.innerHTML = `
    <div class="set-row"><div><div class="sl">Difficulty</div><div class="sd">Hostile mob damage & spawns</div></div>${chips('difficulty', [{ v: 'peaceful', l: 'Peace' }, { v: 'easy', l: 'Easy' }, { v: 'normal', l: 'Normal' }, { v: 'hard', l: 'Hard' }])}</div>
    <div class="set-row"><div><div class="sl">Zoom</div><div class="sd">Camera zoom level</div></div>${chips('zoom', [{ v: 1.4, l: 'Far' }, { v: 1.8, l: 'Mid' }, { v: 2.4, l: 'Near' }])}</div>
    <div class="set-row"><div><div class="sl">Mob Cap</div><div class="sd">Max hostiles at night</div></div>${chips('mobCap', [{ v: 5, l: '5' }, { v: 10, l: '10' }, { v: 18, l: '18' }])}</div>
    <div class="set-row"><div><div class="sl">Show Grid</div><div class="sd">Tile grid overlay</div></div>${chips('showGrid', [{ v: true, l: 'On' }, { v: false, l: 'Off' }])}</div>
    <div class="set-row"><div><div class="sl">Autosave</div><div class="sd">Save world every 30s</div></div>${chips('autosave', [{ v: true, l: 'On' }, { v: false, l: 'Off' }])}</div>
    <div class="set-row" style="border-top:2px solid #c00;margin-top:8px;padding-top:8px"><div><div class="sl" style="color:#c00">🎥 Streamer Mode</div><div class="sd">Hides all IP addresses — safe to stream</div></div>${chips('streamerMode', [{ v: true, l: 'On' }, { v: false, l: 'Off' }])}</div>`;
  el.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const k = (c as HTMLElement).dataset.k as keyof Settings; let v: any = (c as HTMLElement).dataset.v;
    if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(parseFloat(v))) v = parseFloat(v);
    (settings as any)[k] = v; sfx('click'); buildSettingsControls(el, onChange); onChange();
  }));
}

function timeAgo(iso?: string): string {
  if (!iso) return 'recently'; const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return 'just now'; if (m < 60) return Math.floor(m) + 'm ago'; if (m < 1440) return Math.floor(m / 60) + 'h ago'; return Math.floor(m / 1440) + 'd ago';
}

// ============================================================
// IN-GAME HUD
// ============================================================
let hudBuilt = false;
let invOpen = false;
let settingsOpen = false;
let chatOpen = false;

function buildHudDom() {
  if (hudBuilt) return; hudBuilt = true;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="topbar">
      <div class="hud-panel bars"><div class="heart-row" id="hearts"></div><div class="food-row" id="food"></div></div>
      <div class="hud-right">
        <div class="hud-panel"><div class="clock" id="clock">${Icons.sun} Day</div></div>
        <div class="hud-panel menu-btns">
          <button class="mc-btn icon" id="invBtn" title="Inventory (E)">${Icons.bag}</button>
          <button class="mc-btn icon" id="chatBtn" title="Chat (T)">${Icons.chat}</button>
          <button class="mc-btn icon" id="setBtn" title="Settings">${Icons.gear}</button>
          <button class="mc-btn icon" id="leaveBtn" title="Leave">${Icons.logout}</button>
        </div>
      </div>
    </div>
    <div id="hotbar"></div>
    <div id="chatlog"></div>
    <div id="chatinput"><input id="chatField" maxlength="200" placeholder="Type message or /command…" /></div>
    <div class="help" id="help"><span><kbd>WASD</kbd> move</span><span><kbd>L</kbd> mine</span><span><kbd>R</kbd> place / use</span><span><kbd>E</kbd> craft</span><span><kbd>T</kbd> chat</span><span><kbd>1-9</kbd> slots</span></div>
    <div id="invscreen"><div class="inv-wrap mc-panel" id="invWrap"></div></div>
    <div id="shipPrompt"></div>
    <div id="tradePrompt" style="position:fixed;inset:0;z-index:32;pointer-events:none"></div>
    <div id="storagescreen"><div class="mc-panel" id="storageWrap"></div></div>
    <div id="tradescreen"><div class="mc-panel" id="tradeWrap" style="width:460px"></div></div>
    <canvas id="minimap" width="180" height="180"></canvas>
    <div id="coords"></div>
    <div id="bigmsg"><div class="bt pixel" id="bigT">YOU DIED</div><div class="bd" id="bigD"></div><button class="mc-btn primary" id="bigBtn" style="width:auto"></button></div>
  `);
  startMinimap();
  (document.getElementById('invBtn') as HTMLElement).addEventListener('click', () => toggleInventory());
  (document.getElementById('chatBtn') as HTMLElement).addEventListener('click', () => openChat());
  (document.getElementById('setBtn') as HTMLElement).addEventListener('click', () => openIngameSettings());
  (document.getElementById('leaveBtn') as HTMLElement).addEventListener('click', () => leaveWorld());

  const cf = document.getElementById('chatField') as HTMLInputElement;
  cf.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { sendChat(cf.value); cf.value = ''; closeChat(); }
    if (e.key === 'Escape') { cf.value = ''; closeChat(); }
  });
}

let minimapTimer: number | null = null;
function startMinimap() {
  if (minimapTimer) return;
  const canvas = document.getElementById('minimap') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const coords = document.getElementById('coords') as HTMLElement;
  const RAD = 64, STEP = 2; // tiles radius, downsample step
  minimapTimer = window.setInterval(() => {
    if (app.classList.contains('hidden') === false) { canvas.style.display = 'none'; coords.style.display = 'none'; return; }
    const sc = cb.getScene(); if (!sc) return;
    canvas.style.display = 'block'; coords.style.display = 'block';
    const data = sc.sampleMinimap(RAD, STEP);
    const px = canvas.width / data.w;
    for (let j = 0; j < data.h; j++) for (let i = 0; i < data.w; i++) {
      ctx.fillStyle = '#' + data.colors[j][i].toString(16).padStart(6, '0');
      ctx.fillRect(i * px, j * px, Math.ceil(px), Math.ceil(px));
    }
    // markers: villages (gold), ships (blue), player (white)
    const toMap = (tx: number, ty: number) => ({ mx: ((tx - (data.px - RAD)) / (RAD * 2)) * canvas.width, my: ((ty - (data.py - RAD)) / (RAD * 2)) * canvas.height });
    for (const v of sc.villageMarkers()) { const m = toMap(v.x, v.y); if (m.mx >= 0 && m.mx < canvas.width && m.my >= 0 && m.my < canvas.height) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(m.mx - 2, m.my - 2, 5, 5); } }
    for (const s of sc.shipMarkers()) { const m = toMap(s.x, s.y); if (m.mx >= 0 && m.mx < canvas.width && m.my >= 0 && m.my < canvas.height) { ctx.fillStyle = '#5a8fde'; ctx.fillRect(m.mx - 2, m.my - 2, 4, 4); } }
    // player centre arrow
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    coords.textContent = `X ${data.px}  Y ${data.py}`;
  }, 280);
}

function showHud(show: boolean) {
  buildHudDom();
  const mm = document.getElementById('minimap'); if (mm) mm.style.display = show ? 'block' : 'none';
  const cc = document.getElementById('coords'); if (cc) cc.style.display = show ? 'block' : 'none';
  document.getElementById('topbar')!.classList.toggle('show', show);
  document.getElementById('hotbar')!.classList.toggle('show', show);
  document.getElementById('help')!.classList.toggle('show', show);
  document.getElementById('chatlog')!.classList.toggle('show', show);
  if (!show) {
    ['invscreen', 'storagescreen', 'tradescreen', 'bigmsg', 'chatinput'].forEach(id => document.getElementById(id)!.classList.remove('show'));
    const sp = document.getElementById('shipPrompt'); if (sp) sp.innerHTML = '';
    const tp = document.getElementById('tradePrompt'); if (tp) tp.innerHTML = '';
    shipPromptKey = ''; tradePromptKey = ''; storageOpen = false; storageShipId = null; tradeOpen = false;
  }
}

let lastHud: HudState | null = null;
export function updateHud(s: HudState) {
  lastHud = s; buildHudDom();
  // hearts (each = 10 hp, 10 hearts)
  const hearts = document.getElementById('hearts') as HTMLElement;
  let hh = '';
  for (let i = 0; i < 10; i++) hh += (s.hp >= (i + 1) * 10) ? Icons.heart : (s.hp >= i * 10 + 5 ? Icons.heart : Icons.heartEmpty);
  hearts.innerHTML = s.mode === 'creative' ? '' : hh;
  const food = document.getElementById('food') as HTMLElement;
  let fh = '';
  for (let i = 0; i < 10; i++) fh += (s.hunger >= (i + 1) * 10) ? Icons.meat : Icons.meatEmpty;
  food.innerHTML = s.mode === 'creative' ? '' : fh;

  const clock = document.getElementById('clock') as HTMLElement;
  const t = s.time; let label = 'Day', icon = Icons.sun;
  if (t > 0.72 || t < 0.18) { label = 'Night'; icon = Icons.moon; } else if (t < 0.25) label = 'Dawn'; else if (t > 0.62) label = 'Dusk';
  clock.innerHTML = `${icon} ${label}${s.mode === 'creative' ? ' · Creative' : ''}`;
  renderHotbar(s);
  if (invOpen) renderInventory(s);
}

function renderHotbar(s: HudState) {
  const hb = document.getElementById('hotbar') as HTMLElement; hb.innerHTML = '';
  const scene = cb.getScene();
  for (let i = 0; i < 9; i++) {
    const slot = s.inventory.hotbar[i];
    const d = document.createElement('div'); d.className = 'slot' + (i === s.selected ? ' active' : '');
    d.innerHTML = `<span class="key">${i + 1}</span>${slot.item ? `<img class="ico" src="${texUrl(slot.item)}" />` : ''}${slot.item && slot.count > 1 ? `<span class="cnt">${slot.count}</span>` : ''}`;
    d.addEventListener('click', () => scene?.selectSlot(i));
    hb.appendChild(d);
  }
}

const texCache: Record<string, string> = {};
function texUrl(item: ItemId): string {
  if (texCache[item]) return texCache[item];
  const game = cb.getGame(); if (!game) return '';
  const tex = game.textures.get(itemTextureKey(item)); if (!tex) return '';
  try { const src = tex.getSourceImage() as HTMLCanvasElement; if (src && (src as any).toDataURL) { const u = src.toDataURL(); texCache[item] = u; return u; } } catch { /* */ }
  return '';
}

export function toggleInventory(forceClose = false) {
  const scr = document.getElementById('invscreen') as HTMLElement;
  const wasOpen = invOpen;
  invOpen = forceClose ? false : !invOpen;
  scr.classList.toggle('show', invOpen);
  cb.getScene()?.setUiOpen(invOpen || settingsOpen);
  if (invOpen && lastHud) { sfx('click'); renderInventory(lastHud); }
  else { if (wasOpen) { const sc = cb.getScene(); if (sc) returnCarried(sc.inventory.storage); sc?.emitHud(); } sfx('click', 0.8); }
}

function renderInventory(s: HudState) {
  const wrap = document.getElementById('invWrap') as HTMLElement; const scene = cb.getScene();
  let rec = '';
  for (let i = 0; i < RECIPES.length; i++) {
    const r = RECIPES[i]; const can = s.inventory.canCraft(i, s.nearTable);
    const need = r.needs.map(n => `${n.n} ${ITEM_NAMES[n.item] || n.item}`).join(', ');
    rec += `<div class="recipe ${can ? 'can' : ''}"><div class="ricon"><img src="${texUrl(r.out)}" /></div>
      <div class="grow"><div class="rn">${r.count > 1 ? r.count + '× ' : ''}${ITEM_NAMES[r.out] || r.out}${r.table ? ' 🔨' : ''}</div><div class="rc">${need}</div></div>
      <button class="mc-btn sm ${can ? 'primary' : ''}" data-r="${i}" ${can ? '' : 'disabled'}>Craft</button></div>`;
  }
  wrap.innerHTML = `
    <button class="iconbtn red inv-close" id="ic">${Icons.x}</button>
    <div class="inv-col"><h3>${Icons.bag} Inventory <span class="pill lan" style="font-size:8px">drag to move · right-click to split</span></h3>
      <div style="font-size:9px;color:#3f3f3f;font-family:'PressStart',monospace;margin:0 0 5px">HOTBAR</div>
      <div class="inv-grid" id="invHot"></div>
      <div style="font-size:9px;color:#3f3f3f;font-family:'PressStart',monospace;margin:10px 0 5px">BACKPACK</div>
      <div class="inv-grid" id="invBag"></div></div>
    <div class="inv-col"><h3>${Icons.craft} Crafting ${s.nearTable ? '<span class="pill survival">At Table</span>' : '<span class="pill lan">No Table</span>'}</h3><div class="recipe-list">${rec}</div></div>`;
  (wrap.querySelector('#ic') as HTMLElement).addEventListener('click', () => toggleInventory(true));
  const change = () => { scene?.emitHud(); };
  buildGrid(wrap.querySelector('#invHot') as HTMLElement, s.inventory.hotbar, 9, change);
  buildGrid(wrap.querySelector('#invBag') as HTMLElement, s.inventory.storage, 9, change);
  wrap.querySelectorAll('button[data-r]').forEach(b => b.addEventListener('click', () => { const i = parseInt((b as HTMLElement).dataset.r!); scene?.craft(i); }));
}

// in-game settings popup
function openIngameSettings() {
  settingsOpen = true; cb.getScene()?.setUiOpen(true);
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'setModal';
  bg.innerHTML = `<div class="mc-panel modal"><div class="mc-h">${Icons.gear} Settings</div><div id="setb"></div><button class="mc-btn primary" id="close" style="margin-top:14px">Done</button></div>`;
  document.body.appendChild(bg);
  buildSettingsControls(bg.querySelector('#setb') as HTMLElement, () => { persistSettings(settings); cb.getScene()?.applySettings(settings); });
  (bg.querySelector('#close') as HTMLElement).addEventListener('click', () => closeIngameSettings());
  bg.addEventListener('click', e => { if (e.target === bg) closeIngameSettings(); });
}
function closeIngameSettings() { settingsOpen = false; document.getElementById('setModal')?.remove(); cb.getScene()?.setUiOpen(invOpen); sfx('click'); }

// ----- chat -----
function openChat(prefill = '') {
  chatOpen = true;
  const ci = document.getElementById('chatinput') as HTMLElement; ci.classList.add('show');
  const cf = document.getElementById('chatField') as HTMLInputElement; cf.value = prefill; cf.focus();
  cb.getScene()?.setUiOpen(true);
}
function closeChat() { chatOpen = false; document.getElementById('chatinput')!.classList.remove('show'); cb.getScene()?.setUiOpen(invOpen || settingsOpen); }
function sendChat(text: string) {
  const t = text.trim(); if (!t) return;
  if (t.startsWith('/')) { cb.getScene()?.runCommand(t); }
  else { pushChat(`<${esc(currentPlayer?.username || 'You')}> ${esc(t)}`, 'chat'); }
}
export function pushChat(msg: string, kind: 'system' | 'chat') {
  buildHudDom();
  const log = document.getElementById('chatlog') as HTMLElement;
  const line = document.createElement('div'); line.className = `chatline ${kind} fade`; line.innerHTML = msg;
  log.appendChild(line);
  while (log.children.length > 10) log.removeChild(log.firstChild!);
}

// ----- ship hover buttons + storage -----
let storageOpen = false;
let storageShipId: string | null = null;
let shipPromptKey = '';

export function showShipPrompt(info: ShipPromptInfo | null) {
  buildHudDom();
  const host = document.getElementById('shipPrompt') as HTMLElement;
  if (!info || invOpen || settingsOpen || storageOpen || chatOpen) { if (shipPromptKey) { host.innerHTML = ''; shipPromptKey = ''; } return; }
  // identity of the prompt content (rebuild only when this changes)
  const key = `${info.shipId}|${info.driving}|${info.drive}|${info.storage}|${info.enter}|${info.inInterior}|${info.name}`;
  if (key !== shipPromptKey) {
    shipPromptKey = key;
    const btns: string[] = [];
    if (info.inInterior) {
      if (info.storage) btns.push(`<div class="sb" data-a="storage">${Icons.bag} Open Storage</div>`);
      btns.push(`<div class="sb exit" data-a="exit">${Icons.logout} Leave Ship</div>`);
    } else if (info.driving) {
      btns.push(`<div class="sb drive" data-a="drive">${Icons.x} Stop Driving</div>`);
    } else {
      if (info.drive) btns.push(`<div class="sb drive" data-a="drive">${Icons.play} Drive</div>`);
      if (info.storage) btns.push(`<div class="sb" data-a="storage">${Icons.bag} Storage</div>`);
      if (info.enter) btns.push(`<div class="sb" data-a="enter">${Icons.home} Enter</div>`);
    }
    host.innerHTML = `<div class="hover-ui" id="shipHover"><div class="hover-title">${esc(info.name)}</div><div class="hover-btns">${btns.join('')}</div></div>`;
    host.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', () => {
      const a = (el as HTMLElement).dataset.a; const sc = cb.getScene(); if (!sc) return; sfx('click');
      if (a === 'drive') sc.uiDrive(info.shipId);
      else if (a === 'enter') sc.uiEnter(info.shipId);
      else if (a === 'storage') openStorage(info.shipId);
      else if (a === 'exit') sc.uiExitShip();
    }));
  }
  // reposition every frame (cheap)
  const hover = document.getElementById('shipHover') as HTMLElement | null;
  if (hover) { hover.style.left = info.screenX + 'px'; hover.style.top = info.screenY + 'px'; }
}

export function openShipStorage(shipId: string) { openStorage(shipId); }
function openStorage(shipId: string) {
  const sc = cb.getScene(); if (!sc) return;
  const data = sc.shipStorage(shipId); if (!data) return;
  storageOpen = true; storageShipId = shipId;
  sc.setUiOpen(true);
  const scr = document.getElementById('storagescreen') as HTMLElement; scr.classList.add('show');
  const wrap = document.getElementById('storageWrap') as HTMLElement;
  // chest grid columns: small chests stay compact, big ones cap at 9 wide.
  const cols = data.slots.length >= 18 ? 9 : data.slots.length > 9 ? 6 : Math.max(1, Math.min(9, data.slots.length));
  wrap.innerHTML = `
    <div class="panel-head">
      <h3>${Icons.bag} ${esc(data.name)} <span class="pill lan" style="font-size:8px">${data.slots.length} slots</span></h3>
      <button class="mc-btn sm danger" id="sx">${Icons.x} Close</button>
    </div>
    <div class="panel-body">
      <div class="panel-section">CONTAINER</div>
      <div class="storage-grid" id="stGrid" style="grid-template-columns:repeat(${cols},42px)"></div>
      <div class="panel-section">YOUR HOTBAR</div>
      <div class="storage-grid" id="stHot" style="grid-template-columns:repeat(9,42px)"></div>
      <div class="panel-section">BACKPACK</div>
      <div class="storage-grid" id="stBag" style="grid-template-columns:repeat(9,42px)"></div>
      <div class="panel-hint">Drag items between grids · right-click to split a stack</div>
    </div>`;
  (wrap.querySelector('#sx') as HTMLElement).addEventListener('click', () => closeStorage());
  const change = () => { sc.emitHud(); };
  buildGrid(wrap.querySelector('#stGrid') as HTMLElement, data.slots, cols, change, 42);
  buildGrid(wrap.querySelector('#stHot') as HTMLElement, sc.inventory.hotbar, 9, change, 42);
  buildGrid(wrap.querySelector('#stBag') as HTMLElement, sc.inventory.storage, 9, change, 42);
  sfx('click');
}
function closeStorage() {
  storageOpen = false;
  const sc = cb.getScene();
  if (sc && storageShipId) { const d = sc.shipStorage(storageShipId); if (d) returnCarried(d.slots); returnCarried(sc.inventory.storage); }
  storageShipId = null;
  document.getElementById('storagescreen')!.classList.remove('show');
  cb.getScene()?.setUiOpen(invOpen || settingsOpen);
  sfx('click', 0.8);
}

// ----- villager trade -----
let tradeOpen = false;
let tradePromptKey = '';
const TRADES: { give: ItemId; giveN: number; get: ItemId; getN: number }[] = [
  { give: 'wood', giveN: 6, get: 'apple', getN: 4 },
  { give: 'coal', giveN: 4, get: 'iron', getN: 2 },
  { give: 'iron', giveN: 3, get: 'diamond', getN: 1 },
  { give: 'apple', giveN: 4, get: 'meat', getN: 3 },
  { give: 'planks', giveN: 10, get: 'glass', getN: 4 },
  { give: 'diamond', giveN: 1, get: 'diamond_sword', getN: 1 },
];

export function showTradePrompt(info: TradePrompt | null) {
  buildHudDom();
  const host = document.getElementById('tradePrompt') as HTMLElement;
  if (!info || invOpen || settingsOpen || storageOpen || chatOpen || tradeOpen) { if (tradePromptKey) { host.innerHTML = ''; tradePromptKey = ''; } return; }
  if (tradePromptKey !== 'on') {
    tradePromptKey = 'on';
    host.innerHTML = `<div class="hover-ui" id="tradeHover"><div class="hover-title">Villager</div><div class="hover-btns"><div class="sb trade" data-a="trade">${Icons.friends} Trade</div></div></div>`;
    (host.querySelector('[data-a="trade"]') as HTMLElement).addEventListener('click', () => { sfx('click'); openTrade(); });
  }
  const hover = document.getElementById('tradeHover') as HTMLElement | null;
  if (hover) { hover.style.left = info.screenX + 'px'; hover.style.top = info.screenY + 'px'; }
}

function openTrade() {
  const sc = cb.getScene(); if (!sc) return;
  tradeOpen = true; sc.setUiOpen(true);
  const scr = document.getElementById('tradescreen') as HTMLElement; scr.classList.add('show');
  renderTrade();
  sfx('click');
}
function renderTrade() {
  const sc = cb.getScene(); if (!sc) return;
  const wrap = document.getElementById('tradeWrap') as HTMLElement;
  let rows = '';
  for (let i = 0; i < TRADES.length; i++) {
    const t = TRADES[i]; const can = sc.inventory.total(t.give) >= t.giveN;
    rows += `<div class="recipe ${can ? 'can' : ''}">
      <div class="ricon"><img src="${texUrl(t.give)}" /></div>
      <div class="grow"><div class="rn">${t.giveN} ${ITEM_NAMES[t.give] || t.give} → ${t.getN} ${ITEM_NAMES[t.get] || t.get}</div><div class="rc">${can ? 'Ready to trade' : 'Not enough ' + (ITEM_NAMES[t.give] || t.give)}</div></div>
      <div class="ricon"><img src="${texUrl(t.get)}" /></div>
      <button class="mc-btn sm ${can ? 'primary' : ''}" data-t="${i}" ${can ? '' : 'disabled'}>Trade</button></div>`;
  }
  wrap.innerHTML = `
    <div class="panel-head">
      <h3>${Icons.friends} Villager Trades</h3>
      <button class="mc-btn sm danger" id="tx">${Icons.x} Close</button>
    </div>
    <div class="panel-body"><div class="recipe-list" style="max-height:none">${rows}</div></div>`;
  (wrap.querySelector('#tx') as HTMLElement).addEventListener('click', () => closeTrade());
  wrap.querySelectorAll('button[data-t]').forEach(b => b.addEventListener('click', () => {
    const i = parseInt((b as HTMLElement).dataset.t!); const t = TRADES[i];
    if (sc.doTrade(t.give, t.giveN, t.get, t.getN)) renderTrade();
  }));
}
function closeTrade() { tradeOpen = false; document.getElementById('tradescreen')!.classList.remove('show'); cb.getScene()?.setUiOpen(invOpen || settingsOpen || storageOpen); sfx('click', 0.8); }

export function showDeath() {
  const bm = document.getElementById('bigmsg') as HTMLElement;
  (document.getElementById('bigT') as HTMLElement).textContent = 'YOU DIED';
  (document.getElementById('bigD') as HTMLElement).textContent = 'Respawn at your starting point.';
  const btn = document.getElementById('bigBtn') as HTMLButtonElement; btn.textContent = 'Respawn';
  btn.onclick = () => { sfx('click'); cb.getScene()?.respawn(); bm.classList.remove('show'); };
  bm.classList.add('show');
}

// ============================================================
// World lifecycle
// ============================================================
let currentWorld: World | null = null;
let autosaveTimer: number | null = null;
let bannerMsg: string | null = null;

function enterWorld(w: World, banner?: string) { currentWorld = w; bannerMsg = banner || null; cb.startWorld(w, settings); }

export function onWorldStarted() {
  app.classList.add('hidden');
  showHud(true); invOpen = false; settingsOpen = false; chatOpen = false;
  if (autosaveTimer) clearInterval(autosaveTimer);
  if (settings.autosave) autosaveTimer = window.setInterval(() => saveCurrentWorld(false), 30000);
  if (bannerMsg) pushChat(bannerMsg, 'system');
}

async function saveCurrentWorld(showToast: boolean) {
  const scene = cb.getScene(); if (!scene || !currentWorld) return;
  try { const data = scene.serialize(); await Api.saveWorld(currentWorld.id, data); currentWorld.save_data = data; if (showToast) toast('World saved', 'good'); }
  catch { if (showToast) toast('Save failed', 'bad'); }
}

async function leaveWorld() {
  sfx('click'); await saveCurrentWorld(false);
  if (autosaveTimer) clearInterval(autosaveTimer);
  showHud(false);
  cb.getGame()?.scene.stop('GameScene');
  toast('World saved & closed', 'good');
  showHub(); refreshFriends();
}
