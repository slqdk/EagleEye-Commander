// EagleEye Commander — the client: menu, lobby, base building, attack planning and battle playback.
import { DEFS } from '../shared/defs.js';
import { powerState, buildBlock, trainBlock, makeOcc, placeBlock, hasOn, harvCount, sellValue, repairCost } from '../shared/engine.js';
import { createSim, musterPositions, dockOf, assignGroups } from '../shared/sim.js';
import { unpackBits, stamp } from '../shared/util.js';
import { Renderer, GROUP_COL } from './render.js';
import { cameo, sprite, TURRET, OUT, setStyle } from './toon.js';
import { sfx, say, unitSay, unlock, music, songNames } from './audio.js';
import { cfg, setCfg, resetCfg, onCfg } from './settings.js';
import { Remote, Local, LS } from './backend.js';

const BD = DEFS.buildings, UD = DEFS.units;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('da-DK');
const TOUCH = matchMedia('(pointer: coarse)').matches, MOUSE = matchMedia('(any-pointer: fine)').matches;
const R = new Renderer($('#map'));
const st = { be: null, v: null, mode: 'menu', scene: null, ps: null, occ: null, ed: { mode: 'idle' }, sel: null, prod: { b: null, u: [] }, orders: [], editG: -1,
  rp: null, moneyShown: 0, knownPrev: new Set(), skew: 0, tab: 'B', busy: false, cam0: false, selU: new Set(), box: null, lastU: null, hoverG: -1,
  bAnim: new Map(), sold: [], tweenOK: false, radarWas: null, radarT0: null };

