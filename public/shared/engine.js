// EagleEye Commander — rules: lobby, economy, building, training, orders and round resolution.
// Pure functions on a plain game object, so the same code runs on the server and in offline play.
import { DEFS, isBase } from './defs.js';
import { generateMap, MAP_KINDS } from './map.js';
import { createSim, dockOf } from './sim.js';
import { mulberry32, hashStr, packBits, unpackBits, oreToArr, oreToStr, stamp } from './util.js';
import { aiTurn } from './ai.js';

export class GameError extends Error {}
const fail = m => { throw new GameError(m); };
const BD = DEFS.buildings, UD = DEFS.units;
const BOTS = ['Oberst Krag', 'Major Holm', 'General Brandt', 'Kaptajn Vinter', 'Oberst Steen'];

export const teamKey = p => p.team ? 'T' + p.team : 'P' + p.id;
export const allied = (a, b) => teamKey(a) === teamKey(b);
const mates = (game, p) => game.players.filter(q => q.alive && allied(p, q));      // p's alliance, p included

// ---------- lobby ----------
const OPTS = { roundHours: 24, peace: DEFS.peaceRounds, map: 'random', size: 'normal', theme: 'grass', money: DEFS.startMoney, diplo: 'notice', open: true };
export function newGame({ name, seed, now = 0, ...opts }) {
  const game = { v: 2, name, seed: seed >>> 0, phase: 'lobby', round: 0, deadline: 0, opts: { ...OPTS }, nextId: 1, host: 0,
    players: [], map: null, ore: '', bridges: [], neut: [], chat: [], chatId: 0, offers: [], nextTeam: 4, last: null, winner: null, rev: 1, created: now };
  setOpts(game, opts);
  return game;
}
// A match saved by an older version gets the fields that have been added since.
export function upgrade(game) {
  game.opts = { ...OPTS, diplo: 'fixed', open: false, ...game.opts };
  for (const k of ['bridges', 'neut', 'chat', 'offers']) if (!Array.isArray(game[k])) game[k] = [];
  game.chatId = game.chatId | 0; game.nextTeam = game.nextTeam || 4;
  for (const p of game.players) { if (!p.intel) p.intel = {}; p.nukeAt = p.nukeAt | 0; }
  return game;
}
function setOpts(game, a) {
  const o = game.opts;
  if (a.roundHours != null) o.roundHours = Math.max(0, Math.min(168, +a.roundHours || 0));
  if (a.peace != null) o.peace = Math.max(0, Math.min(10, a.peace | 0));
  if (a.map != null && MAP_KINDS.includes(a.map)) o.map = a.map;
  if (a.size != null && DEFS.sizes[a.size]) o.size = a.size;
  if (a.theme != null && DEFS.themes[a.theme]) o.theme = a.theme;
  if (a.money != null && DEFS.moneyChoices.includes(+a.money)) o.money = +a.money;
  if (a.diplo != null && DEFS.diplo[a.diplo]) o.diplo = a.diplo;
  if (a.open != null) o.open = !!a.open;
}
// A line in the chat. from 0 = the game itself. ids: only these generals see it.
function say(game, from, text, now = 0, ids = null) {
  game.chat.push({ id: ++game.chatId, t: now, from, text, ...(ids ? { ids } : {}) });
  if (game.chat.length > 150) game.chat.splice(0, game.chat.length - 150);
}
export function addPlayer(game, { name, kind = 'human', faction = 'A', team = 0, auth = null, now = 0 }) {
  if (game.phase !== 'lobby') fail('Kampen er allerede i gang.');
  if (game.players.length >= 6) fail('Kampen er fuld (højst 6 generaler).');
  name = String(name || '').trim().slice(0, 20); if (!name) fail('Skriv et navn.');
  if (game.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('Navnet er allerede taget.');
  if (!DEFS.factions[faction]) faction = 'A';
  let color = 0; while (game.players.some(p => p.color === color)) color++;
  const p = { id: game.nextId++, name, kind, faction, team: team | 0, color, money: 0, buildings: [], army: {}, orders: [], ready: false,
    explored: '', known: {}, intel: {}, nukeAt: 0, alive: true, trained: {}, stats: { killed: 0, lost: 0, bKilled: 0, bLost: 0, income: 0 }, report: null, auth };
  game.players.push(p);
  if (!game.host && kind === 'human') game.host = p.id;
  else say(game, 0, name + ' er med.', now);
  game.rev++;
  return p;
}
export function addBot(game, faction) {
  const name = BOTS.find(b => !game.players.some(p => p.name === b)) || 'General ' + (game.players.length + 1);
  const f = faction || (game.players.filter(p => p.faction === 'P').length < game.players.filter(p => p.faction === 'A').length ? 'P' : 'A');
  return addPlayer(game, { name, kind: 'ai', faction: f });
}
export function startGame(game, now) {
  if (game.phase !== 'lobby') fail('Kampen er allerede i gang.');
  const k = game.players.length; if (k < 2) fail('Der skal mindst to generaler til en kamp.');
  const map = generateMap(game.seed, k, game.opts.map, game.opts.size), n = map.n, R = mulberry32(game.seed ^ 0x5bd1e995);
  game.map = { n, t: map.t, starts: map.starts }; game.ore = oreToStr(map.ore);
  game.bridges = map.bridges.map(b => ({ id: game.nextId++, x: b.x, y: b.y, w: b.w, h: b.h, cells: b.cells, a: b.a, hp: DEFS.bridge.hp }));
  game.neut = map.neutrals.map(q => ({ id: game.nextId++, t: q.t, x: q.x, y: q.y, o: 0 }));
  const slots = map.starts.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
  game.players.forEach((p, i) => {
    const s = map.starts[slots[i]]; p.slot = slots[i];
    p.buildings = [{ id: game.nextId++, t: 'hq', x: s.x - 1, y: s.y - 1, hp: BD.hq.hp }];
    p.money = game.opts.money; p.army = { ...DEFS.startArmy }; p.alive = true; p.ready = false;
    const e = new Uint8Array(n * n); stamp(e, n, s.x, s.y, BD.hq.sight + 2); p.explored = packBits(e);
  });
  game.phase = 'play'; game.round = 1; setDeadline(game, now); game.rev++;
  say(game, 0, 'Kampen er i gang på ' + (game.opts.map === 'random' ? 'et tilfældigt kort' : DEFS.maps[game.opts.map]) + '.', now);
}
function setDeadline(game, now) { game.deadline = game.opts.roundHours > 0 ? Math.round(now + game.opts.roundHours * 3600) : 0; }
export const peaceLeft = game => Math.max(0, game.opts.peace - game.round + 1);

// ---------- economy ----------
// Power works as in v66: buildings get power in the order they were built; the newest switch off first.
export function powerState(p) {
  let prod = 0, use = 0; const off = {};
  for (const b of p.buildings) { const pw = BD[b.t].power; if (pw > 0) prod += pw; }
  for (const b of [...p.buildings].sort((a, b) => a.id - b.id)) { const pw = BD[b.t].power; if (pw >= 0) continue; use -= pw; if (use > prod) off[b.id] = 1; }
  return { prod, use, off };
}
export const hasOn = (p, t, ps) => p.buildings.some(b => b.t === t && !ps.off[b.id]);
export const armySize = p => Object.values(p.army).reduce((s, n) => s + n, 0);
// The A-bomb: a silo with power, and the preparation done. at: the round from which it can be used.
export function nukeState(p, round, ps = powerState(p)) {
  const built = p.buildings.some(b => b.t === 'silo'), on = hasOn(p, 'silo', ps), at = p.nukeAt | 0;
  return { built, on, at, left: Math.max(0, at - round), ready: on && at > 0 && round >= at };
}
// A camp is found when the general knows at least one of its buildings: seen by his troops, or by a spy.
export const campFound = (p, q) => { for (const id in p.known) if (p.known[id].o === q.id) return true; return false; };
const gen = name => name + (/[sxz]$/i.test(name) ? "'" : 's');      // Danish possessive
// free pads for aircraft
export function airRoom(p, ps) {
  const pads = p.buildings.filter(b => b.t === 'air' && !ps.off[b.id]).length * DEFS.padsPerAirfield;
  return pads - Object.entries(p.army).reduce((s, [t, n]) => s + (UD[t] && UD[t].air ? n : 0), 0);
}
export const armyValue = army => Object.entries(army).reduce((s, [t, n]) => s + (UD[t] ? UD[t].cost * n : 0), 0);
export function harvCount(p, ps) { return p.buildings.filter(b => b.t === 'ref' && !ps.off[b.id]).length ? p.buildings.filter(b => b.t === 'ref' && !ps.off[b.id]).length + (p.army.harv | 0) : 0; }

// Why a player cannot build / train a type right now ('' if they can).
export function buildBlock(p, t, ps = powerState(p)) {
  const d = BD[t]; if (!d || !d.f.includes(p.faction)) return 'Ukendt bygning.';
  const hq = p.buildings.some(b => b.t === 'hq');
  if (d.only === 'nohq') return hq ? 'Du har allerede en kommandocentral.' : '';
  if (!hq) return 'Uden kommandocentral kan du ikke bygge. Genopbyg den først.';
  if (d.only === 'one' && p.buildings.some(b => b.t === t)) return 'Du har allerede en ' + d.name.toLowerCase() + '.';
  if (d.mine && p.buildings.filter(b => b.t === t).length >= DEFS.mineCap) return 'Du kan højst have ' + DEFS.mineCap + ' minefelter ad gangen.';
  for (const nd of d.needs || []) if (!hasOn(p, nd, ps)) return 'Kræver ' + BD[nd].name.toLowerCase() + ' med strøm.';
  return '';
}
export function trainBlock(p, t, ps = powerState(p)) {
  const d = UD[t]; if (!d || !d.f.includes(p.faction)) return 'Ukendt enhed.';
  for (const nd of d.needs || []) if (!hasOn(p, nd, ps)) return 'Kræver ' + BD[nd].name.toLowerCase() + ' med strøm.';
  return '';
}

// ---------- placement ----------
// occ: 1 where nothing can be built (terrain, ore, buildings, refinery gates).
export function makeOcc(map, ore, buildings, neut = []) {
  const n = map.n, occ = new Uint8Array(n * n), T = map.t;
  for (let i = 0; i < occ.length; i++) if (T[i] !== '.' || ore[i] !== '0') occ[i] = 1;
  for (const q of neut) for (let y = q.y; y < q.y + 2; y++) for (let x = q.x; x < q.x + 2; x++) occ[y * n + x] = 2;
  for (const b of buildings) {
    const d = BD[b.t];
    for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) occ[y * n + x] = 2;
    if (b.t === 'ref') { const [dx, dy] = dockOf(b); if (dx >= 0 && dy >= 0 && dx < n && dy < n && !occ[dy * n + dx]) occ[dy * n + dx] = 3; }
  }
  return occ;
}
export function placeBlock(occ, n, own, t, x, y) {
  const d = BD[t];
  if (x < 1 || y < 1 || x + d.w > n - 1 || y + d.h > n - 1) return 'Uden for kortet.';
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) if (occ[yy * n + xx]) return 'Kan ikke placeres her.';
  if (t === 'ref') { const dy = y + d.h, dx = x + 1; if (dy >= n - 1 || occ[dy * n + dx]) return 'Porten mod syd skal være fri.'; }
  // a wall may continue a wall; everything else must lie near a building of the base (a minefield a little further out)
  const gap = d.mine ? DEFS.mineGap : DEFS.buildGap; let near = false;
  for (const b of own) {
    const bd = BD[b.t]; if (bd.mine || (bd.wall && !d.wall)) continue;
    const gx = Math.max(b.x - (x + d.w), x - (b.x + bd.w), 0), gy = Math.max(b.y - (y + d.h), y - (b.y + bd.h), 0);
    if (Math.max(gx, gy) <= gap) { near = true; break; }
  }
  return near ? '' : d.mine ? 'For langt fra din base.' : 'For langt fra dine bygninger.';
}
const allBuildings = game => game.players.flatMap(p => p.alive ? p.buildings : []);
// What stands in the way when p builds. A hostile minefield does not: nobody can see it, and whoever builds on it clears it.
const occOf = (game, p) => makeOcc(game.map, game.ore, game.players.flatMap(q => !q.alive ? [] : q !== p && !allied(p, q) ? q.buildings.filter(b => !BD[b.t].mine) : q.buildings), game.neut);
function clearMines(game, p, b) {
  const d = BD[b.t];
  for (const q of game.players) if (q !== p && q.alive && !allied(p, q)) q.buildings = q.buildings.filter(m => !(BD[m.t].mine && m.x >= b.x && m.x < b.x + d.w && m.y >= b.y && m.y < b.y + d.h));
}

