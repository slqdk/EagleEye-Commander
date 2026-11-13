// EagleEye Commander — deterministic round simulation on the shared battlefield.
// The server runs it to get the result; the client runs the very same code to play the round back.
// No trigonometry in here, so the outcome is identical in Node and in every browser.
import { DEFS, dmgMult, isBase } from './defs.js';
import { mulberry32, Heap, oreToArr, oreToStr, packBits, unpackBits, stamp } from './util.js';

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const SQ2 = 1.41421356;

// Where a player's units stand while waiting at home. Used by the sim and by the client's base view.
export function musterPositions(buildings, army, isFree) {
  const out = [], used = new Set(), BD = DEFS.buildings;
  const find = t => buildings.find(b => b.t === t && b.hp > 0);
  const hq = find('hq') || buildings.find(b => isBase(b.t) && b.hp > 0);
  if (!hq) return out;
  const anchors = { bar: find('bar') || hq, fac: find('fac') || hq };
  const rings = {};
  const next = (key, perCell) => {
    const b = anchors[key], d = BD[b.t];
    const st = rings[key] || (rings[key] = { r: 1, cells: [], i: 0, sub: 0 });
    for (let guard = 0; guard < 4000; guard++) {
      if (st.i >= st.cells.length) {
        if (st.r > 16) return null;
        const r = st.r++, cells = [], mx = b.x + d.w / 2 - 0.5;
        for (let y = b.y - r; y < b.y + d.h + r; y++) for (let x = b.x - r; x < b.x + d.w + r; x++) {
          if (x > b.x - r && x < b.x + d.w + r - 1 && y > b.y - r && y < b.y + d.h + r - 1) continue;
          cells.push([x, y]);
        }
        cells.sort((p, q) => (q[1] - p[1]) || (Math.abs(p[0] - mx) - Math.abs(q[0] - mx)) || (p[0] - q[0]));
        st.cells = cells; st.i = 0; st.sub = 0;
        continue;
      }
      const [x, y] = st.cells[st.i], k = x + ',' + y;
      if (st.sub === 0 && (used.has(k) || !isFree(x, y))) { st.i++; continue; }
      used.add(k);
      const s = st.sub++;
      if (st.sub >= perCell) { st.i++; st.sub = 0; }
      return [x, y, s];
    }
    return null;
  };
  const SUB = [[0.28, 0.32], [0.72, 0.32], [0.28, 0.76], [0.72, 0.76]];
  const fields = buildings.filter(b => b.t === 'air' && b.hp > 0).sort((a, b) => a.id - b.id); let airK = 0;
  for (const t of Object.keys(DEFS.units)) {
    const d = DEFS.units[t], c = army[t] | 0;
    if (d.harv) continue;
    for (let i = 0; i < c; i++) {
      if (d.air && airK < fields.length * DEFS.padsPerAirfield) {   // aircraft park on the airfield pads
        const f = fields[(airK / 4) | 0], k = airK % 4; airK++;
        out.push({ t, i, x: f.x + 0.8 + (k % 2) * 1.4, y: f.y + 0.62 + ((k / 2) | 0) * 0.8 }); continue;
      }
      const foot = d.cls === 'inf', p = next(foot ? 'bar' : 'fac', foot ? 4 : 1);
      if (!p) { out.push({ t, i, x: hq.x + 1.5, y: hq.y + 3.5 }); continue; }
      out.push(foot ? { t, i, x: p[0] + SUB[p[2]][0], y: p[1] + SUB[p[2]][1] } : { t, i, x: p[0] + 0.5, y: p[1] + 0.5 });
    }
  }
  return out;
}

// Which attack group each mustered unit belongs to (-1 = stays home). An order may name exact units
// (slots: { type: [index, …] }, set when the player picks units on the map); the rest is filled by count.
export function assignGroups(list, orders) {
  const g = new Array(list.length).fill(-1), at = new Map(), need = (orders || []).map(o => ({ ...o.units }));
  list.forEach((u, k) => at.set(u.t + ':' + u.i, k));
  (orders || []).forEach((o, oi) => {
    for (const t in o.slots || {}) for (const i of o.slots[t]) { const k = at.get(t + ':' + i); if (k != null && g[k] < 0 && need[oi][t] > 0) { g[k] = oi; need[oi][t]--; } }
  });
  (orders || []).forEach((o, oi) => { list.forEach((u, k) => { if (g[k] < 0 && need[oi][u.t] > 0) { g[k] = oi; need[oi][u.t]--; } }); });
  return g;
}

export const dockOf = b => [b.x + 1, b.y + DEFS.buildings[b.t].h];
// The bridge an order points at (its last route point lies on the deck or right next to it). Shared with the client.
export const bridgeAt = (bridges, pt) => (bridges || []).find(b => pt[0] >= b.x - 1 && pt[0] <= b.x + b.w && pt[1] >= b.y - 1 && pt[1] <= b.y + b.h) || null;

