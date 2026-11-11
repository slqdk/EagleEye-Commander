// EagleEye Commander — battlefield generator. One shared map per match.
// Terrain: '.' open ground, 'f' forest, 'r' rock, 'w' water, 'b' ford (passable water crossing).
// Bridges lie on water cells and are listed apart from the terrain, because they can be blown up and rebuilt.
// Every base can always reach the middle through fords alone.
import { mulberry32, hashStr } from './util.js';

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
export const MAP_KINDS = ['random', 'kors', 'grav', 'pas'];

// kind: 'random' (from the seed) or one of the fixed maps, which are the same every time and alike for every player:
//   kors  crossroads: open country, a road from every base to the middle and a ring road between the neighbours
//   grav  the moat: a river in a ring around the middle, a bridge on every base's road and a ford between neighbours
//   pas   mountain pass: ridges between neighbours with one pass each, all valleys meet in the middle
// size: 'normal', 'large', 'huge' or 'giant' (sides 1.3, 1.6 and 2 times as long, with more ore to match).
export const SIZE_K = { normal: 1, large: 1.3, huge: 1.6, giant: 2 };
export function generateMap(seed, k, kind = 'random', size = 'normal') {
  const fixed = kind === 'kors' || kind === 'grav' || kind === 'pas', big = SIZE_K[size] || 1;
  if (fixed) seed = hashStr('kort:' + kind + ':' + k + (big > 1 ? ':' + size : ''));
  const n = 2 * Math.round(sizeFor(k) * big / 2), N = n * n, R = mulberry32(seed);
  const t = new Array(N).fill('.'), ore = new Uint8Array(N);
  const at = (x, y) => y * n + x, inb = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const cx = n / 2, cy = n / 2, ring = n * 0.36, sector = Math.PI * 2 / k;
  const decks = [];          // bridge candidates: { cells, a: the direction the road runs }, settled at the very end
  const nf = noise(seed + 1), nf2 = noise(seed + 2), nr = noise(seed + 3), nw = noise(seed + 4);
  let a0;

  if (fixed) {
    // The base roads point at the corners with two or four players (most room), otherwise the first one points up.
    a0 = k === 2 || k === 4 ? Math.PI / 4 : k === 6 ? 0 : -Math.PI / 2;
    // Fold every cell into one half sector, so the country is the same seen from every base and mirrored around its road.
    const fold = (x, y) => {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
      let u = (Math.atan2(dy, dx) - a0) % sector; if (u < 0) u += sector;
      const m = Math.min(u, sector - u), e = sector / 2 - m;
      return { r, fx: r * Math.cos(m), fy: r * Math.sin(m), db: r * Math.sin(e), rb: r * Math.cos(e) };   // db/rb: across/along the border to the neighbour
    };
    const moat = n * 0.17;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const q = fold(x, y), f = nf(q.fx / 8, q.fy / 8) * 0.7 + nf2(q.fx / 3.5, q.fy / 3.5) * 0.3, rk = nr(q.fx / 5, q.fy / 5);
      let c = '.';
      if (kind === 'kors') {
        if (f > 0.6) c = 'f';
        if (rk > 0.84) c = 'r';
        if ((q.fy < 2.4 && q.fx < ring) || Math.abs(q.r - ring * 0.6) < 1.7 || q.r < n * 0.1) c = '.';
      } else if (kind === 'grav') {
        if (f > 0.66) c = 'f';
        if (rk > 0.86) c = 'r';
        if (q.r < moat + 4.5 || q.fy < 2.2) c = '.';
        if (Math.abs(q.r - moat) < 1.6) c = q.db < 1.7 ? 'b' : 'w';
      } else {
        if (f > 0.68) c = 'f';
        if (rk > 0.86) c = 'r';
        if (q.r < n * 0.11 || q.fy < 2.2) c = '.';
        if (q.db < 2.3 && q.rb >= n * 0.11) c = Math.abs(q.rb - n * 0.3) <= 3.7 ? '.' : 'r';
      }
      t[at(x, y)] = c;
    }
    if (kind === 'grav') for (let i = 0; i < k; i++) {
      const a = a0 + i * sector, ux = Math.cos(a), uy = Math.sin(a), cells = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (t[at(x, y)] === 'w' && dx * ux + dy * uy > 0 && Math.abs(dx * uy - dy * ux) < 1.05) cells.push(at(x, y));
      }
      decks.push({ cells, a });
    }
  } else {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = nf(x / 9, y / 9) * 0.7 + nf2(x / 3.5, y / 3.5) * 0.3;
      if (f > 0.63) t[at(x, y)] = 'f';
      if (nr(x / 5, y / 5) > 0.8) t[at(x, y)] = 'r';
      if (nw(x / 11, y / 11) > 0.78) t[at(x, y)] = 'w';
    }
    // one meandering river with three crossings: a bridge, a ford, a bridge
    if (R() < 0.8) {
      const horiz = R() < 0.5, off = n * (0.3 + R() * 0.4), amp = n * (0.08 + R() * 0.08), ph = R() * 6.28, fr = 2 + R() * 2;
      const cross = [0.2 + R() * 0.1, 0.45 + R() * 0.1, 0.72 + R() * 0.1].map(v => Math.round(v * n));
      const course = i => Math.round(off + Math.sin(i / n * fr * 3.14 + ph) * amp);
      const put = (i, c, ch) => { const x = horiz ? i : c, y = horiz ? c : i; if (inb(x, y)) t[at(x, y)] = ch; };
      let prev = null;
      for (let i = 0; i < n; i++) {
        let j = i; for (const q of cross) if (Math.abs(i - q) <= 3) j = q;            // the river runs straight past a crossing
        const c = course(j), lo = Math.min(c, prev ?? c) - 1, hi = Math.max(c, prev ?? c) + 1;
        const ford = Math.abs(i - cross[1]) <= 1;
        for (let w = lo; w <= hi; w++) put(i, w, ford ? 'b' : 'w');                   // lo..hi also closes the gap after a sharp bend
        prev = c;
      }
      for (const q of [cross[0], cross[2]]) {
        const c = course(q), cells = [];
        for (const i of [q, q + 1]) for (let w = -1; w <= 1; w++) { const x = horiz ? i : c + w, y = horiz ? c + w : i; if (inb(x, y)) cells.push(at(x, y)); }
        decks.push({ cells, a: horiz ? Math.PI / 2 : 0 });
      }
    }
    a0 = R() * Math.PI * 2;
  }

  // start positions on a ring around the centre
  // Fixed maps take the cell a point falls in (floor), which keeps them exactly alike when the map is turned.
  const cellOf = fixed ? Math.floor : Math.round;
  const polar = (a, r) => [cellOf(cx + Math.cos(a) * r), cellOf(cy + Math.sin(a) * r)];
  const starts = [];
  for (let i = 0; i < k; i++) { const a = a0 + i * sector, [x, y] = polar(a, ring); starts.push({ x, y, a }); }
  const clear = (px, py, r, hard) => {
    for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x - px, y - py);
      if (d <= r && (hard || d < r - 1.5 || R() < 0.6)) { t[at(x, y)] = '.'; }
    }
  };
  const oreField = (px, py, r, rich) => {
    px = Math.max(r + 1, Math.min(n - r - 2, px)); py = Math.max(r + 1, Math.min(n - r - 2, py));
    const no = fixed ? () => 0.5 : noise(seed + 9 + Math.round(px * 7 + py * 13));
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
  starts.forEach(s => {
    if (fixed) {
      s.ore = { x: Math.floor(s.x + 0.5 + Math.cos(s.a + Math.PI + 1.35) * 11), y: Math.floor(s.y + 0.5 + Math.sin(s.a + Math.PI + 1.35) * 11) };
    } else {
      // try both sides and a few angles; take the driest spot, then make sure it really is dry land
      let best = null, bs = 1e9; const first = R() < 0.5 ? 1 : -1;
      for (const side of [first, -first]) for (const da of [1.0, 0.75, 1.25, 0.5]) for (const dist of [10.5, 12]) {
        const a = s.a + Math.PI + side * da, x = Math.round(s.x + Math.cos(a) * dist), y = Math.round(s.y + Math.sin(a) * dist);
        if (x < 6 || y < 6 || x > n - 7 || y > n - 7) continue;
        const w = wet(x, y, 5) + (bs === 1e9 ? 0 : 0.5); if (w < bs) { bs = w; best = { x, y }; }
      }
      s.ore = best || { x: Math.round(s.x + Math.cos(s.a + Math.PI) * 9), y: Math.round(s.y + Math.sin(s.a + Math.PI) * 9) };
    }
    for (let y = s.ore.y - 5; y <= s.ore.y + 5; y++) for (let x = s.ore.x - 5; x <= s.ore.x + 5; x++) if (inb(x, y) && Math.hypot(x - s.ore.x, y - s.ore.y) <= 5.2 && (t[at(x, y)] === 'w' || t[at(x, y)] === 'b')) t[at(x, y)] = '.';
    // a dry track from the base to its ore
    const away = v => Math.sign(v) * Math.round(Math.abs(v)), brush = fixed ? [-1, 0, 1] : [0, 1];
    for (let j = 0; j <= 12; j++) { const x = s.x + away((s.ore.x - s.x) * j / 12), y = s.y + away((s.ore.y - s.y) * j / 12); for (const oy of brush) for (const ox of brush) if (inb(x + ox, y + oy)) t[at(x + ox, y + oy)] = '.'; }
    oreField(s.ore.x, s.ore.y, 4.2, false);
  });

  // ore to fight over, and the neutral buildings (2x2). Wanted spots first; they are settled on dry land below.
  const want = [], spot = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  for (let i = 0; i < k; i++) {
    const axis = a0 + i * sector, border = axis + sector / 2;
    if (kind === 'kors') { oreField(...polar(border, n * 0.27), 3.6, false); want.push(['depot', ...spot(border, n * 0.4)]); }
    else if (kind === 'grav') { oreField(...polar(border, n * 0.33), 3.6, false); want.push(['depot', ...spot(border, n * 0.44)]); }
    else if (kind === 'pas') { oreField(...polar(axis, n * 0.21), 3.4, false); want.push(['depot', ...spot(border, n * 0.3)]); }
    else { oreField(...polar(border, n * (k <= 2 ? 0.3 : 0.2)), 3.6, false); want.push(['depot', ...spot(border, n * (k <= 2 ? 0.42 : 0.33))]); }
    // a larger map has more to live off: a field on the road to the middle, and on the largest one more out on the flank
    if (big > 1 && kind !== 'pas') oreField(...polar(axis, ring * 0.56), 3.6, false);
    if (big > 1.4) oreField(...polar(axis + sector / 4, n * 0.4), 3.4, false);
  }
  if (fixed) oreField(cx - 0.5, cy - 0.5, 5.2, true); else oreField(Math.round(cx), Math.round(cy), 4.6, true);
  if (kind === 'kors' || kind === 'grav') want.push(['tower', cx, cy]);
  else if (kind === 'pas') want.push(['shop', cx, cy]);
  else want.push(['tower', ...spot(a0 + sector / 2, 8)], ['shop', ...spot(a0 + sector / 2 + Math.PI, 8)]);

  const neutrals = [];
  for (const [type, wx, wy] of want) {
    const px = Math.round(wx), py = Math.round(wy); let best = null, bs = 1e9;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = px - 1 + dx, y = py - 1 + dy, s = dx * dx + dy * dy;      // x, y: top-left cell of the building
      if (s >= bs || x < 3 || y < 3 || x + 2 > n - 3 || y + 2 > n - 3) continue;
      let ok = starts.every(q => Math.hypot(q.x - x - 1, q.y - y - 1) > 13) && neutrals.every(q => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) > 5);
      for (let yy = y - 1; yy <= y + 2 && ok; yy++) for (let xx = x - 1; xx <= x + 2; xx++) if (t[at(xx, yy)] === 'w' || t[at(xx, yy)] === 'b') { ok = false; break; }
      if (ok) { bs = s; best = [x, y]; }
    }
    if (!best) continue;
    const [bx, by] = best;
    for (let yy = by - 3; yy <= by + 4; yy++) for (let xx = bx - 3; xx <= bx + 4; xx++) {      // open ground around it, nothing growing right next to it
      if (!inb(xx, yy)) continue;
      const near = xx >= bx - 1 && xx <= bx + 2 && yy >= by - 1 && yy <= by + 2;
      if (near) { t[at(xx, yy)] = '.'; ore[at(xx, yy)] = 0; }
      else if (Math.hypot(xx - bx - 0.5, yy - by - 0.5) <= 3.4 && (t[at(xx, yy)] === 'f' || t[at(xx, yy)] === 'r')) t[at(xx, yy)] = '.';
    }
    neutrals.push({ t: type, x: bx, y: by });
  }
  const solid = new Uint8Array(N);
  for (const q of neutrals) for (let yy = q.y; yy < q.y + 2; yy++) for (let xx = q.x; xx < q.x + 2; xx++) solid[at(xx, yy)] = 1;

  for (const s of starts) { clear(s.x, s.y, 6, true); for (let y = s.y - 6; y <= s.y + 6; y++) for (let x = s.x - 6; x <= s.x + 6; x++) if (inb(x, y) && Math.hypot(x - s.x, y - s.y) <= 6) ore[at(x, y)] = 0; }

  // bridges: a deck that still lies in water and has land at both ends stays a bridge, anything else becomes a ford
  const bridges = [];
  for (const { cells, a } of decks) {
    const wet = cells.filter(c => t[c] === 'w'), land = new Set();
    for (const c of wet) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = (c % n) + dx, Y = ((c / n) | 0) + dy;
      if (inb(X, Y) && t[at(X, Y)] === '.' && !solid[at(X, Y)]) land.add(at(X, Y));
    }
    // both ends: two landing cells that are further apart than the deck is wide
    let far = 0; for (const a of land) for (const b of land) far = Math.max(far, Math.abs((a % n) - (b % n)) + Math.abs(((a / n) | 0) - ((b / n) | 0)));
    if (wet.length < 4 || wet.length !== cells.length || far < 4) { for (const c of wet) t[c] = 'b'; continue; }
    let x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (const c of wet) { x0 = Math.min(x0, c % n); x1 = Math.max(x1, c % n); y0 = Math.min(y0, (c / n) | 0); y1 = Math.max(y1, (c / n) | 0); }
    bridges.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cells: wet, a: Math.round(a * 1000) / 1000 });
  }

  // every start must reach the centre without a bridge: carve a track where it cannot
  const mid = at(Math.round(cx), Math.round(cy) + (solid[at(Math.round(cx), Math.round(cy))] ? 2 : 0));
  const reach = () => {
    const seen = new Uint8Array(N), q = [mid];
    if (!passable(t[q[0]])) t[q[0]] = '.';
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), x = c % n, y = (c / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue;
        const j = at(X, Y); if (!seen[j] && passable(t[j]) && !solid[j]) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  let seen = reach();
  const must = [...starts.map(q => [q.x, q.y]), ...neutrals.map(q => [q.x - 1, q.y])];
  for (const [sx, sy] of must) {
    if (seen[at(sx, sy)]) continue;
    let x = sx, y = sy, guard = 0; const wig = fixed ? 0 : 0.8;
    while (Math.hypot(x - cx, y - cy) > 1.5 && guard++ < 400) {
      const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
      x += dx / d + (R() - 0.5) * wig; y += dy / d + (R() - 0.5) * wig;
      for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
        const X = Math.round(x) + ox, Y = Math.round(y) + oy; if (!inb(X, Y) || solid[at(X, Y)]) continue;
        const c = t[at(X, Y)];
        if (c === 'w') t[at(X, Y)] = 'b'; else if (c !== 'b') t[at(X, Y)] = '.';
      }
      if (guard > 3 && seen[at(Math.round(x), Math.round(y))]) break;      // joined country that is already connected
    }
    seen = reach();
  }
  // a track may have turned part of a deck into a ford: such a bridge is no longer needed there
  for (let i = bridges.length - 1; i >= 0; i--) if (bridges[i].cells.some(c => t[c] !== 'w')) { for (const c of bridges[i].cells) if (t[c] === 'w') t[c] = 'b'; bridges.splice(i, 1); }

  return { n, t: t.join(''), starts: starts.map(s => ({ x: s.x, y: s.y })), ore, bridges, neutrals };
}