function reveal(game, p, cx, cy, r) {
  const n = game.map.n, e = unpackBits(p.explored, n * n); stamp(e, n, cx, cy, r); p.explored = packBits(e);
}
export const sellValue = b => Math.round(BD[b.t].cost * DEFS.sellRate * b.hp / BD[b.t].hp);
export const repairCost = b => Math.ceil(BD[b.t].cost * DEFS.repairRate * (1 - b.hp / BD[b.t].hp));

// An order may name a camp (the general's id) instead of only a place, and one such order per round may carry the A-bomb.
function cleanOrders(p, orders, game) {
  const out = [], left = { ...p.army }; let nuke = false;
  for (const o of (orders || []).slice(0, DEFS.maxOrders)) {
    const units = {}; let cnt = 0;
    for (const t in o.units || {}) {
      if (!UD[t] || UD[t].harv) continue;
      const c = Math.max(0, Math.min(left[t] | 0, o.units[t] | 0)); if (!c) continue;
      units[t] = c; left[t] -= c; cnt += c;
    }
    const pts = (o.pts || []).slice(0, DEFS.maxPts).map(q => [q[0] | 0, q[1] | 0]), slots = {};
    for (const t in o.slots || {}) {
      if (!units[t] || !Array.isArray(o.slots[t])) continue;
      const l = [...new Set(o.slots[t].map(i => i | 0))].filter(i => i >= 0 && i < (p.army[t] | 0)).slice(0, units[t]);
      if (l.length) slots[t] = l;
    }
    const r = Object.keys(slots).length ? { units, pts, slots } : { units, pts };
    const q = o.camp ? game.players.find(x => x.id === (o.camp | 0)) : null;
    if (q && q !== p && q.alive && !allied(p, q) && (p.kind === 'ai' || campFound(p, q))) {
      r.camp = q.id;
      if (o.nuke && !nuke && peaceLeft(game) <= 0 && nukeState(p, game.round).ready) nuke = r.nuke = true;
    }
    out.push(r);
  }
  return out;
}

