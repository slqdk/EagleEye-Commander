// EagleEye Commander — small shared helpers (browser + Node).

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Binary min-heap of (key, value) pairs.
export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1; if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Bit sets packed as text (6 bits per character) so they survive JSON.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function packBits(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 6) {
    let v = 0;
    for (let k = 0; k < 6; k++) if (u8[i + k]) v |= 1 << k;
    s += B64[v];
  }
  return s;
}
export function unpackBits(s, n) {
  const u8 = new Uint8Array(n);
  if (!s) return u8;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    for (let k = 0; k < 6; k++) { const j = i * 6 + k; if (j < n && (v >> k) & 1) u8[j] = 1; }
  }
  return u8;
}

// Ore amounts: one character per cell.
export const ORE = '0123456789abc';
export function oreToArr(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = ORE.indexOf(s[i]); return a; }
export function oreToStr(a) { let s = ''; for (let i = 0; i < a.length; i++) s += ORE[a[i]]; return s; }

const circles = new Map();
export function circleOffsets(r) {
  let c = circles.get(r); if (c) return c;
  c = []; const R = Math.ceil(r), r2 = (r + 0.3) * (r + 0.3);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r2) c.push(dx, dy);
  circles.set(r, c); return c;
}
export function stamp(u8, n, cx, cy, r) {
  const c = circleOffsets(r); cx |= 0; cy |= 0;
  for (let i = 0; i < c.length; i += 2) {
    const x = cx + c[i], y = cy + c[i + 1];
    if (x >= 0 && y >= 0 && x < n && y < n) u8[y * n + x] = 1;
  }
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