// ---------- small UI helpers ----------
let toastT = 0;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); if (bad) sfx('error'); }
function modal(html) { $('#modalBox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function splash(big, small, ms = 1500) { const s = $('#splash'); s.innerHTML = `<b>${esc(big)}<small>${esc(small || '')}</small></b>`; s.hidden = false; setTimeout(() => s.hidden = true, ms); }
function show(id) { for (const s of $$('.screen')) s.hidden = s.id !== id; }
const cameoCache = new Map();
function cameoURL(t, faction, color) { const k = t + faction + color; let u = cameoCache.get(k); if (!u) { u = cameo(t, faction, color).toDataURL(); cameoCache.set(k, u); } return u; }
const me = () => st.v.me;
// The graphics settings: the sprite factory gets the style, the renderer the rest. Everything painted in advance is painted again.
function applyGraphics() {
  const styled = setStyle({ detail: cfg.detail, palette: cfg.palette, outline: cfg.outline }), sharp = R.opt.sharp !== cfg.sharp;
  Object.assign(R.opt, { shadows: cfg.shadows, damage: cfg.damage, anim: cfg.anim, particles: cfg.particles, sharp: cfg.sharp });
  if (styled || sharp) R.restyle();
  if (styled) { cameoCache.clear(); fillPick(); if (st.v && st.v.me && st.scene && st.mode !== 'lobby') renderSide(); }
  document.documentElement.dataset.palette = cfg.palette;
}
const seenKey = () => 'jf2-seen-' + (st.be.kind === 'local' ? 'L' + st.v.map.t.length + st.v.map.starts[0].x : st.v.code) + '-' + (me() ? me().id : 0);

// ---------- menu ----------
function fillPick() {
  for (const box of $$('.fpick')) {
    const cur = box.dataset.f || 'A';
    box.innerHTML = Object.entries(DEFS.factions).map(([f, d], i) => `<button type="button" data-f="${f}" class="${f === cur ? 'on' : ''}"><img src="${cameoURL(f === 'A' ? 'mt' : 'ht', f, i)}" alt=""><b>${d.name}</b><small>${d.desc}</small></button>`).join('');
    box.dataset.f = cur;
  }
}
function initMenu() {
  fillPick();
  for (const box of $$('.fpick')) box.onclick = e => { const b = e.target.closest('button'); if (!b) return; box.dataset.f = b.dataset.f; for (const x of box.children) x.classList.toggle('on', x === b); sfx('click'); };
  $('#btnSet0').onclick = () => { unlock(); showSettings(); };
  $('#quickForm').onsubmit = e => {
    e.preventDefault(); unlock();
    const f = new FormData(e.target), faction = e.target.querySelector('.fpick').dataset.f, bots = +f.get('bots');
    const be = Local.create({ name: String(f.get('name')).trim() || 'General', faction, bots });
    enter(be);
  };
  const saved = Local.load();
  if (saved && saved.game.phase === 'play') { $('#btnContinue').hidden = false; $('#btnContinue').onclick = () => { unlock(); enter(saved); }; }
  // online play only when the page is served by the game server
  let mode = 'create';
  const setMode = m => { mode = m; for (const b of $('#onlineSeg').children) b.classList.toggle('on', b.dataset.m === m); for (const el of $$('#onlineForm [data-for]')) el.hidden = !el.dataset.for.split(' ').includes(m); $('#onlineBtn').textContent = { create: 'Opret kamp', join: 'Deltag', login: 'Log ind' }[m]; };
  $('#onlineSeg').onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
  $('#onlineForm').onsubmit = async e => {
    e.preventDefault(); unlock(); $('#onlineErr').textContent = '';
    const f = new FormData(e.target), body = { game: f.get('game'), code: String(f.get('code') || '').toUpperCase().trim(), name: f.get('name'), pin: f.get('pin'), faction: e.target.querySelector('.fpick').dataset.f };
    try { const [be, v] = await Remote.enter(mode, body); enter(be, v); } catch (err) { $('#onlineErr').textContent = err.message; sfx('error'); }
  };
  (window.JF_OFFLINE ? Promise.resolve(false) : Remote.available()).then(async ok => {
    if (!ok) return;
    $('#onlineForm').hidden = false; setMode('create');
    const code = new URLSearchParams(location.search).get('kode');
    if (code) { setMode('join'); $('#onlineForm [name=code]').value = code.toUpperCase(); }
    const tok = LS.get('jf2-token');
    if (tok && !code) { try { const be = new Remote(tok), v = await be.state(-1); if (v && st.mode === 'menu') enter(be, v); } catch { LS.del('jf2-token'); } }
  });
}
async function enter(be, v) {
  st.be = be; st.v = null; st.rp = null; st.cam0 = false; st.knownPrev = new Set(); st.tweenOK = false; st.radarWas = null; st.radarT0 = null; st.bAnim.clear(); st.sold = []; music.setLevel(0);
  applyView(v || await be.state(-1), true);
}
function leave() { closeModal(); music.setLevel(0); st.tweenOK = false; if (st.be) st.be.leave(); st.be = null; st.v = null; st.rp = null; st.scene = null; st.mode = 'menu'; show('menu'); const s = Local.load(); $('#btnContinue').hidden = !(s && s.game.phase === 'play'); if (s) $('#btnContinue').onclick = () => { unlock(); enter(s); }; }

// ---------- lobby ----------
function renderLobby() {
  const v = st.v, host = v.host === v.me.id, url = location.origin + location.pathname + '?kode=' + v.code;
  const fsel = (p, dis) => `<select data-id="${p.id}" data-k="f" ${dis ? 'disabled' : ''}>${Object.entries(DEFS.factions).map(([f, d]) => `<option value="${f}" ${p.faction === f ? 'selected' : ''}>${d.name}</option>`).join('')}</select>`;
  const tsel = (p, dis) => `<select data-id="${p.id}" data-k="t" ${dis ? 'disabled' : ''}>${['Alle mod alle', 'Hold 1', 'Hold 2', 'Hold 3'].map((n, i) => `<option value="${i}" ${p.team === i ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  $('#lobbyCard').innerHTML = `
    <h2>${esc(v.name)}</h2>
    <div class="row"><div><small style="color:var(--dim)">INVITATIONSKODE</small><div class="code">${esc(v.code)}</div></div><span class="grow"></span><button class="btn" id="lbCopy">Kopiér invitationslink</button></div>
    <div>${v.players.map(p => { const mine = p.id === v.me.id, can = mine || (host && p.kind === 'ai'); return `<div class="lrow"><i class="chip" style="background:${DEFS.colors[p.color].main}"></i><span>${esc(p.name)}${p.kind === 'ai' ? ' <small style="color:var(--dim)">AI</small>' : ''}${mine ? ' <small style="color:var(--gold)">dig</small>' : ''}</span>${fsel(p, !can)}${tsel(p, !can)}${host && p.kind === 'ai' ? `<button class="btn small warn" data-kick="${p.id}">Fjern</button>` : '<span></span>'}</div>`; }).join('')}</div>
    ${host ? `<div class="row"><button class="btn" id="lbBot">Tilføj AI-general</button><span class="grow"></span>
      <label style="flex-direction:row;align-items:center;gap:6px">Runde senest efter<select id="lbHours">${[[0, 'ingen frist'], [12, '12 timer'], [24, '1 døgn'], [48, '2 døgn'], [72, '3 døgn']].map(([h, n]) => `<option value="${h}" ${v.opts.roundHours === h ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label style="flex-direction:row;align-items:center;gap:6px">Våbenhvile<select id="lbPeace">${[0, 1, 2, 3, 4, 5].map(n => `<option ${v.opts.peace === n ? 'selected' : ''}>${n}</option>`).join('')}</select>runder</label></div>
      <div class="acts"><button class="btn" id="lbLeave">Tilbage</button><button class="btn go" id="lbStart" ${v.players.length < 2 ? 'disabled' : ''}>Start kampen</button></div>`
    : `<p class="hint">Venter på, at værten starter kampen …</p><div class="acts"><button class="btn" id="lbLeave">Tilbage</button></div>`}`;
  const C = $('#lobbyCard');
  C.onchange = e => {
    const s = e.target; if (s.id === 'lbHours') return doAct({ a: 'opts', roundHours: +s.value }); if (s.id === 'lbPeace') return doAct({ a: 'opts', peace: +s.value });
    const id = +s.dataset.id; if (!id) return;
    if (id === v.me.id) doAct(s.dataset.k === 'f' ? { a: 'faction', f: s.value } : { a: 'team', team: +s.value });
    else doAct(s.dataset.k === 'f' ? { a: 'botSet', id, f: s.value } : { a: 'botSet', id, team: +s.value });
  };
  C.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; unlock();
    if (b.id === 'lbCopy') { navigator.clipboard?.writeText(url); toast('Link kopieret'); }
    else if (b.id === 'lbBot') doAct({ a: 'addBot' });
    else if (b.dataset.kick) doAct({ a: 'kick', id: +b.dataset.kick });
    else if (b.id === 'lbStart') doAct({ a: 'start' });
    else if (b.id === 'lbLeave') leave();
  };
}

// ---------- talking to the game ----------
async function doAct(a, quiet) {
  if (!st.be) return false;
  try { const v = await st.be.act(a); applyView(v); return true; }
  catch (e) { if (!quiet) toast(e.message, true); if (/midler/.test(e.message)) say('nomoney'); return false; }
}
function applyView(v, first) {
  if (!v) return;
  const prev = st.v; st.v = v; st.skew = v.now ? v.now - Date.now() / 1000 : 0;
  if (v.phase === 'lobby') { st.mode = 'lobby'; show('lobby'); renderLobby(); return; }
  show('game'); R.resize(); R.setMap(v.map);
  st.orders = JSON.parse(JSON.stringify(v.me ? v.me.orders : []));
  if (!st.cam0) { st.cam0 = true; focusHome(); R.cam.z = Math.min(64, Math.max(28, R.w / 30)); }
  const resolved = prev && prev.phase !== 'lobby' && v.round > prev.round;
  const unseen = first && v.last && +(LS.get(seenKey()) || 0) < v.last.round;
  if (resolved || unseen) { cancelEdit(); startBattle(); return; }
  if (st.mode === 'replay') { renderTop(); return; }
  st.mode = 'plan'; rebuild();
  if (first && v.phase === 'play' && v.me && v.me.alive) setTimeout(() => say('hello'), 900);
  if (first && v.phase === 'over') showOver();
  if ((first || (prev && prev.phase === 'lobby')) && v.phase === 'play' && v.round === 1 && LS.get('jf2-help') !== '4') { LS.set('jf2-help', '4'); setTimeout(showHelp, 400); }
}
setInterval(async () => {
  if (!st.be || st.be.kind !== 'remote' || !st.v || st.busy || document.hidden) return;
  if (st.mode !== 'plan' && st.mode !== 'lobby') return;
  try { const v = await st.be.state(st.v.rev); if (v) applyView(v); } catch {}
}, 7000);

function focusHome() {
  const m = me(); if (!m || !m.buildings.length) { R.cam.x = st.v.map.n / 2; R.cam.y = st.v.map.n / 2; return; }
  const hq = m.buildings.find(b => b.t === 'hq') || m.buildings[0]; R.cam.x = hq.x + 1.5; R.cam.y = hq.y + 2.5;
}

// ---------- planning scene ----------
function rebuild() {
  const v = st.v, m = v.me, n = v.map.n, T = v.map.t;
  if (!m) return;
  st.ps = powerState(m);
  const colors = {}; for (const p of v.players) colors[p.id] = { color: p.color, faction: p.faction };
  const explored = unpackBits(m.explored, n * n), vis = new Uint8Array(n * n), B = [], Us = [];
  const friends = new Set([m.id, ...v.allies.map(a => a.id)]);
  const add = (b, o, off, ghost) => B.push({ id: b.id, t: b.t, x: b.x, y: b.y, hp: b.hp ?? BD[b.t].hp, mhp: BD[b.t].hp, o, off, ghost, sel: st.sel === b.id, an: st.bAnim.get(b.id) });
  if (m.alive) for (const b of m.buildings) add(b, m.id, !!st.ps.off[b.id], false);
  for (const a of v.allies) { const ps = powerState(a); for (const b of a.buildings) add(b, a.id, !!ps.off[b.id], false); }
  for (const id in m.known) { const k = m.known[id]; if (!friends.has(k.o)) add({ id: +id, t: k.t, x: k.x, y: k.y }, k.o, false, true); }
  st.occ = makeOcc(v.map, v.ore, B);
  for (const g of st.sold) B.push(g);   // buildings that are still sinking into the ground after being sold
  const free = (x, y) => x >= 0 && y >= 0 && x < n && y < n && (T[y * n + x] === '.' || T[y * n + x] === 'b') && st.occ[y * n + x] < 2;
  let uid = 1;
  const muster = (p, ps, isMe) => {
    const list = musterPositions(p.buildings, p.army, free), gs = isMe ? assignGroups(list, st.orders) : null, keys = new Set();
    list.forEach((u, k) => {
      const key = u.t + ':' + u.i, air = UD[u.t].air; keys.add(key);
      Us.push({ id: uid++, t: u.t, i: u.i, key, uk: p.id + '|' + key, x: u.x, y: u.y, fx: air ? 1 : 0.3, fy: air ? 0 : 0.95, o: p.id, hp: 1, mhp: 1, g: gs ? gs[k] : -1, pick: isMe, sel: isMe && st.selU.has(key) });
    });
    if (isMe) for (const k of [...st.selU]) if (!keys.has(k)) st.selU.delete(k);
    const refs = p.buildings.filter(b => b.t === 'ref' && !ps.off[b.id]), hc = harvCount(p, ps);
    for (let k = 0; k < hc && refs.length; k++) { const [dx, dy] = dockOf(refs[k % refs.length]); Us.push({ id: uid++, t: 'harv', uk: p.id + '|harv' + k, x: dx + 0.5 + ((k / refs.length) | 0) * 0.7, y: dy + 0.5 + ((k / refs.length) | 0) * 0.4, fx: 0, fy: -1, o: p.id, hp: 1, mhp: 1, g: -1 }); }
  };
  if (m.alive) muster(m, st.ps, true);
  for (const a of v.allies) muster(a, powerState(a), false);
  for (const b of B) if (!b.ghost && !b.gone) { const d = BD[b.t]; stamp(vis, n, b.x + d.w / 2, b.y + d.h / 2, d.sight + (d.w > 2 ? 1 : 0)); }
  for (const u of Us) stamp(vis, n, u.x, u.y, UD[u.t].sight);
  for (let i = 0; i < vis.length; i++) if (vis[i]) explored[i] = 1;
  st.knownPrev = new Set(Object.keys(m.known).map(Number));
  // Units walk to their new spot instead of jumping, and new ones come out of the building that made them.
  const tnow = performance.now() / 1000, prev = st.tweenOK && st.scene ? new Map(st.scene.units.map(u => [u.uk, u])) : null;
  let door = false;
  if (prev) for (const u of Us) {
    const d = UD[u.t], pu = prev.get(u.uk), tx = u.x, ty = u.y; let x0, y0, alt = null;
    if (pu) { x0 = pu.x; y0 = pu.y; if (pu.tw && pu.tw.alt != null) alt = pu.alt; }
    else {
      const owner = u.o === m.id ? m : v.allies.find(a => a.id === u.o); if (!owner) continue;
      if (d.air) { x0 = tx - 3; y0 = ty - 0.6; alt = 1; }
      else if (d.harv) { const r = owner.buildings.filter(b => b.t === 'ref').sort((a, b) => Math.hypot(a.x + 1.5 - tx, a.y + 3.5 - ty) - Math.hypot(b.x + 1.5 - tx, b.y + 3.5 - ty))[0]; if (!r) continue; x0 = r.x + 1.5; y0 = r.y + 2.3; }
      else { const b = owner.buildings.find(q => q.t === (d.cls === 'inf' ? 'bar' : 'fac')); if (!b) continue; x0 = b.x + BD[b.t].w / 2; y0 = b.y + BD[b.t].h - 0.35; door = door || d.cls !== 'inf'; }
    }
    const dist = Math.hypot(tx - x0, ty - y0); if (dist < 0.04 && alt == null) continue;
    u.tw = { x0, y0, x1: tx, y1: ty, t0: tnow, dur: Math.max(0.25, Math.min(1.3, dist / (d.cls === 'inf' ? 2.4 : d.air ? 4 : 3))), fx: u.fx, fy: u.fy, alt };
    u.x = x0; u.y = y0; if (alt != null) u.alt = alt;
  }
  if (door) sfx('door');
  const radarOn = hasOn(m, 'rad', st.ps);
  if (radarOn && st.radarWas === false && st.tweenOK) { st.radarT0 = tnow; sfx('powerup'); }
  st.radarWas = radarOn; st.tweenOK = true;
  st.scene = { buildings: B, units: Us, ore: v.ore, fog: m.alive || v.phase !== 'over' ? { explored, vis, key: 'p' + v.rev + ':' + st.orders.length } : null, colors, mine: o => friends.has(o),
    radarOn, radarT0: st.radarT0, showGroups: true, overlay: planOverlay, hq: B.find(b => b.t === 'hq' && b.o === m.id) };
  if (v.phase === 'over' || !m.alive) st.scene.radarOn = true;
  renderTop(); renderSide(); renderInfo(); renderOrders(); renderBanner();
}

// ---------- top bar ----------
function renderTop() {
  const v = st.v, m = v.me, replay = st.mode === 'replay';
  $('#roundInfo').innerHTML = `Runde ${replay && st.rp ? st.rp.snap.round : v.round}${v.peaceLeft > 0 && !replay ? `<small>våbenhvile</small>` : ''}`;
  $('#pips').innerHTML = v.players.map(p => `<span class="pip ${p.alive ? '' : 'dead'} ${p.ready ? 'rdy' : ''}" title="${esc(p.name)}"><i style="background:${DEFS.colors[p.color].main}">${p.ready ? '✓' : ''}</i><span>${esc(p.name)}</span></span>`).join('');
  const b = $('#btnReady'), can = v.phase === 'play' && m && m.alive && !replay;
  b.disabled = !can; b.textContent = !can ? (replay ? 'KAMP I GANG' : v.phase === 'over' ? 'KAMPEN ER SLUT' : 'SLÅET UD') : m.ready ? 'VENTER … (fortryd)' : 'KLAR TIL KAMP';
  b.classList.toggle('wait', !!(can && m.ready)); b.classList.toggle('go', !(can && m.ready));
}
setInterval(() => {
  const v = st.v, el = $('#deadline'); if (!v || !v.deadline || v.phase !== 'play') { el.textContent = ''; return; }
  const s = Math.max(0, v.deadline - (Date.now() / 1000 + st.skew)), h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60);
  el.textContent = 'Kamp senest om ' + (h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 't' : h + 't ' + String(mi).padStart(2, '0') + 'm');
}, 1000);
function renderBanner() {
  const v = st.v, m = v.me, b = $('#banner'); let txt = '', cls = '';
  if (st.mode === 'replay') { b.hidden = true; return; }
  if (v.phase === 'over') txt = 'Kampen er slut';
  else if (!m.alive) { txt = 'Du er slået ud. Du kan stadig se kampene.'; cls = 'warn'; }
  else if (st.ed.mode === 'place') txt = 'Vælg hvor ' + BD[st.ed.t].name.toLowerCase() + ' skal stå';
  else if (st.ed.mode === 'sell') { txt = 'SÆLG: klik på en bygning'; cls = 'warn'; }
  else if (st.ed.mode === 'repair') { txt = 'REPARÉR: klik på en beskadiget bygning'; cls = 'warn'; }
  else if (st.ed.mode === 'route') { txt = 'Klik på kortet for at sætte rute og mål for gruppe ' + (st.editG + 1); cls = 'warn'; }
  else if (st.ed.mode === 'send') { txt = (TOUCH ? 'Tryk' : 'Klik') + ' på målet for de valgte enheder' + (TOUCH ? '' : ' · Shift+klik lægger rutepunkter · Esc annullerer'); cls = 'warn'; }
  else if (st.selU.size) { txt = st.selU.size + ' valgt: tryk Send af sted' + (TOUCH ? '' : ' (G)') + ' og udpeg målet'; cls = 'warn'; }
  else if (st.ps.use > st.ps.prod) { txt = '⚡ Lav strøm: de nyeste bygninger er slukket'; cls = 'warn'; }
  else if (v.peaceLeft > 0) { txt = `Våbenhvile ${v.peaceLeft} runde${v.peaceLeft > 1 ? 'r' : ''} endnu: ingen kan skyde, men du kan spejde`; cls = 'peace'; }
  b.hidden = !txt; b.textContent = txt; b.className = cls;
}

// ---------- sidebar ----------
const camEls = new Map();
function renderSide() {
  const v = st.v, m = v.me, ps = st.ps; if (!m) return;
  $('#side').classList.toggle('off', st.mode !== 'plan' || !m.alive || v.phase !== 'play');
  $('#side').dataset.tab = st.tab;
  const mk = (kind, t, d, why, cnt, minus) => `<button class="cameo ${why ? 'locked' : ''} ${!why && m.money < d.cost ? 'poor' : ''}" data-k="${kind}:${t}"><img src="${cameoURL(t, m.faction, m.color)}" alt="" draggable="false"><span class="cost">${d.cost}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}<span class="st"></span><i class="wipe"></i><span class="nm">${d.name}</span>${minus ? `<span class="minus" data-minus="${t}">−</span>` : ''}</button>`;
  let hb = '', hu = '';
  const hq = m.buildings.some(b => b.t === 'hq');
  for (const t in BD) { const d = BD[t]; if (!d.f.includes(m.faction)) continue; if (d.only === 'nohq' && hq) continue; if (d.only !== 'nohq' && !hq) continue; hb += mk('b', t, d, buildBlock(m, t, ps)); }
  for (const t in UD) { const d = UD[t]; if (!d.f.includes(m.faction)) continue; hu += mk('u', t, d, trainBlock(m, t, ps), m.army[t] | 0, (m.trained[t] | 0) > 0); }
  $('#colB').innerHTML = hb; $('#colU').innerHTML = hu;
  camEls.clear(); for (const el of $$('.cameo')) camEls.set(el.dataset.k, el);
  const max = Math.max(ps.prod, ps.use, 100) * 1.15;
  $('#powFill').style.height = (ps.prod / max * 100) + '%'; $('#powMark').style.bottom = (ps.use / max * 100) + '%';
  $('#power').classList.toggle('low', ps.use > ps.prod); $('#power').title = `Strøm: bruger ${ps.use} af ${ps.prod}`;
  $('#mRepair').classList.toggle('on', st.ed.mode === 'repair'); $('#mSell').classList.toggle('on', st.ed.mode === 'sell'); $('#mOrders').classList.toggle('on', !$('#orders').hidden || st.ed.mode === 'send');
  for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.tab === st.tab);
  updateProd(performance.now() / 1000);
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { st.tab = b.dataset.tab; renderSide(); } };
function pendingCost(now) {
  let c = 0; const b = st.prod.b;
  if (b) c += BD[b.t].cost * (b.ready ? 1 : Math.min(1, (now - b.t0) / b.dur));
  st.prod.u.forEach((u, i) => { c += UD[u.t].cost * (i === 0 ? Math.min(1, (now - u.t0) / u.dur) : 0); });
  return c;
}
function updateProd(now) {
  const b = st.prod.b;
  if (b && !b.ready && now - b.t0 >= b.dur) { b.ready = true; sfx('ready'); say('ready'); startPlace(b.t); }
  if (b && !b.ready && Math.floor(now * 14) !== Math.floor((now - 0.017) * 14)) sfx('tick', 0.6);
  const q = st.prod.u;
  if (q.length && !q[0].sent && now - q[0].t0 >= q[0].dur) {
    const u = q[0]; u.sent = true;
    doAct({ a: 'train', t: u.t, n: 1 }).then(ok => { q.shift(); if (q.length) q[0].t0 = performance.now() / 1000; if (ok) { sfx('ready', 0.6); say('unit'); } else st.prod.u = []; renderSide(); });
  }
  for (const [k, el] of camEls) {
    const [kind, t] = k.split(':'); let busy = false, rdy = false, p = 0, txt = '';
    if (kind === 'b' && b && b.t === t) { if (b.ready) { rdy = true; txt = 'KLAR'; } else { busy = true; p = (now - b.t0) / b.dur * 100; } }
    if (kind === 'u') { const n = q.filter(u => u.t === t).length; if (n) { busy = true; p = q[0].t === t ? Math.min(100, (now - q[0].t0) / q[0].dur * 100) : 0; txt = n > 1 ? '×' + n : ''; } }
    el.classList.toggle('busy', busy); el.classList.toggle('rdy', rdy);
    if (busy) el.style.setProperty('--p', p.toFixed(1));
    const s = el.querySelector('.st'); if (s.textContent !== txt) s.textContent = txt;
  }
}
function clickCameo(el, ev) {
  unlock();
  const [kind, t] = el.dataset.k.split(':'), m = me(), now = performance.now() / 1000;
  if (st.mode !== 'plan' || !m.alive) return;
  if (ev.target.dataset.minus) { doAct({ a: 'untrain', t, n: 1 }).then(ok => ok && sfx('sell')); return; }
  if (kind === 'b') {
    const why = buildBlock(m, t, st.ps); if (why) return toast(why, true);
    const b = st.prod.b;
    if (b && b.t === t) { if (b.ready) startPlace(t); return; }
    if (b) return toast(b.ready ? BD[b.t].name + ' venter på at blive placeret.' : 'Der bygges allerede.', true);
    if (m.money < BD[t].cost) { say('nomoney'); return toast('Utilstrækkelige midler.', true); }
    st.prod.b = { t, t0: now, dur: Math.min(1.8, 0.7 + BD[t].cost / 1800), ready: false }; sfx('click'); say('building');
  } else {
    const why = trainBlock(m, t, st.ps); if (why) return toast(why, true);
    if (m.money - pendingCost(now) - st.prod.u.slice(1).reduce((s, u) => s + UD[u.t].cost, 0) < UD[t].cost) { say('nomoney'); return toast('Utilstrækkelige midler.', true); }
    st.prod.u.push({ t, t0: now, dur: UD[t].cls === 'inf' ? 0.45 : 0.8 }); sfx('click'); if (st.prod.u.length === 1) say('training');
  }
}
$('#build').addEventListener('click', e => { const el = e.target.closest('.cameo'); if (el) clickCameo(el, e); });
$('#build').addEventListener('contextmenu', e => {
  e.preventDefault(); const el = e.target.closest('.cameo'); if (!el) return; const [kind, t] = el.dataset.k.split(':');
  if (kind === 'b' && st.prod.b && st.prod.b.t === t) { st.prod.b = null; cancelEdit(); say('cancel'); }
  else if (kind === 'u') { const i = st.prod.u.findLastIndex(u => u.t === t && !u.sent); if (i >= 0) st.prod.u.splice(i, 1); else if ((me().trained[t] | 0) > 0) doAct({ a: 'untrain', t, n: 1 }); }
});
// hover card (mouse only)
$('#build').addEventListener('pointermove', e => {
  const el = e.target.closest('.cameo'), tip = $('#tip'); if (!el || e.pointerType !== 'mouse') { tip.hidden = true; return; }
  const [kind, t] = el.dataset.k.split(':'), d = kind === 'b' ? BD[t] : UD[t], m = me(), why = kind === 'b' ? buildBlock(m, t, st.ps) : trainBlock(m, t, st.ps), w = d.weapon;
  const stats = kind === 'b' ? `Styrke ${d.hp}` + (d.power ? ` · strøm ${d.power > 0 ? '+' : ''}${d.power}` : '') : `Styrke ${d.hp} · fart ${d.speed}`;
  tip.innerHTML = `<b>${d.name} · ${d.cost}</b>${esc(d.desc)}<div class="st">${stats}${w ? ` · skade ${w.dmg} · rækkevidde ${w.range}` : ''}</div>${why ? `<div class="rq">${esc(why)}</div>` : ''}`;
  tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = Math.max(6, r.left - tip.offsetWidth - 12) + 'px'; tip.style.top = Math.max(6, Math.min(innerHeight - tip.offsetHeight - 6, r.top)) + 'px';
});
$('#build').addEventListener('pointerleave', () => $('#tip').hidden = true);

// ---------- placing, selling, repairing ----------
function cancelEdit() { st.ed = { mode: 'idle' }; $('#placebar').hidden = true; $('#map').className = ''; if (st.v && st.mode === 'plan') { renderBanner(); $('#mRepair').classList.remove('on'); $('#mSell').classList.remove('on'); } if (st.scene && st.mode === 'plan' && st.selU.size) renderInfo(); }
function startPlace(t) {
  if (st.mode !== 'plan') return;
  st.sel = null; st.selU.clear(); for (const u of st.scene.units) u.sel = false; $('#info').hidden = true; $('#orders').hidden = true; st.editG = -1;
  st.ed = { mode: 'place', t, x: null, y: null, ok: false, why: '' }; $('#map').className = 'place'; renderBanner();
  const pb = $('#placebar'); pb.hidden = false;
  pb.innerHTML = `<span>${BD[t].name}</span><button class="btn go small" id="pbOk">Placér</button><button class="btn small" id="pbNo">Annullér</button>`;
  $('#pbOk').onclick = () => confirmPlace(); $('#pbNo').onclick = () => { cancelEdit(); };
}
function ghostAt(wx, wy) {
  const e = st.ed, d = BD[e.t], n = st.v.map.n;
  e.x = Math.max(0, Math.min(n - d.w, Math.floor(wx - (d.w - 1) / 2))); e.y = Math.max(0, Math.min(n - d.h, Math.floor(wy - (d.h - 1) / 2)));
  e.why = placeBlock(st.occ, n, me().buildings, e.t, e.x, e.y); e.ok = !e.why;
}
async function confirmPlace() {
  const e = st.ed; if (e.mode !== 'place' || e.x == null) return toast('Klik på kortet for at vælge en plads.');
  if (!e.ok) { say('cant'); return toast(e.why, true); }
  const t = e.t, wasLow = st.ps.use > st.ps.prod;
  if (!await doAct({ a: 'build', t, x: e.x, y: e.y })) return;
  const nb = me().buildings.reduce((a, q) => q.id > a.id ? q : a), d = BD[t], an = { k: 'build', t0: performance.now() / 1000, dur: d.wall ? 0.35 : 0.55 + 0.25 * Math.sqrt(d.w * d.h) };
  st.bAnim.set(nb.id, an); const sb = st.scene.buildings.find(q => q.id === nb.id); if (sb) sb.an = an;
  sfx(d.wall ? 'place' : 'construct', an.dur);
  if (st.ps.use > st.ps.prod && !wasLow) say('lowpower'); else if (t === 'rad') say('radar');
  if (BD[t].wall && me().money >= BD[t].cost) { st.ed.x = null; return; }   // walls: keep placing
  st.prod.b = null; cancelEdit(); renderSide();
}
function setTool(mode) { unlock(); if (st.mode !== 'plan') return; const on = st.ed.mode === mode; cancelEdit(); if (!on) { st.ed = { mode }; $('#map').className = mode; st.sel = null; st.selU.clear(); rebuild(); } renderSide(); renderBanner(); sfx('click'); }
$('#mRepair').onclick = () => setTool('repair'); $('#mSell').onclick = () => setTool('sell');
const buildingAt = (cx, cy) => st.scene.buildings.find(b => !b.gone && cx >= b.x && cy >= b.y && cx < b.x + BD[b.t].w && cy < b.y + BD[b.t].h);

async function sellBuilding(id) {
  const m = me(), b = m.buildings.find(q => q.id === id); if (!b) return;
  const info = { t: b.t, x: b.x, y: b.y, hp: b.hp }, val = sellValue(b), d = BD[b.t];
  if (st.sel === id) st.sel = null;
  if (!await doAct({ a: 'sell', id })) return;
  const ghost = { id: -id, t: info.t, x: info.x, y: info.y, hp: info.hp, mhp: d.hp, o: m.id, off: false, ghost: false, gone: true, an: { k: 'sell', t0: performance.now() / 1000, dur: d.wall ? 0.3 : 0.75 } };
  st.sold.push(ghost); st.scene.buildings.push(ghost);
  sfx('sink'); sfx('sell'); say('sold'); R.fx.push({ k: 'tx', x: info.x + d.w / 2, y: info.y + d.h / 2, txt: '+' + val, t0: R.t, life: 1.3 });
}
// Things that move on their own while planning: finished construction, sold buildings, units walking to their posts.
function tickAnims(now) {
  for (const [id, a] of st.bAnim) {
    if (now < a.t0 + a.dur) continue;
    st.bAnim.delete(id); const b = st.scene.buildings.find(q => q.id === id); if (!b || BD[b.t].wall) continue; const d = BD[b.t];
    sfx('place'); R.fx.push({ k: 'fl', x: b.x + d.w / 2, y: b.y + d.h / 2, z: 0.9, r: 0.55, t0: R.t, life: 0.2, col: '#fff7c0' });
    for (let i = 0; i < 4 + d.w * d.h; i++) R.puff(b.x + Math.random() * d.w, b.y + d.h * (0.6 + Math.random() * 0.4), 0.05, '#e9e2c8', 0.2, 0.6, 0.3, (Math.random() - 0.5) * 1.8, 0.25);
  }
  if (st.sold.length) st.sold = st.sold.filter(g => now < g.an.t0 + g.an.dur + 0.1);
  for (const u of st.scene.units) {
    const w = u.tw; if (!w) continue; const p = (now - w.t0) / w.dur;
    if (p >= 1) { u.x = w.x1; u.y = w.y1; u.mv = false; u.fx = w.fx; u.fy = w.fy; if (w.alt != null) u.alt = 0; u.tw = null; continue; }
    const q = p <= 0 ? 0 : p * p * (3 - 2 * p), dx = w.x1 - w.x0, dy = w.y1 - w.y0, l = Math.hypot(dx, dy) || 1;
    u.x = w.x0 + dx * q; u.y = w.y0 + dy * q; u.mv = true; u.fx = dx / l; u.fy = dy / l; if (w.alt != null) u.alt = w.alt * (1 - q);
  }
  if (st.scene.hq) st.scene.hq.busy = !!st.prod.b || st.bAnim.size > 0;   // the crane swings while something is being built
}
function renderInfo() {
  const el = $('#info');
  if (st.selU.size && st.mode === 'plan') {
    const sel = st.scene.units.filter(u => u.pick && st.selU.has(u.key)), by = {}; for (const u of sel) by[u.t] = (by[u.t] | 0) + 1;
    const grouped = sel.some(u => u.g >= 0);
    el.hidden = false;
    el.innerHTML = `<h3>${sel.length} ${sel.length === 1 ? 'enhed' : 'enheder'} valgt<button class="btn small" id="inX">Fravælg</button></h3><p>${Object.entries(by).map(([t, c]) => c + '× ' + UD[t].name).join(', ')}</p>
      <p>${st.ed.mode === 'send' ? (TOUCH ? 'Tryk' : 'Klik') + ' nu på målet på kortet.' : 'Tryk Send af sted, og udpeg derefter målet på kortet.'}${st.v.peaceLeft > 0 ? ' Der er våbenhvile, så de kan kun spejde.' : ''}</p>
      <div class="row"><button class="btn ${st.ed.mode === 'send' ? '' : 'gold'}" id="inSend">${st.ed.mode === 'send' ? 'Annullér' : 'Send af sted'}</button>${grouped ? '<button class="btn" id="inHome">Bliv hjemme</button>' : ''}</div>`;
    $('#inSend').onclick = startSend;
    $('#inX').onclick = () => { cancelEdit(); st.selU.clear(); rebuild(); renderSide(); };
    if ($('#inHome')) $('#inHome').onclick = standDown;
    return;
  }
  const b = st.sel != null && st.scene.buildings.find(q => q.id === st.sel);
  if (!b || st.mode !== 'plan') { el.hidden = true; return; }
  const d = BD[b.t], mine = b.o === me().id, owner = st.v.players.find(p => p.id === b.o), real = mine && me().buildings.find(q => q.id === b.id);
  el.hidden = false;
  el.innerHTML = `<h3>${d.name}<button class="btn small" id="inX">Luk</button></h3>${mine ? '' : `<div style="color:${DEFS.colors[owner.color].light}">${esc(owner.name)} · ${DEFS.factions[owner.faction].name}${b.ghost ? ' · sidst set' : ''}</div>`}
    ${b.ghost ? '' : `<div class="hp"><i style="width:${b.hp / b.mhp * 100}%;background:${b.hp > b.mhp / 2 ? 'var(--go)' : b.hp > b.mhp / 4 ? 'var(--gold)' : 'var(--bad)'}"></i></div>`}
    <p>${esc(d.desc)}${b.off ? ' <b style="color:var(--gold)">Slukket: mangler strøm.</b>' : ''}</p>
    ${real ? `<div class="row">${real.hp < d.hp ? `<button class="btn small gold" id="inRep">Reparér (${fmt(repairCost(real))})</button>` : ''}<button class="btn small warn" id="inSell">Sælg (+${fmt(sellValue(real))})</button></div>` : ''}`;
  $('#inX').onclick = () => { st.sel = null; rebuild(); };
  if ($('#inRep')) $('#inRep').onclick = () => doAct({ a: 'repair', id: b.id }).then(ok => ok && (sfx('ready'), say('repair')));
  if ($('#inSell')) $('#inSell').onclick = () => sellBuilding(b.id);
}

// ---------- attack orders ----------
const avail = (t, gi) => (me().army[t] | 0) - st.orders.reduce((s, o, i) => s + (i === gi ? 0 : (o.units[t] | 0)), 0);
const combatTypes = () => Object.keys(me().army).filter(t => !UD[t].harv && me().army[t] > 0);
async function sendOrders() { const g = st.editG, mode = st.ed.mode; if (await doAct({ a: 'orders', orders: st.orders })) { st.editG = g; if (mode === 'route') st.ed = { mode: 'route' }; renderOrders(); renderBanner(); } }
function renderOrders() {
  const el = $('#orders'); if (el.hidden || st.mode !== 'plan') { el.hidden = true; return; }
  const m = me(), types = combatTypes();
  const sum = o => Object.entries(o.units).map(([t, c]) => c + '× ' + UD[t].name).join(', ') || 'ingen enheder';
  let h = `<h3>Angrebsordrer<button class="btn small" id="orX">Luk</button></h3><div class="hint">${st.v.peaceLeft > 0 ? 'Der er våbenhvile, så grupperne kan kun spejde.' : 'Grupperne kører af sted, når runden afvikles. Resten bliver hjemme og forsvarer.'}</div>`;
  st.orders.forEach((o, i) => {
    const ed = i === st.editG;
    h += `<div class="grp ${ed ? 'ed' : ''}"><div class="hd"><span class="dot" style="background:${GROUP_COL[i]}">${i + 1}</span><span class="sum">${sum(o)}<small>${o.pts.length ? 'mål sat' + (o.pts.length > 1 ? ' · ' + (o.pts.length - 1) + ' rutepunkt' + (o.pts.length > 2 ? 'er' : '') : '') : 'intet mål endnu'}</small></span>
      <button class="btn small" data-ed="${i}">${ed ? 'Færdig' : 'Redigér'}</button><button class="btn small warn" data-del="${i}">Slet</button></div>`;
    if (ed) {
      h += types.map(t => { const a = avail(t, i), c = o.units[t] | 0; return `<div class="urow"><span>${UD[t].name}</span><button class="btn small" data-u="${t}" data-d="-1">−</button><b>${c}/${a}</b><button class="btn small" data-u="${t}" data-d="1">+</button><button class="btn small" data-u="${t}" data-d="99">alle</button></div>`; }).join('');
      h += `<div class="hint">Klik på kortet: første klik er målet. Flere klik lægger ruten (det sidste er målet).</div><div class="row"><button class="btn small" data-all="${i}">Tag alle ledige</button><button class="btn small" data-undo="${i}" ${o.pts.length ? '' : 'disabled'}>Fortryd punkt</button></div>`;
    }
    h += '</div>';
  });
  if (st.orders.length < DEFS.maxOrders) h += `<div class="acts" style="justify-content:flex-start"><button class="btn gold" id="orNew" ${types.length ? '' : 'disabled'}>+ Ny angrebsgruppe</button></div>`;
  if (!types.length) h += `<div class="hint">Du har ingen kampenheder endnu. Træn nogle i kasernen.</div>`;
  el.innerHTML = h;
}
$('#orders').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; sfx('click');
  if (b.id === 'orX') { $('#orders').hidden = true; st.editG = -1; cancelEdit(); renderSide(); return; }
  if (b.id === 'orNew') { const units = {}; for (const t of combatTypes()) { const a = avail(t, -1); if (a > 0) units[t] = a; } st.orders.push({ units, pts: [] }); st.editG = st.orders.length - 1; st.ed = { mode: 'route' }; $('#map').className = 'route'; return sendOrders(); }
  if (b.dataset.ed != null) { const i = +b.dataset.ed; if (st.editG === i) { st.editG = -1; cancelEdit(); say('orders'); } else { st.editG = i; st.ed = { mode: 'route' }; $('#map').className = 'route'; } renderOrders(); renderBanner(); return; }
  if (b.dataset.del != null) { st.orders.splice(+b.dataset.del, 1); st.editG = -1; cancelEdit(); return sendOrders(); }
  const o = st.orders[st.editG]; if (!o) return;
  if (b.dataset.u) { const t = b.dataset.u, a = avail(t, st.editG), c = Math.max(0, Math.min(a, (o.units[t] | 0) + +b.dataset.d)); if (c) o.units[t] = c; else delete o.units[t]; if (o.slots) delete o.slots[t]; return sendOrders(); }
  if (b.dataset.all != null) { for (const t of combatTypes()) { const a = avail(t, st.editG); if (a > 0) o.units[t] = a; } delete o.slots; return sendOrders(); }
  if (b.dataset.undo != null) { o.pts.pop(); return sendOrders(); }
};
$('#mOrders').onclick = () => { unlock(); if (st.mode !== 'plan') return; if (st.selU.size) return startSend(); const el = $('#orders'), open = el.hidden; cancelEdit(); st.sel = null; if (st.selU.size) { st.selU.clear(); rebuild(); } $('#info').hidden = true; el.hidden = !open; st.editG = -1; if (open && !st.orders.length && combatTypes().length) { el.hidden = false; renderOrders(); $('#orNew').click(); } else renderOrders(); renderSide(); sfx('click'); };

// The heaviest unit in a selection is the one that answers on the radio.
const leadType = units => units.reduce((a, u) => !a || UD[u.t].cost > UD[a].cost ? u.t : a, null);
// ---------- picking units on the map ----------
// which group's flag is under this point of the map view (-1 = none)
function flagAt(px, py) {
  for (let i = st.orders.length - 1; i >= 0; i--) {
    const o = st.orders[i]; if (!o.pts.length) continue;
    const t = o.pts[o.pts.length - 1], [sx, sy] = R.toScreen(t[0] + 0.5, t[1] + 0.5);
    if (px > sx - 30 && px < sx + 34 && py > sy - 42 && py < sy + 28) return i;
  }
  return -1;
}
function startSend() {
  if (st.mode !== 'plan' || !st.selU.size) return;
  if (st.ed.mode === 'send') { cancelEdit(); return; }
  cancelEdit(); st.ed = { mode: 'send' }; $('#map').className = 'route'; sfx('click'); renderBanner(); renderInfo(); renderSide();
}
function unitAt(wx, wy) {
  let best = null, bd = 1e9;
  for (const u of st.scene.units) {
    if (!u.pick) continue;
    const inf = UD[u.t].cls === 'inf', d = Math.hypot(u.x - wx, u.y - (inf ? 0.28 : 0.12) - wy);
    if (d < (inf ? 0.36 : 0.58) && d < bd) { bd = d; best = u; }
  }
  return best;
}
function selectUnit(u, e) {
  const now = performance.now(), dbl = st.lastU && st.lastU.key === u.key && now - st.lastU.t < 420; st.lastU = { key: u.key, t: now };
  const same = st.scene.units.filter(q => q.pick && q.t === u.t && q.g === u.g).map(q => q.key);
  if (e.pointerType !== 'mouse') { const on = st.selU.has(u.key); for (const k of same) on ? st.selU.delete(k) : st.selU.add(k); }   // touch: a tap picks every unit of that kind
  else if (dbl) st.selU = e.shiftKey ? new Set([...st.selU, ...same]) : new Set(same);
  else if (e.shiftKey) { if (st.selU.has(u.key)) st.selU.delete(u.key); else st.selU.add(u.key); }
  else st.selU = new Set([u.key]);
  st.sel = null; $('#orders').hidden = true; st.editG = -1; sfx('click'); if (st.selU.has(u.key)) unitSay(u.t, 's'); rebuild(); renderSide();
}
function finishBox(add) {
  const b = st.box; st.box = null; if (!b) return;
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1), sel = add ? new Set(st.selU) : new Set();
  for (const u of st.scene.units) { if (!u.pick) continue; const [sx, sy] = R.toScreen(u.x, u.y - 0.15); if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) sel.add(u.key); }
  st.selU = sel; st.sel = null; if (sel.size) { $('#orders').hidden = true; st.editG = -1; sfx('click'); unitSay(leadType(st.scene.units.filter(u => u.pick && sel.has(u.key))), 's'); }
  rebuild(); renderSide();
}
// Write down exactly which units each group holds, as shown on the map.
function explicitOrders() {
  const mine = st.scene.units.filter(u => u.pick);
  return st.orders.map((o, i) => { const units = {}, slots = {}; for (const u of mine) if (u.g === i) { units[u.t] = (units[u.t] | 0) + 1; (slots[u.t] || (slots[u.t] = [])).push(u.i); } return { units, slots, pts: o.pts }; });
}
function pullOut(orders, sel) {
  for (const o of orders) for (const u of sel) { const l = o.slots[u.t], k = l ? l.indexOf(u.i) : -1; if (k >= 0) { l.splice(k, 1); if (!--o.units[u.t]) { delete o.units[u.t]; delete o.slots[u.t]; } } }
  return orders.filter(o => Object.keys(o.units).length);
}
function giveOrder(cx, cy, append) {
  const mine = st.scene.units.filter(u => u.pick), sel = mine.filter(u => st.selU.has(u.key)); if (!sel.length) return;
  let orders = explicitOrders(), gi = -1;
  const gs = new Set(sel.map(u => u.g));
  if (gs.size === 1 && !gs.has(-1) && mine.filter(u => u.g === sel[0].g).length === sel.length) gi = sel[0].g;   // a whole group: just give it a new target
  if (gi < 0) {
    orders = pullOut(orders, sel);
    if (orders.length >= DEFS.maxOrders) return toast('Højst ' + DEFS.maxOrders + ' angrebsgrupper. Vælg en hel gruppe for at give den et nyt mål, eller slet en gruppe.', true);
    const units = {}, slots = {}; for (const u of sel) { units[u.t] = (units[u.t] | 0) + 1; (slots[u.t] || (slots[u.t] = [])).push(u.i); }
    orders.push({ units, slots, pts: [] }); gi = orders.length - 1;
  } else orders = orders.map((o, i) => i === gi || Object.keys(o.units).length ? o : { ...o, units: {}, slots: {} });
  const o = orders[gi];
  if (append && o.pts.length) { if (o.pts.length >= DEFS.maxPts) return toast('Højst ' + DEFS.maxPts + ' punkter pr. rute.', true); o.pts = [...o.pts, [cx, cy]]; } else o.pts = [[cx, cy]];
  st.orders = orders; st.editG = -1; sfx('click'); unitSay(leadType(sel), 'g');
  toast('Gruppe ' + (gi + 1) + ': ' + sel.length + (sel.length === 1 ? ' enhed' : ' enheder') + (st.v.peaceLeft > 0 ? ' spejder, når runden afvikles' : ' rykker ud, når runden afvikles'));
  R.fx.push({ k: 'fl', x: cx + 0.5, y: cy + 0.5, z: 0, r: 0.55, t0: R.t, life: 0.3, col: '#b6ffa8' });
  sendOrders();
}
function standDown() {
  const sel = st.scene.units.filter(u => u.pick && st.selU.has(u.key)); if (!sel.length) return;
  st.orders = pullOut(explicitOrders(), sel); st.editG = -1; sfx('click'); sendOrders();
}

// ---------- drawing on top of the map while planning ----------
function planOverlay(g, X, Y, Z, dpr) {
  const e = st.ed, m = me(), k = Z / R.S;
  // planned attacks: a numbered flag with a label at each target; the route is only drawn for the group in focus
  const focus = new Set(); if (st.editG >= 0) focus.add(st.editG); if (st.hoverG >= 0) focus.add(st.hoverG);
  for (const u of st.scene.units) if (u.sel && u.g >= 0) focus.add(u.g);
  g.lineJoin = 'round'; g.lineCap = 'round';
  st.orders.forEach((o, i) => {
    if (!o.pts.length) return;
    const mem = st.scene.units.filter(u => u.pick && u.g === i), n = mem.length, c = GROUP_COL[i], tg = o.pts[o.pts.length - 1], px = X(tg[0] + 0.5), py = Y(tg[1] + 0.5), on = focus.has(i);
    if (!n && i !== st.editG) return;
    if (on && n) {
      let sx = 0, sy = 0; for (const u of mem) { sx += u.x; sy += u.y; } sx /= n; sy /= n;
      const pts = [[sx, sy], ...o.pts.map(q => [q[0] + 0.5, q[1] + 0.5])];
      for (const [w, col, dash] of [[8, OUT, null], [4, c, [12, 10]]]) {
        g.strokeStyle = col; g.lineWidth = w * dpr; g.setLineDash(dash ? dash.map(v => v * dpr) : []); if (dash) g.lineDashOffset = -R.t * 30 * dpr;
        g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.stroke();
      }
      g.setLineDash([]);
      for (let k = 1; k < pts.length - 1; k++) { g.beginPath(); g.arc(X(pts[k][0]), Y(pts[k][1]), 6 * dpr, 0, 7); g.fillStyle = c; g.strokeStyle = OUT; g.lineWidth = 3 * dpr; g.fill(); g.stroke(); }
    }
    const f = dpr * (on ? 1.2 : 1);
    g.fillStyle = OUT; g.beginPath(); g.ellipse(px, py, 6 * f, 3.5 * f, 0, 0, 7); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 6 * f; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 34 * f); g.stroke();
    g.strokeStyle = '#efe8cf'; g.lineWidth = 2.6 * f; g.stroke();
    g.beginPath(); g.moveTo(px + f, py - 35 * f); g.lineTo(px + 27 * f, py - 26 * f); g.lineTo(px + f, py - 17 * f); g.closePath();
    g.lineWidth = 4.5 * f; g.strokeStyle = OUT; g.stroke(); g.fillStyle = c; g.fill();
    g.font = `900 ${11 * f}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = OUT; g.fillText(String(i + 1), px + 9 * f, py - 25.5 * f);
    const txt = n + (n === 1 ? ' enhed' : ' enheder') + (st.v.peaceLeft > 0 ? ' · spejder' : '');
    g.font = `700 ${12 * dpr}px system-ui, sans-serif`; const w = g.measureText(txt).width + 14 * dpr, h = 19 * dpr, bx = px - w / 2, by = py + 7 * dpr;
    g.beginPath(); g.roundRect(bx, by, w, h, h / 2); g.fillStyle = 'rgba(16,21,27,.92)'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = on ? c : OUT; g.stroke();
    g.fillStyle = '#fff'; g.fillText(txt, px, by + h / 2 + dpr * 0.5);
  });
  if (st.box) { const q = st.box, x = Math.min(q.x0, q.x1) * dpr, y = Math.min(q.y0, q.y1) * dpr, w = Math.abs(q.x1 - q.x0) * dpr, h = Math.abs(q.y1 - q.y0) * dpr; g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, w, h); g.lineWidth = 3.5 * dpr; g.strokeStyle = OUT; g.strokeRect(x, y, w, h); g.lineWidth = 1.5 * dpr; g.strokeStyle = '#fff'; g.strokeRect(x, y, w, h); }
  const ring = (cx, cy, r) => { g.setLineDash([8 * dpr, 7 * dpr]); g.lineWidth = 2.5 * dpr; g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(X(cx), Y(cy), r * Z, 0, 7); g.stroke(); g.setLineDash([]); };
  // selected building
  const b = st.sel != null && st.scene.buildings.find(q => q.id === st.sel);
  if (b) {
    const d = BD[b.t], x0 = X(b.x) - 3 * dpr, y0 = Y(b.y) - 3 * dpr, x1 = X(b.x + d.w) + 3 * dpr, y1 = Y(b.y + d.h) + 3 * dpr, L = 10 * dpr;
    for (const [w, c] of [[6, OUT], [3, '#fff']]) { g.lineWidth = w * dpr; g.strokeStyle = c; g.beginPath(); for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); } g.stroke(); }
    if (d.weapon) ring(b.x + d.w / 2, b.y + d.h / 2, d.weapon.range);
  }
  // building about to be placed
  if (e.mode === 'place' && e.x != null) {
    const d = BD[e.t];
    g.fillStyle = e.ok ? 'rgba(90,230,80,.4)' : 'rgba(255,70,50,.45)'; g.fillRect(X(e.x), Y(e.y), d.w * Z, d.h * Z);
    g.lineWidth = 3 * dpr; g.strokeStyle = e.ok ? '#b6ffa8' : '#ffb0a4'; g.strokeRect(X(e.x), Y(e.y), d.w * Z, d.h * Z);
    if (e.t === 'ref') { g.fillStyle = 'rgba(255,210,62,.5)'; g.fillRect(X(e.x + 1), Y(e.y + d.h), Z, Z); }
    const px = X(e.x + d.w / 2), py = Y(e.y + d.h / 2), sp = sprite(e.t, R.S, { color: m.color, faction: m.faction });
    g.globalAlpha = 0.75; g.drawImage(sp.cv, px - sp.ax * k, py - sp.ay * k, sp.cv.width * k, sp.cv.height * k);
    if (TURRET[e.t]) { const tp = sprite(TURRET[e.t], R.S, { dir: 2, color: m.color, faction: m.faction }); g.drawImage(tp.cv, px - tp.ax * k, py - tp.ay * k, tp.cv.width * k, tp.cv.height * k); }
    g.globalAlpha = 1;
    if (d.weapon) ring(e.x + d.w / 2, e.y + d.h / 2, d.weapon.range);
  }
}