// ---------- actions ----------
export function act(game, pid, a, now = 0) {
  const p = game.players.find(q => q.id === pid); if (!p) fail('Ukendt spiller.');
  const host = game.host === p.id;
  if (a.a === 'chat') {      // works before, during and after the match
    const text = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 240); if (!text) fail('Skriv en besked.');
    const mine = game.chat.filter(m => m.from === p.id).slice(-4);
    if (mine.length === 4 && now - mine[0].t < 8) fail('Rolig nu. Vent et øjeblik, før du skriver igen.');
    let ids = null;
    if (a.to === 'team') { ids = game.players.filter(q => allied(p, q)).map(q => q.id); if (ids.length < 2) fail('Du har ingen allierede at skrive til.'); }
    say(game, p.id, text, now, ids); game.rev++; return;
  }
  if (game.phase === 'lobby') {
    if (a.a === 'faction') { if (!DEFS.factions[a.f]) fail('Ukendt fraktion.'); p.faction = a.f; }
    else if (a.a === 'team') p.team = Math.max(0, Math.min(3, a.team | 0));
    else if (a.a === 'addBot') { if (!host) fail('Kun værten kan tilføje AI.'); addBot(game, a.f); }
    else if (a.a === 'botSet') { if (!host) fail('Kun værten.'); const b = game.players.find(q => q.id === a.id && q.kind === 'ai'); if (b) { if (DEFS.factions[a.f]) b.faction = a.f; if (a.team != null) b.team = Math.max(0, Math.min(3, a.team | 0)); } }
    else if (a.a === 'kick') { if (!host) fail('Kun værten.'); const i = game.players.findIndex(q => q.id === a.id && q.kind === 'ai'); if (i >= 0) game.players.splice(i, 1); }
    else if (a.a === 'opts') { if (!host) fail('Kun værten.'); setOpts(game, a); }
    else if (a.a === 'reseed') { if (!host) fail('Kun værten.'); game.seed = hashStr(game.seed + ':nyt:' + game.rev); }
    else if (a.a === 'start') { if (!host) fail('Kun værten kan starte kampen.'); startGame(game, now); return; }
    else fail('Kampen er ikke startet endnu.');
    game.rev++; return;
  }
  if (game.phase !== 'play') fail('Kampen er slut.');
  if (a.a === 'force') { if (!host) fail('Kun værten.'); resolveRound(game, now); return; }
  if (!p.alive) fail('Du er slået ud af kampen.');
  const ps = powerState(p);
  switch (a.a) {
    case 'build': {
      const why = buildBlock(p, a.t, ps); if (why) fail(why);
      const d = BD[a.t], cells = d.wall && Array.isArray(a.cells) ? a.cells.slice(0, 40) : [[a.x, a.y]];
      const occ = occOf(game, p), n = game.map.n; let placed = 0;
      for (const [x, y] of cells) {
        if (p.money < d.cost) { if (!placed) fail('Utilstrækkelige midler.'); break; }
        const r = placeBlock(occ, n, p.buildings, a.t, x | 0, y | 0); if (r) { if (cells.length === 1) fail(r); continue; }
        p.money -= d.cost;
        const b = { id: game.nextId++, t: a.t, x: x | 0, y: y | 0, hp: d.hp }; p.buildings.push(b); placed++;
        for (let yy = b.y; yy < b.y + d.h; yy++) for (let xx = b.x; xx < b.x + d.w; xx++) occ[yy * n + xx] = 2;
        clearMines(game, p, b);
        if (!d.mine) reveal(game, p, b.x + d.w / 2, b.y + d.h / 2, d.sight);
        if (a.t === 'silo' && !p.nukeAt) p.nukeAt = game.round + DEFS.nuke.prep;      // the first silo starts the preparation
      }
      if (!placed) fail('Kan ikke placeres her.');
      break;
    }
    case 'sell': {
      const i = p.buildings.findIndex(b => b.id === a.id); if (i < 0) fail('Bygningen findes ikke.');
      const b = p.buildings[i];
      if (isBase(b.t) && p.buildings.filter(q => isBase(q.t)).length <= 1) fail('Du kan ikke sælge din sidste bygning.');
      p.money += sellValue(b); p.buildings.splice(i, 1);
      p.orders = cleanOrders(p, p.orders, game);
      break;
    }
    case 'repair': {
      const list = a.id ? p.buildings.filter(b => b.id === a.id) : p.buildings.filter(b => b.hp < BD[b.t].hp).sort((x, y) => (BD[x.t].wall ? 1 : 0) - (BD[y.t].wall ? 1 : 0));
      let did = false;
      for (const b of list) {
        const c = repairCost(b); if (c <= 0) continue;
        if (p.money >= c) { p.money -= c; b.hp = BD[b.t].hp; did = true; }
        else if (p.money > 0) { b.hp = Math.min(BD[b.t].hp, Math.round(b.hp + (BD[b.t].hp - b.hp) * p.money / c)); p.money = 0; did = true; break; }
      }
      if (!did) fail(list.length ? 'Utilstrækkelige midler.' : 'Intet at reparere.');
      break;
    }
    case 'train': {
      const why = trainBlock(p, a.t, ps); if (why) fail(why);
      const d = UD[a.t], c = Math.max(1, Math.min(20, a.n | 0));
      if (d.air && c > airRoom(p, ps)) fail('Flyvepladsen er fuld. Hver flyveplads har plads til ' + DEFS.padsPerAirfield + ' fly.');
      if (armySize(p) + c > DEFS.unitCap) fail('Hæren er fuld (højst ' + DEFS.unitCap + ' enheder).');
      if (p.money < d.cost * c) fail('Utilstrækkelige midler.');
      p.money -= d.cost * c; p.army[a.t] = (p.army[a.t] | 0) + c; p.trained[a.t] = (p.trained[a.t] | 0) + c;
      break;
    }
    case 'untrain': {
      const d = UD[a.t]; if (!d) fail('Ukendt enhed.');
      const c = Math.min(a.n | 0 || 1, p.trained[a.t] | 0, p.army[a.t] | 0); if (c <= 0) fail('Kun enheder trænet i denne runde kan fortrydes.');
      p.army[a.t] -= c; p.trained[a.t] -= c; p.money += d.cost * c; if (!p.army[a.t]) delete p.army[a.t];
      p.orders = cleanOrders(p, p.orders, game);
      break;
    }
    case 'orders': {
      const n = game.map.n; let bombs = 0;
      for (const o of a.orders || []) {
        for (const q of o.pts || []) if (!(q[0] >= 0 && q[1] >= 0 && q[0] < n && q[1] < n)) fail('Ruten ligger uden for kortet.');
        const q = o.camp ? game.players.find(x => x.id === (o.camp | 0)) : null;
        if (o.camp) {
          if (!q || q === p || !q.alive) fail('Ukendt lejr.');
          if (allied(p, q)) fail(q.name + ' er din allierede.');
          if (p.kind !== 'ai' && !campFound(p, q)) fail('Du har ikke fundet ' + gen(q.name) + ' lejr endnu. Spionér først.');
        }
        if (o.nuke) {
          const ns = nukeState(p, game.round, ps);
          if (!q) fail('A-bomben skal have en lejr som mål.');
          if (++bombs > 1) fail('A-bomben kan kun sættes på ét angreb.');
          if (!ns.built) fail('Du har ingen raketsilo.');
          if (!ns.on) fail('Raketsiloen mangler strøm.');
          if (!ns.ready) fail('A-bomben er først klar i runde ' + ns.at + '.');
          if (peaceLeft(game) > 0) fail('Der er våbenhvile. A-bomben kan ikke bruges endnu.');
        }
      }
      p.orders = cleanOrders(p, a.orders, game);
      break;
    }
    case 'spy': {      // a look at an enemy camp as it is right now; minefields stay hidden. Allies get the picture too.
      const q = game.players.find(x => x.id === (a.id | 0));
      if (!q || q === p || !q.alive) fail('Ukendt general.');
      if (allied(p, q)) fail('I er allierede. Du kan allerede se hans base.');
      if (!hasOn(p, 'rad', ps)) fail('Spionage kræver en radarstation med strøm.');
      if (p.money < DEFS.spyCost) fail('Utilstrækkelige midler.');
      p.money -= DEFS.spyCost;
      const n = game.map.n, seen = q.buildings.filter(b => !BD[b.t].mine);
      for (const m of mates(game, p)) {
        const e = unpackBits(m.explored, n * n);
        for (const b of seen) { m.known[b.id] = { t: b.t, x: b.x, y: b.y, o: q.id }; stamp(e, n, b.x + BD[b.t].w / 2, b.y + BD[b.t].h / 2, 2.5 + BD[b.t].w / 2); }
        m.explored = packBits(e);
        m.intel[q.id] = { round: game.round, army: { ...q.army } };
      }
      break;
    }
    case 'ready': p.ready = !!a.on; break;
    case 'rebridge': {
      const b = game.bridges.find(q => q.id === a.id); if (!b) fail('Broen findes ikke.');
      if (b.hp > 0) fail('Broen står endnu.');
      if (p.money < DEFS.bridge.cost) fail('Utilstrækkelige midler.');
      p.money -= DEFS.bridge.cost; b.hp = DEFS.bridge.hp;
      say(game, 0, p.name + ' har genopbygget en bro.', now);
      break;
    }
    case 'ally': {      // offer an alliance, or accept the one that general has offered
      if (game.opts.diplo === 'fixed') fail('Holdene ligger fast i denne kamp.');
      const q = game.players.find(x => x.id === a.id);
      if (!q || q === p || !q.alive) fail('Ukendt general.');
      if (allied(p, q)) fail('I er allerede allierede.');
      if (q.kind === 'ai') fail(q.name + ' indgår ikke pagter.');
      const mine = mates(game, p), theirs = mates(game, q), max = Math.ceil(game.players.filter(x => x.alive).length / 2);
      if (mine.length > 1 && theirs.length > 1) fail('I er begge i en alliance. En af jer må forlade sin først.');
      if (mine.length + theirs.length > max) fail('Alliancen bliver for stor. Lige nu må en alliance højst have ' + max + (max === 1 ? ' general.' : ' generaler.'));
      if (game.offers.some(o => o.from === q.id && o.to === p.id)) {
        const tid = mine.length > 1 ? p.team : theirs.length > 1 ? q.team : game.nextTeam++;
        for (const x of [...mine, ...theirs]) { x.team = tid; delete x.leaving; }
        game.offers = game.offers.filter(o => !((o.from === p.id && o.to === q.id) || (o.from === q.id && o.to === p.id)));
        say(game, 0, q.name + ' og ' + p.name + ' har indgået en alliance.', now);
      } else if (!game.offers.some(o => o.from === p.id && o.to === q.id)) {
        game.offers.push({ from: p.id, to: q.id, round: game.round });
        say(game, 0, p.name + ' tilbyder ' + q.name + ' en alliance.', now, [p.id, q.id]);
      }
      break;
    }
    case 'unally': {    // take my offer back, or turn theirs down
      const before = game.offers.length;
      game.offers = game.offers.filter(o => !((o.from === p.id && o.to === a.id) || (o.from === a.id && o.to === p.id)));
      if (game.offers.length === before) fail('Der er intet tilbud at trække tilbage.');
      break;
    }
    case 'leave': {
      if (game.opts.diplo === 'fixed') fail('Holdene ligger fast i denne kamp.');
      if (mates(game, p).length < 2) fail('Du er ikke i en alliance.');
      if (game.opts.diplo === 'free') { leaveTeam(game, p); say(game, 0, p.name + ' har brudt sin alliance.', now); }
      else if (p.leaving) fail('Du har allerede opsagt alliancen.');
      else { p.leaving = true; say(game, 0, p.name + ' har opsagt sin alliance. Den gælder til og med næste slag.', now); }
      break;
    }
    default: fail('Ukendt handling.');
  }
  game.rev++;
}

