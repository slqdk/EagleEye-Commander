// EagleEye Commander — battlefield generator. One shared map per match.
// Terrain: '.' grass, 'f' forest, 'r' rock, 'w' water, 'b' ford (passable water crossing).
import { mulberry32 } from './util.js';

function noise(seed) {
  const h = (a, b) => {
    let n = (a * 374761393 + b * 668265263 + seed * 982451653) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  };
}

export const sizeFor = k => k <= 2 ? 60 : k <= 3 ? 68 : k <= 4 ? 76 : 88;
export const passable = c => c === '.' || c === 'b';

export function generateMap(seed, k) {
  const n = sizeFor(k), N = n * n, R = mulberry32(seed);
  const t = new Array(N).fill('.'), ore = new Uint8Array(N);
  const nf = noise(seed + 1), nf2 = noise(seed + 2), nr = noise(seed + 3), nw = noise(seed + 4);
  const at = (x, y) => y * n + x, inb = (x, y) => x >= 0 && y >= 0 && x < n && y < n;

  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const f = nf(x / 9, y / 9) * 0.7 + nf2(x / 3.5, y / 3.5) * 0.3;
    if (f > 0.63) t[at(x, y)] = 'f';
    if (nr(x / 5, y / 5) > 0.8) t[at(x, y)] = 'r';
    if (nw(x / 11, y / 11) > 0.78) t[at(x, y)] = 'w';
  }

  // one meandering river with fords
  if (R() < 0.8) {
    const horiz = R() < 0.5, off = n * (0.3 + R() * 0.4), amp = n * (0.08 + R() * 0.08), ph = R() * 6.28, fr = 2 + R() * 2;
    const fords = [0.2 + R() * 0.1, 0.45 + R() * 0.1, 0.72 + R() * 0.1].map(v => Math.round(v * n));
    for (let i = 0; i < n; i++) {
      const c = Math.round(off + Math.sin(i / n * fr * 3.14 + ph) * amp);
      const ford = fords.some(fx => Math.abs(i - fx) <= 1);
      for (let w = -1; w <= 1; w++) {
        const x = horiz ? i : c + w, y = horiz ? c + w : i;
        if (inb(x, y)) t[at(x, y)] = ford ? 'b' : 'w';
      }
    }
  }

  // start positions on a ring around the centre
  const starts = [], a0 = R() * Math.PI * 2, cx = n / 2, cy = n / 2, ring = n * 0.36;
  for (let i = 0; i < k; i++) {
    const a = a0 + i * Math.PI * 2 / k;
    starts.push({ x: Math.round(cx + Math.cos(a) * ring), y: Math.round(cy + Math.sin(a) * ring), a });
  }
  const clear = (px, py, r, hard) => {
    for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x - px, y - py);
      if (d <= r && (hard || d < r - 1.5 || R() < 0.6)) { t[at(x, y)] = '.'; }
    }
  };
  const oreField = (px, py, r, rich) => {
    px = Math.max(r + 1, Math.min(n - r - 2, px)); py = Math.max(r + 1, Math.min(n - r - 2, py));
    const no = noise(seed + 9 + Math.round(px * 7 + py * 13));
    for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x - px, y - py) / r + (no(x / 2.2, y / 2.2) - 0.5) * 0.7;
      if (d < 1) {
        if (t[at(x, y)] === 'w' || t[at(x, y)] === 'b') continue;
        t[at(x, y)] = '.';
        ore[at(x, y)] = Math.max(3, Math.min(12, Math.round((rich ? 13 : 10) * (1.1 - d * 0.7))));
      }
    }
  };
  for (const s of starts) clear(s.x, s.y, 9, true);
  // home ore: to one side of the base, slightly towards the centre
  const wet = (px, py, r) => { let w = 0; for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) if (!inb(x, y) || t[at(x, y)] === 'w' || t[at(x, y)] === 'b') w++; return w; };
  starts.forEach((s, i) => {
    // try both sides and a few angles; take the driest spot, then make sure it really is dry land
    let best = null, bs = 1e9; const first = R() < 0.5 ? 1 : -1;
    for (const side of [first, -first]) for (const da of [1.0, 0.75, 1.25, 0.5]) for (const dist of [10.5, 12]) {
      const a = s.a + Math.PI + side * da, x = Math.round(s.x + Math.cos(a) * dist), y = Math.round(s.y + Math.sin(a) * dist);
      if (x < 6 || y < 6 || x > n - 7 || y > n - 7) continue;
      const w = wet(x, y, 5) + (bs === 1e9 ? 0 : 0.5); if (w < bs) { bs = w; best = { x, y }; }
    }
    s.ore = best || { x: Math.round(s.x + Math.cos(s.a + Math.PI) * 9), y: Math.round(s.y + Math.sin(s.a + Math.PI) * 9) };
    for (let y = s.ore.y - 5; y <= s.ore.y + 5; y++) for (let x = s.ore.x - 5; x <= s.ore.x + 5; x++) if (inb(x, y) && Math.hypot(x - s.ore.x, y - s.ore.y) <= 5.2 && (t[at(x, y)] === 'w' || t[at(x, y)] === 'b')) t[at(x, y)] = '.';
    // a dry track from the base to its ore
    for (let k = 0; k <= 12; k++) { const x = Math.round(s.x + (s.ore.x - s.x) * k / 12), y = Math.round(s.y + (s.ore.y - s.y) * k / 12); for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) if (inb(x + ox, y + oy)) t[at(x + ox, y + oy)] = '.'; }
    oreField(s.ore.x, s.ore.y, 4.2, false);
  });
  // contested ore between neighbours and a rich field in the middle
  for (let i = 0; i < k; i++) {
    const a = a0 + (i + 0.5) * Math.PI * 2 / k, r = n * (k <= 2 ? 0.3 : 0.2);
    oreField(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 3.6, false);
  }
  oreField(Math.round(cx), Math.round(cy), 4.6, true);
  for (const s of starts) { clear(s.x, s.y, 6, true); for (let y = s.y - 6; y <= s.y + 6; y++) for (let x = s.x - 6; x <= s.x + 6; x++) if (inb(x, y) && Math.hypot(x - s.x, y - s.y) <= 6) ore[at(x, y)] = 0; }

  // every start must reach the centre: carve a wiggly track where it cannot
  const reach = () => {
    const seen = new Uint8Array(N), q = [at(Math.round(cx), Math.round(cy))];
    if (!passable(t[q[0]])) t[q[0]] = '.';
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), x = c % n, y = (c / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue;
        const j = at(X, Y); if (!seen[j] && passable(t[j])) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  let seen = reach();
  for (const s of starts) {
    if (seen[at(s.x, s.y)]) continue;
    let x = s.x, y = s.y, guard = 0;
    while (Math.hypot(x - cx, y - cy) > 1.5 && guard++ < 400) {
      const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
      x += dx / d + (R() - 0.5) * 0.8; y += dy / d + (R() - 0.5) * 0.8;
      for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
        const X = Math.round(x) + ox, Y = Math.round(y) + oy; if (!inb(X, Y)) continue;
        const c = t[at(X, Y)];
        if (c === 'w') t[at(X, Y)] = 'b'; else if (c !== 'b') t[at(X, Y)] = '.';
      }
    }
    seen = reach();
  }
  return { n, t: t.join(''), starts: starts.map(s => ({ x: s.x, y: s.y })), ore };
}