// ---------- map input ----------
const ptrs = new Map(); let drag = null, pinch = null;
const cv = $('#map');
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', e => {
  unlock(); cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) {
    // mouse: the left button drags a selection box while planning (as in the 90s); right or middle button moves the map.
    // With the setting "the left button moves the map", the box needs Shift instead.
    const m = st.v && st.v.me, [lx, ly] = local(e), pan = cfg.leftDrag === 'pan';
    drag = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y, moved: false, btn: e.button, lx, ly, pan,
      box: e.pointerType === 'mouse' && e.button === 0 && pan === e.shiftKey && st.mode === 'plan' && st.ed.mode === 'idle' && m && m.alive && st.v.phase === 'play' };
  }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: R.cam.z }; if (drag) drag.moved = true; }
});
cv.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; R.cam.z = pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d; return; }
  if (drag && ptrs.size === 1) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
    if (drag.moved && drag.box) { const [px, py] = local(e); st.box = { x0: drag.lx, y0: drag.ly, x1: px, y1: py }; }
    else if (drag.moved) { R.cam.x = drag.cx - dx / R.cam.z; R.cam.y = drag.cy - dy / R.cam.z; }
  }
  if (e.pointerType === 'mouse' && st.mode === 'plan' && !drag) { const [hx, hy] = local(e); st.hoverG = flagAt(hx, hy); cv.style.cursor = st.hoverG >= 0 && st.ed.mode === 'idle' ? 'pointer' : ''; }
  if (e.pointerType === 'mouse' && st.ed.mode === 'place' && st.mode === 'plan') { const [px, py] = local(e), [wx, wy] = R.toCell(px, py); ghostAt(wx, wy); }
});
let edge = null;   // where the mouse is over the map
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') edge = local(e); });
cv.addEventListener('pointerleave', () => edge = null);
const up = e => {
  ptrs.delete(e.pointerId);
  if (drag && drag.box && drag.moved) { if (e.type === 'pointerup') finishBox(drag.pan ? e.ctrlKey || e.metaKey : e.shiftKey); else st.box = null; }
  else if (drag && !drag.moved && ptrs.size === 0 && e.type === 'pointerup') { if (drag.btn === 2) rightClick(); else if (drag.btn === 0) click(e); }
  if (ptrs.size < 2) pinch = null; if (ptrs.size === 0) drag = null;
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault(); const [px, py] = local(e), [wx, wy] = R.toCell(px, py), z0 = R.cam.z;
  R.cam.z *= Math.exp(-e.deltaY * 0.0012); R.clampCam(); const k = z0 / R.cam.z;
  R.cam.x = wx - (wx - R.cam.x) * k; R.cam.y = wy - (wy - R.cam.y) * k;
}, { passive: false });
function rightClick() { if (st.ed.mode !== 'idle') { const route = st.ed.mode === 'route'; cancelEdit(); if (route) { st.editG = -1; renderOrders(); } renderSide(); } else if (st.selU.size) { st.selU.clear(); rebuild(); } else if (st.sel != null) { st.sel = null; rebuild(); } }
function click(e) {
  if (st.mode !== 'plan' || !st.scene) return;
  const [px, py] = local(e), [wx, wy] = R.toCell(px, py), cx = Math.floor(wx), cy = Math.floor(wy), ed = st.ed, m = me(), n = st.v.map.n;
  if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
  if (ed.mode === 'place') {
    const had = ed.x; const ox = ed.x, oy = ed.y; ghostAt(wx, wy);
    if (e.pointerType === 'mouse' || (had != null && ox === ed.x && oy === ed.y)) confirmPlace();
    return;
  }
  const b = buildingAt(cx, cy);
  if (ed.mode === 'sell') { if (b && b.o === m.id) sellBuilding(b.id); return; }
  if (ed.mode === 'repair') { if (b && b.o === m.id) doAct({ a: 'repair', id: b.id }).then(ok => ok && (sfx('ready'), say('repair'))); return; }
  if (ed.mode === 'route') {
    const o = st.orders[st.editG]; if (!o) return cancelEdit();
    if (o.pts.length >= DEFS.maxPts) return toast('Højst ' + DEFS.maxPts + ' punkter pr. rute. Fortryd et punkt først.', true);
    o.pts.push([cx, cy]); sfx('click'); if (o.pts.length === 1) say('orders'); sendOrders(); return;
  }
  if (ed.mode === 'send') {   // the Send button was pressed: this click is the target
    giveOrder(cx, cy, e.shiftKey);
    if (!e.shiftKey) { cancelEdit(); st.selU.clear(); for (const u of st.scene.units) u.sel = false; renderInfo(); renderSide(); }
    return;
  }
  if (ed.mode === 'idle' && m.alive && st.v.phase === 'play') {
    const f = flagAt(px, py);
    if (f >= 0) { const mem = st.scene.units.filter(u => u.pick && u.g === f); st.selU = new Set(mem.map(u => u.key)); if (mem.length) unitSay(leadType(mem), 's'); st.sel = null; $('#orders').hidden = true; sfx('click'); rebuild(); renderSide(); return; }
    const u = unitAt(wx, wy); if (u) return selectUnit(u, e);
    if (st.selU.size) { st.selU.clear(); if (!b) { rebuild(); renderSide(); return; } }   // a click elsewhere only deselects
  }
  if (b) { st.sel = b.id; $('#orders').hidden = true; sfx('click'); rebuild(); } else if (st.sel != null) { st.sel = null; rebuild(); }
}
// radar: click or drag to move the view
const rad = $('#radar'); let radDown = false;
const radGo = e => { const r = rad.getBoundingClientRect(), n = st.v ? st.v.map.n : 0; if (!n) return; R.cam.x = (e.clientX - r.left) / r.width * n; R.cam.y = (e.clientY - r.top) / r.height * n; };
rad.addEventListener('pointerdown', e => { radDown = true; rad.setPointerCapture(e.pointerId); radGo(e); });
rad.addEventListener('pointermove', e => { if (radDown) radGo(e); });
rad.addEventListener('pointerup', () => radDown = false); rad.addEventListener('pointercancel', () => radDown = false);
const keys = new Set();
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'Escape') { if (!$('#modal').hidden) return; rightClick(); }
  else if (e.key === ' ' && st.mode === 'replay') { e.preventDefault(); st.rp.paused = !st.rp.paused; renderReplayBar(); }
  else if (e.key === 'h' || e.key === 'H') focusHome();
  else if ((e.key === 'g' || e.key === 'G') && st.mode === 'plan' && st.selU.size) startSend();
  else if (e.key === '+' || e.key === '=') R.cam.z *= 1.15; else if (e.key === '-') R.cam.z /= 1.15;
  keys.add(e.key.toLowerCase());
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
new ResizeObserver(() => R.resize()).observe($('#stage'));