// Out of the alliance: the former allies know each other's bases, and from now on they can shoot at each other.
function leaveTeam(game, p) {
  for (const q of mates(game, p)) {
    if (q === p) continue;
    for (const b of q.buildings) if (!BD[b.t].mine) p.known[b.id] = { t: b.t, x: b.x, y: b.y, o: q.id };
    for (const b of p.buildings) if (!BD[b.t].mine) q.known[b.id] = { t: b.t, x: b.x, y: b.y, o: p.id };
  }
  p.team = 0; delete p.leaving;
}

// Resolve when every living human is ready, or when the deadline has passed.
export function maybeResolve(game, now) {
  if (game.phase !== 'play') return false;
  const humans = game.players.filter(p => p.alive && p.kind === 'human');
  const all = humans.length > 0 && humans.every(p => p.ready);
  if (all || (game.deadline && now >= game.deadline)) { resolveRound(game, now); return true; }
  return false;
}

export function buildSnapshot(game) {
  const peace = peaceLeft(game) > 0, byId = new Map(game.players.map(p => [p.id, p]));
  // where a group goes when its target is a camp: the command centre as it stands now, wherever the general last saw it
  const aimOf = q => { const b = q.buildings.find(x => x.t === 'hq') || q.buildings.find(x => isBase(x.t)); return b ? [b.x + (BD[b.t].w >> 1), b.y + (BD[b.t].h >> 1)] : null; };
  return {
    map: game.map, ore: game.ore, seed: hashStr(game.seed + ':' + game.round), round: game.round, peace, duration: (DEFS.sizes[game.opts.size] || DEFS.sizes.normal).seconds,
    bridges: game.bridges.map(b => ({ ...b })), neut: game.neut.map(q => ({ ...q })),
    players: game.players.filter(p => p.alive).map(p => {
      const ps = powerState(p), orders = []; let nuke = null;
      for (const o of p.orders) {
        let r = o;
        if (o.camp) {
          const q = byId.get(o.camp), aim = q && q.alive && !allied(p, q) ? aimOf(q) : null;
          if (!aim) continue;      // the camp is gone, or its general has become an ally
          r = { ...o, pts: [...o.pts.slice(0, -1), aim] };
          if (o.nuke && !peace && !nuke && nukeState(p, game.round, ps).ready) nuke = { to: q.id };
        }
        if (r.pts.length && Object.keys(r.units).length) orders.push(r);
      }
      return { id: p.id, name: p.name, team: teamKey(p), faction: p.faction, color: p.color, explored: p.explored, harv: harvCount(p, ps),
        buildings: p.buildings.map(b => ({ id: b.id, t: b.t, x: b.x, y: b.y, hp: b.hp, off: ps.off[b.id] ? 1 : 0 })),
        army: { ...p.army }, orders, ...(nuke ? { nuke } : {}) };
    }),
  };
}

