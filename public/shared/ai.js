// EagleEye Commander — AI generals. They play by the same rules and actions as humans
// (their one advantage: they know where the other bases are).
import { DEFS } from './defs.js';
import { act, powerState, buildBlock, trainBlock, makeOcc, placeBlock, armySize, allied, peaceLeft, airRoom, GameError } from './engine.js';

const BD = DEFS.buildings, UD = DEFS.units;
const SCRIPT = {
  A: ['pow', 'ref', 'bar', 'pill', 'fac', 'pow', 'ref', 'tur', 'rad', 'pow', 'aag', 'pill', 'tech', 'tur', 'pow', 'air', 'tur', 'pill', 'ref', 'pow', 'aag', 'tur'],
  P: ['pow', 'ref', 'bar', 'flt', 'fac', 'pow', 'ref', 'flt', 'rad', 'pow', 'sam', 'pow', 'coil', 'tech', 'flt', 'pow', 'air', 'coil', 'ref', 'pow', 'sam', 'coil'],
};
const MIX = { A: { inf: 3, rkt: 2.5, jeep: 1, lt: 2, mt: 4, art: 2, td: 2, jet: 1.5 }, P: { inf: 3, gren: 2, rkt: 2.5, flm: 1, ht: 4, kat: 2, kol: 2, heli: 1.5 } };

const tryAct = (game, p, a) => { try { act(game, p.id, a); return true; } catch (e) { if (e instanceof GameError) return false; throw e; } };
const count = (p, t) => p.buildings.filter(b => b.t === t).length;

export function findSpot(game, p, t, R) {
  const n = game.map.n, d = BD[t], occ = makeOcc(game.map, game.ore, game.players.flatMap(q => q.alive ? q.buildings : []));
  const hq = p.buildings.find(b => b.t === 'hq') || p.buildings.find(b => !BD[b.t].wall); if (!hq) return null;
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

  // 3. spend the rest on troops (keep some back for the next building early on)
  const reserve = game.round < 9 ? nextCost * 0.6 : 0;
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

  // 4. attack
  if (peaceLeft(game) > 0) return;
  const combat = Object.entries(p.army).filter(([t]) => !UD[t].harv);
  const total = combat.reduce((s, [, c]) => s + c, 0);
  const enemies = game.players.filter(q => q.alive && !allied(p, q) && q.buildings.length);
  if (total < 7 || !enemies.length || R() < 0.3) return;
  const me = p.buildings.find(b => b.t === 'hq') || p.buildings[0];
  const dist = q => { const b = q.buildings.find(x => x.t === 'hq') || q.buildings[0]; return Math.hypot(b.x - me.x, b.y - me.y); };
  enemies.sort((a, b) => dist(a) - dist(b));
  const target = R() < 0.3 ? enemies[(R() * enemies.length) | 0] : enemies[0];
  const tb = target.buildings.filter(b => !BD[b.t].wall), aim = tb[(R() * tb.length) | 0] || target.buildings[0];
  const units = {};
  for (const [t, c] of combat) {
    const long = UD[t].weapon.range >= 8, send = long ? c : t === 'inf' ? Math.max(0, Math.round(c * 0.7) - 1) : Math.round(c * 0.75);
    if (send > 0) units[t] = send;
  }
  tryAct(game, p, { a: 'orders', orders: [{ units, pts: [[aim.x + 1, aim.y + 1]] }] });
}
