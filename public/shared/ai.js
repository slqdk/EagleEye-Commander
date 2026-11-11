// EagleEye Commander — AI generals. They play by the same rules and actions as humans
// (their one advantage: they know where the other bases are).
import { DEFS, isBase } from './defs.js';
import { act, powerState, buildBlock, trainBlock, makeOcc, placeBlock, armySize, allied, peaceLeft, airRoom, nukeState, GameError } from './engine.js';

const BD = DEFS.buildings, UD = DEFS.units;
const SCRIPT = {
  A: ['pow', 'ref', 'bar', 'pill', 'fac', 'pow', 'ref', 'tur', 'rad', 'pow', 'aag', 'pill', 'tech', 'tur', 'pow', 'air', 'tur', 'pill', 'silo', 'ref', 'pow', 'aag', 'tur'],
  P: ['pow', 'ref', 'bar', 'flt', 'fac', 'pow', 'ref', 'flt', 'rad', 'pow', 'sam', 'pow', 'coil', 'tech', 'flt', 'pow', 'air', 'coil', 'silo', 'ref', 'pow', 'sam', 'coil'],
};
const MIX = { A: { inf: 3, rkt: 2.5, jeep: 1, lt: 2, mt: 4, art: 2, td: 2, jet: 1.5 }, P: { inf: 3, gren: 2, rkt: 2.5, flm: 1, ht: 4, kat: 2, kol: 2, heli: 1.5 } };

const tryAct = (game, p, a) => { try { act(game, p.id, a); return true; } catch (e) { if (e instanceof GameError) return false; throw e; } };
const count = (p, t) => p.buildings.filter(b => b.t === t).length;

export function findSpot(game, p, t, R) {
  const n = game.map.n, d = BD[t], occ = makeOcc(game.map, game.ore, game.players.flatMap(q => q.alive ? q.buildings : []), game.neut);
  const hq = p.buildings.find(b => b.t === 'hq') || p.buildings.find(b => isBase(b.t)); if (!hq) return null;
  const cx = hq.x + BD[hq.t].w / 2, cy = hq.y + BD[hq.t].h / 2;
  let px = cx, py = cy;
  if (t === 'ref') {
    let bs = 1e9;
    for (let c = 0; c < n * n; c++) if (game.ore[c] !== '0') { const x = c % n, y = (c / n) | 0, s = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (s < bs) { bs = s; px = x; py = y; } }
  } else if (d.weapon) {
    const dx = n / 2 - cx, dy = n / 2 - cy, l = Math.hypot(dx, dy) || 1;
    px = cx + dx / l * 6 + (R() - 0.5) * 9; py = cy + dy / l * 6 + (R() - 0.5) * 9;
  }
  let best = null, bs = 1e9;
  for (let y = Math.round(cy) - 18; y <= cy + 18; y++) for (let x = Math.round(cx) - 18; x <= cx + 18; x++) {
    if (placeBlock(occ, n, p.buildings, t, x, y)) continue;
    let lane = true;   // keep a one-cell lane around every building so units can get through
    for (let yy = y - 1; yy <= y + d.h && lane; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) if (occ[yy * n + xx] >= 2) { lane = false; break; }
    if (!lane) continue;
    const s = Math.hypot(x + d.w / 2 - px, y + d.h / 2 - py) + R() * 1.5;
    if (s < bs) { bs = s; best = [x, y]; }
  }
  return best;
}

