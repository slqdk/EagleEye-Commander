// EagleEye Commander — cartoon sprite factory.
// Every building and vehicle is put together from chunky boxes, cylinders and tubes and drawn in the classic
// slanted 90s strategy-game view. Each part gets a dark outline and cel shading; at high detail it also gets
// a material (brick courses, wall panels, corrugated roofs, rivets, track links ...), soft shading and a
// small drop shadow. Sprites are rendered once per (model, direction, team colour, frame, damage) and cached.
import { DEFS } from '../shared/defs.js';
import { mulberry32, hashStr } from '../shared/util.js';

export const KZ = 0.78;            // one cell of height moves this many cells up the screen
const LIGHT = [-0.42, 0.36, 0.84];
const D = [0, KZ, 1];              // towards the viewer
// detail: 'high' | 'low'   palette: 'cartoon' | 'military'   outline: 'thick' | 'thin'
export const STYLE = { detail: 'high', palette: 'military', outline: 'thick' };
export let OUT = '#1e1b18';
// Finished sprites, least recently used first. The total is capped, so a long match with many colours cannot eat the memory.
const cache = new Map();
let cachePx = 0;
const CACHE_MAX = (typeof navigator !== 'undefined' && (navigator.deviceMemory || 8) <= 4) || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ? 26e6 : 52e6;
const pxOf = s => s.cv.width * s.cv.height + (s.sh ? s.sh.cv.width * s.sh.cv.height : 0);
export function setStyle(s) {
  let changed = false;
  for (const k in s) if (k in STYLE && STYLE[k] !== s[k]) { STYLE[k] = s[k]; changed = true; }
  OUT = STYLE.palette === 'military' ? '#1e1b18' : '#1c1d26';
  if (changed) { cache.clear(); cachePx = 0; }
  return changed;
}

const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = (r, g, b) => '#' + ((1 << 24) | (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)))).toString(16).slice(1);
export function shade(h, k) {
  let [r, g, b] = rgb(h);
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return hex(r, g, b);
}
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const dusty = (h, t) => { const [r, g, b] = rgb(h), l = r * 0.3 + g * 0.59 + b * 0.11; return hex(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- the kit: collects the parts of one model. Coordinates are in cells: x east, y south, z up. ----------
// Face kinds: 'side' = [bottom-left, bottom-right, top-right, top-left] (on rods and tubes "up" runs along the beam),
// 'top' / 'end' = a flat lid, 'cap' = a round lid.
class Kit {
  constructor(angle, c, f, veh) { this.ca = Math.cos(angle); this.sa = Math.sin(angle); this.parts = []; this.c = c; this.f = f; this.veh = veh; this.hi = STYLE.detail === 'high'; }
  _part(faces, col, o = {}) {
    const ca = this.ca, sa = this.sa, fs = [], bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    let cx = 0, cy = 0, cz = 0, cnt = 0;
    for (const f of faces) {
      const p = f.p.map(q => [q[0] * ca - q[1] * sa, q[0] * sa + q[1] * ca, q[2]]);
      for (const q of p) { cx += q[0]; cy += q[1]; cz += q[2]; cnt++; for (let i = 0; i < 3; i++) { if (q[i] < bb[i]) bb[i] = q[i]; if (q[i] > bb[i + 3]) bb[i + 3] = q[i]; } }
      fs.push({ p, k: f.k });
    }
    cx /= cnt; cy /= cnt; cz /= cnt;
    const keep = [];
    fs.forEach((f, i) => {
      const p = f.p; let n = [0, 0, 0];   // Newell's method copes with any polygon
      for (let j = 0; j < p.length; j++) { const a = p[j], b = p[(j + 1) % p.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
      if (len(n) < 1e-7) return;
      n = norm(n);
      let fx = 0, fy = 0, fz = 0; for (const q of p) { fx += q[0]; fy += q[1]; fz += q[2]; }
      const m = p.length;
      if (dot(n, [fx / m - cx, fy / m - cy, fz / m - cz]) < 0) n = [-n[0], -n[1], -n[2]];
      f.n = n; f.i = i; keep.push(f);
    });
    const key = this.c._key.get(col), m = MAT[key];
    const part = {
      faces: keep, col, mat: o.mat !== undefined ? o.mat : Array.isArray(m) ? m[this.f === 'P' ? 1 : 0] : m || null,
      smooth: !!o.smooth, glow: !!o.glow, ol: o.ol ?? 1, ao: o.ao ?? !o.smooth, sh: o.sh ?? true,
      depth: cy * KZ + cz + (o.bias || 0), bb, seed: this.parts.length * 7919 + 13,
    };
    this.parts.push(part); return part;
  }
  // box standing on z0; o.yaw turns it around the vertical axis
  box(cx, cy, z0, lx, ly, lz, col, o = {}) {
    const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), hx = lx / 2, hy = ly / 2;
    const q = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    return this.fr(q, z0, q, z0 + lz, col, o);
  }
  // beam from a to b with cross-section ty (sideways) × tz
  rod(a, b, ty, tz, col, o = {}) {
    const ex = norm(sub(b, a)), ey = Math.abs(ex[2]) > 0.99 ? [1, 0, 0] : norm([-ex[1], ex[0], 0]), ez = cross(ex, ey);
    const P = (base, sy, sz) => [base[0] + ey[0] * sy * ty / 2 + ez[0] * sz * tz / 2, base[1] + ey[1] * sy * ty / 2 + ez[1] * sz * tz / 2, base[2] + ey[2] * sy * ty / 2 + ez[2] * sz * tz / 2];
    const A = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)], B = [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)];
    const faces = [{ p: A, k: 'end' }, { p: B, k: 'end' }];
    for (let i = 0; i < 4; i++) faces.push({ p: [A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]], k: 'side' });
    return this._part(faces, col, o);
  }
  // round beam from a to b; o.r2 = radius at b
  tube(a, b, r, col, o = {}) {
    const n = o.n || 8, r2 = o.r2 ?? r, ex = norm(sub(b, a)), ey = Math.abs(ex[2]) > 0.99 ? [1, 0, 0] : norm([-ex[1], ex[0], 0]), ez = cross(ex, ey);
    const ring = (c, rr) => { const q = []; for (let i = 0; i < n; i++) { const t = (i + 0.5) * 2 * Math.PI / n, cs = Math.cos(t) * rr, sn = Math.sin(t) * rr; q.push([c[0] + ey[0] * cs + ez[0] * sn, c[1] + ey[1] * cs + ez[1] * sn, c[2] + ey[2] * cs + ez[2] * sn]); } return q; };
    const A = ring(a, r), B = ring(b, r2), faces = [{ p: A, k: 'cap' }, { p: B, k: 'cap' }];
    for (let i = 0; i < n; i++) faces.push({ p: [A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]], k: 'side' });
    return this._part(faces, col, { smooth: true, ...o });
  }
  // frustum: bottom outline pb at z0, top outline pt at z1 (same number of corners)
  fr(pb, z0, pt, z1, col, o = {}) {
    const m = pb.length, Bt = pb.map(p => [p[0], p[1], z0]), Tp = pt.map(p => [p[0], p[1], z1]), faces = [];
    for (let i = 0; i < m; i++) faces.push({ p: [Bt[i], Bt[(i + 1) % m], Tp[(i + 1) % m], Tp[i]], k: 'side' });
    faces.push({ p: Tp, k: m === 4 ? 'top' : 'cap' });
    return this._part(faces, col, o);
  }
  // barrel roof: half a tube lying on its flat side, from a to b (both at the height of the eaves); o.sq flattens it
  arch(a, b, r, col, o = {}) {
    const n = o.n || 8, ex = norm(sub(b, a)), ey = norm([-ex[1], ex[0], 0]), sq = o.sq ?? 1;
    const ring = c => { const q = []; for (let i = 0; i <= n; i++) { const t = i * Math.PI / n; q.push([c[0] + ey[0] * Math.cos(t) * r, c[1] + ey[1] * Math.cos(t) * r, c[2] + Math.sin(t) * r * sq]); } return q; };
    const A = ring(a), B = ring(b), faces = [{ p: A, k: 'cap' }, { p: B, k: 'cap' }];
    for (let i = 0; i < n; i++) faces.push({ p: [A[i], A[i + 1], B[i + 1], B[i]], k: 'side' });
    return this._part(faces, col, { smooth: true, ...o });
  }
  ngon(cx, cy, r, n, rot = 0) { const q = []; for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; q.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return q; }
  cyl(cx, cy, r, z0, h, col, o = {}) {
    const n = o.n || 12, rot = Math.PI / n;
    return this.fr(this.ngon(cx, cy, r, n, rot), z0, this.ngon(cx, cy, o.r2 ?? r, n, rot), z0 + h, col, { smooth: n > 8, ao: true, ...o });
  }
  // several stacked rings drawn as one part (domes, cones)
  stack(cx, cy, rings, col, o = {}) {
    const n = o.n || 12, rot = Math.PI / n, faces = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const [r0, z0] = rings[i], [r1, z1] = rings[i + 1], A = this.ngon(cx, cy, r0, n, rot), B = this.ngon(cx, cy, r1, n, rot);
      for (let j = 0; j < n; j++) faces.push({ p: [[...A[j], z0], [...A[(j + 1) % n], z0], [...B[(j + 1) % n], z1], [...B[j], z1]], k: 'side' });
      if (i === rings.length - 2 && r1 > 0.01) faces.push({ p: B.map(p => [...p, z1]), k: 'cap' });
    }
    return this._part(faces, col, { smooth: true, ...o });
  }
  dome(cx, cy, r, z0, col, o = {}) { const s = o.sq ?? 1; return this.stack(cx, cy, [[r, z0], [r * 0.92, z0 + r * 0.4 * s], [r * 0.68, z0 + r * 0.74 * s], [r * 0.34, z0 + r * 0.95 * s], [0.005, z0 + r * s]], col, o); }
}

// which material a palette colour stands for: [Alliancen, Pagten] where the factions differ
const MAT = {
  wall: ['panel', 'brick'], wall2: ['ribbed', 'brick'], roof: 'sheet', metal: 'metal', conc: 'conc', bunker: 'conc', crate: 'crate', crane: 'girder',
  track: 'tread', tyre: 'tyre', sand: 'sandbag', glass: 'glass', asph: 'asph', wood: 'wood', T: 'paint', Td: 'paint', Tl: 'paint', harv: 'ribbed', gun: 'barrel',
};

function toneOf(col, n, glow, hi) {
  if (glow) return col;
  const t = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return shade(col, hi ? Math.max(-0.34, Math.min(0.3, t * 0.5 - 0.2)) : Math.max(-0.3, Math.round((t * 0.5 - 0.2) / 0.08) * 0.08));
}

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
const path = (g, q) => { g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); };

// Back-to-front order. A part that lies wholly south of or wholly above another one is in front of it wherever
// the two overlap on screen; only when neither holds do we fall back on comparing the middles.
function order(parts) {
  const n = parts.length, E = 0.012, out = [], indeg = new Int16Array(n), adj = Array.from({ length: n }, () => []);
  const sb = parts.map(p => { const b = p.bb; return [b[0], b[1] - b[5] * KZ, b[3], b[4] - b[2] * KZ]; });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = sb[i], b = sb[j]; if (a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3]) continue;
    const A = parts[i].bb, B = parts[j].bb, y1 = A[1] - B[4], y2 = B[1] - A[4], z1 = A[2] - B[5], z2 = B[2] - A[5];
    let front;   // true: i is in front of j
    if (Math.max(y1, y2) >= -E && y1 !== y2) front = y1 > y2;
    else if (Math.max(z1, z2) >= -E && z1 !== z2) front = z1 > z2;
    else front = parts[i].depth >= parts[j].depth;
    if (front) { adj[j].push(i); indeg[i]++; } else { adj[i].push(j); indeg[j]++; }
  }
  const done = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    let best = -1, any = -1;
    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      if (any < 0 || parts[i].depth < parts[any].depth) any = i;
      if (indeg[i] <= 0 && (best < 0 || parts[i].depth < parts[best].depth)) best = i;
    }
    if (best < 0) best = any;
    done[best] = 1; out.push(parts[best]); for (const j of adj[best]) indeg[j]--;
  }
  return out;
}

// The face's own coordinate system: origin and two unit axes on the surface, sizes in cells.
function frameOf(f) {
  const p = f.p;
  if (f.k === 'cap' || p.length !== 4) {
    const c = [0, 0, 0]; for (const q of p) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; }
    c[0] /= p.length; c[1] /= p.length; c[2] /= p.length;
    const u = sub(p[0], c), r = len(u); if (r < 1e-4) return null;
    return { o: c, u: norm(u), v: norm(cross(f.n, u)), w: r * 2, h: r * 2, r, cap: true };
  }
  let u, v;
  if (f.k === 'side') { u = sub(p[1], p[0]); v = sub([(p[2][0] + p[3][0]) / 2, (p[2][1] + p[3][1]) / 2, (p[2][2] + p[3][2]) / 2], [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, (p[0][2] + p[1][2]) / 2]); }
  else { u = sub(p[1], p[0]); v = sub(p[3], p[0]); }
  const w = len(u), h = len(v); if (w < 1e-4 || h < 1e-4) return null;
  return { o: p[0], u: [u[0] / w, u[1] / w, u[2] / w], v: [v[0] / h, v[1] / h, v[2] / h], w, h };
}

// ---------- materials: drawn in the face's own coordinates (cells) ----------
const ink = (g, a) => { g.strokeStyle = g.fillStyle = `rgba(18,14,12,${a})`; };
const lit = (g, a) => { g.strokeStyle = g.fillStyle = `rgba(255,255,255,${a})`; };
const hl = (g, y, x0, x1) => { g.moveTo(x0, y); g.lineTo(x1, y); };
const vl = (g, x, y0, y1) => { g.moveTo(x, y0); g.lineTo(x, y1); };
const disc = (g, x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832); };
const wall = F => F.kind === 'side' && !F.up;