// ---------- ready ----------
$('#btnReady').onclick = async () => {
  unlock(); const m = me(); if (!m || st.mode !== 'plan' || st.busy) return;
  if (!m.ready) {
    if (st.prod.b && st.prod.b.ready) return toast(BD[st.prod.b.t].name + ' er ikke placeret endnu.', true);
    const i = st.orders.findIndex(o => Object.keys(o.units).length && !o.pts.length); if (i >= 0) toast('Gruppe ' + (i + 1) + ' har intet mål og bliver hjemme.');
  }
  cancelEdit(); $('#orders').hidden = true; st.editG = -1; st.sel = null; st.selU.clear(); $('#info').hidden = true; sfx('click');
  st.busy = true; await doAct({ a: 'ready', on: !m.ready }); st.busy = false;
};

// ---------- battle playback ----------
async function startBattle() {
  const v = st.v; st.mode = 'replay'; st.busy = true; st.tweenOK = false; st.bAnim.clear(); st.sold = []; closeModal(); renderTop(); renderSide(); $('#banner').hidden = true; $('#info').hidden = true; $('#orders').hidden = true;
  let snap = null; try { snap = await st.be.replay(); } catch {}
  st.busy = false;
  if (!snap) { st.mode = 'plan'; rebuild(); return; }
  splash('RUNDE ' + snap.round, snap.peace ? 'våbenhvile' : 'kampen begynder'); sfx('drum'); say(snap.peace ? 'peace' : 'battle'); music.setLevel(snap.peace ? 1 : 2);
  const sim = createSim(snap), myIdx = v.me ? snap.players.findIndex(p => p.id === v.me.id) : -1, ti = myIdx >= 0 ? sim.P[myIdx].ti : -1;
  const rep = v.me && v.me.report && v.me.report.round === snap.round ? v.me.report : null;
  st.rp = { sim, snap, myIdx, ti, colors: snap.players.map(p => ({ color: p.color, faction: p.faction })), speed: cfg.replaySpeed === 'auto' ? 'auto' : +cfg.replaySpeed, acc: 0, paused: false, lastCombat: -999, cash: 0, done: false,
    known: new Set(st.knownPrev), money0: v.me ? v.me.money - (rep ? rep.income + rep.supply + (rep.aid || 0) : 0) : 0, hold: 1.0 };
  R.clear(); $('#alerts').innerHTML = '';
  const mine = myIdx >= 0 && snap.players[myIdx].buildings.find(b => b.t === 'hq'); if (mine) { R.cam.x = mine.x + 1.5; R.cam.y = mine.y + 2.5; }
  $('#replaybar').hidden = false; renderReplayBar(); renderTop(); $('#side').classList.add('off');
}
function renderReplayBar() {
  const rp = st.rp; if (!rp) return;
  const sp = [['auto', 'Auto'], [1, '1×'], [4, '4×'], [12, '12×']];
  $('#replaybar').innerHTML = `<button class="btn small" id="rpPause">${rp.paused ? '▶' : '❚❚'}</button>${sp.map(([s, n]) => `<button class="btn small ${rp.speed === s ? 'on' : ''}" data-s="${s}">${n}</button>`).join('')}<div class="bar"><i id="rpFill"></i></div><span class="tm" id="rpTime"></span><button class="btn small" id="rpSpot" title="Hop til det seneste sted, der blev kæmpet">Vis kamp</button><button class="btn small gold" id="rpSkip">Spring over</button>`;
}
$('#replaybar').onclick = e => {
  const b = e.target.closest('button'), rp = st.rp; if (!b || !rp) return; sfx('click');
  if (b.id === 'rpPause') rp.paused = !rp.paused;
  else if (b.id === 'rpSkip') { rp.speed = 400; rp.paused = false; }
  else if (b.id === 'rpSpot') { if (rp.spot) { R.cam.x = rp.spot[0]; R.cam.y = rp.spot[1]; } else toast('Der har ikke været kamp inden for synsvidde endnu.'); return; }
  else if (b.dataset.s) { rp.speed = b.dataset.s === 'auto' ? 'auto' : +b.dataset.s; rp.paused = false; }
  renderReplayBar();
};
function onScreen(x, y) { const c = R.cam; return Math.abs(x - c.x) < R.w / c.z / 2 + 1 && Math.abs(y - c.y) < R.h / c.z / 2 + 1; }
function handleEvents(rp, fxOn) {
  const sim = rp.sim, n = sim.n, vis = rp.ti >= 0 ? sim.vis[rp.ti] : null, see = (x, y) => !vis || vis[(y | 0) * n + (x | 0)];
  for (const e of sim.ev) {
    if (e.k === 's') {
      const a = see(e.x1, e.y1), b = see(e.x2, e.y2); if (!a && !b) continue;
      rp.lastCombat = sim.tick; rp.spot = [e.x2, e.y2]; if (!fxOn) continue; R.event(e);
      if (onScreen(e.x2, e.y2) || onScreen(e.x1, e.y1)) sfx({ bullet: 'mg', mg: 'mg', flak: 'mg', cannon: 'cannon', at: 'rocket', rocket: 'rocket', he: 'cannon', fire: 'flame', arc: 'zap' }[e.w], 0.7);
    } else if (e.k === 'ud' || e.k === 'bd') {
      if (e.k === 'bd' && e.o === rp.myIdx && e.t !== 'wall') { say('lost'); addAlert('Bygning tabt: ' + BD[e.t].name, e.x, e.y); }
      if (e.k === 'ud' && e.o === rp.myIdx && fxOn && e.t !== 'harv') say('unitlost');
      if (!see(e.x, e.y)) continue; if (!fxOn) continue; R.event(e);
      if (onScreen(e.x, e.y)) sfx(e.k === 'bd' ? 'bigboom' : e.c === 'inf' ? 'mg' : 'boom', 0.9);
    } else if (e.k === 'c') { if (e.o === rp.myIdx) { rp.cash += e.v; if (fxOn) { sfx('cash'); R.event(e); } } }
    else if (e.k === 'a') { if (e.o === rp.myIdx) { R.event(e); if (fxOn) { sfx('alert'); say(e.h ? 'harv' : 'attack'); } addAlert(e.h ? 'Malmhøster under angreb' : 'Basen er under angreb', e.x, e.y); } }
  }
}
function addAlert(txt, x, y) {
  const box = $('#alerts'); if (box.children.length >= 3) box.firstChild.remove();
  const b = document.createElement('button'); b.className = 'alert'; b.textContent = '⚠ ' + txt + ' · vis';
  b.onclick = () => { R.cam.x = x; R.cam.y = y; b.remove(); }; box.appendChild(b); setTimeout(() => b.remove(), 9000);
}
function stepReplay(dt) {
  const rp = st.rp; if (!rp || rp.paused || rp.done) return;
  if (rp.hold > 0) { rp.hold -= dt; return; }
  const sim = rp.sim, speed = rp.speed === 'auto' ? (sim.tick - rp.lastCombat < 45 ? 1.4 : 14) : rp.speed;
  rp.acc += dt * speed; let steps = 0; const max = speed > 100 ? 400 : 80;
  while (rp.acc >= DEFS.tick && !sim.done && steps < max) { sim.step(); rp.acc -= DEFS.tick; steps++; handleEvents(rp, speed <= 14 && steps <= 8); }
  if (steps >= max) rp.acc = 0;
  const f = $('#rpFill'); if (f) { f.style.width = (sim.time / sim.duration * 100) + '%'; const left = Math.max(0, sim.duration - sim.time); $('#rpTime').textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); }
  if (sim.done) { rp.done = true; LS.set(seenKey(), String(rp.snap.round)); setTimeout(showSummary, 700); }
}
function replayScene() {
  const rp = st.rp, sim = rp.sim, ti = rp.ti, seen = ti >= 0 ? sim.seen[ti] : null;
  const B = ti < 0 ? sim.Bs : sim.Bs.filter(b => sim.P[b.o].ti === ti || seen.has(b.id) || rp.known.has(b.id));
  const radar = ti < 0 || sim.Bs.some(b => b.o === rp.myIdx && b.t === 'rad' && !b.dead && !b.off);
  st.scene = { buildings: B, units: sim.Us, ore: sim.ore, fog: ti >= 0 ? { explored: sim.explored[ti], vis: sim.vis[ti], key: 'r' + ((sim.tick / 5) | 0) } : null, colors: rp.colors,
    mine: o => ti < 0 || sim.P[o].ti === ti, tick: sim.tick, radarOn: radar };
}
function endReplay() { st.rp = null; $('#replaybar').hidden = true; $('#alerts').innerHTML = ''; R.clear(); st.mode = 'plan'; rebuild(); }
function showSummary() {
  const v = st.v, m = v.me, rp = st.rp; if (!rp) return;
  music.setLevel(0);
  const r = m && m.report && m.report.round === rp.snap.round ? m.report : null, out = v.last && v.last.round === rp.snap.round ? v.last.out : [];
  if (v.phase === 'over') { endReplay(); return showOver(); }
  const lost = r ? Object.entries(r.lost).map(([t, c]) => c + '× ' + UD[t].name).join(', ') : '';
  modal(`<h2>Runde ${rp.snap.round}: rapport</h2>
    ${r ? `<div class="stats"><div class="stat"><small>Malm høstet</small><b class="g">+${fmt(r.income)}</b></div><div class="stat"><small>Forsyning${r.aid ? ' + støtte' : ''}</small><b class="g">+${fmt(r.supply + (r.aid || 0))}</b></div><div class="stat"><small>Nedkæmpet for</small><b class="k">${fmt(r.killed)}</b></div>
      <div class="stat"><small>Bygninger mistet</small><b class="${r.bLost ? 'r' : ''}">${r.bLost}</b></div><div class="stat"><small>Bygninger ødelagt</small><b class="${r.bKilled ? 'k' : ''}">${r.bKilled}</b></div><div class="stat"><small>Tab i enheder</small><b class="${r.lostValue ? 'r' : ''}">${fmt(r.lostValue)}</b></div></div>
      ${lost ? `<p>Faldne: ${lost}.</p>` : '<p>Ingen enheder gik tabt.</p>'}${r.aid ? `<p>Du har fået ${fmt(r.aid)} i genopbygningsstøtte.</p>` : ''}` : '<p>Du deltog ikke i denne runde.</p>'}
    ${out.length ? `<p><b style="color:var(--bad)">Slået ud:</b> ${out.map(esc).join(', ')}</p>` : ''}
    ${m && !m.alive ? '<p><b style="color:var(--bad)">Din sidste bygning er faldet. Du er ude af kampen.</b></p>' : ''}
    <div class="acts"><button class="btn" id="smAgain">Se kampen igen</button><button class="btn go" id="smOk">Videre til runde ${v.round}</button></div>`);
  if (m && !m.alive) say('eliminated'); else if (out.length) say('out');
  $('#smOk').onclick = () => { closeModal(); endReplay(); say('newround'); };
  $('#smAgain').onclick = () => { closeModal(); st.rp = null; startBattle(); };
}
function standings() {
  const v = st.v;
  return `<table class="pl"><tr><th></th><th>General</th><th>Fraktion</th><th style="text-align:right">Nedkæmpet</th><th style="text-align:right">Tab</th><th style="text-align:right">Indtjent</th></tr>${[...v.players].sort((a, b) => (b.alive - a.alive) || (b.stats.killed - a.stats.killed)).map(p => `<tr style="${p.alive ? '' : 'opacity:.55'}"><td><i class="chip" style="background:${DEFS.colors[p.color].main}"></i></td><td>${esc(p.name)}${p.kind === 'ai' ? ' <small style="color:var(--dim)">AI</small>' : ''}${p.team ? ' <small style="color:var(--sky)">hold ' + p.team + '</small>' : ''}${p.alive ? '' : ' <small>(ude)</small>'}</td><td>${DEFS.factions[p.faction].name}</td><td class="n">${fmt(p.stats.killed)}</td><td class="n">${fmt(p.stats.lost)}</td><td class="n">${fmt(p.stats.income)}</td></tr>`).join('')}</table>`;
}
function showOver() {
  const v = st.v, won = v.winner && v.me && v.winner.names.includes(v.me.name);
  sfx(won ? 'win' : 'lose'); say(won ? 'won' : 'defeat');
  modal(`<h2 class="big ${won ? '' : 'bad'}">${won ? 'SEJR!' : 'NEDERLAG'}</h2><p style="text-align:center">${v.winner && v.winner.names.length ? esc(v.winner.names.join(' og ')) + ' vandt kampen efter ' + (v.round - 1) + (v.round - 1 === 1 ? ' runde.' : ' runder.') : 'Kampen er slut.'}</p>${standings()}
    <div class="acts"><button class="btn" id="ovSee">Se slagmarken</button><button class="btn" id="ovAgain">Se sidste kamp igen</button><button class="btn go" id="ovMenu">Til menuen</button></div>`);
  $('#ovSee').onclick = closeModal; $('#ovAgain').onclick = () => { closeModal(); startBattle(); };
  $('#ovMenu').onclick = () => { if (st.be.kind === 'local') Local.clear(); leave(); };
}