// A place for a minefield: in the approaches on the side of the base that faces the middle of the map, clear of the lanes between the buildings.
function mineSpot(game, p, R) {
  const n = game.map.n, occ = makeOcc(game.map, game.ore, game.players.flatMap(q => q.alive ? q.buildings : []), game.neut);
  const base = p.buildings.filter(b => isBase(b.t)); if (!base.length) return null;
  const hq = base.find(b => b.t === 'hq') || base[0], cx = hq.x + 1.5, cy = hq.y + 1.5, dx = n / 2 - cx, dy = n / 2 - cy, l = Math.hypot(dx, dy) || 1;
  let best = null, bs = -1e9;
  for (let i = 0; i < 60; i++) {
    const b = base[(R() * base.length) | 0], d = BD[b.t];
    const x = Math.round(b.x + d.w / 2 + (R() - 0.5) * (d.w + 2 * DEFS.mineGap)), y = Math.round(b.y + d.h / 2 + (R() - 0.5) * (d.h + 2 * DEFS.mineGap));
    if (placeBlock(occ, n, p.buildings, 'mine', x, y)) continue;
    let gap = 99; for (const q of p.buildings) { const qd = BD[q.t]; gap = Math.min(gap, Math.max(q.x - x - 1, x - q.x - qd.w, q.y - y - 1, y - q.y - qd.h, 0)); }
    if (gap < 2) continue;
    const s = ((x - cx) * dx + (y - cy) * dy) / l + R() * 4;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  return best;
}

export function aiTurn(game, p, R) {
  const f = p.faction;
  // 1. rebuild and repair
  if (!count(p, 'hq') && p.money >= BD.hq.cost) { const s = findSpot(game, p, 'hq', R); if (s) tryAct(game, p, { a: 'build', t: 'hq', x: s[0], y: s[1] }); }
  if (p.money > 600) tryAct(game, p, { a: 'repair' });

  // 2. follow the build order
  let nextCost = 0;
  for (let built = 0; built < 4; built++) {
    const want = {}; let target = null;
    for (const t of SCRIPT[f]) { want[t] = (want[t] || 0) + 1; if (count(p, t) < want[t]) { target = t; break; } }
    if (!target) break;
    const ps = powerState(p);
    if (BD[target].power < 0 && ps.use - BD[target].power > ps.prod) target = 'pow';
    if (ps.use > ps.prod) target = 'pow';
    if (buildBlock(p, target, ps)) break;
    if (p.money < BD[target].cost) { nextCost = BD[target].cost; break; }
    const s = findSpot(game, p, target, R); if (!s) break;
    if (!tryAct(game, p, { a: 'build', t: target, x: s[0], y: s[1] })) break;
  }

  // minefields in the approaches: a couple per round once there is a barracks, more as the match goes on
  const mines = count(p, 'mine'), wantMines = Math.min(DEFS.mineCap, 2 + (game.round >> 1));
  for (let i = 0; i < 2 && mines + i < wantMines && p.money >= BD.mine.cost + 600 && !buildBlock(p, 'mine'); i++) {
    const s = mineSpot(game, p, R); if (!s || !tryAct(game, p, { a: 'build', t: 'mine', x: s[0], y: s[1] })) break;
  }
  // a fallen bridge is put up again now and then, or the way round may be too long for an attack to arrive
  const down = (game.bridges || []).filter(b => !(b.hp > 0));
  if (down.length && p.money >= DEFS.bridge.cost + 1500 && (game.round + p.id) % 2 === 0) {
    const hq = p.buildings.find(b => b.t === 'hq') || p.buildings[0];
    down.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
    tryAct(game, p, { a: 'rebridge', id: down[0].id });
  }
  // 3. an engineer when there is a neutral building to take, then the rest on troops (keep some back for the next building early on)
  const me = p.buildings.find(b => b.t === 'hq') || p.buildings[0];
  const free = (game.neut || []).filter(q => { const o = game.players.find(x => x.id === q.o); return !o || !allied(p, o); })
    .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
  if (free.length && game.round >= 2 && !(p.army.eng | 0) && !trainBlock(p, 'eng') && armySize(p) < DEFS.unitCap) tryAct(game, p, { a: 'train', t: 'eng', n: 1 });
  const reserve = nextCost * (game.round < 9 ? 0.6 : 0.5);      // later on the money is also held back for the next building, or a silo would never be afforded
  const refs = count(p, 'ref');
  if (refs && game.round >= 4 && (p.army.harv | 0) < refs && !trainBlock(p, 'harv') && p.money - reserve >= UD.harv.cost + 500) tryAct(game, p, { a: 'train', t: 'harv', n: 1 });
  for (let guard = 0; guard < 60; guard++) {
    if (armySize(p) >= DEFS.unitCap) break;
    let best = null, bs = -1;
    for (const t in MIX[f]) {
      if (trainBlock(p, t) || UD[t].cost > p.money - reserve || (UD[t].air && airRoom(p, powerState(p)) < 1)) continue;
      const s = MIX[f][t] / ((p.army[t] | 0) + 1) + R() * 0.3;
      if (s > bs) { bs = s; best = t; }
    }
    if (!best || !tryAct(game, p, { a: 'train', t: best, n: 1 })) break;
  }

  // 4. orders: the engineer goes for the nearest neutral building that is not ours, the army attacks
  const orders = [];
  if (free.length && (p.army.eng | 0)) {
    const escort = peaceLeft(game) > 0 ? 0 : Math.min(3, Math.max(0, (p.army.inf | 0) - 2));
    orders.push({ units: escort ? { eng: 1, inf: escort } : { eng: 1 }, pts: [[free[0].x, free[0].y + 2]] });
  }
  const combat = Object.entries(p.army).filter(([t]) => UD[t].weapon);
  const total = combat.reduce((s, [, c]) => s + c, 0);
  const enemies = game.players.filter(q => q.alive && !allied(p, q) && q.buildings.length);
  if (peaceLeft(game) <= 0 && total >= 7 && enemies.length && R() >= 0.3) {
    const dist = q => { const b = q.buildings.find(x => x.t === 'hq') || q.buildings[0]; return Math.hypot(b.x - me.x, b.y - me.y); };
    enemies.sort((a, b) => dist(a) - dist(b));
    const target = R() < 0.3 ? enemies[(R() * enemies.length) | 0] : enemies[0];
    const tb = target.buildings.filter(b => isBase(b.t)), aim = tb[(R() * tb.length) | 0] || target.buildings[0];
    const units = {};
    for (const [t, c] of combat) {
      const long = UD[t].weapon.range >= 8, send = long ? c : t === 'inf' ? Math.max(0, Math.round(c * 0.7) - 1) : Math.round(c * 0.75);
      if (send > 0) units[t] = send;
    }
    orders.push({ units, pts: [[aim.x + 1, aim.y + 1]] });
  }
  // the A-bomb goes off as soon as it is ready: on the richest enemy camp
  if (peaceLeft(game) <= 0 && enemies.length && nukeState(p, game.round).ready) {
    const worth = q => q.buildings.reduce((v, b) => v + (isBase(b.t) ? BD[b.t].cost : 0), 0);
    const q = [...enemies].sort((a, b) => worth(b) - worth(a))[0];
    orders.push({ units: {}, pts: [], camp: q.id, nuke: true });
  }
  if (orders.length) tryAct(game, p, { a: 'orders', orders });
}