const TEX = {
  brick(g, w, h, F) {
    if (!wall(F)) return;
    const ch = 0.085, bl = 0.2, R = F.R;
    for (let i = 0; i * ch < h; i++) for (let j = -1; j * bl < w; j++) { const r = R(); if (r < 0.24) { g.fillStyle = r < 0.12 ? 'rgba(255,236,210,0.13)' : 'rgba(60,24,10,0.13)'; g.fillRect((j + (i & 1) * 0.5) * bl, i * ch, bl, ch); } }
    ink(g, 0.3); g.lineWidth = F.lw; g.beginPath();
    for (let i = 1; i * ch < h; i++) hl(g, i * ch, -0.3, w + 0.3);
    for (let i = 0; i * ch < h; i++) for (let j = 0; j * bl < w + bl; j++) vl(g, (j + (i & 1) * 0.5) * bl, i * ch, (i + 1) * ch);
    g.stroke();
  },
  panel(g, w, h, F) {     // prefabricated wall elements
    if (!wall(F)) return;
    const n = Math.max(1, Math.round(w / 0.42)), d = w / n, mid = h > 0.45 ? h * 0.56 : 0;
    g.fillStyle = 'rgba(40,52,58,0.2)'; g.fillRect(-0.3, 0, w + 0.6, Math.min(0.07, h * 0.3));
    g.lineWidth = F.lw; ink(g, 0.26); g.beginPath();
    for (let i = 1; i < n; i++) vl(g, i * d, 0, h);
    if (mid) hl(g, mid, -0.3, w + 0.3);
    g.stroke();
    lit(g, 0.4); g.beginPath(); for (let i = 1; i < n; i++) vl(g, i * d + F.lw, 0, h); if (mid) hl(g, mid - F.lw, -0.3, w + 0.3); g.stroke();
    ink(g, 0.38); g.beginPath();
    for (let i = 0; i <= n; i++) for (const y of mid ? [0.12, mid - 0.05, mid + 0.05, h - 0.06] : [0.12, h - 0.06]) { if (i > 0) disc(g, i * d - 0.035, y, F.lw * 0.7); if (i < n) disc(g, i * d + 0.035, y, F.lw * 0.7); }
    g.fill();
  },
  ribbed(g, w, h, F) {    // corrugated siding
    if (!wall(F) || h < 0.12) return;
    const d = 0.06; g.lineWidth = F.lw;
    ink(g, 0.19); g.beginPath(); for (let x = d; x < w; x += d) vl(g, x, 0, h); g.stroke();
    lit(g, 0.2); g.beginPath(); for (let x = d + F.lw; x < w; x += d) vl(g, x, 0, h); g.stroke();
    g.fillStyle = 'rgba(30,34,38,0.18)'; g.fillRect(-0.3, 0, w + 0.6, Math.min(0.06, h * 0.3));
  },
  sheet(g, w, h, F) {     // corrugated roof
    if (F.cap || (wall(F) && h < 0.15)) return;
    const d = 0.07, R = F.R; g.lineWidth = F.lw;
    for (let i = 0; i < w * h * 1.5; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'; g.fillRect(Math.floor(R() * w / (d * 4)) * d * 4, R() * h, d * 4, 0.25 + R() * 0.35); }
    ink(g, 0.24); g.beginPath(); for (let x = d; x < w; x += d) vl(g, x, -0.3, h + 0.3); g.stroke();
    lit(g, 0.17); g.beginPath(); for (let x = d + F.lw; x < w; x += d) vl(g, x, -0.3, h + 0.3); g.stroke();
  },
  paint(g, w, h, F) {     // team colour: armour plate on vehicles, seamed roofing on buildings
    g.lineWidth = F.lw;
    if (F.cap) { if (F.r > 0.1) { ink(g, 0.22); g.beginPath(); disc(g, 0, 0, F.r * 0.8); g.stroke(); } return; }
    if (F.smooth) return;
    if (F.veh) {
      if (F.kind !== 'top' || w < 0.16 || h < 0.16) return;
      const m = 0.035; ink(g, 0.25); g.strokeRect(m, m, w - 2 * m, h - 2 * m); lit(g, 0.22); g.strokeRect(m + F.lw, m + F.lw, w - 2 * m - 2 * F.lw, h - 2 * m - 2 * F.lw);
      ink(g, 0.45); g.beginPath(); for (const [x, y] of [[m, m], [w - m, m], [w - m, h - m], [m, h - m]]) disc(g, x, y, F.lw * 0.9); g.fill();
      return;
    }
    if ((F.kind !== 'top' && !F.up) || w < 0.3 || h < 0.25) return;
    const d = 0.21;
    ink(g, 0.2); g.beginPath(); for (let x = d; x < w - 0.05; x += d) vl(g, x, -0.3, h + 0.3); g.stroke();
    lit(g, 0.24); g.beginPath(); for (let x = d + F.lw; x < w - 0.05; x += d) vl(g, x, -0.3, h + 0.3); g.stroke();
    if (F.kind === 'top') { lit(g, 0.2); g.lineWidth = 0.04; g.strokeRect(0.02, 0.02, w - 0.04, h - 0.04); }
  },
  metal(g, w, h, F) {     // riveted bands
    g.lineWidth = F.lw;
    if (F.cap) { if (F.r > 0.12) { ink(g, 0.26); g.beginPath(); disc(g, 0, 0, F.r * 0.78); for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.4; g.moveTo(Math.cos(a) * F.r * 0.78, Math.sin(a) * F.r * 0.78); g.lineTo(Math.cos(a) * F.r * 1.1, Math.sin(a) * F.r * 1.1); } g.stroke(); } return; }
    if (!wall(F) || h < 0.3) return;
    const n = Math.max(1, Math.round(h / 0.27)), d = h / n;
    for (let i = 1; i <= n; i++) {
      const y = i * d - 0.04; if (y < 0.05) continue;
      ink(g, 0.28); g.beginPath(); hl(g, y, -0.3, w + 0.3); g.stroke();
      lit(g, 0.3); g.beginPath(); hl(g, y - F.lw, -0.3, w + 0.3); g.stroke();
      ink(g, 0.4); g.beginPath(); for (let x = 0.03; x < w; x += 0.07) disc(g, x, y + 0.022, F.lw * 0.6); g.fill();
    }
  },
  conc(g, w, h, F) {
    const R = F.R; g.lineWidth = F.lw;
    if (F.cap) { if (F.r > 0.2) { ink(g, 0.16); g.beginPath(); disc(g, 0, 0, F.r * 0.86); g.stroke(); } return; }
    if (F.kind === 'top') {     // a cast slab: joints, stains and cracks
      if (w * h < 0.5) return;
      const d = 0.5, ox = (w % d) / 2 || d, oy = (h % d) / 2 || d;
      for (let i = 0; i < w * h; i++) { g.fillStyle = `rgba(44,36,26,${0.05 + R() * 0.07})`; g.beginPath(); g.ellipse(R() * w, R() * h, 0.08 + R() * 0.2, 0.05 + R() * 0.11, R() * 3, 0, 7); g.fill(); }
      ink(g, 0.2); g.beginPath(); for (let x = ox; x < w - 0.03; x += d) vl(g, x, 0, h); for (let y = oy; y < h - 0.03; y += d) hl(g, y, 0, w); g.stroke();
      lit(g, 0.2); g.beginPath(); for (let x = ox + F.lw; x < w - 0.03; x += d) vl(g, x, 0, h); for (let y = oy + F.lw; y < h - 0.03; y += d) hl(g, y, 0, w); g.stroke();
      ink(g, 0.3); g.beginPath(); for (let i = 0; i < w * h * 0.6; i++) { let x = R() * w, y = R() * h; g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (R() - 0.5) * 0.24; y += (R() - 0.5) * 0.24; g.lineTo(x, y); } } g.stroke();
      return;
    }
    if (!wall(F)) return;      // poured wall: board marks and streaks from the top
    ink(g, 0.15); g.beginPath(); for (let y = 0.13; y < h - 0.03; y += 0.13) hl(g, y, -0.3, w + 0.3); g.stroke();
    for (let i = 0; i < w * 4; i++) { const l = 0.06 + R() * h * 0.5; g.fillStyle = 'rgba(40,34,26,0.11)'; g.fillRect(R() * w, h - l, 0.02 + R() * 0.03, l); }
  },
  crate(g, w, h, F) {
    if (F.cap) return;
    const m = Math.min(0.03, w * 0.14, h * 0.14); g.lineWidth = F.lw;
    ink(g, 0.22); g.beginPath(); for (let y = m + 0.065; y < h - m; y += 0.065) hl(g, y, m, w - m); g.stroke();
    ink(g, 0.36); g.lineWidth = m; g.strokeRect(m / 2, m / 2, w - m, h - m);
    g.lineWidth = m * 0.8; g.beginPath(); g.moveTo(m, m); g.lineTo(w - m, h - m); g.stroke();
    lit(g, 0.2); g.lineWidth = F.lw; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
  },
  girder(g, w, h, F) {    // lattice: dark gaps between the members
    if (F.kind !== 'side') return;
    const d = Math.max(0.08, w * 1.2), n = Math.max(1, Math.round(h / d)), s = h / n;
    ink(g, 0.6); g.fillRect(0, 0, w, h);
    g.strokeStyle = F.tone; g.lineWidth = Math.max(F.lw, w * 0.17); g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(0, i * s); g.lineTo(w, (i + 1) * s); g.moveTo(w, i * s); g.lineTo(0, (i + 1) * s); hl(g, i * s, 0, w); }
    g.stroke();
    g.lineWidth = w * 0.36; g.beginPath(); vl(g, 0, 0, h); vl(g, w, 0, h); g.stroke();
  },
  tread(g, w, h, F) {     // tracks: links on top, road wheels along the side
    g.lineWidth = F.lw;
    if (F.kind === 'top') {
      const along = w >= h; ink(g, 0.55); g.beginPath();
      if (along) for (let x = 0.03; x < w; x += 0.055) vl(g, x, 0, h); else for (let y = 0.03; y < h; y += 0.055) hl(g, y, 0, w);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.11)'; if (along) g.fillRect(0, h * 0.3, w, h * 0.4); else g.fillRect(w * 0.3, 0, w * 0.4, h);
      return;
    }
    if (F.kind !== 'side') return;
    if (w > h * 2.4) {
      const n = Math.max(3, Math.round(w / (h * 1.2))), d = w / n, r = Math.min(h * 0.4, d * 0.45);
      ink(g, 0.4); g.fillRect(-0.3, 0, w + 0.6, h);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * d, y = h * 0.45;
        g.fillStyle = F.wheel; g.beginPath(); disc(g, x, y, r); g.fill();
        ink(g, 0.6); g.beginPath(); disc(g, x, y, r); g.stroke(); g.beginPath(); disc(g, x, y, r * 0.36); g.fill();
      }
      g.fillStyle = F.tone; g.fillRect(-0.3, h * 0.87, w + 0.6, h * 0.2); g.fillRect(-0.3, -0.05, w + 0.6, 0.05 + h * 0.07);
      ink(g, 0.55); g.beginPath(); for (let x = 0.02; x < w; x += 0.05) vl(g, x, h * 0.87, h); g.stroke();
    } else { ink(g, 0.55); g.beginPath(); for (let y = 0.03; y < h; y += 0.05) hl(g, y, -0.2, w + 0.2); g.stroke(); }
  },
  tyre(g, w, h, F) {
    g.lineWidth = F.lw;
    if (!F.cap) { if (F.kind === 'side') { ink(g, 0.5); g.beginPath(); vl(g, w / 2, 0, h); g.stroke(); } return; }
    const r = F.r; g.fillStyle = F.wheel; g.beginPath(); disc(g, 0, 0, r * 0.56); g.fill();
    ink(g, 0.55); g.beginPath(); disc(g, 0, 0, r * 0.56); g.stroke(); g.beginPath(); disc(g, 0, 0, r * 0.2); g.fill();
  },
  glass(g, w, h, F) {
    if (F.cap || F.smooth || w * h < 0.006) return;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,25,50,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.2)');
    g.fillStyle = gr; g.fillRect(-0.2, -0.2, w + 0.4, h + 0.4);
    lit(g, 0.4); g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.1 + Math.min(w * 0.22, 0.09), 0); g.lineTo(w * 0.1 + Math.min(w * 0.22, 0.09) + h * 0.7, h); g.lineTo(w * 0.1 + h * 0.7, h); g.closePath(); g.fill();
    const nx = Math.max(1, Math.round(w / 0.15)), ny = h > 0.3 ? 2 : 1;
    ink(g, 0.62); g.lineWidth = F.lw * 1.1; g.beginPath();
    for (let i = 1; i < nx; i++) vl(g, i * w / nx, 0, h);
    for (let j = 1; j < ny; j++) hl(g, j * h / ny, 0, w);
    g.stroke();
    g.lineWidth = F.lw * 2.4; g.strokeRect(0, 0, w, h);
  },
  door(g, w, h, F) {      // roller door
    if (F.kind !== 'side') return;
    g.lineWidth = F.lw;
    lit(g, 0.16); g.beginPath(); for (let y = 0.05; y < h; y += 0.055) hl(g, y, 0, w); g.stroke();
    ink(g, 0.45); g.beginPath(); for (let y = 0.05 + F.lw; y < h; y += 0.055) hl(g, y, 0, w); g.stroke();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.4)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    lit(g, 0.24); g.lineWidth = F.lw * 1.6; g.strokeRect(0, 0, w, h);
  },
  hazard(g, w, h, F) {    // yellow and black warning stripes
    if (F.cap) return;
    g.fillStyle = 'rgba(26,24,22,0.86)'; g.beginPath();
    if (w >= h) { const s = Math.max(0.045, h * 0.7); for (let x = -h; x < w; x += s * 2) { g.moveTo(x, 0); g.lineTo(x + s, 0); g.lineTo(x + s + h, h); g.lineTo(x + h, h); g.closePath(); } }
    else { const s = Math.max(0.045, w * 0.7); for (let y = -w; y < h; y += s * 2) { g.moveTo(0, y); g.lineTo(0, y + s); g.lineTo(w, y + s + w); g.lineTo(w, y + w); g.closePath(); } }
    g.fill();
  },
  sandbag(g, w, h, F) {
    if (F.cap) return;
    g.lineWidth = F.lw; ink(g, 0.36); g.beginPath();
    if (wall(F)) { const ch = 0.075, bl = 0.15; for (let i = 0; i * ch < h; i++) { if (i) hl(g, i * ch, 0, w); for (let j = 0; j * bl < w + bl; j++) vl(g, (j + (i & 1) * 0.5) * bl, i * ch + ch * 0.15, (i + 1) * ch - ch * 0.1); } }
    else { for (let x = 0.15; x < w - 0.03; x += 0.15) vl(g, x, 0, h); if (h > 0.18) hl(g, h / 2, 0, w); }
    g.stroke();
  },
  asph(g, w, h, F) {
    if (F.kind !== 'top' || w * h < 0.5) return;
    const R = F.R;
    for (let i = 0; i < w * h * 0.7; i++) { g.fillStyle = 'rgba(0,0,0,0.11)'; g.beginPath(); g.ellipse(R() * w, R() * h, 0.1 + R() * 0.25, 0.06 + R() * 0.12, R() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < w * h * 30; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.15)'; g.fillRect(R() * w, R() * h, 0.025, 0.02); }
    ink(g, 0.22); g.lineWidth = F.lw; g.beginPath(); for (let x = 0.725; x < w - 0.1; x += 0.725) vl(g, x, 0, h); hl(g, h / 2, 0, w); g.stroke();
  },
  wood(g, w, h, F) { if (F.cap) return; g.lineWidth = F.lw; ink(g, 0.28); g.beginPath(); if (w >= h) for (let y = 0.06; y < h; y += 0.06) hl(g, y, 0, w); else for (let x = 0.06; x < w; x += 0.06) vl(g, x, 0, h); g.stroke(); },
  grill(g, w, h, F) {     // louvres
    if (F.cap) return;
    const m = Math.min(0.025, w * 0.12, h * 0.12); ink(g, 0.55); g.lineWidth = F.lw; g.beginPath();
    if (w >= h) for (let x = m + 0.035; x < w - m; x += 0.035) vl(g, x, m, h - m); else for (let y = m + 0.035; y < h - m; y += 0.035) hl(g, y, m, w - m);
    g.stroke(); ink(g, 0.32); g.strokeRect(m, m, w - 2 * m, h - 2 * m);
  },
  hatch(g, w, h, F) {
    g.lineWidth = F.lw;
    if (F.cap) { ink(g, 0.4); g.beginPath(); disc(g, 0, 0, F.r * 0.7); g.moveTo(-F.r * 0.3, 0); g.lineTo(F.r * 0.3, 0); g.stroke(); lit(g, 0.3); g.beginPath(); g.arc(0, 0, F.r * 0.7 - F.lw, 3.4, 5.2); g.stroke(); }
    else if (F.kind === 'top') { ink(g, 0.4); g.strokeRect(w * 0.14, h * 0.14, w * 0.72, h * 0.72); g.beginPath(); hl(g, h / 2, w * 0.36, w * 0.64); g.stroke(); }
  },
  fan(g, w, h, F) {
    if (!F.cap) return;
    const r = F.r; ink(g, 0.6); g.beginPath(); disc(g, 0, 0, r * 0.9); g.fill();
    lit(g, 0.4); g.lineWidth = r * 0.18; g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.3; g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } g.stroke();
    g.beginPath(); disc(g, 0, 0, r * 0.22); g.fill();
  },
  mesh(g, w, h, F) {
    if (F.cap) return;
    ink(g, 0.34); g.lineWidth = F.lw; g.beginPath(); for (let x = 0.05; x < w; x += 0.05) vl(g, x, 0, h); for (let y = 0.05; y < h; y += 0.05) hl(g, y, 0, w); g.stroke();
    ink(g, 0.45); g.lineWidth = F.lw * 2; g.strokeRect(0, 0, w, h);
  },
  drum(g, w, h, F) {
    g.lineWidth = F.lw;
    if (F.cap) { ink(g, 0.34); g.beginPath(); disc(g, 0, 0, F.r * 0.76); g.stroke(); g.beginPath(); disc(g, F.r * 0.4, 0, F.r * 0.13); g.fill(); return; }
    if (F.kind !== 'side') return;
    for (const y of [h * 0.33, h * 0.67]) { ink(g, 0.34); g.beginPath(); hl(g, y, -0.2, w + 0.2); g.stroke(); lit(g, 0.3); g.beginPath(); hl(g, y - F.lw, -0.2, w + 0.2); g.stroke(); }
  },
  barrel(g, w, h, F) {    // gun barrels: a bore at the end, rings along the tube
    g.lineWidth = F.lw;
    if (F.cap) { ink(g, 0.8); g.beginPath(); disc(g, 0, 0, F.r * 0.55); g.fill(); return; }
    if (F.kind !== 'side' || h < 0.25) return;
    ink(g, 0.4); g.beginPath(); for (const y of [h * 0.28, h * 0.6]) hl(g, y, -0.2, w + 0.2); g.stroke();
  },
  solar(g, w, h, F) {
    if (F.cap || w * h < 0.02) return;
    g.lineWidth = F.lw; lit(g, 0.34); g.beginPath(); for (let x = 0.09; x < w; x += 0.09) vl(g, x, 0, h); for (let y = 0.09; y < h; y += 0.09) hl(g, y, 0, w); g.stroke();
    lit(g, 0.16); g.beginPath(); g.moveTo(0, h * 0.2); g.lineTo(w * 0.5, 0); g.lineTo(w * 0.8, 0); g.lineTo(0, h * 0.7); g.fill();
  },
  skirt(g, w, h, F) {     // side armour over the tracks
    if (F.kind !== 'side') return;
    g.lineWidth = F.lw; ink(g, 0.32); g.beginPath(); for (let x = 0.2; x < w - 0.05; x += 0.2) vl(g, x, 0, h); g.stroke();
    ink(g, 0.45); g.beginPath(); for (let x = 0.05; x < w; x += 0.1) disc(g, x, h * 0.72, F.lw * 0.7); g.fill();
  },
  ore(g, w, h, F) { if (F.kind !== 'side') return; lit(g, 0.3); g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.5, h); g.lineTo(0, h * 0.4); g.fill(); },
};