// ---------- menu and help ----------
function showHelp() {
  modal(`<h2>Sådan spiller du</h2>
    <ul><li><b>Byg:</b> klik på et billede i sidebaren, vent til det er klar, og placér bygningen tæt på dine andre. Start med kraftværk, raffinaderi og kaserne.</li>
    <li><b>Malm er penge:</b> høsterne kører selv malm hjem, mens runden afvikles. Flere raffinaderier og høstere giver flere penge.</li>
    <li><b>Strøm:</b> den lodrette bjælke viser strømmen. Mangler der strøm, slukker de nyeste bygninger.</li>
    <li><b>Angreb:</b> markér enheder (træk en boks med venstre museknap, eller klik på dem; på mobil vælger et tryk alle af samme slags), tryk <b>Send af sted</b>, og udpeg målet på kortet. Et flag med gruppens nummer viser, hvor de skal hen, når runden afvikles. Tryk på flaget for at vælge gruppen igen. Du kan sende folk ind i det sorte for at udforske.</li>
    <li><b>Fly:</b> en flyveplads har plads til fire fly. De flyver over alt, og kun luftværn, raketsoldater og maskingeværer kan ramme dem.</li>
    <li><b>Klar til kamp:</b> når alle er klar, afvikles runden. Hærene kører hen over kortet og kæmper selv, og du ser det hele bagefter.</li>
    <li>Enheder, der ikke er i en gruppe, bliver hjemme og forsvarer basen. Overlevende vender hjem efter hver runde.</li>
    <li><b>Indstillinger:</b> lyd, grafik og styring ændrer du under tandhjulet øverst til venstre.</li></ul>
    <h4>Styring</h4><p>Mus: venstre knap markerer, højre knap (eller piletaster/WASD) flytter kortet (kan byttes om i indstillingerne), hjulet zoomer, dobbeltklik vælger alle af samme slags, Shift lægger til. Mobil: træk for at flytte, knib for at zoome. Højreklik eller Esc annullerer · H hopper hjem · klik på radaren for at springe.</p>
    <div class="acts"><button class="btn go" id="hpOk">Forstået</button></div>`);
  $('#hpOk').onclick = closeModal;
}
$('#btnMenu').onclick = () => {
  unlock(); const v = st.v, host = v.host === (v.me && v.me.id), remote = st.be.kind === 'remote';
  modal(`<h2>${esc(v.name)}</h2>${remote ? `<p>Invitationskode: <b style="color:var(--gold);letter-spacing:.1em">${esc(v.code)}</b></p>` : ''}${standings()}
    <div class="acts"><button class="btn" id="mnSet">Indstillinger</button><button class="btn" id="mnHelp">Hjælp</button>${v.last ? '<button class="btn" id="mnReplay">Se sidste kamp igen</button>' : ''}${host && remote && v.phase === 'play' ? '<button class="btn warn" id="mnForce">Afvikl runden nu</button>' : ''}<button class="btn warn" id="mnLeave">${remote ? 'Log ud' : 'Til menuen'}</button><button class="btn go" id="mnOk">Luk</button></div>`);
  $('#mnOk').onclick = closeModal; $('#mnHelp').onclick = showHelp; $('#mnLeave').onclick = leave; $('#mnSet').onclick = () => showSettings();
  if ($('#mnReplay')) $('#mnReplay').onclick = () => { closeModal(); if (st.mode === 'plan') { cancelEdit(); startBattle(); } };
  if ($('#mnForce')) $('#mnForce').onclick = () => { closeModal(); doAct({ a: 'force' }); };
};
$('#btnSet').onclick = () => { unlock(); showSettings(); };