export function resolveRound(game, now = 0) {
  const R = mulberry32(hashStr(game.seed + ':ai:' + game.round));
  for (const p of game.players) if (p.alive && p.kind === 'ai') { try { aiTurn(game, p, R); } catch (e) { if (!(e instanceof GameError)) throw e; } }
  const snap = buildSnapshot(game), res = createSim(snap).run();
  const dead = new Set(res.dead), out = [], n = game.map.n;
  game.bridges.forEach((b, i) => { if (b.hp > 0 && res.bridges[i] === 0) say(game, 0, 'En bro er sprængt.', now); b.hp = res.bridges[i]; });
  game.neut.forEach((q, i) => { q.o = res.neut[i]; });
  const byId = new Map(game.players.map(p => [p.id, p]));
  snap.players.forEach((sp, i) => {
    const p = byId.get(sp.id), r = res.players[i];
    const aid = Math.round(DEFS.aid * p.buildings.reduce((v, b) => v + (dead.has(b.id) && isBase(b.t) ? BD[b.t].cost : 0), 0));
    p.buildings = p.buildings.filter(b => !dead.has(b.id));
    for (const b of p.buildings) if (res.hp[b.id] != null) b.hp = Math.min(BD[b.t].hp, res.hp[b.id]);
    let lostValue = 0; const lost = {};
    for (const t in r.lost) {
      let c = r.lost[t];
      if (t === 'harv') c = Math.max(0, c - (sp.harv - (p.army.harv | 0)));   // refinery harvesters are replaced for free
      c = Math.min(c, p.army[t] | 0); if (!c) continue;
      p.army[t] -= c; if (!p.army[t]) delete p.army[t]; lost[t] = c; lostValue += UD[t].cost * c;
    }
    for (const t in r.used) { const c = Math.min(r.used[t], p.army[t] | 0); if (c) { p.army[t] -= c; if (!p.army[t]) delete p.army[t]; } }      // engineers who stayed in a building
    const depot = game.neut.filter(q => q.o === p.id && DEFS.neutral[q.t].income).reduce((v, q) => v + DEFS.neutral[q.t].income, 0);
    const income = r.income + DEFS.hqIncome + aid + depot;
    p.money += income; p.explored = r.explored;
    p.stats.killed += r.killed; p.stats.lost += lostValue; p.stats.bKilled += r.bKilled; p.stats.bLost += r.bLost; p.stats.income += income;
    p.report = { round: game.round, income: r.income, supply: DEFS.hqIncome, aid, depot, lost, lostValue, killed: r.killed, bLost: r.bLost, bKilled: r.bKilled };
    p.seenNow = r.seen;
    if (r.nuked) {      // the bomb is gone, and the next one takes as long to prepare
      p.nukeAt = game.round + DEFS.nuke.prep; p.report.nuked = sp.nuke.to;
      say(game, 0, p.name + ' har kastet en A-bombe over ' + gen(byId.get(sp.nuke.to).name) + ' lejr.', now);
    }
    p.orders = []; p.ready = false; p.trained = {};
  });
  // what everybody now knows about enemy buildings
  const where = new Map(); for (const p of game.players) if (p.alive) for (const b of p.buildings) where.set(b.id, { t: b.t, x: b.x, y: b.y, o: p.id });
  for (const p of game.players) {
    for (const id of p.seenNow || []) if (where.has(id)) p.known[id] = where.get(id);
    delete p.seenNow;
    for (const id in p.known) if (!where.has(+id)) delete p.known[id];
  }
  // ore grows back a little
  const ore = oreToArr(res.ore), occ = makeOcc(game.map, '0'.repeat(n * n), allBuildings(game)), OD = DEFS.ore, add = [];
  for (let c = 0; c < ore.length; c++) {
    if (!ore[c]) continue;
    if (ore[c] < OD.cellMax) ore[c] = Math.min(OD.cellMax, ore[c] + OD.regrow);
    if (ore[c] >= 6 && R() < OD.spread * 4) { const k = (R() * 4) | 0, x = (c % n) + [1, -1, 0, 0][k], y = ((c / n) | 0) + [0, 0, 1, -1][k]; if (x > 0 && y > 0 && x < n - 1 && y < n - 1 && !ore[y * n + x] && !occ[y * n + x]) add.push(y * n + x); }
  }
  for (const c of add) ore[c] = 2;
  game.ore = oreToStr(ore);
  // alliances that were given notice end now, after the battle
  for (const p of game.players) if (p.alive && p.leaving) { leaveTeam(game, p); say(game, 0, p.name + ' er trådt ud af sin alliance.', now); }
  // eliminations and victory
  for (const p of game.players) {
    if (p.alive && !p.buildings.some(b => isBase(b.t))) {
      p.alive = false; p.army = {}; p.buildings = []; out.push(p.name);
      for (const q of game.neut) if (q.o === p.id) q.o = 0;
      say(game, 0, p.name + ' er slået ud.', now);
    }
  }
  game.offers = game.offers.filter(o => game.round - o.round < 3 && byId.get(o.from).alive && byId.get(o.to).alive);
  for (const p of game.players) {
    for (const id in p.known) { const k = p.known[id], o = byId.get(k.o); if (!o || !o.alive) delete p.known[id]; }
    for (const id in p.intel) { const o = byId.get(+id); if (!o || !o.alive || allied(p, o)) delete p.intel[id]; }
  }
  const alive = game.players.filter(p => p.alive), teamsAlive = [...new Set(alive.map(teamKey))];
  game.last = { round: game.round, snap, out };
  if (teamsAlive.length <= 1 || !alive.some(p => p.kind === 'human')) {
    game.phase = 'over'; game.winner = { team: teamsAlive[0] || null, names: teamsAlive.length === 1 ? alive.map(p => p.name) : [] };
    if (teamsAlive.length > 1) { const best = [...alive].sort((a, b) => b.stats.killed - a.stats.killed)[0]; game.winner = { team: teamKey(best), names: alive.filter(p => allied(p, best)).map(p => p.name) }; }
    if (game.winner.names.length) say(game, 0, 'Sejr til ' + game.winner.names.join(' og ') + '.', now);
  }
  game.round++; setDeadline(game, now); game.rev++;
}