// sun-bleached paint, dust and oil: only in the military palette
function grime(g, w, h, F) {
  const R = F.R, n = Math.min(9, Math.ceil(w * h * 3.5)), x0 = F.cap ? -F.r : 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * w, y = x0 + R() * h, r = 0.08 + R() * 0.22, gr = g.createRadialGradient(x, y, 0, x, y, r), dark = R() < 0.65;
    gr.addColorStop(0, dark ? `rgba(58,46,26,${0.13 + R() * 0.1})` : `rgba(255,244,214,${0.1 + R() * 0.08})`); gr.addColorStop(1, dark ? 'rgba(58,46,26,0)' : 'rgba(255,244,214,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (wall(F) && F.vert) { g.fillStyle = 'rgba(84,66,38,0.2)'; g.fillRect(-w, 0, w * 3, Math.min(0.1, h * 0.35)); }
}
// soft shading on top of the flat cel colour
function soft(g, w, h, F) {
  if (F.glow || F.cap) return;
  if (wall(F) && F.vert && F.ao) {
    const gr = g.createLinearGradient(0, 0, 0, h), a = F.veh ? 0.17 : 0.24;
    gr.addColorStop(0, `rgba(10,12,26,${a})`); gr.addColorStop(Math.min(0.7, 0.16 / h + 0.12), 'rgba(10,12,26,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = gr; g.fillRect(-w, -0.3, w * 3, h + 0.6);
    if (!F.smooth && h > 0.1) { lit(g, 0.34); g.lineWidth = F.lw; g.beginPath(); hl(g, h - F.lw * 0.9, -w, w * 2); g.stroke(); }
  } else if ((F.kind === 'top' || F.up) && !F.smooth) {
    const gr = g.createLinearGradient(0, h, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.11)'); gr.addColorStop(1, 'rgba(10,12,26,0.08)');
    g.fillStyle = gr; g.fillRect(-w, -h, w * 3, h * 3);
  }
}

function texFace(g, v, part, S, ctx) {
  const f = v.f, fr = frameOf(f); if (!fr) return;
  let o = fr.o, u = fr.u; const vv = fr.v, w = fr.w, h = fr.h;
  if (!fr.cap && f.k === 'side' && u[0] < -1e-6) { o = [o[0] + u[0] * w, o[1] + u[1] * w, o[2] + u[2] * w]; u = [-u[0], -u[1], -u[2]]; }   // keep "right" pointing right
  const ux = u[0] * S, uy = (u[1] - u[2] * KZ) * S, vx = vv[0] * S, vy = (vv[1] - vv[2] * KZ) * S;
  if (Math.abs(ux * vy - uy * vx) < S * S * 0.03) return;
  const F = { kind: f.k, cap: !!fr.cap, r: fr.r || 0, up: f.n[2] > 0.35, vert: vv[2] > 0.5, veh: ctx.veh, smooth: part.smooth, glow: part.glow, ao: part.ao,
    lw: Math.max(0.012, 1.15 / S), R: mulberry32((ctx.seed ^ Math.imul(part.seed + v.f.i * 131, 2654435761)) >>> 0), tone: v.tone, wheel: ctx.wheel };
  g.save(); path(g, v.q); g.clip();
  g.save(); g.transform(ux, uy, vx, vy, o[0] * S, (o[1] - o[2] * KZ) * S);
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  const fn = part.mat && TEX[part.mat]; if (fn) fn(g, w, h, F);
  if (ctx.mil && !part.glow && v.area > 50) grime(g, w, h, F);
  soft(g, w, h, F);
  g.restore();
  if (part.glow && part.smooth && part.mat === 'glass') { ink(g, 0.3); g.lineWidth = Math.max(1, S * 0.02); path(g, v.q); g.stroke(); }                                   // struts of a glass dome
  else if ((f.k === 'top' || f.k === 'end') && !part.smooth && !part.glow && part.ol >= 0.5 && v.area > 110) { lit(g, 0.24); g.lineWidth = S * 0.03; path(g, v.q); g.stroke(); }   // a lighter bevel
  g.restore();
}

function renderParts(parts, S, wantShadow, ctx) {
  const hi = STYLE.detail === 'high', OW = S * (STYLE.outline === 'thin' ? 0.027 : 0.045);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
  for (const part of parts) {
    part.vis = [];
    for (const f of part.faces) {
      for (const p of f.p) { const X = (p[0] + p[2] * 0.42) * S, Y = (p[1] + p[2] * 0.2) * S; if (X < sx0) sx0 = X; if (X > sx1) sx1 = X; if (Y < sy0) sy0 = Y; if (Y > sy1) sy1 = Y; }
      if (dot(f.n, D) <= 1e-6) continue;
      const q = f.p.map(p => [p[0] * S, (p[1] - p[2] * KZ) * S]);
      let ar = 0; for (let j = 0; j < q.length; j++) { const a = q[j], b = q[(j + 1) % q.length]; ar += a[0] * b[1] - b[0] * a[1]; }
      if (Math.abs(ar) < 0.4) continue;
      if (ar < 0) q.reverse();          // one winding for all, so a part's faces can share a path
      for (const [X, Y] of q) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      part.vis.push({ q, f, area: Math.abs(ar) / 2, tone: toneOf(part.col, f.n, part.glow, hi) });
    }
  }
  if (x1 < x0) { x0 = y0 = 0; x1 = y1 = 1; }
  const m = Math.ceil(OW + S * 0.05) + 2, cv = mkCanvas(x1 - x0 + m * 2, y1 - y0 + m * 2), g = cv.getContext('2d');
  g.translate(-x0 + m, -y0 + m);
  const edge = Math.max(1, S * 0.014), dsx = S * 0.032, dsy = S * 0.024;
  for (const part of order(parts)) {
    const vis = part.vis; if (!vis.length) continue;
    const P = new Path2D(); for (const { q } of vis) { P.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) P.lineTo(q[i][0], q[i][1]); P.closePath(); }
    const ow = OW * part.ol;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (hi && part.sh && part.ol >= 0.4 && !part.glow) { g.fillStyle = 'rgba(10,12,24,0.2)'; g.translate(dsx, dsy); g.fill(P); g.translate(-dsx, -dsy); }
    if (ow > 0) { g.strokeStyle = OUT; g.fillStyle = OUT; g.lineWidth = ow * 2; g.stroke(P); g.fill(P); }
    for (const v of vis) {
      g.fillStyle = v.tone; g.strokeStyle = hi || part.smooth || part.glow ? v.tone : shade(v.tone, -0.2); g.lineWidth = hi ? Math.max(1, S * 0.012) : Math.max(1, S * 0.016);
      path(g, v.q); g.fill(); g.stroke();
    }
    if (!hi) continue;
    for (const v of vis) if (v.area > 14) texFace(g, v, part, S, ctx);
    if (!part.smooth && !part.glow && part.ol > 0) { g.lineJoin = 'round'; g.strokeStyle = 'rgba(16,14,24,0.3)'; g.lineWidth = edge; g.stroke(P); }
  }
  const out = { cv, ax: -x0 + m, ay: -y0 + m, S };
  if (wantShadow) {
    const sc = mkCanvas(sx1 - sx0 + 4, sy1 - sy0 + 4), h = sc.getContext('2d');
    h.translate(-sx0 + 2, -sy0 + 2); h.fillStyle = '#000';
    for (const part of parts) for (const f of part.faces) {
      h.beginPath(); f.p.forEach((p, i) => { const X = (p[0] + p[2] * 0.42) * S, Y = (p[1] + p[2] * 0.2) * S; i ? h.lineTo(X, Y) : h.moveTo(X, Y); }); h.closePath(); h.fill();
    }
    out.sh = { cv: sc, ax: -sx0 + 2, ay: -sy0 + 2 };
  }
  return out;
}

// A battered copy of a building sprite: holes with a burnt inside, soot and cracks. lvl 1 = damaged, 2 = nearly gone.
function wreck(sp, lvl, name) {
  const w = sp.cv.width, h = sp.cv.height, S = sp.S, d = DEFS.buildings[name] || { w: 1, h: 1 }, R = mulberry32(hashStr(name) + 71);
  const cv = mkCanvas(w, h), g = cv.getContext('2d'), burnt = mkCanvas(w, h), b = burnt.getContext('2d');
  const spot = () => [sp.ax + (R() - 0.5) * d.w * S * 0.86, sp.ay + (-d.h / 2 - 0.45 + R() * (d.h + 0.2)) * S];
  const blob = (c, x, y, r, seed) => { const Q = mulberry32(seed); c.beginPath(); for (let j = 0; j < 11; j++) { const a = j / 11 * 6.283, rr = r * (0.5 + Q() * 0.8); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.78); } c.closePath(); };
  const holes = []; for (let i = 0, n = lvl + Math.round(d.w * d.h * (lvl === 2 ? 0.45 : 0.2)); i < n; i++) holes.push([...spot(), S * (0.09 + R() * (lvl === 2 ? 0.17 : 0.07)), (R() * 1e9) | 0]);
  g.drawImage(sp.cv, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0, n = 2 + d.w * d.h * lvl * 1.5; i < n; i++) {      // soot
    const [x, y] = i < holes.length ? holes[i] : spot(), r = S * (0.22 + R() * 0.32), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(22,18,16,${lvl === 2 ? 0.62 : 0.45})`); gr.addColorStop(1, 'rgba(22,18,16,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(20,16,14,0.7)'; g.lineWidth = Math.max(1, S * 0.012); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [hx, hy, hr] of holes) for (let i = 0; i < 2; i++) {    // cracks running out from the holes
    let a = R() * 6.283, x = hx + Math.cos(a) * hr * 0.6, y = hy + Math.sin(a) * hr * 0.5; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 3; j++) { a += (R() - 0.5) * 1.6; x += Math.cos(a) * S * 0.07; y += Math.sin(a) * S * 0.06; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.26)'; for (const [hx, hy, hr, sd] of holes) { blob(g, hx - S * 0.012, hy - S * 0.014, hr * 1.06, sd); g.fill(); }   // a chipped, lighter rim
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  for (const [hx, hy, hr, sd] of holes) { blob(g, hx, hy, hr, sd); g.fill(); }
  b.drawImage(sp.cv, 0, 0); b.globalCompositeOperation = 'source-atop'; b.fillStyle = 'rgba(24,19,18,0.93)'; b.fillRect(0, 0, w, h);
  if (lvl === 2) for (const [hx, hy, hr] of holes) { const r = hr * 0.75, y = hy + hr * 0.25, gr = b.createRadialGradient(hx, y, 0, hx, y, r); gr.addColorStop(0, 'rgba(255,150,40,0.6)'); gr.addColorStop(1, 'rgba(230,70,20,0)'); b.fillStyle = gr; b.fillRect(hx - r, y - r, r * 2, r * 2); }
  g.globalCompositeOperation = 'destination-over'; g.drawImage(burnt, 0, 0);
  return { ...sp, cv };
}

// ---------- palettes ----------
const NOBODY = { main: '#b9b3a2', dark: '#7f7a6c', light: '#e4dfd0' };      // a neutral building that nobody holds yet
function pal(f, ci) {
  const t = DEFS.colors[ci] || (ci < 0 ? NOBODY : DEFS.colors[0]), mil = STYLE.palette === 'military';
  const c = f === 'P'
    ? { wall: '#cfa57c', wall2: '#a97d5a', roof: '#6d4a3c', metal: '#8f887b', dark: '#3a302d', glass: '#ffd76a', conc: '#a79f90', crate: '#8a6a3c', crane: '#e0a82a', trim: '#5e4a3c', bunker: '#948a6c' }
    : { wall: '#e2e5d8', wall2: '#bcc3b2', roof: '#5f7389', metal: '#9dabb8', dark: '#3a444f', glass: '#8fd6f2', conc: '#b9bcae', crate: '#b8a06a', crane: '#f0c330', trim: '#66747f', bunker: '#98a087' };
  Object.assign(c, { T: t.main, Td: t.dark, Tl: t.light, track: '#33383f', tyre: '#2b2e34', gun: '#40464e', gold: '#f2c21c', fire: '#ff8a1e', hot: '#ffe066', zap: '#9fe9ff', lamp: '#fff3b8',
    red: '#d8392c', white: '#f6f7f2', sand: '#cdb884', asph: '#555b63', rust: '#9a5a34', wood: '#a37a4c', harv: '#e8a531', coal: '#2c2a2b', navy: '#2c4a7a' });
  if (mil) {      // dusty field colours; the team colour is toned towards the faction's paint
    const paint = f === 'P' ? '#6e6046' : '#5f6a4e';
    for (const k of ['wall', 'wall2', 'roof', 'metal', 'conc', 'crate', 'crane', 'trim', 'bunker', 'sand', 'asph', 'rust', 'wood', 'harv', 'white', 'red', 'gold']) c[k] = mix(dusty(c[k], 0.4), '#6e6650', 0.2);
    c.T = mix(dusty(t.main, 0.25), paint, 0.3); c.Td = mix(dusty(t.dark, 0.25), paint, 0.3); c.Tl = mix(dusty(t.light, 0.3), paint, 0.25);
    c.glass = mix(c.glass, '#3c4a52', 0.3);
  }
  // every colour is unique, so the colour also tells which material a part is made of
  const key = new Map();
  for (const k of Object.keys(c)) { let v = c[k]; while (key.has(v)) { const [r, g, b] = rgb(v); v = hex(r, g, b < 255 ? b + 1 : b - 1); } c[k] = v; key.set(v, k); }
  Object.defineProperty(c, '_key', { value: key });
  return c;
}

// ---------- small things used on many models ----------
const M = {};
// The ground a building stands on. Every building has its own outline, so a base is not a row of squares.
const slab = (k, c, pts, col = c.conc) => k.fr(pts, 0, pts, 0.07, col, { ol: 0.8, bias: -5, sh: false });
// a rectangle w x h around (cx, cy) with its corners cut off by ch
const oct = (w, h, ch, cx = 0, cy = 0) => { const x = w / 2, y = h / 2; return [[-x + ch, -y], [x - ch, -y], [x, -y + ch], [x, y - ch], [x - ch, y], [-x + ch, y], [-x, y - ch], [-x, -y + ch]].map(([a, b]) => [a + cx, b + cy]); };
const shrink = (pts, f, cx, cy) => pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
// walls on any outline with a lid in the team colour
const block = (k, c, pts, z0, h, col, cx, cy, lid = c.T, grow = 1.03) => { k.fr(pts, z0, pts, z0 + h, col); const top = shrink(pts, grow, cx, cy); k.fr(top, z0 + h, top, z0 + h + 0.08, lid); };
const win = (k, c, x, y, z, w = 0.2, h = 0.2) => {
  k.box(x, y, z, w, 0.03, h, c.glass, { ol: 0.45, glow: true, bias: 0.3 });
  if (k.hi) k.box(x, y + 0.012, z - 0.035, w + 0.07, 0.05, 0.03, c.trim, { ol: 0.3, bias: 0.35, sh: false });
};
const door = (k, c, x, y, z, w, h) => {
  k.box(x, y, z, w, 0.03, h, c.dark, { ol: 0.5, bias: 0.3, mat: 'door' });
  if (k.hi) k.box(x, y + 0.012, z + h, w + 0.1, 0.05, 0.045, c.trim, { ol: 0.3, bias: 0.4, sh: false });
};
const sign = (k, c, x, y, z, w, h, col, mat) => k.box(x, y, z, w, 0.03, h, col, { ol: 0.4, bias: 0.4, mat, sh: false });
const flag = (k, c, x, y, z0, h) => {
  k.rod([x, y, z0], [x, y, z0 + h], 0.045, 0.045, c.dark, { ol: 0.5 });
  k.box(x + 0.2, y, z0 + h - 0.25, 0.38, 0.03, 0.23, c.T, { ol: 0.6 });
  if (k.hi) { k.box(x + 0.2, y + 0.012, z0 + h - 0.17, 0.38, 0.03, 0.07, c.Tl, { ol: 0, sh: false, bias: 0.4 }); k.box(x, y, z0 + h, 0.08, 0.08, 0.05, c.gold, { ol: 0.4 }); }
};
const vent = (k, c, x, y, z, s = 0.16) => { k.box(x, y, z, s, s, s * 0.7, c.metal, { ol: 0.5, mat: 'grill' }); k.box(x, y, z + s * 0.7, s * 1.3, s * 1.3, s * 0.2, c.dark, { ol: 0.45 }); };
const ac = (k, c, x, y, z, lx = 0.34, ly = 0.26) => { k.box(x, y, z, lx, ly, 0.13, c.metal, { ol: 0.5, mat: 'grill' }); k.cyl(x, y, Math.min(lx, ly) * 0.38, z + 0.13, 0.012, c.dark, { ol: 0.3, n: 10, mat: 'fan', sh: false }); };
const lamp = (k, c, x, y, z0, h) => {
  k.rod([x, y, z0], [x, y, z0 + h], 0.035, 0.035, c.dark, { ol: 0.45 });
  k.box(x - 0.07, y, z0 + h - 0.03, 0.2, 0.07, 0.05, c.dark, { ol: 0.45 });
  k.box(x - 0.12, y, z0 + h - 0.055, 0.09, 0.06, 0.025, c.lamp, { ol: 0.3, glow: true });
};
const drum = (k, c, x, y, z, col) => k.cyl(x, y, 0.085, z, 0.2, col, { n: 8, ol: 0.6, mat: 'drum', smooth: true });
const ladder = (k, c, x, y, z0, z1) => {
  for (const s of [-0.05, 0.05]) k.box(x + s, y, z0, 0.022, 0.022, z1 - z0, c.dark, { ol: 0.3, sh: false });
  for (let z = z0 + 0.07; z < z1 - 0.03; z += 0.1) k.box(x, y, z, 0.1, 0.02, 0.016, c.dark, { ol: 0, sh: false });
};
const mast = (k, c, x, y, z0, h, tip) => { k.rod([x, y, z0], [x, y, z0 + h], 0.03, 0.03, c.dark, { ol: 0.4 }); if (tip) k.box(x, y, z0 + h, 0.06, 0.06, 0.06, tip, { ol: 0.35, glow: true }); };
const dish = (k, c, x, y, z, r = 0.13) => { k.cyl(x, y, 0.03, z, r * 0.7, c.metal, { n: 6, ol: 0.4 }); k.stack(x, y, [[0.03, z + r * 0.6], [r, z + r * 1.1]], c.white, { n: 10, ol: 0.6 }); k.box(x, y, z + r * 1.1, 0.04, 0.04, 0.07, c.dark, { ol: 0.3 }); };

// ---------- building models (origin = centre of the footprint) ----------
M.hq = (k, c, f, frame = 0) => {
  const hi = k.hi, P = f === 'P';
  slab(k, c, oct(2.88, 2.88, 0.6));
  const main = [[-1.35, -0.8], [-0.85, -1.3], [0.05, -1.3], [0.55, -0.8], [0.55, 0.4], [-1.35, 0.4]];      // main block, its two back corners cut off
  k.fr(main, 0.07, main, 0.97, c.wall);
  { const lid = shrink(main, 0.92, -0.4, -0.45); k.fr(lid, 0.97, lid, 1.07, c.T); }
  k.box(-0.6, -0.6, 1.07, 0.8, 0.7, 0.2, c.wall2);                         // roof house with the radome
  k.dome(-0.6, -0.6, 0.2, 1.27, c.white, { sq: 0.8 });
  for (const x of [-1.15, -0.82]) win(k, c, x, 0.41, 0.4, 0.22, 0.24);
  k.box(0.35, 0.82, 0.07, 1.5, 1.0, 0.4, c.wall2);                         // garage under a barrel roof
  k.arch([0.35, 0.3, 0.47], [0.35, 1.34, 0.47], 0.77, c.roof, { sq: 0.42 });
  door(k, c, 0.35, 1.33, 0.09, 0.9, 0.36);
  sign(k, c, 0.35, 1.34, 0.45, 1.04, 0.08, c.gold, 'hazard');
  k.box(1.05, -0.95, 0.07, 0.34, 0.34, 0.22, c.dark);                      // crane
  k.rod([1.05, -0.95, 0.25], [1.05, -0.95, 1.95], 0.12, 0.12, c.crane);
  // frames 1..7 swing the jib and lower the hook
  const w = frame / 8 * Math.PI * 2, an = 2.65 + Math.sin(w) * 0.55, ca = Math.cos(an), sa = Math.sin(an), drop = 0.35 + 0.14 * (1 - Math.cos(w)) / 2;
  const tip = [1.05 + ca * 1.32, -0.95 + sa * 1.32], tail = [1.05 - ca * 0.28, -0.95 - sa * 0.28], hk = [1.05 + ca * 1.25, -0.95 + sa * 1.25];
  k.rod([tail[0], tail[1], 1.92], [tip[0], tip[1], 1.92], 0.1, 0.1, c.crane);
  k.box(tail[0], tail[1], 1.72, 0.24, 0.24, 0.2, c.dark);
  k.rod([hk[0], hk[1], 1.87], [hk[0], hk[1], 1.87 - drop], 0.03, 0.03, c.dark, { ol: 0.4, sh: false });
  k.box(hk[0], hk[1], 1.75 - drop, 0.13, 0.13, 0.12, c.crane, { ol: 0.6, mat: null });
  flag(k, c, -1.2, 1.1, 0.07, 1.25);
  k.box(-0.85, 1.0, 0.07, 0.3, 0.3, 0.24, c.crate);
  k.box(-0.52, 1.1, 0.07, 0.24, 0.24, 0.18, c.crate);
  if (!hi) return;
  win(k, c, -0.4, 0.41, 0.75, 1.66, 0.13);                                 // the long window of the operations room
  door(k, c, -0.56, 0.41, 0.09, 0.18, 0.3);
  win(k, c, -0.6, -0.24, 1.13, 0.62, 0.09);
  mast(k, c, -0.3, -0.88, 1.27, 0.5, c.red); mast(k, c, -0.9, -0.88, 1.27, 0.32);
  ac(k, c, -0.95, 0.05, 1.07); vent(k, c, -0.5, 0.08, 1.07);
  dish(k, c, -0.12, 0.08, 1.07);
  if (P) { for (const [r, z, col] of [[0.3, 1.07, c.white], [0.21, 1.076, c.Td], [0.09, 1.082, c.white]]) k.fr(k.ngon(0.1, -0.8, r, 4), z, k.ngon(0.1, -0.8, r, 4), z + 0.006, col, { ol: 0, sh: false, mat: null }); }
  else for (const [r, z, col] of [[0.27, 1.07, c.white], [0.19, 1.076, c.Td], [0.08, 1.082, c.white]]) k.cyl(0.1, -0.8, r, z, 0.006, col, { ol: 0, n: 16, sh: false, mat: null });
  win(k, c, -0.25, 1.33, 0.28, 0.16, 0.16); win(k, c, 0.95, 1.33, 0.28, 0.16, 0.16);
  k.box(0.35, 1.36, 0.56, 0.14, 0.05, 0.04, c.lamp, { ol: 0.3, glow: true, bias: 0.5 });
  vent(k, c, 0.9, 0.62, 0.66); k.box(0.35, 0.8, 0.79, 0.36, 0.3, 0.02, c.glass, { glow: true, ol: 0.4 });
  k.box(1.05, -0.82, 1.56, 0.2, 0.14, 0.2, c.wall, { ol: 0.6, mat: null }); k.box(1.05, -0.745, 1.62, 0.14, 0.02, 0.09, c.glass, { glow: true, ol: 0.3, bias: 0.3 });   // crane cab
  k.rod([1.05, -0.95, 1.95], [1.05, -0.95, 2.24], 0.05, 0.05, c.crane, { ol: 0.6, mat: null });
  k.rod([1.05, -0.95, 2.22], [1.05 + ca * 0.9, -0.95 + sa * 0.9, 1.97], 0.02, 0.02, c.dark, { ol: 0.3, sh: false });
  k.rod([1.05, -0.95, 2.22], [tail[0], tail[1], 1.97], 0.02, 0.02, c.dark, { ol: 0.3, sh: false });
  drum(k, c, -1.28, 0.7, 0.07, c.red); drum(k, c, -1.08, 0.66, 0.07, c.metal);
  lamp(k, c, 1.3, 1.28, 0.07, 0.75);
};

M.pow = (k, c, f) => {
  const hi = k.hi, P = f === 'P';
  slab(k, c, P ? k.ngon(0.05, 0.02, 1.0, 10, Math.PI / 10) : oct(1.88, 1.88, 0.5));
  if (P) {
    k.stack(0.28, -0.2, [[0.56, 0.07], [0.47, 0.36], [0.42, 0.62], [0.4, 0.9], [0.43, 1.08], [0.47, 1.2]], c.conc);     // cooling tower
    k.cyl(0.28, -0.2, 0.48, 1.2, 0.06, c.Td, { ol: 0.7 });
    k.cyl(0.28, -0.2, 0.37, 1.22, 0.05, c.dark, { ol: 0, sh: false });
    k.box(-0.52, 0.3, 0.07, 0.7, 0.9, 0.5, c.wall);
    k.box(-0.52, 0.3, 0.57, 0.74, 0.94, 0.08, c.T);
    win(k, c, -0.52, 0.76, 0.22, 0.34, 0.2);
    k.tube([-0.2, 0.2, 0.4], [0.05, 0.1, 0.4], 0.06, c.metal, { ol: 0.6 });
    if (hi) {
      k.tube([-0.2, 0.45, 0.22], [0.0, 0.34, 0.22], 0.045, c.rust, { ol: 0.5 });
      vent(k, c, -0.66, 0.02, 0.65);
      k.cyl(-0.4, 0.5, 0.06, 0.65, 0.34, c.dark, { n: 8, ol: 0.5 }); k.cyl(-0.4, 0.5, 0.085, 0.99, 0.03, c.dark, { n: 8, ol: 0.45 });
      k.stack(0.78, 0.56, [[0.17, 0.07], [0.1, 0.19], [0.005, 0.24]], c.coal, { n: 7, smooth: false, ol: 0.7 });
    }
  } else {
    k.box(-0.3, 0.2, 0.07, 1.1, 1.1, 0.48, c.wall);                         // turbine hall under a barrel roof
    k.arch([-0.87, 0.2, 0.55], [0.27, 0.2, 0.55], 0.57, c.T, { sq: 0.45 });
    for (const y of [-0.5, 0.2]) {
      k.cyl(0.6, y, 0.2, 0.07, 1.25, c.wall2, { r2: 0.15, mat: 'metal' });
      k.cyl(0.6, y, 0.17, 1.05, 0.12, c.T, { ol: 0, r2: 0.165, sh: false });
      k.cyl(0.6, y, 0.11, 1.32, 0.03, c.dark, { ol: 0, sh: false });
      if (hi) k.cyl(0.6, y, 0.23, 0.07, 0.08, c.dark, { ol: 0.5 });
    }
    win(k, c, -0.55, 0.76, 0.22, 0.26, 0.22);
    if (hi) {
      vent(k, c, -0.62, -0.08, 0.75); vent(k, c, -0.3, -0.08, 0.75);
      k.cyl(-0.02, 0.2, 0.06, 0.75, 0.12, c.metal, { n: 8, ol: 0.5 }); k.tube([-0.02, 0.2, 0.87], [0.42, 0.2, 0.87], 0.06, c.metal, { ol: 0.55 });
      k.tube([0.36, 0.72, 0.21], [0.9, 0.72, 0.21], 0.115, c.metal, { ol: 0.7, n: 10 });      // fuel tank on two saddles
      for (const x of [0.46, 0.8]) k.box(x, 0.72, 0.07, 0.06, 0.2, 0.06, c.dark, { ol: 0.4 });
    }
  }
  const tx = P ? 0.42 : -0.05;                                                // transformer
  k.box(tx, 0.78, 0.09, 0.34, 0.14, 0.3, hi ? c.metal : c.gold, { ol: 0.6, mat: 'grill' });
  if (hi) { sign(k, c, tx, 0.86, 0.3, 0.34, 0.07, c.gold, 'hazard'); for (const s of [-0.1, 0, 0.1]) k.cyl(tx + s, 0.78, 0.022, 0.39, 0.09, c.white, { n: 6, ol: 0.35 }); }
};

M.ref = (k, c, f, frame) => {
  const hi = k.hi;
  for (const [x, y] of [[-0.95, -0.85], [-0.05, -0.95]]) k.cyl(x, y, 0.52, 0, 0.07, c.conc, { ol: 0.8, bias: -5, sh: false, n: 10 });
  slab(k, c, oct(1.3, 1.7, 0.3, 0.86, -0.55)); slab(k, c, [[-0.8, 0.26], [0.8, 0.26], [1.02, 1.44], [-1.02, 1.44]]);
  for (const [x, y] of [[-0.95, -0.85], [-0.05, -0.95]]) { k.cyl(x, y, 0.4, 0.07, 0.9, c.metal); k.dome(x, y, 0.4, 0.97, c.T, { sq: 0.55 }); }
  k.box(0.9, -0.55, 0.07, 1.0, 1.4, 0.8, c.wall);
  k.box(0.9, -0.55, 0.87, 1.04, 1.44, 0.08, c.roof);
  win(k, c, 0.72, 0.16, 0.4); win(k, c, 1.08, 0.16, 0.4);
  k.cyl(1.15, -1.0, 0.11, 0.95, 0.75, c.dark, { n: 8 });                   // flare stack
  k.stack(1.15, -1.0, [[0.1, 1.7], [0.13, 1.8], [0.005, 2.02]], frame ? c.hot : c.fire, { glow: true, n: 8, ol: 0.5 });
  k.rod([-0.5, -0.5, 0.95], [0, 0.45, 0.6], 0.2, 0.14, c.metal, { mat: 'grill' });     // conveyor from the bay up to the silos
  // unloading bay facing south (the harvester gate)
  k.box(-0.62, 0.85, 0.07, 0.16, 1.1, 0.62, c.wall2);
  k.box(0.62, 0.85, 0.07, 0.16, 1.1, 0.62, c.wall2);
  k.box(0, 0.42, 0.07, 1.1, 0.24, 0.62, c.wall2);
  k.box(0, 0.8, 0.69, 1.44, 1.2, 0.09, c.T);
  k.box(0, 0.95, 0.08, 1.06, 0.84, 0.03, c.dark, { ol: 0, bias: -1, sh: false });
  sign(k, c, 0, 1.41, 0.6, 1.4, 0.1, c.gold, 'hazard');
  k.stack(-1.05, 0.95, [[0.24, 0.07], [0.12, 0.26], [0.005, 0.3]], c.gold, { n: 6, smooth: false, mat: 'ore' });
  k.stack(-0.92, 1.2, [[0.16, 0.07], [0.08, 0.2], [0.005, 0.22]], c.gold, { n: 6, smooth: false, mat: 'ore' });
  if (!hi) return;
  ladder(k, c, -1.08, -0.43, 0.1, 0.95); ladder(k, c, 0.14, -0.53, 0.1, 0.95);
  for (const [x, y] of [[-0.95, -0.85], [-0.05, -0.95]]) k.cyl(x, y, 0.07, 1.17, 0.06, c.dark, { n: 8, ol: 0.4 });
  ac(k, c, 0.72, -0.25, 0.95); vent(k, c, 1.15, -0.4, 0.95); vent(k, c, 0.78, -0.75, 0.95, 0.13);
  k.cyl(1.15, -1.0, 0.17, 1.42, 0.035, c.metal, { n: 8, ol: 0.5 });
  k.tube([1.3, 0.17, 0.1], [1.3, 0.17, 0.84], 0.03, c.rust, { ol: 0.45, n: 6 });
  for (const s of [-1, 1]) sign(k, c, s * 0.62, 1.41, 0.09, 0.16, 0.18, c.gold, 'hazard');
  k.box(0, 1.42, 0.53, 0.2, 0.03, 0.05, c.lamp, { glow: true, ol: 0.3, bias: 0.5 });
  drum(k, c, 1.24, 0.42, 0.07, c.red); drum(k, c, 1.05, 0.48, 0.07, c.metal); drum(k, c, 1.2, 0.62, 0.07, c.metal);
  k.box(1.1, 1.05, 0.07, 0.3, 0.26, 0.2, c.crate);
};

M.bar = (k, c, f) => {
  const hi = k.hi;
  slab(k, c, oct(1.9, 1.9, 0.55), c.sand);
  if (f === 'P') {
    k.box(-0.2, -0.1, 0.07, 1.25, 1.2, 0.4, c.wall);
    k.arch([-0.2, -0.72, 0.47], [-0.2, 0.52, 0.47], 0.65, c.T, { sq: 0.55 });
    k.box(0.62, -0.45, 0.07, 0.46, 0.46, 1.0, c.wall2);                    // watch tower
    k.fr(k.ngon(0.62, -0.45, 0.4, 4, Math.PI / 4), 1.07, k.ngon(0.62, -0.45, 0.02, 4, Math.PI / 4), 1.4, c.T);
    win(k, c, 0.62, -0.21, 0.75, 0.2, 0.16);
    door(k, c, -0.2, 0.51, 0.09, 0.3, 0.34);
    win(k, c, -0.6, 0.51, 0.24, 0.2, 0.18); win(k, c, 0.2, 0.51, 0.24, 0.2, 0.18);
    if (hi) {
      win(k, c, 0.62, -0.21, 0.36, 0.1, 0.2);
      k.box(-0.6, -0.42, 0.67, 0.2, 0.2, 0.26, c.wall2, { ol: 0.6 }); k.box(-0.6, -0.42, 0.93, 0.26, 0.26, 0.04, c.dark, { ol: 0.45 });     // chimney
      vent(k, c, -0.1, -0.35, 0.67, 0.14);
      mast(k, c, 0.62, -0.45, 1.4, 0.26, c.red);
      k.box(-0.2, 0.54, 0.47, 0.12, 0.04, 0.04, c.lamp, { glow: true, ol: 0.3, bias: 0.5 });
    }
  } else {
    k.box(0, -0.15, 0.07, 1.55, 1.0, 0.4, c.wall);
    k.fr([[-0.82, -0.7], [0.82, -0.7], [0.82, 0.4], [-0.82, 0.4]], 0.47, [[-0.82, -0.17], [0.82, -0.17], [0.82, -0.13], [-0.82, -0.13]], 0.86, c.T);
    door(k, c, 0, 0.36, 0.09, 0.28, 0.3);
    win(k, c, -0.48, 0.36, 0.2, 0.2, 0.16); win(k, c, 0.48, 0.36, 0.2, 0.2, 0.16);
    if (hi) {
      k.box(0, -0.15, 0.85, 1.68, 0.1, 0.035, c.Td, { ol: 0.4 });           // ridge
      for (const x of [-0.45, 0.45]) k.box(x, -0.15, 0.885, 0.16, 0.14, 0.07, c.metal, { ol: 0.45, mat: 'grill' });
      k.cyl(0.6, 0.12, 0.045, 0.6, 0.26, c.dark, { n: 6, ol: 0.45 });
      mast(k, c, -0.74, -0.6, 0.47, 0.6);
      k.box(0, 0.39, 0.43, 0.12, 0.04, 0.04, c.lamp, { glow: true, ol: 0.3, bias: 0.5 });
    }
  }
  for (const x of [-0.7, -0.38, 0.38, 0.7]) k.box(x, 0.78, 0.07, 0.3, 0.2, 0.15, c.sand, { ol: 0.7 });   // sandbags
  flag(k, c, f === 'P' ? -0.82 : 0.85, 0.62, 0.07, 1.05);
  if (hi) { k.box(0, 0.68, 0.07, 0.34, 0.42, 0.014, c.wood, { ol: 0.3, sh: false }); k.box(f === 'P' ? 0.72 : -0.82, 0.5, 0.07, 0.2, 0.2, 0.16, c.crate, { ol: 0.6 }); }
};

M.fac = (k, c) => {
  const hi = k.hi;
  slab(k, c, [[-1.44, -1.44], [1.44, -1.44], [1.44, 0.85], [0.9, 1.44], [-0.9, 1.44], [-1.44, 0.85]]);
  k.box(0, -0.25, 0.07, 2.6, 2.1, 0.95, c.wall);
  for (let i = 0; i < 3; i++) {     // saw-tooth roof: team-coloured slopes, lit glazing towards the south
    const y0 = -1.3 + i * 0.7, y1 = y0 + 0.7;
    k.fr([[-1.3, y0], [1.3, y0], [1.3, y1], [-1.3, y1]], 1.02, [[-1.3, y1 - 0.06], [1.3, y1 - 0.06], [1.3, y1], [-1.3, y1]], 1.32, c.T);
    k.box(0, y1 + 0.005, 1.06, 2.44, 0.03, 0.2, c.glass, { ol: 0.4, glow: true, bias: 0.3 });
  }
  door(k, c, 0, 0.81, 0.09, 1.35, 0.7);
  sign(k, c, 0, 0.82, 0.79, 1.5, 0.11, c.gold, 'hazard');
  win(k, c, -1.0, 0.81, 0.45, 0.3, 0.22); win(k, c, 1.0, 0.81, 0.45, 0.3, 0.22);
  k.cyl(1.05, -1.05, 0.13, 1.0, 0.7, c.dark, { n: 8 });
  k.box(0, 1.15, 0.07, 1.5, 0.5, 0.02, c.dark, { ol: 0, bias: -1, sh: false, mat: null });
  k.box(-1.0, 1.15, 0.07, 0.34, 0.34, 0.26, c.crate); k.box(-1.05, 1.1, 0.33, 0.22, 0.22, 0.18, c.crate);
  drum(k, c, 1.05, 1.12, 0.07, c.red); drum(k, c, 0.86, 1.22, 0.07, c.metal);
  if (!hi) return;
  for (const x of [-0.45, 0.45]) k.box(x, 0.84, 0.92, 0.12, 0.04, 0.04, c.lamp, { glow: true, ol: 0.3, bias: 0.5 });
  k.cyl(1.05, -1.05, 0.16, 1.66, 0.04, c.dark, { n: 8, ol: 0.5 }); k.cyl(0.72, -1.1, 0.07, 1.0, 0.5, c.metal, { n: 8, ol: 0.5 });
  k.tube([1.24, 0.82, 0.1], [1.24, 0.82, 0.96], 0.03, c.rust, { ol: 0.45, n: 6 }); k.tube([-1.24, 0.82, 0.1], [-1.24, 0.82, 0.96], 0.03, c.metal, { ol: 0.45, n: 6 });
  for (const x of [-0.62, 0.62]) k.box(x, 1.15, 0.09, 0.035, 0.5, 0.004, c.gold, { ol: 0, sh: false, mat: null });      // guide lines on the apron
  for (const z of [0.07, 0.14]) k.cyl(1.27, 1.25, 0.1, z, 0.07, c.tyre, { n: 10, ol: 0.5, mat: 'drum' });
};

M.rad = (k, c, f, frame) => {
  const hi = k.hi;
  slab(k, c, k.ngon(0, 0.06, 0.98, 12, Math.PI / 12));
  block(k, c, oct(1.4, 1.2, 0.34, 0, 0.1), 0.07, 0.5, c.wall, 0, 0.1);
  win(k, c, -0.24, 0.71, 0.22, 0.18, 0.18); win(k, c, 0.24, 0.71, 0.22, 0.18, 0.18);
  door(k, c, 0, 0.71, 0.09, 0.22, 0.3);
  k.cyl(0.25, -0.05, 0.16, 0.65, 0.5, c.metal, { n: 8 });
  // the turning aerial: three mesh panels in a shallow arc
  const a = frame * Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a), at = (lx, ly) => [0.25 + lx * ca - ly * sa, -0.05 + lx * sa + ly * ca];
  k.box(0.25, -0.05, 1.15, 0.46, 0.08, 0.42, c.white, { yaw: a, bias: 0.5, mat: 'mesh' });
  for (const s of [-1, 1]) { const [x, y] = at(s * 0.36, 0.06); k.box(x, y, 1.15, 0.32, 0.07, 0.42, c.white, { yaw: a + s * 0.42, bias: 0.5, mat: 'mesh' }); }
  const [fx, fy] = at(0, 0.22);
  k.rod([0.25, -0.05, 1.2], [fx, fy, 1.36], 0.03, 0.03, c.dark, { ol: 0.35, sh: false });
  k.box(fx, fy, 1.3, 0.12, 0.12, 0.12, c.T, { yaw: a, ol: 0.5, bias: 0.6 });
  if (f === 'A') { k.cyl(-0.42, -0.2, 0.2, 0.65, 0.12, c.Td, { ol: 0.7 }); k.dome(-0.42, -0.2, 0.26, 0.74, c.white); }
  else { k.rod([-0.45, -0.25, 0.65], [-0.45, -0.25, 1.5], 0.06, 0.06, c.metal, { ol: 0.6, mat: 'girder' }); k.dome(-0.45, -0.25, 0.07, 1.5, frame % 4 < 2 ? c.red : c.dark, { glow: true, ol: 0.5 }); }
  if (!hi) return;
  ac(k, c, -0.42, 0.45, 0.65, 0.3, 0.22); vent(k, c, 0.5, 0.48, 0.65, 0.13);
  mast(k, c, 0.62, -0.42, 0.65, 0.4);
  k.box(0.62, 0.84, 0.07, 0.3, 0.14, 0.2, c.metal, { ol: 0.6, mat: 'grill' });     // generator
  drum(k, c, 0.36, 0.84, 0.07, c.red);
  k.box(0, 0.74, 0.43, 0.1, 0.04, 0.04, c.lamp, { glow: true, ol: 0.3, bias: 0.5 });
};

M.tech = (k, c, f) => {
  const hi = k.hi, P = f === 'P';
  slab(k, c, oct(2.88, 1.88, 0.5));
  block(k, c, [[1.3, 0.8], [1.3, -0.8], [-0.5, -0.8], [-0.97, -0.6], [-1.27, -0.22], [-1.27, 0.22], [-0.97, 0.6], [-0.5, 0.8]], 0.07, 0.6, c.wall, 0, 0);      // the west end is round, under the dome
  k.cyl(-0.55, -0.1, 0.55, 0.75, 0.1, c.wall2, { mat: null });
  k.dome(-0.55, -0.1, 0.5, 0.85, c.glass, { glow: true });
  k.box(0.75, -0.15, 0.75, 0.8, 0.9, 0.35, c.wall2);
  k.box(0.75, 0.31, 0.83, 0.5, 0.03, 0.16, P ? c.fire : c.zap, { glow: true, ol: 0.45, bias: 0.3, mat: null });
  k.rod([1.05, -0.45, 1.1], [1.05, -0.45, 1.75], 0.05, 0.05, c.metal, { ol: 0.6, mat: null });
  k.rod([0.85, -0.45, 1.6], [1.25, -0.45, 1.6], 0.04, 0.04, c.metal, { ol: 0.5, mat: null });
  for (const x of [-0.33, 0.45, 0.9]) win(k, c, x, 0.81, 0.26, 0.22, 0.2);
  door(k, c, 0, 0.81, 0.09, 0.3, 0.36);
  if (!hi) return;
  k.box(0.75, -0.15, 1.1, 0.84, 0.94, 0.04, c.Td, { ol: 0.5 });
  vent(k, c, 0.55, -0.35, 1.14, 0.14); k.box(0.95, 0.05, 1.14, 0.2, 0.2, 0.05, c.glass, { glow: true, ol: 0.4 });
  k.box(0, 0.88, 0.47, 0.5, 0.18, 0.03, c.T, { ol: 0.5 });                  // porch
  for (const s of [-1, 1]) k.box(s * 0.22, 0.95, 0.07, 0.03, 0.03, 0.4, c.dark, { ol: 0.3, sh: false });
  if (P) for (const x of [0.5, 0.78, 1.06]) { k.cyl(x, 0.55, 0.09, 0.75, 0.16, c.dark, { n: 8, ol: 0.5 }); k.cyl(x, 0.55, 0.06, 0.91, 0.015, c.fire, { glow: true, ol: 0, n: 8 }); }    // glowing vents
  else for (const x of [0.52, 0.94]) k.rod([x, 0.42, 0.87], [x, 0.72, 0.78], 0.34, 0.016, c.navy, { ol: 0.5, mat: 'solar' });        // solar panels
  dish(k, c, 0.2, -0.5, 0.75, 0.15);
  k.tube([0.28, 0.2, 0.8], [0.28, 0.6, 0.8], 0.04, c.metal, { ol: 0.45, n: 6 });
};

M.wall = (k, c) => {
  k.box(0, 0, 0, 1.0, 1.0, 0.4, c.conc, { ol: 0.9, mat: k.hi ? 'conc' : null });
  k.box(0, 0, 0.4, 0.7, 0.7, 0.05, shade(c.conc, -0.14), { ol: 0.4 });
};

// A minefield as its owner sees it: three plates half buried in turned earth, and a marker stake with a pennant.
M.mine = (k, c) => {
  k.fr(k.ngon(0, 0.02, 0.46, 9, 0.3), 0, k.ngon(0, 0.02, 0.4, 9, 0.3), 0.025, c.sand, { ol: 0.5, sh: false, bias: -5, mat: null });
  for (const [x, y, r] of [[-0.2, -0.14, 0.13], [0.19, -0.02, 0.135], [-0.06, 0.24, 0.125]]) {
    k.cyl(x, y, r, 0.02, 0.05, c.gun, { n: 10, ol: 0.6, mat: null });
    k.cyl(x, y, r * 0.45, 0.07, 0.03, c.red, { n: 8, ol: 0.35, sh: false, mat: null });
    if (k.hi) for (let i = 0; i < 3; i++) { const a = i * 2.094 + x * 9; k.box(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, 0.07, 0.025, 0.025, 0.02, c.metal, { ol: 0, sh: false, mat: null }); }
  }
  k.rod([0.33, -0.3, 0], [0.33, -0.3, 0.42], 0.03, 0.03, c.wood, { ol: 0.4, mat: null });
  k.box(0.43, -0.3, 0.27, 0.2, 0.025, 0.13, c.T, { ol: 0.5, sh: false });
};
// The rocket silo: a round shaft in a concrete collar with the hatch slid open and the nose of the rocket just showing,
// a blast wall behind it and a control hut with a mast in the corner.
M.silo = (k, c) => {
  const hi = k.hi, sx = -0.2, sy = 0.14;
  slab(k, c, oct(1.9, 1.9, 0.42));
  k.cyl(sx, sy, 0.66, 0.07, 0.2, c.bunker, { n: 12 });
  k.cyl(sx, sy, 0.69, 0.11, 0.07, c.gold, { n: 12, ol: 0.35, sh: false, mat: 'hazard' });
  k.cyl(sx, sy, 0.47, 0.27, 0.012, c.coal, { n: 12, ol: 0.5, sh: false, mat: null });
  k.cyl(sx, sy, 0.17, 0.24, 0.24, c.white, { n: 10, ol: 0.6, mat: null });                    // the rocket: white, with a red tip
  k.cyl(sx, sy, 0.175, 0.36, 0.045, c.coal, { n: 10, ol: 0.3, sh: false, mat: null });
  k.stack(sx, sy, [[0.17, 0.48], [0.1, 0.63]], c.white, { n: 10, ol: 0.6, mat: null });
  k.stack(sx, sy, [[0.1, 0.63], [0.012, 0.76]], c.red, { n: 10, ol: 0.6, mat: null });
  for (const s of [-1, 1]) {      // the two halves of the hatch, slid aside on their rails
    k.box(sx + s * 0.66, sy, 0.27, 0.36, 0.86, 0.07, c.T, { ol: 0.7 });
    if (hi) k.box(sx + s * 0.66, sy, 0.34, 0.3, 0.8, 0.012, c.Td, { ol: 0, sh: false });
  }
  k.box(sx, sy - 0.74, 0.07, 1.1, 0.12, 0.5, c.conc, { ol: 0.8 });                 // blast wall
  k.box(0.66, -0.62, 0.07, 0.46, 0.44, 0.36, c.wall);                            // control hut
  k.box(0.66, -0.62, 0.43, 0.54, 0.52, 0.05, c.roof, { ol: 0.5 });
  win(k, c, 0.66, -0.395, 0.2, 0.24, 0.14);
  mast(k, c, 0.82, -0.78, 0.48, 0.52, c.red);
  if (!hi) return;
  k.box(sx, sy - 0.74, 0.57, 1.14, 0.16, 0.03, shade(c.conc, -0.14), { ol: 0.4 });
  sign(k, c, 0.66, 0.84, 0.03, 0.4, 0.1, c.gold, 'hazard');
  k.tube([0.42, -0.5, 0.16], [0.14, -0.2, 0.16], 0.035, c.metal, { ol: 0.45, n: 6 });      // fuel line from the hut to the shaft
  for (const [x, y] of [[0.72, 0.3], [0.86, 0.46]]) drum(k, c, x, y, 0.07, c.rust);
  lamp(k, c, -0.86, 0.78, 0.07, 0.5);
  dish(k, c, 0.52, -0.72, 0.48, 0.1);
};

M.pill = (k, c) => {
  k.cyl(0, 0, 0.44, 0, 0.32, c.bunker, { n: 8 });
  k.cyl(0, 0, 0.46, 0.12, 0.08, c.T, { n: 8, ol: 0.4, sh: false });
  k.dome(0, 0, 0.42, 0.32, c.bunker, { sq: 0.45, n: 8, mat: null });
  if (k.hi) for (const [x, y, yaw] of [[-0.33, 0.33, -0.75], [0.33, 0.33, 0.75]]) k.box(x, y, 0, 0.3, 0.14, 0.12, c.sand, { yaw, ol: 0.6 });
};
M.pill_t = (k, c) => {
  k.box(0.1, 0, 0.3, 0.3, 0.3, 0.12, c.dark, { ol: 0.6 });
  k.tube([0.2, 0, 0.36], [0.62, 0, 0.36], 0.035, c.gun, { ol: 0.7 });
  if (k.hi) { k.tube([0.52, 0, 0.36], [0.64, 0, 0.36], 0.048, c.gun, { ol: 0.5 }); k.box(0.02, 0.1, 0.42, 0.1, 0.07, 0.05, c.crate, { ol: 0.4 }); }
};
M.tur = (k, c) => {
  k.cyl(0, 0, 0.46, 0, 0.2, c.conc, { n: 8 });
  k.cyl(0, 0, 0.36, 0.2, 0.08, c.dark, { n: 8, ol: 0.6 });
  if (k.hi) for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; k.cyl(Math.cos(a) * 0.41, Math.sin(a) * 0.41, 0.03, 0.2, 0.03, c.dark, { n: 6, ol: 0.3, sh: false }); }
};
M.tur_t = (k, c) => {
  k.fr([[-0.3, -0.26], [0.26, -0.22], [0.26, 0.22], [-0.3, 0.26]], 0.28, [[-0.24, -0.2], [0.2, -0.17], [0.2, 0.17], [-0.24, 0.2]], 0.56, c.T);
  k.tube([0.2, 0, 0.42], [0.82, 0, 0.42], 0.052, c.gun, { ol: 0.8 });
  k.tube([0.76, 0, 0.42], [0.9, 0, 0.42], 0.075, c.gun, { ol: 0.6 });
  k.cyl(-0.08, 0, 0.09, 0.56, 0.05, c.Tl, { n: 8, ol: 0.5, mat: 'hatch' });
  if (!k.hi) return;
  k.box(0.26, 0, 0.34, 0.08, 0.24, 0.16, c.Td, { ol: 0.5 });
  k.box(-0.32, 0, 0.34, 0.1, 0.34, 0.12, c.Td, { ol: 0.45, mat: 'grill' });
  k.rod([-0.18, -0.12, 0.56], [-0.22, -0.12, 0.92], 0.014, 0.014, c.dark, { ol: 0.25, sh: false });
};
M.flt = (k, c) => {
  k.cyl(0, 0, 0.42, 0, 0.14, c.dark, { n: 8 });
  k.cyl(0, 0, 0.3, 0.14, 0.5, c.wall2, { n: 8, r2: 0.24 });
  k.cyl(0, 0, 0.27, 0.36, 0.08, c.T, { n: 8, ol: 0.4, r2: 0.26, sh: false });
  k.cyl(-0.3, 0.24, 0.13, 0, 0.36, c.red, { n: 8, ol: 0.8, mat: 'drum', smooth: true });
  if (k.hi) { k.tube([-0.3, 0.24, 0.4], [-0.12, 0.1, 0.56], 0.03, c.metal, { ol: 0.4, n: 6 }); k.cyl(-0.3, 0.24, 0.05, 0.36, 0.04, c.dark, { n: 6, ol: 0.4 }); }
};
M.flt_t = (k, c) => {
  k.cyl(0, 0, 0.2, 0.64, 0.16, c.dark, { n: 8, ol: 0.8 });
  k.tube([0.1, 0, 0.72], [0.5, 0, 0.72], 0.05, c.metal, { ol: 0.8, mat: 'barrel' });
  k.box(0.54, 0, 0.66, 0.08, 0.14, 0.12, c.fire, { glow: true, ol: 0.5 });
  if (k.hi) k.cyl(0, 0, 0.11, 0.8, 0.04, c.metal, { n: 8, ol: 0.4, mat: 'hatch' });
};
M.coil = (k, c, f, frame) => {
  k.cyl(0, 0, 0.42, 0, 0.18, c.dark, { n: 8 });
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; k.rod([Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.18], [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 1.12], 0.08, 0.08, c.metal, { ol: 0.8, mat: null }); }
  k.cyl(0, 0, 0.2, 0.56, 0.1, c.T, { n: 8, ol: 0.7 });
  if (k.hi) for (const z of [0.7, 0.83, 0.96]) k.cyl(0, 0, 0.19 - (z - 0.7) * 0.15, z, 0.05, c.white, { n: 10, ol: 0.5, r2: 0.13 - (z - 0.7) * 0.12 });     // insulator discs
  k.cyl(0, 0, 0.13, 1.1, 0.1, c.dark, { n: 8, ol: 0.7 });
  k.rod([-0.1, 0, 1.18], [-0.32, 0, 1.66], 0.07, 0.07, c.metal, { ol: 0.7, mat: null });
  k.rod([0.1, 0, 1.18], [0.32, 0, 1.66], 0.07, 0.07, c.metal, { ol: 0.7, mat: null });
  k.dome(0, 0, frame % 2 ? 0.13 : 0.1, 1.36, frame % 2 ? c.white : c.zap, { glow: true, ol: 0.5, n: 8 });
  if (k.hi) sign(k, c, 0, 0.4, 0.03, 0.26, 0.11, c.gold, 'hazard');
};

M.air = (k, c) => {
  const hi = k.hi;
  { const apron = oct(2.9, 1.9, 0.42); k.fr(apron, 0, apron, 0.05, c.asph, { ol: 0.8, bias: -5, sh: false }); }
  for (const [x, y] of [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.42], [0.7, 0.42]]) { k.cyl(x, y, 0.33, 0.05, 0.006, c.gold, { ol: 0, bias: -4, sh: false, n: 16 }); k.cyl(x, y, 0.26, 0.056, 0.006, c.asph, { ol: 0, bias: -3.9, sh: false, n: 16, mat: null }); }
  k.cyl(0, -0.76, 0.17, 0.05, 0.7, c.wall, { n: 6, smooth: false });       // six-sided control tower
  k.cyl(0, -0.76, 0.27, 0.75, 0.2, c.glass, { n: 6, glow: true, smooth: false, r2: 0.3 });
  k.cyl(0, -0.76, 0.33, 0.95, 0.06, c.T, { n: 6, smooth: false });
  k.rod([0, -0.78, 1.01], [0, -0.78, 1.3], 0.03, 0.03, c.dark, { ol: 0.5 });
  k.rod([1.32, 0.82, 0.05], [1.32, 0.82, 0.6], 0.04, 0.04, c.dark, { ol: 0.5 });   // windsock
  k.tube([1.3, 0.82, 0.56], [1.02, 0.82, 0.5], 0.055, c.fire, { ol: 0.6, r2: 0.03, n: 6 });
  for (const x of [-1.36, 1.36]) k.box(x, -0.86, 0.05, 0.08, 0.08, 0.07, c.hot, { glow: true, ol: 0.5 });
  k.box(-1.36, 0.86, 0.05, 0.08, 0.08, 0.07, c.hot, { glow: true, ol: 0.5 });
  if (!hi) return;
  k.box(0, 0.02, 0.05, 2.5, 0.035, 0.004, c.white, { ol: 0, sh: false });     // taxi lines
  for (const x of [-0.7, 0.7]) k.box(x, 0.02, 0.05, 0.035, 0.22, 0.004, c.white, { ol: 0, sh: false });
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) k.box(x, 0.88, 0.05, 0.05, 0.05, 0.04, c.zap, { glow: true, ol: 0.35 });
  door(k, c, 0, -0.645, 0.07, 0.12, 0.2);
  k.box(0, -0.78, 1.3, 0.2, 0.05, 0.05, c.red, { glow: true, ol: 0.35 });
  drum(k, c, -0.32, -0.8, 0.05, c.red); drum(k, c, -0.5, -0.84, 0.05, c.metal);
  k.box(0.42, -0.8, 0.05, 0.34, 0.22, 0.05, c.dark, { ol: 0.5 });           // bomb cart
  for (const y of [-0.85, -0.75]) k.tube([0.28, y, 0.14], [0.54, y, 0.14], 0.042, c.gun, { ol: 0.5, n: 6, mat: null });
};
M.aag = (k, c) => {
  k.cyl(0, 0, 0.44, 0, 0.16, c.conc, { n: 8 }); k.cyl(0, 0, 0.3, 0.16, 0.14, c.dark, { n: 8, ol: 0.7 }); k.cyl(0, 0, 0.32, 0.2, 0.05, c.T, { n: 8, ol: 0.4, sh: false });
  if (k.hi) { k.box(-0.3, 0.3, 0, 0.18, 0.14, 0.1, c.crate, { ol: 0.5, yaw: 0.6 }); k.box(0.31, 0.29, 0, 0.14, 0.12, 0.08, c.bunker, { ol: 0.5, yaw: -0.5, mat: null }); }
};
M.aag_t = (k, c) => {
  k.box(-0.04, 0, 0.3, 0.3, 0.36, 0.16, c.T);
  for (const y of [-0.09, 0.09]) { k.tube([0.04, y, 0.42], [0.56, y, 0.8], 0.03, c.gun, { ol: 0.7 }); if (k.hi) k.tube([0.5, y, 0.756], [0.6, y, 0.829], 0.042, c.gun, { ol: 0.5 }); }
  if (!k.hi) return;
  k.rod([0.1, 0, 0.36], [0.2, 0, 0.6], 0.5, 0.02, c.Td, { ol: 0.5 });         // gun shield
  k.box(-0.2, 0, 0.46, 0.1, 0.16, 0.08, c.dark, { ol: 0.4 });
};
M.sam = (k, c) => {
  k.cyl(0, 0, 0.44, 0, 0.16, c.dark, { n: 8 }); k.cyl(0, 0, 0.26, 0.16, 0.2, c.wall2, { n: 8, ol: 0.8 }); k.cyl(0, 0, 0.28, 0.24, 0.05, c.T, { n: 8, ol: 0.4, sh: false });
  if (k.hi) sign(k, c, 0, 0.42, 0.03, 0.26, 0.1, c.gold, 'hazard');
};
M.sam_t = (k, c) => {
  k.rod([-0.24, 0, 0.42], [0.22, 0, 0.64], 0.46, 0.1, c.metal, { mat: 'grill' });
  for (const y of [-0.12, 0.12]) {
    k.tube([-0.22, y, 0.52], [0.36, y, 0.8], 0.05, c.white, { ol: 0.7, mat: null });
    k.tube([0.36, y, 0.8], [0.5, y, 0.868], 0.05, c.red, { ol: 0.6, r2: 0.008, mat: null });
    if (k.hi) k.rod([-0.2, y, 0.53], [-0.1, y, 0.578], 0.16, 0.012, c.red, { ol: 0.3, sh: false });      // fins
  }
  if (k.hi) k.box(-0.26, 0, 0.36, 0.12, 0.3, 0.1, c.Td, { ol: 0.5 });
};

// ---------- vehicles (facing east; the kit turns them) ----------
const tracks = (k, c, len, wid, tw, h) => {
  for (const s of [-1, 1]) {
    const y = s * (wid / 2 - tw / 2);
    k.fr([[-len / 2, y - tw / 2], [len / 2, y - tw / 2], [len / 2, y + tw / 2], [-len / 2, y + tw / 2]], 0, [[-len / 2 + 0.05, y - tw / 2], [len / 2 - 0.05, y - tw / 2], [len / 2 - 0.05, y + tw / 2], [-len / 2 + 0.05, y + tw / 2]], h, c.track);
    if (k.hi) for (const e of [-1, 1]) k.box(e * (len / 2 - 0.1), y, h, 0.13, tw + 0.02, 0.014, c.Td, { ol: 0.35, sh: false, mat: null });   // mudguards
  }
};
const skirts = (k, c, len, wid, h) => { for (const s of [-1, 1]) k.box(0, s * (wid / 2 + 0.012), h * 0.42, len * 0.84, 0.022, h * 0.66, c.Td, { ol: 0.45, mat: 'skirt', sh: false }); };
const hull = (k, c, x, len, wid, z0, h, col, top = 0.82) =>
  k.fr([[x - len / 2, -wid / 2], [x + len / 2, -wid / 2], [x + len / 2, wid / 2], [x - len / 2, wid / 2]], z0,
    [[x - len / 2 * top, -wid / 2 * 0.86], [x + len / 2 * top * 0.9, -wid / 2 * 0.86], [x + len / 2 * top * 0.9, wid / 2 * 0.86], [x - len / 2 * top, wid / 2 * 0.86]], z0 + h, col);
const wheels = (k, c, xs, wid, r = 0.11, th = 0.1) => { for (const x of xs) for (const s of [-1, 1]) k.tube([x, s * (wid / 2 - th / 2), r], [x, s * (wid / 2 + th / 2), r], r, c.tyre, { ol: 0.8, n: 10 }); };
const lights = (k, c, x, y, z) => { for (const s of [-1, 1]) k.box(x, s * y, z, 0.035, 0.07, 0.045, c.lamp, { glow: true, ol: 0.35 }); };
const pipes = (k, c, x, y, z, l = 0.1) => { for (const s of [-1, 1]) k.tube([x, s * y, z], [x - l, s * y, z], 0.028, c.rust, { ol: 0.4, n: 6 }); };
const whip = (k, c, x, y, z, h = 0.34) => k.rod([x, y, z], [x - 0.04, y, z + h], 0.014, 0.014, c.dark, { ol: 0.25, sh: false });
const plate = (k, c, x, y, z, lx, ly, col, mat = null) => k.box(x, y, z, lx, ly, 0.012, col, { ol: mat ? 0.3 : 0, sh: false, mat });

M.lt = (k, c) => {
  tracks(k, c, 0.8, 0.64, 0.17, 0.16); hull(k, c, 0, 0.74, 0.46, 0.09, 0.2, c.T);
  if (!k.hi) return;
  plate(k, c, -0.24, 0, 0.29, 0.1, 0.3, c.dark, 'grill'); plate(k, c, 0.21, 0, 0.29, 0.08, 0.34, c.Tl);
  lights(k, c, 0.335, 0.15, 0.2); pipes(k, c, -0.32, 0.17, 0.25);
};
M.lt_t = (k, c) => {
  k.cyl(-0.04, 0, 0.17, 0.29, 0.14, c.T, { n: 8, r2: 0.14 });
  k.tube([0.06, 0, 0.36], [0.56, 0, 0.36], 0.032, c.gun, { ol: 0.8 });
  k.cyl(-0.08, 0, 0.06, 0.43, 0.04, c.Tl, { n: 8, ol: 0.5, mat: 'hatch' });
  if (!k.hi) return;
  k.box(0.11, 0, 0.31, 0.07, 0.14, 0.1, c.Td, { ol: 0.5 });
  k.tube([0.49, 0, 0.36], [0.59, 0, 0.36], 0.046, c.gun, { ol: 0.55 });
  whip(k, c, -0.14, 0.09, 0.43);
};
M.mt = (k, c) => {
  tracks(k, c, 0.94, 0.76, 0.2, 0.18); hull(k, c, 0, 0.88, 0.56, 0.1, 0.22, c.T);
  k.box(-0.36, 0, 0.32, 0.12, 0.4, 0.06, c.Td, { ol: 0.5, mat: 'grill' });
  if (!k.hi) return;
  skirts(k, c, 0.94, 0.76, 0.18);
  plate(k, c, 0.265, 0, 0.32, 0.09, 0.4, c.Tl);
  lights(k, c, 0.4, 0.2, 0.22); pipes(k, c, -0.42, 0.22, 0.28);
};
M.mt_t = (k, c) => {
  k.fr([[-0.26, -0.21], [0.2, -0.18], [0.2, 0.18], [-0.26, 0.21]], 0.32, [[-0.2, -0.16], [0.14, -0.14], [0.14, 0.14], [-0.2, 0.16]], 0.5, c.T);
  k.tube([0.14, 0, 0.41], [0.68, 0, 0.41], 0.042, c.gun, { ol: 0.8 });
  k.tube([0.62, 0, 0.41], [0.73, 0, 0.41], 0.06, c.gun, { ol: 0.6 });
  k.cyl(-0.08, 0.02, 0.07, 0.5, 0.05, c.Tl, { n: 8, ol: 0.5, mat: 'hatch' });
  if (!k.hi) return;
  k.box(0.2, 0, 0.35, 0.07, 0.2, 0.12, c.Td, { ol: 0.5 });
  k.tube([0.36, 0, 0.41], [0.47, 0, 0.41], 0.056, c.gun, { ol: 0.5 });
  k.box(-0.3, 0, 0.36, 0.1, 0.3, 0.1, c.Td, { ol: 0.45, mat: 'grill' });
  for (const s of [-1, 1]) k.tube([0.04, s * 0.2, 0.4], [0.13, s * 0.22, 0.45], 0.022, c.dark, { ol: 0.35, n: 6 });
  whip(k, c, -0.18, -0.1, 0.5);
};
M.td = (k, c) => {
  tracks(k, c, 0.98, 0.76, 0.2, 0.18);
  k.fr([[-0.46, -0.3], [0.44, -0.3], [0.44, 0.3], [-0.46, 0.3]], 0.1, [[-0.4, -0.23], [0.14, -0.2], [0.14, 0.2], [-0.4, 0.23]], 0.44, c.T);
  k.tube([0.1, 0, 0.3], [0.98, 0, 0.3], 0.048, c.gun, { ol: 0.8 });
  k.tube([0.9, 0, 0.3], [1.04, 0, 0.3], 0.07, c.gun, { ol: 0.6 });
  k.cyl(-0.2, 0.06, 0.07, 0.44, 0.05, c.Tl, { n: 8, ol: 0.5, mat: 'hatch' });
  if (!k.hi) return;
  skirts(k, c, 0.98, 0.76, 0.18);
  k.box(0.3, 0, 0.2, 0.1, 0.26, 0.17, c.Td, { ol: 0.5 });
  plate(k, c, -0.3, -0.08, 0.44, 0.14, 0.16, c.dark, 'grill');
  k.box(0.04, -0.11, 0.44, 0.07, 0.05, 0.04, c.dark, { ol: 0.35 });
  lights(k, c, 0.43, 0.22, 0.18); pipes(k, c, -0.45, 0.2, 0.3);
  whip(k, c, -0.34, 0.14, 0.44);
};
M.art = (k, c) => {
  tracks(k, c, 0.8, 0.62, 0.17, 0.15);
  hull(k, c, -0.02, 0.7, 0.44, 0.08, 0.16, c.T);
  k.box(0.02, 0, 0.24, 0.1, 0.5, 0.3, c.Td);
  k.tube([-0.12, 0, 0.34], [0.78, 0, 0.72], 0.045, c.gun, { ol: 0.8 });
  k.rod([-0.3, 0, 0.26], [-0.12, 0, 0.34], 0.16, 0.14, c.metal, { ol: 0.7, mat: null });
  if (!k.hi) return;
  k.tube([0.69, 0, 0.682], [0.81, 0, 0.733], 0.064, c.gun, { ol: 0.6 });
  k.tube([0.1, 0, 0.433], [0.34, 0, 0.534], 0.062, c.Td, { ol: 0.5, mat: null });
  k.box(-0.44, 0, 0.02, 0.04, 0.5, 0.14, c.metal, { ol: 0.5, mat: null });       // recoil spade
  k.box(-0.2, 0.14, 0.24, 0.14, 0.1, 0.08, c.crate, { ol: 0.45 });
  lights(k, c, 0.315, 0.14, 0.17);
};
M.ht = (k, c) => {
  tracks(k, c, 1.06, 0.88, 0.24, 0.2); hull(k, c, 0, 1.0, 0.64, 0.11, 0.22, c.T, 0.9);
  for (const s of [-1, 1]) k.cyl(-0.42, s * 0.18, 0.08, 0.33, 0.14, c.metal, { n: 8, ol: 0.7, mat: 'hatch' });
  if (!k.hi) return;
  k.tube([-0.56, -0.2, 0.3], [-0.56, 0.2, 0.3], 0.07, c.Td, { ol: 0.6, mat: 'drum' });     // spare fuel
  k.tube([-0.3, 0.37, 0.24], [0.3, 0.37, 0.24], 0.035, c.wood, { ol: 0.5, n: 6, mat: null });   // unditching beam
  k.box(-0.08, -0.37, 0.2, 0.3, 0.1, 0.07, c.Td, { ol: 0.45, mat: null });
  plate(k, c, 0.33, 0, 0.33, 0.08, 0.46, c.Tl);
  k.box(0.46, 0.2, 0.2, 0.035, 0.08, 0.05, c.lamp, { glow: true, ol: 0.35 });
};
M.ht_t = (k, c) => {
  k.stack(0, 0, [[0.27, 0.33], [0.26, 0.45], [0.18, 0.54], [0.1, 0.56]], c.T, { n: 10 });
  k.tube([0.18, 0, 0.44], [0.8, 0, 0.44], 0.058, c.gun, { ol: 0.8 });
  k.tube([0.74, 0, 0.44], [0.86, 0, 0.44], 0.08, c.gun, { ol: 0.6 });
  k.cyl(-0.06, 0.06, 0.07, 0.56, 0.05, c.Tl, { n: 8, ol: 0.5, mat: 'hatch' });
  if (!k.hi) return;
  k.tube([0.22, -0.1, 0.44], [0.22, 0.1, 0.44], 0.078, c.Td, { ol: 0.5, mat: null });      // mantlet
  for (const s of [-1, 1]) k.rod([-0.14, s * 0.25, 0.47], [0.08, s * 0.25, 0.47], 0.016, 0.016, c.dark, { ol: 0.25, sh: false });
  whip(k, c, -0.16, -0.1, 0.55, 0.4);
};
M.kol = (k, c) => {
  tracks(k, c, 1.3, 1.12, 0.32, 0.26);
  hull(k, c, -0.02, 1.2, 0.8, 0.14, 0.26, c.T, 0.92);
  k.box(0.72, 0, 0.03, 0.08, 1.04, 0.3, c.metal, { mat: null });               // dozer blade
  for (const s of [-1, 1]) k.box(-0.5, s * 0.26, 0.4, 0.2, 0.14, 0.1, c.Td, { ol: 0.6, mat: 'grill' });
  if (!k.hi) return;
  k.box(0.766, 0, 0.2, 0.012, 1.0, 0.09, c.gold, { ol: 0, mat: 'hazard', sh: false });
  for (const s of [-1, 1]) {
    k.rod([0.5, s * 0.44, 0.2], [0.7, s * 0.44, 0.14], 0.05, 0.05, c.dark, { ol: 0.4 });
    k.cyl(-0.6, s * 0.4, 0.035, 0.26, 0.34, c.rust, { n: 6, ol: 0.45 }); k.cyl(-0.6, s * 0.4, 0.05, 0.6, 0.025, c.dark, { n: 6, ol: 0.35 });
    k.box(0.02, s * 0.46, 0.26, 0.5, 0.14, 0.08, c.Td, { ol: 0.5, mat: null });
  }
  plate(k, c, 0.39, 0, 0.4, 0.1, 0.6, c.Tl);
};
M.kol_t = (k, c) => {
  k.fr([[-0.36, -0.32], [0.3, -0.27], [0.3, 0.27], [-0.36, 0.32]], 0.4, [[-0.3, -0.25], [0.2, -0.2], [0.2, 0.2], [-0.3, 0.25]], 0.66, c.T);
  k.tube([0.2, 0, 0.53], [1.02, 0, 0.53], 0.082, c.gun, { ol: 0.9 });
  k.tube([0.94, 0, 0.53], [1.12, 0, 0.53], 0.115, c.gun, { ol: 0.7 });
  k.cyl(-0.12, -0.08, 0.1, 0.66, 0.1, c.Tl, { n: 8, ol: 0.6, mat: 'hatch' });
  k.tube([-0.08, -0.08, 0.8], [0.16, -0.08, 0.8], 0.02, c.gun, { ol: 0.5, n: 6 });
  if (!k.hi) return;
  k.box(0.3, 0, 0.44, 0.1, 0.34, 0.18, c.Td, { ol: 0.55 });
  k.tube([0.5, 0, 0.53], [0.64, 0, 0.53], 0.1, c.gun, { ol: 0.5 });
  k.box(-0.42, 0, 0.44, 0.14, 0.44, 0.14, c.Td, { ol: 0.5, mat: 'grill' });
  k.box(0.16, 0.15, 0.66, 0.08, 0.08, 0.07, c.lamp, { glow: true, ol: 0.4 });
  whip(k, c, -0.26, 0.16, 0.66, 0.44);
};
M.jeep = (k, c) => {
  wheels(k, c, [-0.24, 0.24], 0.44);
  k.fr([[-0.36, -0.2], [0.38, -0.2], [0.38, 0.2], [-0.36, 0.2]], 0.1, [[-0.36, -0.18], [0.34, -0.17], [0.34, 0.17], [-0.36, 0.18]], 0.26, c.T);
  k.box(0.1, 0, 0.26, 0.04, 0.34, 0.14, c.glass, { ol: 0.5, glow: true });
  k.box(-0.2, 0, 0.26, 0.24, 0.3, 0.05, c.Td, { ol: 0.5 });
  if (!k.hi) return;
  plate(k, c, 0.23, 0, 0.26, 0.2, 0.08, c.Tl);
  lights(k, c, 0.385, 0.13, 0.17);
  k.box(0.4, 0, 0.08, 0.04, 0.42, 0.05, c.dark, { ol: 0.4 });
  k.tube([-0.38, 0, 0.24], [-0.45, 0, 0.24], 0.085, c.tyre, { ol: 0.6, n: 10 });      // spare wheel
  for (const s of [-1, 1]) k.box(0.0, s * 0.09, 0.26, 0.08, 0.1, 0.07, c.dark, { ol: 0.3 });
};
M.jeep_t = (k, c) => {
  k.rod([-0.16, 0, 0.3], [-0.16, 0, 0.46], 0.05, 0.05, c.dark, { ol: 0.5 });
  k.tube([-0.26, 0, 0.47], [0.16, 0, 0.47], 0.024, c.gun, { ol: 0.7, n: 6 });
  if (k.hi) { k.box(-0.14, 0.06, 0.42, 0.1, 0.06, 0.06, c.crate, { ol: 0.4, mat: null }); k.box(-0.24, 0, 0.44, 0.06, 0.1, 0.06, c.dark, { ol: 0.4 }); }
};
M.kat = (k, c) => {
  wheels(k, c, [-0.32, -0.08, 0.32], 0.5);
  k.box(-0.04, 0, 0.11, 0.9, 0.42, 0.1, c.Td);
  k.box(0.3, 0, 0.21, 0.26, 0.42, 0.24, c.T);
  k.box(0.44, 0, 0.3, 0.03, 0.34, 0.12, c.glass, { ol: 0.45, glow: true });
  if (!k.hi) {
    k.rod([-0.46, 0, 0.3], [0.2, 0, 0.62], 0.44, 0.1, c.metal);
    for (const y of [-0.15, -0.05, 0.05, 0.15]) k.box(0.2, y, 0.6, 0.07, 0.07, 0.07, c.red, { ol: 0.4, glow: true });
    return;
  }
  k.rod([-0.46, 0, 0.3], [0.2, 0, 0.62], 0.46, 0.05, c.metal, { mat: 'grill' });            // launch rails
  for (const y of [-0.165, -0.055, 0.055, 0.165]) {
    k.tube([-0.43, y, 0.38], [0.14, y, 0.656], 0.042, c.white, { ol: 0.6, n: 6, mat: null });
    k.tube([0.14, y, 0.656], [0.26, y, 0.714], 0.042, c.red, { ol: 0.5, n: 6, r2: 0.008, mat: null });
  }
  k.rod([0.08, 0, 0.21], [0.08, 0, 0.54], 0.3, 0.04, c.dark, { ol: 0.5 });
  k.box(0.3, 0.1, 0.45, 0.07, 0.07, 0.05, c.fire, { glow: true, ol: 0.4 });
  k.box(0.47, 0, 0.1, 0.04, 0.46, 0.06, c.dark, { ol: 0.4 });
  lights(k, c, 0.445, 0.15, 0.22);
  k.tube([-0.3, 0.24, 0.17], [-0.02, 0.24, 0.17], 0.05, c.rust, { ol: 0.5, n: 6, mat: 'drum' });
};
M.harv = (k, c, f, frame) => {
  wheels(k, c, [-0.32, 0.3], 0.6, 0.14, 0.14);
  k.box(-0.14, 0, 0.14, 0.7, 0.58, 0.34, c.harv);
  k.box(-0.14, 0, 0.3, 0.72, 0.6, 0.07, c.T, { ol: 0.4, sh: false });
  if (frame) k.stack(-0.14, 0, [[0.28, 0.48], [0.16, 0.6], [0.005, 0.64]], c.gold, { n: 6, smooth: false, ol: 0.7, mat: 'ore' });
  else k.box(-0.14, 0, 0.48, 0.56, 0.44, 0.02, c.dark, { ol: 0, sh: false });
  k.box(0.36, 0, 0.14, 0.3, 0.5, 0.3, c.T);
  k.box(0.52, 0, 0.26, 0.03, 0.4, 0.13, c.glass, { ol: 0.45, glow: true });
  k.box(0.66, 0, 0.02, 0.14, 0.7, 0.18, c.metal, { mat: null });
  if (!k.hi) return;
  k.box(0.736, 0, 0.1, 0.012, 0.68, 0.08, c.gold, { ol: 0, mat: 'hazard', sh: false });
  k.cyl(0.26, -0.18, 0.032, 0.44, 0.2, c.rust, { n: 6, ol: 0.45 }); k.cyl(0.26, -0.18, 0.046, 0.64, 0.02, c.dark, { n: 6, ol: 0.35 });
  k.box(0.38, 0.12, 0.44, 0.07, 0.07, 0.05, c.fire, { glow: true, ol: 0.4 });
  for (const s of [-1, 1]) { k.rod([0.5, s * 0.28, 0.3], [0.66, s * 0.31, 0.16], 0.04, 0.04, c.dark, { ol: 0.4 }); k.box(-0.495, s * 0.2, 0.3, 0.02, 0.09, 0.05, c.red, { glow: true, ol: 0.3 }); }
};

M.jet = (k, c) => {
  for (const sg of [-1, 1]) k.fr([[0.14, sg * 0.06], [-0.3, sg * 0.06], [-0.44, sg * 0.54], [-0.28, sg * 0.54]], 0.17, [[0.14, sg * 0.06], [-0.3, sg * 0.06], [-0.44, sg * 0.54], [-0.28, sg * 0.54]], 0.2, c.Td, { mat: null });
  for (const sg of [-1, 1]) k.fr([[-0.4, sg * 0.05], [-0.56, sg * 0.05], [-0.6, sg * 0.24], [-0.5, sg * 0.24]], 0.19, [[-0.4, sg * 0.05], [-0.56, sg * 0.05], [-0.6, sg * 0.24], [-0.5, sg * 0.24]], 0.21, c.Td, { ol: 0.7, mat: null });
  k.tube([-0.56, 0, 0.2], [0.38, 0, 0.2], 0.085, c.T, { n: 8 });
  k.tube([0.38, 0, 0.2], [0.64, 0, 0.19], 0.085, c.dark, { ol: 0.8, r2: 0.012 });
  k.box(0.16, 0, 0.27, 0.24, 0.1, 0.07, c.glass, { glow: true, ol: 0.5 });
  k.fr([[-0.3, -0.015], [-0.56, -0.015], [-0.56, 0.015], [-0.3, 0.015]], 0.27, [[-0.48, -0.015], [-0.58, -0.015], [-0.58, 0.015], [-0.48, 0.015]], 0.5, c.T, { ol: 0.8, mat: null });
  for (const sg of [-1, 1]) k.tube([-0.2, sg * 0.3, 0.14], [0.02, sg * 0.3, 0.14], 0.032, c.gun, { ol: 0.5, n: 6, mat: null });
  if (!k.hi) return;
  for (const sg of [-1, 1]) {
    k.box(0.04, sg * 0.105, 0.15, 0.2, 0.05, 0.09, c.Td, { ol: 0.45, mat: null });                    // intakes
    k.fr([[-0.02, sg * 0.2], [-0.12, sg * 0.2], [-0.2, sg * 0.4], [-0.1, sg * 0.4]], 0.2, [[-0.02, sg * 0.2], [-0.12, sg * 0.2], [-0.2, sg * 0.4], [-0.1, sg * 0.4]], 0.206, c.Tl, { ol: 0, sh: false, mat: null });
    k.tube([-0.42, sg * 0.54, 0.185], [-0.22, sg * 0.54, 0.185], 0.02, c.white, { ol: 0.4, n: 6, mat: null });
  }
  k.tube([-0.56, 0, 0.2], [-0.63, 0, 0.2], 0.06, c.gun, { ol: 0.6, mat: null });
  k.tube([-0.63, 0, 0.2], [-0.645, 0, 0.2], 0.04, c.fire, { glow: true, ol: 0, mat: null });
};
M.heli = (k, c, f, frame) => {
  for (const sg of [-1, 1]) { k.rod([-0.2, sg * 0.2, 0.03], [0.32, sg * 0.2, 0.03], 0.04, 0.04, c.dark, { ol: 0.5 }); k.box(0.04, sg * 0.25, 0.14, 0.24, 0.1, 0.09, c.dark, { ol: 0.6 }); }
  k.tube([-0.2, 0, 0.27], [-0.78, 0, 0.31], 0.045, c.Td, { r2: 0.03, mat: null });
  k.box(-0.78, 0, 0.26, 0.12, 0.03, 0.24, c.T, { ol: 0.8, mat: null });
  k.fr([[-0.3, -0.16], [0.3, -0.16], [0.3, 0.16], [-0.3, 0.16]], 0.1, [[-0.24, -0.12], [0.16, -0.12], [0.16, 0.12], [-0.24, 0.12]], 0.38, c.T, { mat: null });
  k.fr([[0.3, -0.14], [0.44, -0.1], [0.44, 0.1], [0.3, 0.14]], 0.12, [[0.16, -0.11], [0.3, -0.07], [0.3, 0.07], [0.16, 0.11]], 0.36, c.glass, { glow: true, ol: 0.8 });
  k.cyl(-0.02, 0, 0.05, 0.38, 0.08, c.dark, { n: 6, ol: 0.5 });
  if (k.hi) {
    k.box(-0.1, 0, 0.38, 0.22, 0.16, 0.05, c.Td, { ol: 0.45, mat: 'grill' });
    for (const sg of [-1, 1]) { k.tube([-0.06, sg * 0.25, 0.185], [0.2, sg * 0.25, 0.185], 0.04, c.gun, { ol: 0.5, n: 6, mat: null }); k.tube([0.2, sg * 0.25, 0.185], [0.215, sg * 0.25, 0.185], 0.028, c.red, { ol: 0, n: 6, mat: null, glow: true }); }
    k.tube([0.4, 0, 0.13], [0.54, 0, 0.11], 0.016, c.gun, { ol: 0.4, n: 6, mat: null });
    k.box(-0.8, 0.03, 0.34, 0.2, 0.012, 0.03, c.dark, { ol: 0.3, sh: false }); k.box(-0.8, 0.03, 0.26, 0.03, 0.012, 0.2, c.dark, { ol: 0.3, sh: false });      // tail rotor
    k.cyl(-0.02, 0, 0.08, 0.455, 0.02, c.metal, { n: 8, ol: 0.4, mat: null });
  }
  const a = frame ? 2.2 : 0.6;
  k.box(-0.02, 0, 0.46, 1.36, 0.07, 0.02, c.dark, { yaw: a, ol: 0.6, bias: 1, sh: false });
  k.box(-0.02, 0, 0.46, 1.36, 0.07, 0.02, c.dark, { yaw: a + 1.5708, ol: 0.6, bias: 1, sh: false });
};

// ---------- neutral buildings (2x2): roof and flag take the owner's colour, pale canvas while nobody holds them ----------
M.depot = (k, c) => {      // an open store under a pitched roof on posts, with crates and drums stacked around it
  const hi = k.hi, slab = [[-0.92, -0.8], [0.62, -0.8], [0.62, 0.4], [-0.92, 0.4]];
  k.fr(slab, 0, slab, 0.05, c.conc, { ol: 0.7, bias: -5, sh: false });
  for (const [x, y] of [[-0.84, -0.72], [0.54, -0.72], [0.54, 0.32], [-0.84, 0.32]]) k.box(x, y, 0.05, 0.08, 0.08, 0.6, c.wood, { ol: 0.5 });
  k.box(-0.46, -0.3, 0.05, 0.5, 0.5, 0.34, c.crate, { ol: 0.6 }); k.box(0.12, -0.36, 0.05, 0.42, 0.42, 0.3, c.crate, { ol: 0.6 });
  k.box(-0.42, -0.3, 0.39, 0.32, 0.32, 0.2, c.crate, { ol: 0.6 });
  drum(k, c, 0.32, 0.12, 0.05, c.red); drum(k, c, 0.1, 0.18, 0.05, c.metal);
  k.fr([[-1.0, -0.88], [0.7, -0.88], [0.7, 0.48], [-1.0, 0.48]], 0.65, [[-1.0, -0.22], [0.7, -0.22], [0.7, -0.18], [-1.0, -0.18]], 1.02, c.T);
  if (hi) k.box(-0.15, -0.2, 1.01, 1.76, 0.1, 0.035, c.Td, { ol: 0.4 });
  k.box(0.86, 0.6, 0, 0.26, 0.26, 0.24, c.crate, { ol: 0.6 });
  for (const x of [0.28, 0.6]) k.box(x, 0.8, 0, 0.3, 0.2, 0.15, c.sand, { ol: 0.7 });
  flag(k, c, 0.88, -0.62, 0, 1.25);
  if (hi) { k.box(-0.62, 0.7, 0, 0.4, 0.3, 0.2, c.crate, { ol: 0.6 }); k.box(-0.58, 0.7, 0.2, 0.26, 0.22, 0.16, c.crate, { ol: 0.6 }); drum(k, c, -0.2, 0.76, 0, c.metal); lamp(k, c, -0.95, 0.56, 0, 0.75); }
};
M.tower = (k, c) => {      // a lookout: four braced legs, a cabin with windows all round, a pointed roof
  const hi = k.hi, base = k.ngon(0, 0.1, 0.66, 8, Math.PI / 8);
  k.fr(base, 0, base, 0.05, c.conc, { ol: 0.7, bias: -5, sh: false });
  for (const [x, y] of [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.5], [-0.4, 0.5]]) k.rod([x, y, 0.05], [x * 0.7, 0.1 + (y - 0.1) * 0.7, 1.2], 0.075, 0.075, c.wood, { ol: 0.5 });
  if (hi) {
    k.rod([-0.38, 0.5, 0.15], [0.3, 0.42, 0.8], 0.04, 0.04, c.wood, { ol: 0.35 }); k.rod([0.38, 0.5, 0.15], [-0.3, 0.42, 0.8], 0.04, 0.04, c.wood, { ol: 0.35 });
    ladder(k, c, 0, 0.52, 0.05, 1.2);
  }
  k.box(0, 0.1, 1.2, 0.82, 0.82, 0.06, c.wood, { ol: 0.6 });
  k.box(0, 0.1, 1.26, 0.68, 0.68, 0.36, c.wall, { ol: 0.7 });
  win(k, c, 0, 0.45, 1.36, 0.46, 0.17);
  k.fr(k.ngon(0, 0.1, 0.66, 4, Math.PI / 4), 1.62, k.ngon(0, 0.1, 0.02, 4, Math.PI / 4), 2.02, c.T);
  mast(k, c, 0, 0.1, 2.02, 0.3, c.red);
  flag(k, c, 0.74, 0.74, 0, 0.95);
  if (hi) { k.box(-0.66, 0.76, 0, 0.3, 0.2, 0.15, c.sand, { ol: 0.7 }); drum(k, c, 0.5, -0.4, 0, c.metal); }
};
M.shop = (k, c) => {       // a field workshop: an arched hall open to the south, a hoist beside it, tyres and tools in the yard
  const hi = k.hi;
  k.box(-0.18, -0.2, 0, 1.3, 1.2, 0.32, c.wall2, { ol: 0.7 });
  k.arch([-0.18, -0.82, 0.32], [-0.18, 0.42, 0.32], 0.67, c.T, { n: 9, sq: 0.8 });
  k.box(-0.18, 0.41, 0.02, 0.84, 0.03, 0.6, c.dark, { ol: 0.5, bias: 0.3, mat: 'door' });
  sign(k, c, -0.18, 0.44, 0.64, 0.5, 0.1, c.gold, 'hazard');
  k.box(0.76, -0.4, 0, 0.1, 0.1, 1.05, c.crane, { ol: 0.5 });
  k.rod([0.76, -0.4, 1.05], [0.76, 0.5, 1.05], 0.08, 0.08, c.crane, { ol: 0.5 });
  k.rod([0.76, 0.44, 1.05], [0.76, 0.44, 0.6], 0.025, 0.025, c.dark, { ol: 0.3 });
  k.box(0.76, 0.44, 0.46, 0.15, 0.15, 0.14, c.metal, { ol: 0.5 });
  flag(k, c, -0.9, 0.72, 0, 1.0);
  for (const x of [0.28, 0.5]) k.tube([x, 0.8, 0.1], [x + 0.08, 0.8, 0.1], 0.1, c.tyre, { n: 8, ol: 0.6 });
  if (hi) { drum(k, c, 0.88, 0.8, 0, c.red); k.box(-0.56, 0.74, 0, 0.3, 0.22, 0.18, c.crate, { ol: 0.6 }); vent(k, c, -0.18, -0.55, 0.84, 0.13); }
};

export const TURRET = { lt: 'lt_t', mt: 'mt_t', ht: 'ht_t', kol: 'kol_t', jeep: 'jeep_t', tur: 'tur_t', pill: 'pill_t', flt: 'flt_t', aag: 'aag_t', sam: 'sam_t' };
export const FRAMES = { rad: 16, coil: 2, harv: 2, ref: 2, heli: 2, hq: 8 };

// ---------- infantry: drawn directly in 2D ----------
function drawInf(g, S, t, c, f, dir, frame) {
  // dir: 0..7 clockwise from east. u = one "pixel" of the soldier, who is about 20 u tall with his feet at the origin.
  // The uniform is the faction's field cloth; the team colour sits on shoulders, sleeves and the helmet band.
  // Every kind has its own outline: rifle, launcher on the shoulder, raised grenade, fuel tanks and mask, hard hat and toolbox.
  const u = S / 36, a = dir * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a), back = dy < -0.3, side = dx < -0.01 ? -1 : 1;
  const hi = STYLE.detail === 'high', mil = STYLE.palette === 'military', ow = STYLE.outline === 'thin' ? 0.9 : 1.3, P = f === 'P';
  const cloth = P ? (mil ? '#75674a' : '#93804f') : (mil ? '#586541' : '#66804a'), gear = P ? (mil ? '#463c2b' : '#54462e') : (mil ? '#39432e' : '#42522f');
  const helm = t === 'eng' ? (mil ? '#c9a63c' : '#f2c21c') : t === 'flm' ? '#3b3e44' : P ? (mil ? '#5f5239' : '#74603b') : (mil ? '#4b5939' : '#566c3f');
  const skin = '#e0b48a', boot = '#25262b', steel = '#34373d', wood = '#7c5b39', olive = P ? '#5c5236' : '#4f5b3f';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const blob = (x, y, w, h, col, r = 1.6) => { g.beginPath(); g.roundRect((x - w / 2) * u, (y - h / 2) * u, w * u, h * u, r * u); g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = ow * u; g.stroke(); g.fill(); };
  const line = (x0, y0, x1, y1, w, col) => { g.beginPath(); g.moveTo(x0 * u, y0 * u); g.lineTo(x1 * u, y1 * u); g.strokeStyle = OUT; g.lineWidth = (w + ow + 0.1) * u; g.stroke(); g.strokeStyle = col; g.lineWidth = w * u; g.stroke(); };
  const dot = (x, y, r, col) => { g.beginPath(); g.arc(x * u, y * u, r * u, 0, 7); g.fillStyle = col; g.fill(); };
  const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0, lift = Math.abs(step) * 0.25;
  // boots and trousers
  blob(-2.2 + step * 0.5, -1.3, 3.7, 2.6, boot, 1); blob(2.2 - step * 0.5, -1.3 - lift, 3.7, 2.6, boot, 1);
  blob(-2.1 + step * 0.4, -4.7, 3.3, 5, cloth, 1.1); blob(2.1 - step * 0.4, -4.7 - lift, 3.3, 5, cloth, 1.1);
  // what he carries on his back: seen beside the body from the front, on top of it from behind
  const pack = () => {
    const x = back ? 0 : -side * 3.8;
    if (t === 'flm') { for (const q of back ? [-2, 2] : [-4.4, 4.4]) { blob(q, -11.2, 3.4, 7.8, c.red, 1.6); if (hi) blob(q, -14.6, 2.2, 1.3, steel, 0.5); } }
    else if (t === 'rkt') { blob(x, -10.6, back ? 6.2 : 3.6, 6.4, gear, 1.3); for (const q of back ? [-1.6, 1.6] : [x]) { line(q, -13.6, q, -17.4, 1.5, olive); line(q, -17.6, q, -18.4, 1.5, c.red); } }      // spare rockets
    else if (t === 'eng') { blob(x, -10.2, back ? 5.6 : 3.2, 5.4, gear, 1.2); if (hi) line(back ? 2.4 : x - side * 0.9, -8, back ? 2.4 : x - side * 0.9, -15, 1, '#9aa1a8'); }      // a pipe sticking up
    else if (t === 'gren') blob(back ? -2.6 : x - side * 0.3, -8, 3.4, 4.2, gear, 1.1);      // grenade satchel on the hip
    else { blob(x, -10.4, back ? 6.2 : 3.3, 5.8, gear, 1.3); if (hi) blob(x, -13.7, back ? 6.6 : 3.6, 1.8, cloth, 0.8); }      // pack with a rolled blanket
  };
  if (!back) pack();
  // tunic in the team's colour, the faction's webbing over the chest
  blob(0, -10.4, 9.2, 8.2, c.T, 2.4);
  if (hi) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.roundRect(-4.6 * u, -8.4 * u, 9.2 * u, 2.2 * u, 0.8 * u); g.fill(); }
  if (t === 'eng') { blob(0, -9.5, 5.6, 6.2, cloth, 1.2); if (!back) for (const q of [-1, 1]) line(q * 1.9, -12.6, q * 2.4, -14.3, 1, cloth); }      // dungarees
  else if (t === 'gren') { if (!back) { line(-side * 3.6, -13.6, side * 3.2, -7.4, 1.5, gear); if (hi) for (const k of [0.25, 0.5, 0.75]) dot(-side * 3.6 + side * 6.8 * k, -13.6 + 6.2 * k, 0.8, '#3d4a30'); } }      // bandolier
  else if (!back) { blob(0, -10, 5.6, 6.6, gear, 1.4); if (hi) { blob(-1.5, -8.2, 2, 2, cloth, 0.5); blob(1.5, -8.2, 2, 2, cloth, 0.5); } }
  blob(0, -6.4, 8.6, 1.5, t === 'eng' ? '#4a3a24' : boot, 0.5);
  if (t === 'eng' && hi && !back) for (const x of [-2.6, 2.4]) line(x, -6.2, x, -4.4, 0.9, '#c9a63c');      // tools in the belt
  if (back) pack();
  // arms and what he holds
  const hx = dx * 3.2, hy = -9 + dy * 1.6, sl = c.Td, arm = (x0, x1, y1) => { line(x0, -12.6, x1, y1, 1.9, sl); dot(x1, y1, 1.1, skin); };
  if (t === 'rkt') {
    const y = -14.4;
    arm(side * 4, dx * 2.2, y + dy * 0.9 + 1.4);
    line(-dx * 6.5, y - dy * 2.6, dx * 8, y + dy * 3.2, 3.2, olive); line(-dx * 6.5, y - dy * 2.6, -dx * 5, y - dy * 2, 4.2, olive);      // tube with a flared end
    line(dx * 8.2, y + dy * 3.3, dx * 9.6, y + dy * 3.9, 2.3, c.red);
    if (hi) line(dx * 1.5, y + dy * 0.6 - 1.9, dx * 3, y + dy * 1.2 - 1.9, 0.9, steel);
  } else if (t === 'gren') {
    arm(-side * 4, -side * 4.4, -7.6);
    const ax = side * 5.4 + dx * 1.6, ay = -18;
    line(side * 4.2, -12.8, ax, ay, 1.9, sl); dot(ax, ay, 1.1, skin);
    line(ax, ay, ax + side * 0.9, ay - 3, 1, wood); blob(ax + side * 1.1, ay - 4, 2.5, 3, '#3d4a30', 1.1);      // stick grenade
  } else if (t === 'flm') {
    arm(-side * 4, hx - dx * 1.5, hy + 2.6); arm(side * 4, hx + dx * 2.6, hy + 3.2);
    line(hx - dx * 3, hy + 2.6 - dy * 1.2, -side * (back ? 2 : 4.4), -8.6, 0.9, steel);      // hose to the tanks
    line(hx - dx * 3, hy + 2.6 - dy * 1.2, hx + dx * 6.6, hy + 2.6 + dy * 3, 2.4, steel); line(hx + dx * 6.6, hy + 2.6 + dy * 3, hx + dx * 8, hy + 2.6 + dy * 3.6, 1.4, '#8a8f98');
    dot(hx + dx * 8.9, hy + 2.6 + dy * 4, 1.5, c.fire); dot(hx + dx * 8.9, hy + 2.6 + dy * 4, 0.7, c.hot);      // pilot flame
  } else if (t === 'eng') {
    arm(-side * 4, -side * 5.2, -8.6); arm(side * 4, hx + dx * 1.6, hy + 2.6);
    line(-side * 5.2, -8.6, -side * 6.2, -12.4, 1.1, '#9aa1a8'); dot(-side * 6.3, -12.9, 1, '#9aa1a8'); dot(-side * 6.3, -12.9, 0.45, OUT);      // spanner
    blob(hx + dx * 1.6, hy + 5, 5.6, 3.6, mil ? '#8a3a30' : '#c8372c', 0.8); line(hx + dx * 1.6 - 1.5, hy + 3, hx + dx * 1.6 + 1.5, hy + 3, 0.9, steel);      // toolbox
  } else {
    arm(-side * 4, hx - dx * 1.2, hy + 1); arm(side * 4, hx + dx * 3.2, hy + 1.8);
    const x0 = hx - dx * 4.6, y0 = hy + 0.8 - dy * 2.2, x1 = hx + dx * 8, y1 = hy + 0.8 + dy * 3.6;
    line(x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.3, x1, y1, 1.4, steel); line(x0, y0, x0 + (x1 - x0) * 0.36, y0 + (y1 - y0) * 0.36, 2.3, wood);      // rifle: barrel and stock
    if (hi) line(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5 + 0.6, x0 + (x1 - x0) * 0.5 - dx * 0.4, y0 + (y1 - y0) * 0.5 + 2.2, 1.1, steel);                // magazine
  }
  // head: the helmet sits low, so the face is a strip in its shadow
  const px = dx * 0.6;
  blob(px, -15.6, 5.4, 4.6, skin, 2.2);
  if (!back) {
    if (t === 'flm') { blob(px + dx * 0.4, -15.3, 5.2, 4, '#2c2f34', 1.6); dot(px + dx * 0.8 - 1.2, -15.8, 0.8, '#c9d2d4'); dot(px + dx * 0.8 + 1.2, -15.8, 0.8, '#c9d2d4'); dot(px + dx * 0.8, -13.9, 1, '#7d838a'); }      // mask
    else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect((px - 2.5) * u, -17.2 * u, 5 * u, 1.5 * u); if (hi) { g.fillStyle = OUT; g.fillRect((px + dx * 1.2 - 1.5) * u, -15.9 * u, 1 * u, 0.9 * u); g.fillRect((px + dx * 1.2 + 0.5) * u, -15.9 * u, 1 * u, 0.9 * u); } }
  }
  if (t === 'gren') {      // a field cap with a peak
    blob(px, -18.2, 6.2, 2.6, cloth, 1); if (!back) { line(px + dx * 1.6 - 1.6, -17, px + dx * 1.6 + 1.6, -17, 0.9, gear); dot(px + dx * 0.6, -18.3, 0.7, c.Tl); }
  } else {
    const hr = t === 'eng' ? 3.7 : 4.1;
    g.beginPath(); g.ellipse(px * u, -17.2 * u, hr * u, 3.3 * u, 0, Math.PI, 0); g.closePath(); g.fillStyle = helm; g.strokeStyle = OUT; g.lineWidth = ow * u; g.stroke(); g.fill();
    if (t === 'eng') { blob(px, -17.1, 9, 1.3, helm, 0.6); if (hi) line(px, -20.2, px, -18.2, 0.9, shade(helm, -0.2)); }      // hard hat: brim and ridge
    else {
      g.fillStyle = shade(helm, -0.22); g.fillRect((px - hr) * u, -17.9 * u, hr * 2 * u, 0.9 * u);      // rim
      if (t !== 'flm') { g.fillStyle = c.T; g.fillRect((px - hr * 0.86) * u, -19.3 * u, hr * 1.72 * u, 0.8 * u); }      // the team's band
      if (P && t !== 'flm') { blob(px - 3.7, -16, 1.7, 2.8, helm, 0.8); blob(px + 3.7, -16, 1.7, 2.8, helm, 0.8); }
    }
    if (hi) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse((px - 1.4) * u, -19 * u, 1.5 * u, 0.8 * u, -0.4, 0, 7); g.fill(); }
  }
}

// ---------- cache ----------
export const isInf = t => DEFS.units[t] && DEFS.units[t].cls === 'inf';

// name: building/unit type or turret model. dir: 0..15 for vehicles (0 = east, clockwise), 0..7 for infantry.
// dmg: 0 = whole, 1 = damaged, 2 = nearly destroyed (buildings).
export function sprite(name, S, { dir = 0, color = 0, faction = 'A', frame = 0, dmg = 0 } = {}) {
  const key = name + '|' + S + '|' + dir + '|' + color + '|' + faction + '|' + frame + '|' + dmg;
  let s = cache.get(key); if (s) { cache.delete(key); cache.set(key, s); return s; }
  if (dmg) s = wreck(sprite(name, S, { dir, color, faction, frame }), dmg, name);
  else {
    const c = pal(faction, color), mil = STYLE.palette === 'military';
    if (isInf(name)) {
      const cv = mkCanvas(S * 0.9, S * 0.96), g = cv.getContext('2d');
      g.translate(S * 0.45, S * 0.84); drawInf(g, S, name, c, faction, dir, frame);
      s = { cv, ax: S * 0.45, ay: S * 0.84, S };
    } else {
      const veh = name.endsWith('_t') || !!DEFS.units[name], k = new Kit(dir * Math.PI / 8, c, faction, veh);
      M[name](k, c, faction, frame);
      s = renderParts(k.parts, S, !!(DEFS.buildings[name] || DEFS.neutral[name]), { veh, mil, seed: hashStr(name), wheel: mil ? '#7d7a68' : '#868d95' });     // only buildings cast a shaped shadow
    }
  }
  cache.set(key, s); cachePx += pxOf(s);
  if (cachePx > CACHE_MAX) for (const [k, v] of cache) { if (cachePx <= CACHE_MAX * 0.75 || k === key) break; cache.delete(k); cachePx -= pxOf(v); }
  return s;
}
export const spriteStats = () => ({ n: cache.size, px: cachePx, max: CACHE_MAX });
export const hasModel = n => !!M[n] || isInf(n);

// Sidebar picture: the model on a little stage.
export function cameo(type, faction, color, w = 128, h = 96) {
  const cv = mkCanvas(w, h), g = cv.getContext('2d');
  const bd = DEFS.buildings[type] || DEFS.neutral[type], grad = g.createLinearGradient(0, 0, 0, h), mil = STYLE.palette === 'military';
  if (mil) { grad.addColorStop(0, '#48524f'); grad.addColorStop(0.62, '#8b8d78'); grad.addColorStop(0.63, '#7c7850'); grad.addColorStop(1, '#55533a'); }
  else { grad.addColorStop(0, '#39506a'); grad.addColorStop(0.62, '#5d7a93'); grad.addColorStop(0.63, '#6f8f52'); grad.addColorStop(1, '#4f6d3a'); }
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const draw = (sp, x, y, k) => g.drawImage(sp.cv, x - sp.ax * k, y - sp.ay * k, sp.cv.width * k, sp.cv.height * k);
  if (bd) {
    const S = 64, sp = sprite(type, S, { color, faction }), tr = TURRET[type];
    const k = Math.min((w - 10) / sp.cv.width, (h - 8) / sp.cv.height, 1.5);
    const x = w / 2 - (sp.cv.width / 2 - sp.ax) * k, y = h / 2 - (sp.cv.height / 2 - sp.ay) * k + 2;
    draw(sp, x, y, k); if (tr) draw(sprite(tr, S, { dir: 2, color, faction }), x, y, k);
  } else if (isInf(type)) {
    const sp = sprite(type, 150, { dir: 1, color, faction }); draw(sp, w / 2, h * 0.9, 1);
  } else {
    const S = 96, dir = 1, sp = sprite(type, S, { dir, color, faction, frame: type === 'harv' ? 1 : 0 }), tr = TURRET[type];
    const k = Math.min((w - 8) / sp.cv.width, (h - 8) / sp.cv.height, 1.25);
    const x = w / 2 - (sp.cv.width / 2 - sp.ax) * k, y = h / 2 - (sp.cv.height / 2 - sp.ay) * k + 3;
    draw(sp, x, y, k); if (tr) draw(sprite(tr, S, { dir, color, faction }), x, y, k);
  }
  return cv;
}