export function createSim(snap) {
  const D = DEFS, n = snap.map.n, N = n * n, T = snap.map.t, dt = D.tick, OD = D.ore;
  const R = mulberry32(snap.seed), peace = !!snap.peace, duration = snap.duration || D.roundSeconds;
  const ore = oreToArr(snap.ore);
  const blk = new Uint8Array(N);          // 0 free, 1 terrain, 2 building, 3 wall
  const bAt = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (T[i] !== '.' && T[i] !== 'b') blk[i] = 1;

  const teams = [];
  const P = snap.players.map((p, i) => {
    let ti = teams.indexOf(p.team); if (ti < 0) { ti = teams.length; teams.push(p.team); }
    return { i, id: p.id, ti, faction: p.faction, income: 0, lost: {}, used: {}, killed: 0, bLost: 0, bKilled: 0, alertAt: -99, nuked: false };
  });
  const NT = teams.length;
  const hostile = (a, b) => P[a].ti !== P[b].ti;
  const vis = [], explored = [], seen = [];
  for (let t = 0; t < NT; t++) { vis.push(new Uint8Array(N)); explored.push(new Uint8Array(N)); seen.push(new Set()); }
  snap.players.forEach((p, i) => { const e = unpackBits(p.explored, N), x = explored[P[i].ti]; for (let c = 0; c < N; c++) if (e[c]) x[c] = 1; });

  const Bs = [], Us = [], deadB = [], Ms = [];
  const mAt = new Int32Array(N).fill(-1);      // the minefield in a cell (index into Ms). Mines block nothing and nobody can aim at them.
  let ev = [], tick = 0, fieldVer = 1, uid = 1, anyDead = false;
  const docks = new Set();

  snap.players.forEach((p, pi) => {
    for (const b of p.buildings) {
      const d = D.buildings[b.t];
      if (d.mine) { const c = b.y * n + b.x; mAt[c] = Ms.length; Ms.push({ id: b.id, o: pi, x: b.x, y: b.y, c, dead: false }); continue; }
      const o = { id: b.id, o: pi, t: b.t, d, x: b.x, y: b.y, w: d.w, h: d.h, cx: b.x + d.w / 2, cy: b.y + d.h / 2, hp: b.hp, mhp: d.hp,
        cd: R() * 0.5, tgt: null, off: !!b.off, dead: false, isB: true, cls: d.wall ? 'wall' : 'bld', rad: Math.max(d.w, d.h) / 2,
        fx: 0, fy: 1, ax: 0, ay: 1, wp: d.weapon || null, shot: -99, hit: -99 };
      const bi = Bs.length; Bs.push(o);
      for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) { blk[y * n + x] = d.wall ? 3 : 2; bAt[y * n + x] = bi; }
      if (b.t === 'ref') { const [dx, dy] = dockOf(b); docks.add(dy * n + dx); o.dock = dy * n + dx; }
    }
  });
  // The home zone of every player: all cells within homeRange of one of the base's buildings. Units that stay home defend all of it.
  const zones = snap.players.map(() => new Uint8Array(N));
  for (const b of Bs) {
    if (b.cls === 'wall') continue;
    const z = zones[b.o], r = D.homeRange;
    for (let y = Math.max(0, b.y - r); y < Math.min(n, b.y + b.h + r); y++) for (let x = Math.max(0, b.x - r); x < Math.min(n, b.x + b.w + r); x++) z[y * n + x] = 1;
  }

  // Bridges are decks on water cells: passable while they stand. Neutral buildings block the way but are never targets.
  const brAt = new Int16Array(N).fill(-1);
  const Brs = (snap.bridges || []).map((b, i) => {
    const o = { id: b.id, i, x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2, cells: b.cells, a: b.a || 0, hp: b.hp, mhp: D.bridge.hp,
      dead: !(b.hp > 0), isB: true, br: true, cls: 'bld', o: -1, t: 'bridge', hit: -99 };
    for (const c of b.cells) { brAt[c] = i; if (!o.dead) blk[c] = 0; }
    return o;
  });
  const pidx = new Map(snap.players.map((p, i) => [p.id, i]));
  const Ns = (snap.neut || []).map((q, i) => {
    for (let y = q.y; y < q.y + 2; y++) for (let x = q.x; x < q.x + 2; x++) blk[y * n + x] = 2;
    return { id: q.id, i, t: q.t, d: D.neutral[q.t], x: q.x, y: q.y, w: 2, h: 2, cx: q.x + 1, cy: q.y + 1, o: pidx.has(q.o) ? pidx.get(q.o) : -1, cap: -99 };
  });

  const cellOf = (x, y) => (y | 0) * n + (x | 0);
  const inb = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const isFreeMuster = (x, y) => inb(x, y) && blk[y * n + x] === 0 && brAt[y * n + x] < 0 && mAt[y * n + x] < 0 && !docks.has(y * n + x);      // nobody musters on a bridge or a minefield

  function mkUnit(pi, t, x, y) {
    const d = D.units[t];
    const u = { id: uid++, o: pi, t, d, x, y, hp: d.hp, mhp: d.hp, cd: R() * 0.5, tgt: null, isB: false, cls: d.cls, rad: d.r,
      fx: 0, fy: 1, mode: 'guard', g: -1, pts: null, wi: 0, hx: x, hy: y, spd: d.speed, path: null, pi: 0, rp: 0, pt: null,
      ig: 0, igT: null, fb: false, dead: false, mv: false, aim: false, ax: 0, ay: 1, shot: -99, hit: -99, wp: d.weapon || null };
    if (d.air) { u.ammo = d.ammo; u.as = 0; u.alt = 0; u.landed = true; u.over = false; u.at = 0; }
    Us.push(u); return u;
  }

  snap.players.forEach((p, pi) => {
    const list = musterPositions(p.buildings, p.army, isFreeMuster);
    const units = list.map(m => mkUnit(pi, m.t, m.x, m.y)), gs = assignGroups(list, p.orders || []);
    (p.orders || []).forEach((o, oi) => {
      if (!o.pts || !o.pts.length) return;
      const mem = units.filter((u, k) => gs[k] === oi); let spd = 99;
      for (const u of mem) if (!u.d.air) spd = Math.min(spd, u.d.speed);
      const sg = bridgeAt(Brs, o.pts[o.pts.length - 1]);      // a target on a standing bridge: the group is there to bring it down
      for (const u of mem) { u.g = oi; u.mode = 'move'; u.pts = o.pts; u.wi = 0; u.sg = sg && !sg.dead ? sg : null; if (!u.d.air) u.spd = spd; }
    });
    // harvesters start at the refinery gates
    const refs = Bs.filter(b => b.o === pi && b.t === 'ref' && !b.off);
    for (let k = 0; k < (p.harv | 0) && refs.length; k++) {
      const r = refs[k % refs.length], c = r.dock;
      const u = mkUnit(pi, 'harv', (c % n) + 0.5 + ((k / refs.length) | 0) * 0.25, ((c / n) | 0) + 0.5);
      u.mode = 'harv'; u.hs = 0; u.load = 0; u.ht = 0; u.oc = -1; u.ref = r; u.wait = k * 0.4;
    }
  });

  // ---------- path finding ----------
  const wallOwnerHostile = (c, ti) => { const b = Bs[bAt[c]]; return b && P[b.o].ti !== ti; };
  // cost to enter a cell for a team, or -1 if it cannot be entered. Enemy walls can be breached.
  const passT = (c, ti) => blk[c] === 0 ? 1 : (blk[c] === 3 && ti >= 0 && wallOwnerHostile(c, ti)) ? 26 : -1;
  const diagOk = (x, y, k) => k < 4 || (blk[y * n + x + DX[k]] === 0 && blk[(y + DY[k]) * n + x] === 0);

  const gS = new Float32Array(N), st = new Int32Array(N), cl = new Int32Array(N), par = new Int32Array(N);
  let stampN = 0;
  const rectDist = (px, py, r) => {
    const dx = px < r.x ? r.x - px : px > r.x + r.w ? px - r.x - r.w : 0, dy = py < r.y ? r.y - py : py > r.y + r.h ? py - r.y - r.h : 0;
    return Math.sqrt(dx * dx + dy * dy);
  };
  // A* to within `reach` of a rectangle (a point is a rectangle of size 0). Returns a list of cells, or null.
  function astar(sx, sy, goal, reach, ti, budget) {
    const sc = cellOf(sx, sy), heap = new Heap(); stampN++;
    const h = c => Math.max(0, rectDist((c % n) + 0.5, ((c / n) | 0) + 0.5, goal) - reach);
    gS[sc] = 0; st[sc] = stampN; par[sc] = -1; heap.push(h(sc), sc);
    let best = sc, bestH = h(sc), nodes = 0, found = -1;
    while (heap.size && nodes++ < budget) {
      const c = heap.pop(); if (cl[c] === stampN) continue; cl[c] = stampN;
      const hc = h(c); if (hc <= 0) { found = c; break; }
      if (hc < bestH) { bestH = hc; best = c; }
      const x = c % n, y = (c / n) | 0;
      for (let k = 0; k < 8; k++) {
        const X = x + DX[k], Y = y + DY[k]; if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const nc = Y * n + X, cost = passT(nc, ti); if (cost < 0 || cl[nc] === stampN || !diagOk(x, y, k)) continue;
        const ng = gS[c] + cost * (k < 4 ? 1 : SQ2);
        if (st[nc] !== stampN || ng < gS[nc]) { gS[nc] = ng; st[nc] = stampN; par[nc] = c; heap.push(ng + h(nc), nc); }
      }
    }
    if (found < 0) { if (best === sc) return null; found = best; }
    const path = []; for (let c = found; c !== sc && c >= 0; c = par[c]) path.push(c);
    path.reverse(); return path;
  }

  // Distance fields: one Dijkstra shared by everybody walking to the same place.
  const fields = new Map();
  function field(key, ti, sources) {
    let f = fields.get(key);
    const time = tick * dt;
    if (f && (f.ver === fieldVer || time - f.at < 0.6)) return f.d;
    if (!f) { f = { d: new Float32Array(N) }; fields.set(key, f); }
    f.ver = fieldVer; f.at = time;
    const d = f.d, heap = new Heap(); d.fill(1e9);
    for (const c of sources()) if (d[c] > 0) { d[c] = 0; heap.push(0, c); }
    while (heap.size) {
      const c = heap.pop(), dc = d[c], x = c % n, y = (c / n) | 0;
      for (let k = 0; k < 8; k++) {
        const X = x + DX[k], Y = y + DY[k]; if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const nc = Y * n + X;
        // cost of leaving nc towards c is the cost of entering c
        const cost = passT(c, ti); if (cost < 0 || passT(nc, ti) < 0) continue;
        if (k >= 4 && (blk[y * n + X] !== 0 || blk[Y * n + x] !== 0)) continue;
        const nd = dc + cost * (k < 4 ? 1 : SQ2);
        if (nd < d[nc]) { d[nc] = nd; heap.push(nd, nc); }
      }
    }
    return d;
  }
  const pointField = (ti, x, y) => field(ti + '|' + x + ',' + y, ti, () => {
    // nearest free cell to the requested point
    for (let r = 0; r < 12; r++) for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!inb(xx, yy) || Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
      if (blk[yy * n + xx] === 0) return [yy * n + xx];
    }
    return [];
  });
  const huntField = ti => field(ti + '|hunt', ti, () => {
    const src = [];
    for (const b of Bs) {
      if (b.dead || b.cls === 'wall' || P[b.o].ti === ti) continue;
      for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
        if (inb(x, y) && passT(y * n + x, ti) > 0) src.push(y * n + x);
      }
    }
    return src;
  });

  // ---------- movement ----------
  function moveTo(e, tx, ty, spd) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.12) return true;
    const s = spd * dt; e.fx = dx / d; e.fy = dy / d; e.mv = true;
    if (d <= s) { e.x = tx; e.y = ty; return true; }
    e.x += e.fx * s; e.y += e.fy * s; return false;
  }
  function hitsWall(e, c) {
    if (blk[c] !== 3) return false;
    const w = Bs[bAt[c]];
    if (w && !w.dead && hostile(e.o, w.o) && e.wp && !(e.wp.minRange > 1)) { e.tgt = w; e.fb = true; }
    return true;
  }
  function followPath(e, spd) {
    const p = e.path; if (!p || e.pi >= p.length) return false;
    const c = p[e.pi];
    if (blk[c] === 3) { hitsWall(e, c); return true; }
    if (blk[c] !== 0) { e.path = null; return false; }
    if (moveTo(e, (c % n) + 0.5, ((c / n) | 0) + 0.5, spd)) e.pi++;
    return true;
  }
  function followField(e, F, spd) {
    const c = cellOf(e.x, e.y), x = c % n, y = (c / n) | 0;
    let bd = F[c], bc = -1; if (bd >= 1e9) return false;
    for (let k = 0; k < 8; k++) {
      const X = x + DX[k], Y = y + DY[k]; if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const nc = Y * n + X; if (F[nc] >= bd) continue;
      if (k >= 4 && (blk[y * n + X] !== 0 || blk[Y * n + x] !== 0)) continue;
      bd = F[nc]; bc = nc;
    }
    if (bc < 0) return false;
    if (blk[bc] === 3) { hitsWall(e, bc); return true; }
    moveTo(e, (bc % n) + 0.5, ((bc / n) | 0) + 0.5, spd);
    return true;
  }
  function pathTo(e, goal, reach, budget, tag) {
    e.rp -= dt;
    if (!e.path || e.rp <= 0 || e.pt !== tag) {
      e.path = astar(e.x, e.y, goal, reach, P[e.o].ti, budget);
      e.pi = 0; e.rp = 1.2 + R() * 0.6; e.pt = tag;
      if (!e.path) return false;
    }
    if (e.pi >= e.path.length) return true;
    if (!followPath(e, e.spd)) e.path = null;
    return true;
  }

  // ---------- combat ----------
  const tx = t => t.isB ? t.cx : t.x, ty = t => t.isB ? t.cy : t.y;
  const distTo = (e, t) => t.isB ? rectDist(tx(e), ty(e), t) : Math.sqrt((t.x - tx(e)) * (t.x - tx(e)) + (t.y - ty(e)) * (t.y - ty(e)));

  // zone: the home zone of a unit on guard; an enemy inside it is a target however far it is from the unit's post
  function acquire(e, wp, maxR, ax, ay, zone = null) {
    let best = null, bs = 1e9; const ex = tx(e), ey = ty(e), w = wp.w, m2 = maxR * maxR, min = wp.minRange || 0;
    for (const u of Us) {
      if (u.dead || P[u.o].ti === P[e.o].ti || u === e.igT) continue;
      const dx = u.x - ax, dy = u.y - ay; if (dx * dx + dy * dy > m2 && !(zone && zone[cellOf(u.x, u.y)])) continue;
      const m = dmgMult(w, u.cls); if (m <= 0) continue;
      const d = Math.sqrt((u.x - ex) * (u.x - ex) + (u.y - ey) * (u.y - ey));
      let s = d / (0.25 + m) + (u.wp ? 0 : 2); if (d < min) s += 40;
      if (s < bs) { bs = s; best = u; }
    }
    const mb = dmgMult(w, 'bld');
    if (mb > 0) for (const b of Bs) {
      if (b.dead || b.cls === 'wall' || P[b.o].ti === P[e.o].ti || b === e.igT) continue;
      if (rectDist(ax, ay, b) > maxR) continue;
      const d = rectDist(ex, ey, b);
      let s = d / (0.25 + mb) + (b.wp && !b.off ? 0.5 : 3); if (d < min) s += 40;
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }

  function hurt(src, t, amount) {
    if (t.dead || amount <= 0) return;
    t.hp -= amount; t.hit = tick;
    if (t.br) {          // a bridge: when it falls the deck is water again, and whoever stands on it goes down with it
      if (t.hp > 0) return;
      t.dead = true; t.hp = 0; fieldVer++;
      for (const c of t.cells) blk[c] = 1;
      ev.push({ k: 'brd', i: t.i, o: src.o, x: t.cx, y: t.cy });
      for (const u of Us) {
        if (u.dead || u.d.air || brAt[cellOf(u.x, u.y)] !== t.i) continue;
        u.dead = true; u.hp = 0; anyDead = true;
        P[u.o].lost[u.t] = (P[u.o].lost[u.t] || 0) + 1;
        if (u.mode === 'harv' && u.oc >= 0) claim[u.oc] = Math.max(0, claim[u.oc] - 1);
        ev.push({ k: 'ud', o: u.o, t: u.t, x: u.x, y: u.y, c: u.cls, wet: 1 });
      }
      return;
    }
    const time = tick * dt, tp = P[t.o];
    if ((t.isB || t.d.harv) && time - tp.alertAt > 12) { tp.alertAt = time; ev.push({ k: 'a', o: t.o, x: tx(t), y: ty(t), h: t.isB ? 0 : 1 }); }
    if (t.hp > 0) return;
    t.dead = true; t.hp = 0; anyDead = true;
    if (t.isB) {
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) { blk[y * n + x] = 0; bAt[y * n + x] = -1; }
      fieldVer++; deadB.push(t.id);
      if (t.cls !== 'wall') { tp.bLost++; P[src.o].bKilled++; }
      P[src.o].killed += Math.round(t.d.cost * 0.5);
      ev.push({ k: 'bd', o: t.o, t: t.t, x: t.cx, y: t.cy, w: t.w, h: t.h });
    } else {
      tp.lost[t.t] = (tp.lost[t.t] || 0) + 1;
      P[src.o].killed += t.d.cost;
      if (t.mode === 'harv' && t.oc >= 0) claim[t.oc] = Math.max(0, claim[t.oc] - 1);
      ev.push({ k: 'ud', o: t.o, t: t.t, x: t.x, y: t.y, c: t.cls });
    }
  }
  function fire(e, t, wp) {
    e.cd = wp.cd * (0.94 + R() * 0.12); e.shot = tick;
    const x2 = tx(t), y2 = ty(t), x1 = tx(e), y1 = ty(e), dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1;
    e.ax = dx / d; e.ay = dy / d;
    ev.push({ k: 's', w: wp.w, t: e.t, b: e.isB ? 1 : 0, x1, y1, x2, y2, sp: wp.splash || 0, a1: e.alt || 0, a2: t.alt || 0 });
    hurt(e, t, wp.dmg * dmgMult(wp.w, t.cls));
    if (wp.splash) {
      const s2 = wp.splash * wp.splash;
      const up = t.cls === 'air';
      for (const u of Us) if (!u.dead && u !== t && (u.cls === 'air') === up && hostile(e.o, u.o) && (u.x - x2) * (u.x - x2) + (u.y - y2) * (u.y - y2) <= s2) hurt(e, u, wp.dmg * 0.5 * dmgMult(wp.w, u.cls));
      if (!up) for (const b of Bs) if (!b.dead && b !== t && hostile(e.o, b.o) && rectDist(x2, y2, b) <= wp.splash * 0.7) hurt(e, b, wp.dmg * 0.5 * dmgMult(wp.w, b.cls));
    }
  }

  function stepBuilding(b) {
    const wp = b.wp; if (!wp || b.off || peace) return;
    b.cd -= dt;
    if (b.tgt && (b.tgt.dead || distTo(b, b.tgt) > wp.range)) b.tgt = null;
    if (!b.tgt && (tick + b.id) % 3 === 0) b.tgt = acquire(b, wp, wp.range, b.cx, b.cy);
    if (b.tgt && b.cd <= 0) fire(b, b.tgt, wp);
  }

  function stepUnit(e) {
    e.mv = false; e.aim = false;
    if (e.mode === 'harv') return stepHarv(e);
    if (e.d.air) return stepAir(e);
    if (!e.wp) return stepEng(e);
    const wp = e.wp; e.cd -= dt; if (e.ig > 0) { e.ig -= dt; if (e.ig <= 0) e.igT = null; }
    let t = e.tgt; if (t && t.dead) { t = e.tgt = null; e.fb = false; e.path = null; }
    const guard = e.mode === 'guard';
    if (!peace && (tick + e.id) % 4 === 0 && (!t || (!e.fb && (tick + e.id) % 12 === 0))) {
      const c = guard ? acquire(e, wp, D.guardRange, e.hx, e.hy, zones[e.o]) : acquire(e, wp, wp.range + 2.5, e.x, e.y);
      if (c && c !== t) { e.tgt = t = c; e.fb = false; e.path = null; }
      else if (!c && t && !e.fb && !t.br) { t = e.tgt = null; e.path = null; }
    }
    if (t) {
      const d = distTo(e, t), min = wp.minRange || 0;
      if (d <= wp.range && d >= min) { e.aim = true; if (e.cd <= 0) fire(e, t, wp); else { const dx = tx(t) - e.x, dy = ty(t) - e.y, l = Math.sqrt(dx * dx + dy * dy) || 1; e.ax = dx / l; e.ay = dy / l; } return; }
      if (d < min) { e.tgt = null; e.fb = false; }
      else if (e.fb) { e.tgt = null; e.fb = false; }   // wall out of reach: walk on
      else {
        const goal = t.isB ? t : { x: t.x, y: t.y, w: 0, h: 0 };
        if (pathTo(e, goal, Math.max(0.7, wp.range - 0.6), 700, t)) return;
        e.igT = t; e.ig = 3; e.tgt = null; e.path = null;
      }
    }
    if (guard) {
      const dx = e.hx - e.x, dy = e.hy - e.y;
      if (dx * dx + dy * dy > 0.2) pathTo(e, { x: e.hx, y: e.hy, w: 0, h: 0 }, 0.2, 900, 'home');
      return;
    }
    const ti = P[e.o].ti;
    if (e.mode === 'move') {
      const p = e.pts[e.wi], F = pointField(ti, p[0], p[1]), c = cellOf(e.x, e.y), sg = e.sg && !e.sg.dead ? e.sg : null;
      // on the way to a bridge that is to be brought down: stop as soon as it is in range, not on the deck
      const there = sg && e.wi === e.pts.length - 1 && rectDist(e.x, e.y, sg) <= Math.max(1.2, wp.range - 0.5);
      if (there || F[c] <= 2.5 || F[c] >= 1e9) { e.wi = there ? e.pts.length : e.wi + 1; if (e.wi >= e.pts.length) e.mode = sg ? 'siege' : 'hunt'; return; }
      followField(e, F, e.spd);
      return;
    }
    if (e.mode === 'siege') {
      if (e.sg.dead) e.mode = 'hunt';
      else if (!peace && e.igT !== e.sg) { e.tgt = e.sg; e.fb = false; }      // from the next step the target code above walks into range and fires
      return;
    }
    // hunt: walk to the nearest enemy building, if one is reasonably near
    const F = huntField(ti), c = cellOf(e.x, e.y);
    if (F[c] < 34 && F[c] > 0.5) followField(e, F, e.spd);
  }

  // ---------- engineers and neutral buildings ----------
  // An engineer follows his group and then walks into the nearest neutral building near the group's target
  // that his team does not hold. He stays inside: the building changes hands and he is gone (not counted as a loss).
  function stepEng(e) {
    if (e.mode === 'guard') {
      const dx = e.hx - e.x, dy = e.hy - e.y;
      if (dx * dx + dy * dy > 0.2) pathTo(e, { x: e.hx, y: e.hy, w: 0, h: 0 }, 0.2, 900, 'home');
      return;
    }
    const ti = P[e.o].ti;
    if (e.mode === 'move') {
      const p = e.pts[e.wi], F = pointField(ti, p[0], p[1]), c = cellOf(e.x, e.y);
      if (F[c] <= 2.5 || F[c] >= 1e9) { e.wi++; if (e.wi >= e.pts.length) e.mode = 'cap'; return; }
      followField(e, F, e.spd);
      return;
    }
    let nb = e.nb;
    if (!nb || (nb.o >= 0 && P[nb.o].ti === ti)) {
      if ((tick + e.id) % 5 !== 0) return;
      const p = e.pts[e.pts.length - 1]; let bs = D.capRange * D.capRange; nb = null;
      for (const q of Ns) {
        if (q.o >= 0 && P[q.o].ti === ti) continue;
        const d2 = (q.cx - p[0] - 0.5) * (q.cx - p[0] - 0.5) + (q.cy - p[1] - 0.5) * (q.cy - p[1] - 0.5);
        if (d2 <= bs) { bs = d2; nb = q; }
      }
      e.nb = nb; e.path = null;
      if (!nb) return;
    }
    if (rectDist(e.x, e.y, nb) <= 0.75) {
      nb.o = e.o; nb.cap = tick;
      e.dead = true; anyDead = true; P[e.o].used[e.t] = (P[e.o].used[e.t] || 0) + 1;
      ev.push({ k: 'cap', o: e.o, i: nb.i, t: nb.t, x: nb.cx, y: nb.cy });
      return;
    }
    pathTo(e, nb, 0.6, 900, nb);
  }
  // A field workshop mends the units of its owner's team that are close by.
  function workshops() {
    for (const q of Ns) {
      if (q.o < 0 || !q.d.heal) continue;
      const ti = P[q.o].ti, r2 = q.d.range * q.d.range;
      for (const u of Us) {
        if (u.dead || u.d.air || u.hp >= u.mhp || P[u.o].ti !== ti) continue;
        if ((u.x - q.cx) * (u.x - q.cx) + (u.y - q.cy) * (u.y - q.cy) > r2) continue;
        u.hp = Math.min(u.mhp, u.hp + u.mhp * q.d.heal);
        ev.push({ k: 'hl', x: u.x, y: u.y });
      }
    }
  }

  // ---------- minefields and the A-bomb ----------
  // A minefield goes off once, under the first hostile unit on the ground that enters its cell, and hits every hostile ground unit close by.
  function blow(m) {
    const bm = D.buildings.mine.boom, x = m.x + 0.5, y = m.y + 0.5, s2 = bm.splash * bm.splash;
    m.dead = true; mAt[m.c] = -1; deadB.push(m.id);
    ev.push({ k: 'mn', o: m.o, x, y });
    for (const u of Us) if (!u.dead && !u.d.air && hostile(m.o, u.o) && (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= s2) hurt(m, u, bm.dmg * dmgMult(bm.w, u.cls));
  }
  function stepMines() {
    for (const u of Us) {
      if (u.dead || u.d.air) continue;
      const k = mAt[cellOf(u.x, u.y)];
      if (k >= 0 && hostile(u.o, Ms[k].o)) blow(Ms[k]);
    }
  }
  // The bomb leaves the silo early in the battle, aimed at the densest cluster of the target's buildings, and lands a few seconds
  // later: everything hostile in the inner part of the blast is destroyed, the rest of the blast takes heavy damage.
  // The owner's side sees the place for a while afterwards.
  const flares = [];
  const nukes = peace ? [] : snap.players.map((p, pi) => p.nuke && pidx.has(p.nuke.to) ? { o: pi, to: pidx.get(p.nuke.to), st: 0 } : null).filter(Boolean);
  function stepNukes() {
    const NK = D.nuke;
    for (const k of nukes) {
      if (k.st === 0 && tick >= Math.round(NK.launch / dt)) {
        const silo = Bs.find(b => b.o === k.o && b.t === 'silo' && !b.dead && !b.off);
        // the aim: the middle of the building with the most of the target's base around it (a building counts when any part of it is in reach)
        let best = null, bv = -1;
        if (silo) for (const c of Bs) {
          if (c.dead || c.o !== k.to || c.cls === 'wall') continue;
          let v = 0; for (const e of Bs) if (!e.dead && e.o === k.to && e.cls !== 'wall' && rectDist(c.cx, c.cy, e) <= NK.r) v += e.mhp;
          if (v > bv) { bv = v; best = c; }
        }
        if (!best) { k.st = 2; continue; }      // no silo or nothing to aim at: the bomb stays where it is
        k.st = 1; k.x = best.cx; k.y = best.cy; P[k.o].nuked = true;
        ev.push({ k: 'nl', o: k.o, to: k.to, x: silo.cx, y: silo.cy, tx: k.x, ty: k.y });
      } else if (k.st === 1 && tick >= Math.round(NK.hit / dt)) {
        k.st = 2;
        const core = NK.r * NK.core, x = k.x, y = k.y, src = { o: k.o };
        ev.push({ k: 'nk', o: k.o, to: k.to, x, y, r: NK.r });
        flares.push({ ti: P[k.o].ti, x, y, r: NK.r + 2, until: tick + 200 });
        const hit = (t, d) => { if (d <= core) hurt(src, t, t.hp + 1); else if (d <= NK.r) hurt(src, t, t.mhp * NK.edge); };
        for (const b of Bs) if (!b.dead && hostile(k.o, b.o)) hit(b, rectDist(x, y, b));
        for (const u of Us) if (!u.dead && hostile(k.o, u.o)) hit(u, Math.sqrt((u.x - x) * (u.x - x) + (u.y - y) * (u.y - y)));
        for (const m of Ms) if (!m.dead && hostile(k.o, m.o) && rectDist(x, y, { x: m.x, y: m.y, w: 1, h: 1 }) <= core) { m.dead = true; mAt[m.c] = -1; deadB.push(m.id); }
      }
    }
  }

  // ---------- aircraft ----------
  // as: 0 flying a mission or on call, 1 returning to the airfield, 2 re-arming on the pad, 3 parked for the rest of the round
  function stepAir(e) {
    const d = e.d, wp = e.wp; e.cd -= dt;
    const up = !(e.as >= 2 || e.landed);
    e.alt = up ? Math.min(1, e.alt + dt * 1.1) : Math.max(0, e.alt - dt * 1.1);
    if (e.as === 3) return;
    if (e.as === 2) { e.at -= dt; if (e.at <= 0) { e.ammo = d.ammo; e.as = e.over ? 3 : 0; e.landed = true; } return; }
    if (e.as === 1) { if (moveTo(e, e.hx, e.hy, d.speed)) { e.as = 2; e.at = d.rearm; } return; }
    let t = e.tgt; if (t && t.dead) t = e.tgt = null;
    if (!peace && !t && (tick + e.id) % 4 === 0) t = e.tgt = e.mode === 'guard' ? acquire(e, wp, D.guardRange, e.hx, e.hy, zones[e.o]) : acquire(e, wp, wp.range + 4, e.x, e.y);
    if (t) {
      e.landed = false;
      if (distTo(e, t) <= wp.range && e.alt > 0.6) {
        e.aim = true;
        if (e.cd <= 0) { fire(e, t, wp); if (--e.ammo <= 0) { e.as = 1; e.tgt = null; return; } }
        if (d.hover) return;
      }
      moveTo(e, tx(t), ty(t), d.speed); return;
    }
    if (e.mode === 'guard') {
      const dx = e.hx - e.x, dy = e.hy - e.y;
      if (dx * dx + dy * dy > 0.05) e.as = 1; else e.landed = true;
      return;
    }
    e.landed = false;
    if (e.wi < e.pts.length) { const p = e.pts[e.wi]; if (moveTo(e, p[0] + 0.5, p[1] + 0.5, d.speed)) e.wi++; return; }
    if (peace) { e.over = true; e.as = 1; return; }
    if ((tick + e.id) % 6 !== 0) return;
    if (e.sg && !e.sg.dead && dmgMult(wp.w, 'bld') > 0) { e.tgt = e.sg; return; }      // sent to bring down a bridge
    // over the target area: go for the nearest enemy building around it, or call it a day
    const p = e.pts[e.pts.length - 1]; let best = null, bs = 26 * 26;
    if (dmgMult(wp.w, 'bld') > 0) for (const b of Bs) {
      if (b.dead || b.cls === 'wall' || P[b.o].ti === P[e.o].ti) continue;
      const q = (b.cx - p[0]) * (b.cx - p[0]) + (b.cy - p[1]) * (b.cy - p[1]); if (q < bs) { bs = q; best = b; }
    }
    if (best) e.tgt = best; else { e.over = true; e.as = 1; }
  }

  // ---------- harvesting ----------
  const claim = new Uint8Array(N), oreBad = new Uint8Array(N);
  function nearestRef(e) {
    let best = null, bs = 1e9;
    for (const b of Bs) if (!b.dead && !b.off && b.t === 'ref' && b.o === e.o) { const d = (b.cx - e.x) * (b.cx - e.x) + (b.cy - e.y) * (b.cy - e.y); if (d < bs) { bs = d; best = b; } }
    return best;
  }
  function pickOre(e, r = 22) {
    const ref = e.ref && !e.ref.dead ? e.ref : nearestRef(e), ax = ref ? ref.cx : e.x, ay = ref ? ref.cy : e.y;
    let best = -1, bs = 1e9;
    for (let y = Math.max(0, (ay - r) | 0); y <= Math.min(n - 1, (ay + r) | 0); y++) for (let x = Math.max(0, (ax - r) | 0); x <= Math.min(n - 1, (ax + r) | 0); x++) {
      const c = y * n + x; if (!ore[c] || blk[c] || oreBad[c]) continue;
      const s = Math.sqrt((x - ax) * (x - ax) + (y - ay) * (y - ay)) + 0.6 * Math.sqrt((x - e.x) * (x - e.x) + (y - e.y) * (y - e.y)) + claim[c] * 5;
      if (s < bs) { bs = s; best = c; }
    }
    return best < 0 && r < n ? pickOre(e, n) : best;   // nothing near home: look across the whole map
  }
  function stepHarv(e) {
    if (e.wait > 0) { e.wait -= dt; return; }
    const ti = P[e.o].ti;
    if (e.hs === 0) {
      const c = pickOre(e); if (c < 0) { e.wait = 3; return; }
      const p = astar(e.x, e.y, { x: (c % n) + 0.5, y: ((c / n) | 0) + 0.5, w: 0, h: 0 }, 0.3, -1, 5000);
      const last = p && p.length ? p[p.length - 1] : cellOf(e.x, e.y);
      if (!p || last !== c) { oreBad[c] = 1; e.wait = 0.3; return; }
      e.path = p; e.pi = 0; e.oc = c; claim[c]++; e.hs = 1;
    } else if (e.hs === 1) {
      if (!ore[e.oc]) { claim[e.oc] = Math.max(0, claim[e.oc] - 1); e.oc = -1; e.hs = 0; return; }
      if (e.pi >= e.path.length) { e.hs = 2; e.ht = 0; return; }
      if (!followPath(e, e.spd)) { claim[e.oc] = Math.max(0, claim[e.oc] - 1); e.oc = -1; e.hs = 0; }
    } else if (e.hs === 2) {
      e.ht += dt;
      if (e.ht >= 1 / OD.rate) {
        e.ht = 0;
        if (ore[e.oc] > 0) { ore[e.oc]--; e.load++; }
        if (!ore[e.oc] || e.load >= OD.cap) { claim[e.oc] = Math.max(0, claim[e.oc] - 1); e.oc = -1; e.hs = e.load >= OD.cap ? 3 : 0; e.path = null; }
      }
    } else if (e.hs === 3) {
      const ref = nearestRef(e); if (!ref) { e.wait = 3; return; }
      if (!e.path || e.ref !== ref) {
        e.ref = ref; const c = ref.dock;
        e.path = astar(e.x, e.y, { x: (c % n) + 0.5, y: ((c / n) | 0) + 0.5, w: 0, h: 0 }, 0.3, -1, 5000); e.pi = 0;
        if (!e.path) { e.wait = 2; return; }
      }
      if (e.pi >= e.path.length) { e.hs = 4; e.ht = 0; e.path = null; e.fx = 0; e.fy = -1; return; }
      if (!followPath(e, e.spd)) e.path = null;
    } else {
      e.ht += dt;
      if (e.ht >= OD.unload) { const v = e.load * OD.value; P[e.o].income += v; ev.push({ k: 'c', o: e.o, x: e.x, y: e.y, v }); e.load = 0; e.hs = 0; }
    }
  }

  function separate() {
    const L = Us.length;
    for (let i = 0; i < L; i++) {
      const a = Us[i]; if (a.dead) continue;
      for (let j = i + 1; j < L; j++) {
        const b = Us[j]; if (b.dead || !a.d.air !== !b.d.air) continue;
        const r = a.rad + b.rad, dx = b.x - a.x; if (dx > r || dx < -r) continue;
        const dy = b.y - a.y; if (dy > r || dy < -r) continue;
        const d2 = dx * dx + dy * dy; if (d2 >= r * r) continue;
        let d = Math.sqrt(d2), ux, uy;
        if (d < 0.01) { ux = ((a.id * 7 + b.id * 3) % 5 - 2) / 3 || 0.5; uy = ((a.id * 5 + b.id) % 5 - 2) / 3 || -0.5; d = 0.01; } else { ux = dx / d; uy = dy / d; }
        const push = (r - d) * 0.5, wa = a.d.harv ? 0.15 : a.mv ? 1 : 0.6, wb = b.d.harv ? 0.15 : b.mv ? 1 : 0.6, ws = wa + wb || 1;
        nudge(a, -ux * push * 2 * wa / ws, -uy * push * 2 * wa / ws);
        nudge(b, ux * push * 2 * wb / ws, uy * push * 2 * wb / ws);
      }
    }
  }
  function nudge(e, dx, dy) {
    const nx = e.x + dx, ny = e.y + dy;
    if (nx < 0.3 || ny < 0.3 || nx > n - 0.3 || ny > n - 0.3) return;
    if (e.d.air) { if (e.alt > 0.5) { e.x = nx; e.y = ny; } return; }
    if (blk[cellOf(nx, ny)] === 0) { e.x = nx; e.y = ny; }
    else if (blk[cellOf(nx, e.y)] === 0) e.x = nx;
    else if (blk[cellOf(e.x, ny)] === 0) e.y = ny;
  }

  function vision() {
    for (let t = 0; t < NT; t++) vis[t].fill(0);
    for (const b of Bs) if (!b.dead) stamp(vis[P[b.o].ti], n, b.cx, b.cy, b.d.sight + (b.w > 2 ? 1 : 0));
    for (const u of Us) if (!u.dead) stamp(vis[P[u.o].ti], n, u.x, u.y, u.d.sight);
    for (const q of Ns) if (q.o >= 0) stamp(vis[P[q.o].ti], n, q.cx, q.cy, q.d.sight);
    for (const f of flares) if (tick <= f.until) stamp(vis[f.ti], n, f.x, f.y, f.r);
    for (let t = 0; t < NT; t++) { const v = vis[t], e = explored[t]; for (let c = 0; c < N; c++) if (v[c]) e[c] = 1; }
    for (const b of Bs) {
      if (b.dead) continue;
      const c = cellOf(b.cx, b.cy);
      for (let t = 0; t < NT; t++) if (t !== P[b.o].ti && vis[t][c]) seen[t].add(b.id);
    }
  }
  vision();

  const sim = {
    n, Bs, Us, P, Brs, Ns, Ms, ore, blk, vis, explored, seen, teams, duration, peace,
    get ev() { return ev; }, get tick() { return tick; }, get time() { return tick * dt; },
    get done() { return tick * dt >= duration; },
    teamIndex: pi => P[pi].ti,
    step() {
      ev = []; tick++;
      for (const b of Bs) if (!b.dead) stepBuilding(b);
      for (const u of Us) if (!u.dead) stepUnit(u);
      separate();
      if (Ms.length && !peace) stepMines();
      if (nukes.length) stepNukes();
      if (tick % 10 === 0) workshops();
      if (anyDead) { anyDead = false; for (let i = Us.length - 1; i >= 0; i--) if (Us[i].dead) Us.splice(i, 1); }
      if (tick % 5 === 0) vision();
    },
    run() { while (!sim.done) sim.step(); return sim.result(); },
    result() {
      for (const u of Us) if (!u.dead && u.mode === 'harv' && u.load) { P[u.o].income += u.load * OD.value; u.load = 0; }
      const hp = {}; for (const b of Bs) if (!b.dead) hp[b.id] = Math.max(1, Math.round(b.hp));
      return {
        hp, dead: deadB.slice(), ore: oreToStr(ore),
        bridges: Brs.map(b => b.dead ? 0 : Math.max(1, Math.round(b.hp))),      // in the order of the snapshot
        neut: Ns.map(q => q.o >= 0 ? P[q.o].id : 0),
        players: P.map(p => ({ id: p.id, income: p.income, lost: p.lost, used: p.used, killed: p.killed, bLost: p.bLost, bKilled: p.bKilled, nuked: p.nuked,
          explored: packBits(explored[p.ti]), seen: [...seen[p.ti]] })),
      };
    },
  };
  return sim;
}