// ---------- settings: sound, graphics and controls ----------
// t: sw = switch, vol = volume slider, seg = a few choices, sel = a list. dep: only useful while that switch is on.
const SETTINGS = {
  lyd: ['Lyd', [
    { k: 'sfx', t: 'sw', n: 'Lydeffekter', d: 'Skud, eksplosioner, byggeri og knapper.' },
    { k: 'sfxVol', t: 'vol', n: 'Styrke', dep: 'sfx', test: 'sfx' },
    { k: 'voice', t: 'sw', n: 'Stemmer', d: 'Radioen melder om byggeri, angreb og tab.' },
    { k: 'voiceVol', t: 'vol', n: 'Styrke', dep: 'voice', test: 'voice' },
    { k: 'unitVoice', t: 'sw', n: 'Enhederne svarer', d: 'Mandskabet svarer, når du vælger dem og sender dem af sted.', dep: 'voice', sub: true },
    { k: 'music', t: 'sw', n: 'Musik', d: 'Roligt, mens du planlægger. Fuldt orkester under kampen.' },
    { k: 'musicVol', t: 'vol', n: 'Styrke', dep: 'music' },
    { k: 'track', t: 'sel', n: 'Nummer', dep: 'music', sub: true, opts: [['auto', 'Skifter selv'], ...songNames.map((n, i) => [String(i), n])] },
  ]],
  grafik: ['Grafik', [
    { k: 'detail', t: 'seg', n: 'Detaljer', opts: [['high', 'Høj'], ['low', 'Lav']], d: 'Høj tegner murværk, plader, nitter, vinduer og bløde skygger. Lav er den enkle tegneseriestil og kører lettest.' },
    { k: 'palette', t: 'seg', n: 'Farver', opts: [['military', 'Militær'], ['cartoon', 'Tegneserie']], d: 'Militær har støvede feltfarver og slid. Tegneserie har klare, rene farver.' },
    { k: 'outline', t: 'seg', n: 'Streg', opts: [['thick', 'Tyk'], ['thin', 'Tynd']] },
    { k: 'sharp', t: 'seg', n: 'Skarphed', opts: [['auto', 'Auto'], ['high', 'Høj'], ['normal', 'Normal']], d: 'Høj er skarpest, når du zoomer ind, men bruger mere hukommelse.' },
    { k: 'shadows', t: 'sw', n: 'Skygger' },
    { k: 'damage', t: 'sw', n: 'Synlige skader', d: 'Huller, revner og sod på bygninger, der er ramt.' },
    { k: 'anim', t: 'sw', n: 'Liv i basen', d: 'Radar og kran i bevægelse, røg fra skorstene og ild i vrag.' },
    { k: 'particles', t: 'seg', n: 'Røg og støv', opts: [[0.4, 'Lidt'], [1, 'Normal'], [1.8, 'Meget']] },
  ]],
  styring: ['Styring', [
    { k: 'leftDrag', t: 'seg', n: 'Venstre museknap trækker', mouse: true, opts: [['select', 'En boks'], ['pan', 'Kortet']], d: 'En boks markerer enheder, og højre knap flytter kortet. Vælger du Kortet, trækker du boksen med Shift holdt nede.' },
    { k: 'edgeScroll', t: 'sw', n: 'Rul ved kanten', mouse: true, d: 'Kortet ruller, når musen er helt ude ved kanten af kortet.' },
    { k: 'replaySpeed', t: 'seg', n: 'Kampens tempo', opts: [['auto', 'Auto'], ['1', '1×'], ['4', '4×']], d: 'Auto spoler hurtigt frem, når der ikke bliver kæmpet.' },
  ]],
};
let setTab = 'lyd';
function settingsBody() {
  const rows = SETTINGS[setTab][1].filter(o => !o.mouse || MOUSE).map(o => {
    const v = cfg[o.k]; let c = '';
    if (o.t === 'sw') c = `<button type="button" class="sw ${v ? 'on' : ''}" data-k="${o.k}" role="switch" aria-checked="${!!v}" aria-label="${o.n}"><i></i></button>`;
    else if (o.t === 'vol') c = `<input type="range" min="0" max="100" step="5" value="${Math.round(v * 100)}" data-k="${o.k}" aria-label="${o.n}"><output>${Math.round(v * 100)}</output>${o.test ? `<button type="button" class="btn small" data-test="${o.test}">Prøv</button>` : ''}`;
    else if (o.t === 'seg') c = `<div class="seg" data-k="${o.k}">${o.opts.map(([val, n]) => `<button type="button" data-v="${val}" class="${v === val ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    else c = `<select data-k="${o.k}" aria-label="${o.n}">${o.opts.map(([val, n]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${n}</option>`).join('')}</select>${o.k === 'track' ? '<button type="button" class="btn small" data-test="skip">Næste</button>' : ''}`;
    return `<div class="srow t-${o.t} ${o.sub || o.t === 'vol' ? 'sub' : ''} ${o.dep && !cfg[o.dep] ? 'dis' : ''}"><div class="sl"><b>${o.n}</b>${o.d ? `<small>${o.d}</small>` : ''}</div><div class="sc">${c}</div></div>`;
  }).join('');
  const top = setTab === 'grafik' ? '<canvas id="setPrev"></canvas>' : '';
  const foot = setTab === 'lyd' ? `<p class="hint" id="setSong">${cfg.music ? 'Spiller nu: ' + music.title : ''}</p>`
    : setTab === 'styring' ? `<p class="hint">${MOUSE ? 'Hjulet zoomer · piletaster eller WASD flytter kortet · H hopper hjem · G sender de valgte af sted · Esc annullerer · mellemrum holder pause i kampen.' : ''} ${TOUCH ? 'På mobil og tablet: træk flytter kortet, knib zoomer, og et tryk på en enhed vælger alle af samme slags.' : ''}</p>` : '';
  return top + rows + foot;
}
function showSettings(tab) {
  if (tab) setTab = tab;
  modal(`<h2>Indstillinger</h2><div class="seg" id="setTabs">${Object.entries(SETTINGS).map(([k, [n]]) => `<button type="button" data-tab="${k}" class="${k === setTab ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="setBody">${settingsBody()}</div>
    <div class="acts pin"><button class="btn" id="setReset">Nulstil ${SETTINGS[setTab][0].toLowerCase()}</button><button class="btn go" id="setOk">Luk</button></div>`);
  const box = $('#modalBox'), body = $('#setBody'), draw = () => { body.innerHTML = settingsBody(); $('#setReset').textContent = 'Nulstil ' + SETTINGS[setTab][0].toLowerCase(); drawPreview(); };
  const opt = k => SETTINGS[setTab][1].find(o => o.k === k);
  $('#setOk').onclick = closeModal;
  $('#setReset').onclick = () => { resetCfg(SETTINGS[setTab][1].map(o => o.k)); sfx('click'); draw(); };
  $('#setTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; setTab = b.dataset.tab; for (const x of $('#setTabs').children) x.classList.toggle('on', x === b); sfx('click'); draw(); };
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.test) {
      if (b.dataset.test === 'sfx') { sfx('cannon'); setTimeout(() => sfx('boom'), 260); }
      else if (b.dataset.test === 'voice') say('ready');
      else if (b.dataset.test === 'skip') { if (cfg.track !== 'auto') setCfg('track', 'auto'); music.skip(); draw(); $('#setSong').textContent = 'Næste nummer: ' + music.title + ' (skifter ved næste takt)'; }
      return;
    }
    const seg = b.closest('.seg');
    if (b.classList.contains('sw')) setCfg(b.dataset.k, !cfg[b.dataset.k]);
    else if (seg) { const o = opt(seg.dataset.k), c = o.opts.find(q => String(q[0]) === b.dataset.v); if (c) setCfg(o.k, c[0]); }
    else return;
    sfx('click'); draw();
  };
  body.oninput = e => { const el = e.target; if (el.type !== 'range') return; setCfg(el.dataset.k, +el.value / 100); el.nextElementSibling.textContent = el.value; };
  body.onchange = e => { const el = e.target; if (el.tagName === 'SELECT') { setCfg(el.dataset.k, el.value); draw(); } else if (el.type === 'range' && el.dataset.k === 'sfxVol') sfx('ready'); };
  drawPreview();
}
// A little scene in the graphics tab that shows what the choices look like.
function drawPreview() {
  const pc = $('#setPrev'); if (!pc) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = pc.clientWidth || 480, h = pc.clientHeight || 170; pc.width = w * dpr; pc.height = h * dpr;
  const g = pc.getContext('2d'), m = st.v && st.v.me, f = m ? m.faction : 'A', color = m ? m.color : 0, S = R.S, Z = pc.height / 4.05, k = Z / S, mil = cfg.palette === 'military';
  g.fillStyle = mil ? '#8c9a5c' : '#7fc44d'; g.fillRect(0, 0, pc.width, pc.height);
  for (let i = 0; i < 60; i++) { g.fillStyle = i % 2 ? (mil ? 'rgba(164,172,108,0.5)' : 'rgba(146,214,92,0.5)') : (mil ? 'rgba(108,122,68,0.4)' : 'rgba(104,176,62,0.4)'); g.beginPath(); g.ellipse((i * 0.137 % 1) * pc.width, (i * 0.531 % 1) * pc.height, Z * (0.5 + (i % 5) * 0.2), Z * 0.4, i, 0, 7); g.fill(); }
  const put = (name, x, y, o = {}) => {
    const sp = sprite(name, S, { color, faction: f, ...o }), px = x * Z, py = y * Z;
    if (cfg.shadows) {
      g.globalAlpha = 0.24;
      if (sp.sh) g.drawImage(sp.sh.cv, px - sp.sh.ax * k, py - sp.sh.ay * k, sp.sh.cv.width * k, sp.sh.cv.height * k);
      else { const r = UD[name].r; g.fillStyle = '#000'; g.beginPath(); g.ellipse(px + r * 0.25 * Z, py + r * 0.2 * Z, r * 1.15 * Z, r * 0.8 * Z, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    g.drawImage(sp.cv, px - sp.ax * k, py - sp.ay * k, sp.cv.width * k, sp.cv.height * k);
    if (TURRET[name]) { const tp = sprite(TURRET[name], S, { color, faction: f, dir: o.dir || 0 }); g.drawImage(tp.cv, px - tp.ax * k, py - tp.ay * k, tp.cv.width * k, tp.cv.height * k); }
  };
  const W = pc.width / Z, tank = f === 'A' ? 'mt' : 'ht';
  put('fac', W * 0.2, 2.62); put('pow', W * 0.5, 2.95, { dmg: cfg.damage ? 2 : 0 });
  put(tank, W * 0.72, 1.6, { dir: 1 }); put('harv', W * 0.88, 3.05, { dir: 15, frame: 1 });
  put('inf', W * 0.66, 3.3, { dir: 1 }); put('rkt', W * 0.73, 3.6, { dir: 2 });
}
const GFX = new Set(['detail', 'palette', 'outline', 'sharp', 'shadows', 'damage', 'anim', 'particles']);
onCfg(k => { if (GFX.has(k)) applyGraphics(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !$('#smOk') && !$('#ovMenu')) closeModal(); });

// ---------- frame loop ----------
let lastT = 0;
function frame(ts) {
  const now = ts / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
  if (st.v && st.v.map && (st.mode === 'plan' || st.mode === 'replay')) {
    const pan = 16 / R.cam.z * 60 * dt;
    if (keys.has('arrowleft') || keys.has('a')) R.cam.x -= pan; if (keys.has('arrowright') || keys.has('d')) R.cam.x += pan;
    if (keys.has('arrowup') || keys.has('w')) R.cam.y -= pan; if (keys.has('arrowdown') || keys.has('s')) R.cam.y += pan;
    if (cfg.edgeScroll && edge && !drag && $('#modal').hidden && document.hasFocus()) {     // the mouse rests at the edge of the map
      const E = 26, [ex, ey] = edge, push = d => Math.min(1, (E - d) / E) * pan * 0.6;
      if (ex < E) R.cam.x -= push(ex); else if (ex > R.w - E) R.cam.x += push(R.w - ex);
      if (ey < E) R.cam.y -= push(ey); else if (ey > R.h - E) R.cam.y += push(R.h - ey);
    }
    if (st.mode === 'replay' && st.rp) { stepReplay(dt); if (st.rp) replayScene(); }
    if (st.mode === 'plan') { updateProd(now); if (st.scene) tickAnims(now); }
    if (st.scene) { R.clampCam(); R.draw(st.scene, now); R.drawRadar(rad, st.scene, now); }
    const m = st.v.me, target = !m ? 0 : st.mode === 'replay' && st.rp ? (st.rp.done ? m.money : st.rp.money0 + st.rp.cash) : m.money - pendingCost(now);
    if (Math.abs(target - st.moneyShown) > 0.5) { const d = target - st.moneyShown; st.moneyShown += Math.abs(d) < 12 ? d : d * Math.min(1, dt * 9); $('#moneyN').textContent = fmt(st.moneyShown); }
  }
  requestAnimationFrame(frame);
}
applyGraphics();
initMenu();
requestAnimationFrame(frame);
window.JF = { st, R, cfg, setCfg, showSettings, refresh: async () => applyView(await st.be.state(-1)) };