// ---------- what a player gets to see ----------
export function view(game, pid, now = 0) {
  const me = game.players.find(p => p.id === pid);
  // atom: everybody can see that a general has a working silo, and how many rounds are left until his bomb is ready (0 = now)
  const atom = p => { const ns = p.alive && game.phase === 'play' ? nukeState(p, game.round) : null; return ns && ns.on && ns.at ? { atom: ns.left } : {}; };
  const pub = p => ({ id: p.id, name: p.name, kind: p.kind, faction: p.faction, color: p.color, team: p.team, alive: p.alive, ready: p.ready, stats: p.stats, ...(p.leaving ? { leaving: true } : {}), ...atom(p) });
  const strip = p => { const { auth, ...rest } = p; return rest; };
  return {
    rev: game.rev, name: game.name, code: game.code || '', phase: game.phase, round: game.round, deadline: game.deadline, opts: game.opts, host: game.host,
    peaceLeft: game.phase === 'play' ? peaceLeft(game) : 0, winner: game.winner, now,
    map: game.map, ore: game.ore, bridges: game.bridges, neut: game.neut,
    seed: game.phase === 'lobby' ? game.seed : 0,      // lets the lobby draw the map that the start will make
    chat: game.chat.filter(m => !m.ids || m.ids.includes(pid)).map(({ ids, ...m }) => (ids ? { ...m, team: 1 } : m)),
    offers: game.offers.filter(o => o.from === pid || o.to === pid),
    me: me ? strip(me) : null,
    players: game.players.map(pub),
    allies: me && game.map ? game.players.filter(p => p !== me && p.alive && allied(p, me)).map(p => ({ id: p.id, buildings: p.buildings, army: p.army })) : [],
    last: game.last ? { round: game.last.round, out: game.last.out } : null,
  };
}
export const replayOf = game => game.last ? game.last.snap : null;
