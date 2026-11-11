// EagleEye Commander — battlefield drawing: cartoon terrain, sprites, shroud, effects and the radar.
import { sprite, TURRET, FRAMES, isInf, OUT, shade, mix, KZ, STYLE } from './toon.js';
import { DEFS } from '../shared/defs.js';
import { mulberry32 } from '../shared/util.js';

const BD = { ...DEFS.buildings, ...DEFS.neutral }, UD = DEFS.units;      // neutral buildings are drawn like any other building
const AIR = 1.25;   // flying height in cells
export const GROUP_COL = ['#ffd23e', '#ff7a3d', '#ff5fa2'];
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const dir16 = (fx, fy) => ((Math.round(Math.atan2(fy, fx) / (Math.PI / 8)) % 16) + 16) % 16;
const dir8 = (fx, fy) => ((Math.round(Math.atan2(fy, fx) / (Math.PI / 4)) % 8) + 8) % 8;

// the land in the two palettes
const LAND = {
  cartoon: { grass: '#7fc44d', hi: 'rgba(146,214,92,0.5)', lo: 'rgba(104,176,62,0.45)', tuft: '#5ea83a', dirt: '172,150,96', sand: '#e6d591', sandDot: '#c7b06a', edge: '#2a67ad', foam: '#d9f1ff', water: '#46a6ea', deep: '#3a94dc', ford: '#86cdf5', wave: '#b5e2ff',
    rock: '#9b9da6', rockHi: '#c9cbd2', rockLo: '#787a85', stone: '#a9abb1', stoneHi: '#d4d6da', wood: 'rgba(84,150,54,0.8)', leaf: ['#2f8e3e', '#3a9c45'], leafHi: ['#49ad52', '#58bd5c'], leafLo: '#267a36', pine: ['#27784a', '#2f8650'], pineHi: ['#3f9c5c', '#49a866'],
    trunk: '#8a5a34', bush: '#4fa843', bushHi: '#6cc25a', flower: ['#fff6c8', '#ffd84d', '#ff9fc0', '#ffffff'], oreBed: 'rgba(150,140,60,0.42)', sky: '#0b0f14',
    radar: { '.': [108, 170, 70], f: [50, 120, 58], r: [140, 142, 150], w: [60, 140, 215], b: [130, 195, 235] } },
  military: { grass: '#8c9a5c', hi: 'rgba(164,172,108,0.5)', lo: 'rgba(108,122,68,0.5)', tuft: '#6c7c46', dirt: '152,130,86', sand: '#cdbd8a', sandDot: '#a6966a', edge: '#27506e', foam: '#bcd4da', water: '#4b86a8', deep: '#3f7797', ford: '#7fb0c4', wave: '#a5c8d4',
    rock: '#8d8a80', rockHi: '#b9b5a6', rockLo: '#69665c', stone: '#9a968a', stoneHi: '#c2bdae', wood: 'rgba(86,108,58,0.8)', leaf: ['#48703f', '#527b45'], leafHi: ['#668f4f', '#719956'], leafLo: '#3b5f36', pine: ['#385e42', '#40684a'], pineHi: ['#527c58', '#5b865f'],
    trunk: '#6e5236', bush: '#62824a', bushHi: '#7d9a5c', flower: ['#b9ad6e', '#c7ba7c', '#a89c62', '#d0c48a'], oreBed: 'rgba(130,118,60,0.42)', sky: '#0c0e10',
    radar: { '.': [124, 138, 82], f: [70, 100, 60], r: [140, 136, 126], w: [70, 124, 158], b: [128, 172, 190] } },
};
// Other landscapes: the same country in other colours (looks only). Each entry replaces part of the palette above.
const THEME = {
  snow: {
    cartoon: { grass: '#e8eef4', hi: 'rgba(255,255,255,0.65)', lo: 'rgba(186,204,222,0.5)', tuft: '#b4c4d6', dirt: '148,150,154', sand: '#cbd9e6', sandDot: '#a9bbcc', edge: '#285c94', foam: '#f0f9ff', water: '#3f93d6', deep: '#3483c6', ford: '#a4d4f0', wave: '#d4ecfc',
      rock: '#98a0ad', rockHi: '#eaeff4', rockLo: '#727a88', stone: '#b4bcc7', stoneHi: '#f3f6f9', wood: 'rgba(160,186,190,0.7)', leaf: ['#2c6c4e', '#357856'], leafHi: ['#f5f9fb', '#e4eef3'], leafLo: '#225a42', pine: ['#236646', '#2b714e'], pineHi: ['#f5f9fb', '#e4eef3'],
      bush: '#5c8c76', bushHi: '#f3f7f9', flower: ['#ffffff', '#dde7f0', '#cbd8e4', '#ffffff'], oreBed: 'rgba(120,128,120,0.34)', shadow: 'rgba(50,72,104,0.22)', fir: 0.8,
      radar: { '.': [226, 232, 238], f: [86, 128, 110], r: [150, 156, 166], w: [60, 132, 204], b: [156, 204, 232] } },
    military: { grass: '#d3d8d6', hi: 'rgba(236,240,238,0.6)', lo: 'rgba(168,178,180,0.5)', tuft: '#a3aeae', dirt: '128,124,112', sand: '#b5bfc2', sandDot: '#96a2a6', edge: '#264a64', foam: '#d6e2e4', water: '#44788f', deep: '#3a6b81', ford: '#8fb4c0', wave: '#b7cfd6',
      rock: '#8b8c88', rockHi: '#dfe2de', rockLo: '#666862', stone: '#a2a49e', stoneHi: '#e3e5e0', wood: 'rgba(140,156,146,0.7)', leaf: ['#3c5c44', '#45674c'], leafHi: ['#e6eae4', '#d8ded6'], leafLo: '#314e3a', pine: ['#33543c', '#3b5e44'], pineHi: ['#e6eae4', '#d8ded6'],
      bush: '#587060', bushHi: '#e2e6e0', flower: ['#eef0ec', '#d4dad6', '#c2cac6', '#f4f5f2'], oreBed: 'rgba(110,108,90,0.36)', shadow: 'rgba(40,52,64,0.24)', fir: 0.8,
      radar: { '.': [208, 214, 212], f: [84, 108, 92], r: [140, 141, 136], w: [68, 118, 142], b: [140, 178, 190] } },
  },
  desert: {
    cartoon: { grass: '#e6c98a', hi: 'rgba(244,222,160,0.55)', lo: 'rgba(206,172,108,0.5)', tuft: '#b89858', dirt: '176,132,84', sand: '#f0dca6', sandDot: '#c9ad6e', edge: '#2a7a8c', foam: '#e2f6f4', water: '#3fb0c4', deep: '#34a0b6', ford: '#8cd8e0', wave: '#bfeef2',
      rock: '#b9825c', rockHi: '#e2b58c', rockLo: '#8f5f42', stone: '#c49a72', stoneHi: '#ecd0aa', wood: 'rgba(170,160,90,0.6)', leaf: ['#7f9a44', '#8aa64c'], leafHi: ['#a5bd5e', '#b0c868'], leafLo: '#688238',
      trunk: '#8a6038', bush: '#96a050', bushHi: '#b6c06a', flower: ['#c9a968', '#b89858', '#d8bc7e', '#a88848'], oreBed: 'rgba(104,66,28,0.5)', shadow: 'rgba(90,60,20,0.24)', fir: 0,
      radar: { '.': [222, 194, 132], f: [132, 150, 76], r: [176, 126, 92], w: [64, 168, 190], b: [140, 212, 220] } },
    military: { grass: '#c4ab78', hi: 'rgba(216,196,144,0.55)', lo: 'rgba(170,144,96,0.5)', tuft: '#9a8452', dirt: '140,112,76', sand: '#d4c08e', sandDot: '#ab9664', edge: '#2c5c66', foam: '#c8dcd8', water: '#4a8c96', deep: '#3f7d87', ford: '#84b6ba', wave: '#abd0d0',
      rock: '#98755a', rockHi: '#c4a284', rockLo: '#735642', stone: '#a88c6e', stoneHi: '#d0b896', wood: 'rgba(138,134,84,0.6)', leaf: ['#6f7c46', '#79864e'], leafHi: ['#8f9c5c', '#99a664'], leafLo: '#5b683a',
      trunk: '#73563a', bush: '#7c8450', bushHi: '#9aa066', flower: ['#a48e5e', '#94804e', '#b49e6e', '#857244'], oreBed: 'rgba(92,62,30,0.52)', shadow: 'rgba(70,50,22,0.26)', fir: 0,
      radar: { '.': [190, 166, 116], f: [112, 124, 76], r: [150, 116, 90], w: [72, 138, 150], b: [130, 180, 186] } },
  },
};
export const landFor = (palette, theme) => ({ shadow: 'rgba(30,60,25,0.28)', fir: 0.4, ...(LAND[palette] || LAND.military), ...((THEME[theme] || {})[palette] || (THEME[theme] || {}).military || {}) });

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.cam = { x: 10, y: 10, z: 40 };
    this.fx = []; this.decals = []; this.pings = []; this.map = null; this.t = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // shadows, damaged building sprites, idle animation, amount of smoke and dust, sprite resolution
    this.opt = { shadows: true, damage: true, anim: true, particles: 1, sharp: 'auto' };
    this.S = 64; this.oreSp = null; this.dirtCache = new Map(); this.brInfo = new Map(); this.theme = 'grass';
    this.shakeT = -99; this.flashT = -99;      // when the ground last shook, and when the screen was last blinded
    this.pickS();
  }
  pickS() { const hd = this.dpr > 1.3, s = this.opt.sharp; this.S = s === 'high' ? (hd ? 128 : 96) : s === 'normal' ? 64 : hd ? 96 : 64; }
  // after a change of style or sharpness: everything that was painted in advance is painted again
  restyle() { this.pickS(); this.dirtCache.clear(); if (this.map) { this.bake(); this.buildOre(); } }
  land() { return landFor(STYLE.palette, this.theme); }
  resize() {
    const r = this.cv.getBoundingClientRect(), d0 = this.dpr; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(2, Math.round(r.width * this.dpr)); this.cv.height = Math.max(2, Math.round(r.height * this.dpr));
    this.w = r.width; this.h = r.height;
    if (d0 !== this.dpr) { const s = this.S; this.pickS(); if (s !== this.S && this.map) this.buildOre(); }
  }
  clampCam() {
    const c = this.cam, n = this.map ? this.map.n : 60, minZ = Math.max(14, Math.min(this.w, this.h) / n);
    c.z = Math.max(minZ, Math.min(88, c.z));
    const hw = this.w / c.z / 2, hh = this.h / c.z / 2;
    c.x = hw * 2 >= n ? n / 2 : Math.max(hw - 2, Math.min(n - hw + 2, c.x));
    c.y = hh * 2 >= n ? n / 2 : Math.max(hh - 2, Math.min(n - hh + 2, c.y));
  }
  toCell(px, py) { const c = this.cam; return [(px - this.w / 2) / c.z + c.x, (py - this.h / 2) / c.z + c.y]; }
  toScreen(x, y) { const c = this.cam; return [(x - c.x) * c.z + this.w / 2, (y - c.y) * c.z + this.h / 2]; }
  clear() { this.fx = []; this.decals = []; this.pings = []; this.shakeT = this.flashT = -99; }
  flash() { this.flashT = this.t; }
  chance(p) { return Math.random() < p * this.opt.particles; }

  // ---------- terrain ----------
  setMap(map, theme = 'grass') {
    if (this.map && this.map.t === map.t && this.theme === theme) return;
    this.map = map; this.theme = theme; this.clear(); this.dirtCache.clear(); this.brInfo = new Map();
    const n = map.n;
    this.fogCv = mk(n, n); this.fogImg = this.fogCv.getContext('2d').createImageData(n, n); this.fogKey = null; this.fogA = this.fogT = null;
    this.oreCv = mk(n, n); this.oreImg = this.oreCv.getContext('2d').createImageData(n, n); this.oreAt = -1;
    this.bake(); this.buildOre();
  }
  bake() {
    const map = this.map, n = map.n, T = map.t, TP = Math.min(48, Math.floor(4096 / n)), W = n * TP, cv = mk(W, W), g = cv.getContext('2d'), R = mulberry32(n * 7 + T.length);
    const L = this.land(), hi = STYLE.detail === 'high', OW = STYLE.outline === 'thin' ? 0.6 : 1;
    this.TP = TP; this.terrain = cv;
    const at = (x, y) => x < 0 || y < 0 || x >= n || y >= n ? '.' : T[y * n + x];
    const cells = ch => { const l = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (T[y * n + x] === ch) l.push([x, y]); return l; };
    const open = (px, py) => at((px / TP) | 0, (py / TP) | 0) === '.';
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = L.grass; g.fillRect(0, 0, W, W);
    for (let i = 0; i < n * n / 5; i++) {
      g.fillStyle = R() < 0.5 ? L.hi : L.lo;
      g.beginPath(); g.ellipse(R() * W, R() * W, (0.6 + R() * 2.2) * TP, (0.4 + R() * 1.4) * TP, R() * 3, 0, 7); g.fill();
    }
    if (hi) {
      for (let i = 0; i < n * n / 55; i++) {        // bare earth showing through
        const x = R() * W, y = R() * W;
        for (let j = 0; j < 6; j++) { g.fillStyle = `rgba(${L.dirt},${0.14 + R() * 0.16})`; g.beginPath(); g.ellipse(x + (R() - 0.5) * 2.6 * TP, y + (R() - 0.5) * 1.8 * TP, (0.4 + R()) * TP, (0.25 + R() * 0.55) * TP, R() * 3, 0, 7); g.fill(); }
      }
      const nt = mk(160, 160), ng = nt.getContext('2d'), RN = mulberry32(99);     // fine grain over everything
      for (let i = 0; i < 2600; i++) { ng.fillStyle = RN() < 0.5 ? 'rgba(255,255,215,0.11)' : 'rgba(20,40,10,0.11)'; ng.fillRect(RN() * 160, RN() * 160, 1 + RN() * 2.2, 1 + RN() * 1.6); }
      g.fillStyle = g.createPattern(nt, 'repeat'); g.fillRect(0, 0, W, W);
    }
    g.strokeStyle = L.tuft; g.lineWidth = Math.max(1.5, TP * 0.05);
    for (let i = 0; i < n * n / 2.2; i++) {
      const x = R() * W, y = R() * W, s = TP * 0.11;
      g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x, y); g.lineTo(x + s, y - s * 1.2); g.stroke();
    }
    const lump = (px, py, r, col, hiCol, seed, ow = 0.13) => {
      const pts = []; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, rr = r * (0.75 + hash(seed + i, i * 3) * 0.4); pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.8]); }
      const p = () => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
      g.strokeStyle = OUT; g.lineWidth = TP * ow * OW; p(); g.stroke(); g.fillStyle = col; g.fill();
      g.fillStyle = hiCol; g.beginPath(); g.moveTo(pts[3][0], pts[3][1]); g.lineTo(pts[4][0], pts[4][1]); g.lineTo(pts[5][0], pts[5][1]); g.lineTo(px, py - r * 0.1); g.closePath(); g.fill();
    };
    if (hi) {
      for (let i = 0; i < n * n / 30; i++) {          // flowers (or dry straw) in small groups
        const x = R() * W, y = R() * W; if (!open(x, y)) continue;
        for (let j = 0; j < 4; j++) { g.fillStyle = L.flower[(R() * 4) | 0]; g.beginPath(); g.arc(x + (R() - 0.5) * TP * 0.7, y + (R() - 0.5) * TP * 0.5, TP * (0.03 + R() * 0.025), 0, 7); g.fill(); }
      }
      for (let i = 0; i < n * n / 26; i++) { const x = R() * W, y = R() * W; if (open(x, y)) lump(x, y, TP * (0.05 + R() * 0.06), L.stone, L.stoneHi, i * 13, 0.07); }
      for (let i = 0; i < n * n / 34; i++) {          // bushes
        const x = R() * W, y = R() * W, r = TP * (0.13 + R() * 0.08); if (!open(x, y)) continue;
        const b = () => { g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x - r * 0.3, y + r * 0.35); g.arc(x - r * 0.9, y + r * 0.35, r * 0.6, 0, 7); g.moveTo(x + r * 1.5, y + r * 0.3); g.arc(x + r * 0.85, y + r * 0.3, r * 0.65, 0, 7); };
        g.fillStyle = L.shadow; g.beginPath(); g.ellipse(x + r * 0.3, y + r * 0.75, r * 1.5, r * 0.5, 0, 0, 7); g.fill();
        g.strokeStyle = OUT; g.lineWidth = TP * 0.09 * OW; b(); g.stroke(); g.fillStyle = L.bush; b(); g.fill();
        g.fillStyle = L.bushHi; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, 7); g.fill();
      }
    }
    // water: a sandy shore, a dark edge, foam and deeper middles
    const water = [...cells('w'), ...cells('b')];
    const blobs = (list, r, col, grow = 0) => { g.fillStyle = col; g.beginPath(); for (const [x, y] of list) { g.moveTo((x + 0.5) * TP + r * TP + grow, (y + 0.5) * TP); g.arc((x + 0.5) * TP, (y + 0.5) * TP, r * TP + grow, 0, 7); } g.fill(); };
    blobs(water, 0.98, L.sand);
    if (hi) { g.fillStyle = L.sandDot; for (const [x, y] of water) for (let i = 0; i < 5; i++) { const a = hash(x * 5 + i, y) * 6.283, d = (0.72 + hash(x, y * 7 + i) * 0.24) * TP; g.fillRect((x + 0.5) * TP + Math.cos(a) * d, (y + 0.5) * TP + Math.sin(a) * d, TP * 0.045, TP * 0.035); } }
    blobs(water, 0.76, L.edge, TP * 0.07);
    if (hi) {
      blobs(water, 0.76, L.foam); blobs(water, 0.76, L.water, -TP * 0.05);
      const isW = (x, y) => { const c = at(x, y); return c === 'w' && x >= 0 && y >= 0 && x < n && y < n; };
      blobs(water.filter(([x, y]) => isW(x, y) && isW(x - 1, y) && isW(x + 1, y) && isW(x, y - 1) && isW(x, y + 1) && isW(x - 1, y - 1) && isW(x + 1, y + 1) && isW(x + 1, y - 1) && isW(x - 1, y + 1)), 0.66, L.deep);
    } else blobs(water, 0.76, L.water);
    blobs(cells('b'), 0.62, L.ford);
    g.strokeStyle = L.wave; g.lineWidth = Math.max(1.5, TP * 0.06);
    for (const [x, y] of water) if (hash(x, y) < 0.45) { const px = (x + 0.2 + hash(y, x) * 0.5) * TP, py = (y + 0.3 + hash(x + 9, y) * 0.5) * TP; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + TP * 0.12, py - TP * 0.1, px + TP * 0.26, py); g.stroke(); }
    if (hi) { g.strokeStyle = L.edge; g.globalAlpha = 0.3; g.lineWidth = Math.max(1, TP * 0.04); for (const [x, y] of water) if (hash(x + 3, y + 5) < 0.3) { const px = (x + 0.15 + hash(y + 2, x) * 0.5) * TP, py = (y + 0.55 + hash(x + 4, y) * 0.3) * TP; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + TP * 0.1, py + TP * 0.07, px + TP * 0.22, py); g.stroke(); } g.globalAlpha = 1; }
    for (const [x, y] of cells('b')) for (let i = 0; i < (hi ? 3 : 2); i++) lump((x + 0.2 + hash(x + i, y) * 0.6) * TP, (y + 0.2 + hash(x, y + i * 5) * 0.6) * TP, TP * (0.11 + hash(x + i, y + 3) * 0.06), L.stone, L.stoneHi, x * 31 + y + i);
    // rocks
    const boulder = (px, py, r, seed) => {
      const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.2, rr = r * (0.78 + hash(seed + i, i * 5) * 0.36); pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.82]); }
      const p = idx => { g.beginPath(); idx.forEach((q, i) => { const v = typeof q === 'number' ? pts[q] : q; i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1]); }); g.closePath(); };
      const c = [px - r * 0.08, py - r * 0.12];
      g.strokeStyle = OUT; g.lineWidth = TP * 0.13 * OW; p([0, 1, 2, 3, 4, 5, 6, 7]); g.stroke(); g.fillStyle = L.rock; g.fill();
      g.fillStyle = L.rockLo; p([0, 1, 2, 3, c]); g.fill();                    // shaded side
      g.fillStyle = L.rockHi; p([4, 5, 6, c]); g.fill();                       // lit top
      g.strokeStyle = 'rgba(30,30,40,0.35)'; g.lineWidth = Math.max(1, TP * 0.03); g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(pts[3][0], pts[3][1]); g.moveTo(c[0], c[1]); g.lineTo(pts[7][0], pts[7][1]); g.moveTo(c[0], c[1]); g.lineTo(pts[4][0], pts[4][1]); g.stroke();
    };
    for (const [x, y] of cells('r')) {
      g.fillStyle = L.shadow; g.beginPath(); g.ellipse((x + 0.58) * TP, (y + 0.72) * TP, TP * 0.5, TP * 0.26, 0, 0, 7); g.fill();
      if (hi) { boulder((x + 0.5 + (hash(x, y) - 0.5) * 0.2) * TP, (y + 0.48) * TP, TP * 0.5, x * 17 + y * 3); if (hash(x, y + 77) < 0.6) boulder((x + 0.28) * TP, (y + 0.74) * TP, TP * 0.2, x + y * 29); if (hash(x + 5, y) < 0.4) lump((x + 0.78) * TP, (y + 0.82) * TP, TP * 0.1, L.stone, L.stoneHi, x * 3 + y, 0.08); }
      else { lump((x + 0.5 + (hash(x, y) - 0.5) * 0.2) * TP, (y + 0.5) * TP, TP * 0.5, L.rock, L.rockHi, x * 17 + y * 3); if (hash(x, y + 77) < 0.5) lump((x + 0.3) * TP, (y + 0.72) * TP, TP * 0.22, shade(L.rock, -0.1), L.rockHi, x + y * 29); }
    }
    // woods: leafy trees and firs
    const trees = cells('f');
    blobs(trees, 0.66, L.wood);
    for (const [x, y] of trees) {
      const k = hash(x, y) < (hi ? 0.45 : 0.3) ? 2 : 1;
      for (let i = 0; i < k; i++) {
        const px = (x + 0.5 + (hash(x + i * 7, y) - 0.5) * 0.5) * TP, py = (y + 0.62 + (hash(x, y + i * 13) - 0.5) * 0.3) * TP, r = TP * (0.3 + hash(x + i, y + 5) * 0.12), v = hash(x * 3, y * 7 + i) < 0.5 ? 0 : 1;
        g.fillStyle = L.shadow; g.beginPath(); g.ellipse(px + r * 0.35, py + r * 0.25, r * 1.05, r * 0.5, 0, 0, 7); g.fill();
        g.strokeStyle = OUT; g.lineWidth = TP * 0.2 * OW; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - r * 0.9); g.stroke();
        g.strokeStyle = L.trunk; g.lineWidth = TP * 0.09; g.stroke();
        if (hi && hash(x * 11 + i, y * 5) < L.fir) {       // a fir: three tiers
          const tier = (cy, w, h) => { g.beginPath(); g.moveTo(px, cy - h); g.lineTo(px + w, cy); g.lineTo(px - w, cy); g.closePath(); };
          for (let j = 0; j < 3; j++) {
            const cy = py - r * (0.5 + j * 0.72), w = r * (1.0 - j * 0.24), h = r * 1.15;
            g.strokeStyle = OUT; g.lineWidth = TP * 0.13 * OW; tier(cy, w, h); g.stroke(); g.fillStyle = L.pine[v]; g.fill();
            g.fillStyle = L.pineHi[v]; g.beginPath(); g.moveTo(px, cy - h); g.lineTo(px - w, cy); g.lineTo(px - w * 0.15, cy); g.closePath(); g.fill();
          }
          continue;
        }
        const cy = py - r * 1.5;
        const top = () => { g.beginPath(); g.arc(px, cy, r, 0, 7); g.moveTo(px - r * 0.55 + r * 0.7, cy + r * 0.45); g.arc(px - r * 0.55, cy + r * 0.45, r * 0.7, 0, 7); g.moveTo(px + r * 0.6 + r * 0.66, cy + r * 0.42); g.arc(px + r * 0.6, cy + r * 0.42, r * 0.66, 0, 7); };
        g.strokeStyle = OUT; g.lineWidth = TP * 0.13 * OW; top(); g.stroke(); g.fillStyle = L.leaf[v]; top(); g.fill();
        if (hi) { g.fillStyle = L.leafLo; g.beginPath(); g.arc(px + r * 0.5, cy + r * 0.55, r * 0.5, 0, 7); g.fill(); }
        g.fillStyle = L.leafHi[v]; g.beginPath(); g.arc(px - r * 0.25, cy - r * 0.25, r * 0.5, 0, 7); g.fill();
        if (hi) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(px - r * 0.38, cy - r * 0.42, r * 0.2, 0, 7); g.fill(); }
      }
    }
    // radar base
    const rc = mk(n, n), rg = rc.getContext('2d'), img = rg.createImageData(n, n), COL = L.radar;
    for (let i = 0; i < n * n; i++) { const c = COL[T[i]] || COL['.']; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    rg.putImageData(img, 0, 0); this.radarBase = rc;
  }
  buildOre() {
    const TP = this.S, L = LAND[STYLE.palette] || LAND.military, hi = STYLE.detail === 'high', mil = STYLE.palette === 'military'; this.oreSp = [];
    const gold = mil ? '#d6a62a' : '#f2b81c', lite = mil ? '#ecd070' : '#ffe36a';
    for (let lv = 0; lv < 3; lv++) for (let v = 0; v < 4; v++) {
      const cv = mk(TP, TP), g = cv.getContext('2d'), R = mulberry32(lv * 10 + v + 5);
      g.fillStyle = L.oreBed; g.beginPath(); g.ellipse(TP / 2, TP / 2, TP * 0.52, TP * 0.46, 0, 0, 7); g.fill();
      const cnt = 2 + lv * 2;
      const list = []; for (let i = 0; i < cnt; i++) list.push([(0.2 + R() * 0.6) * TP, (0.22 + R() * 0.6) * TP, TP * (0.09 + R() * 0.05 + lv * 0.012)]);
      list.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of list) {
        const p = () => { g.beginPath(); g.moveTo(x - r, y); g.lineTo(x - r * 0.4, y - r * 0.9); g.lineTo(x + r * 0.6, y - r * 0.8); g.lineTo(x + r, y); g.lineTo(x + r * 0.3, y + r * 0.7); g.lineTo(x - r * 0.6, y + r * 0.6); g.closePath(); };
        g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = TP * 0.06 * (STYLE.outline === 'thin' ? 0.65 : 1); p(); g.stroke(); g.fillStyle = gold; g.fill();
        if (hi) { g.fillStyle = shade(gold, -0.22); g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + r * 0.3, y + r * 0.7); g.lineTo(x - r * 0.6, y + r * 0.6); g.lineTo(x + r * 0.1, y - r * 0.1); g.closePath(); g.fill(); }
        g.fillStyle = lite; g.beginPath(); g.moveTo(x - r * 0.4, y - r * 0.9); g.lineTo(x + r * 0.6, y - r * 0.8); g.lineTo(x + r * 0.1, y - r * 0.1); g.lineTo(x - r, y); g.closePath(); g.fill();
        if (hi) { g.fillStyle = '#fffbe6'; g.beginPath(); g.moveTo(x - r * 0.3, y - r * 0.7); g.lineTo(x - r * 0.05, y - r * 0.62); g.lineTo(x - r * 0.45, y - r * 0.3); g.closePath(); g.fill(); }
      }
      this.oreSp.push(cv);
    }
  }
  // trampled earth around a building, painted once per footprint size
  dirt(w, h) {
    const key = w * 10 + h; let cv = this.dirtCache.get(key); if (cv) return cv;
    const P = 24, m = 0.7, L = LAND[STYLE.palette] || LAND.military, R = mulberry32(key); cv = mk((w + m * 2) * P, (h + m * 2) * P);
    const g = cv.getContext('2d');
    for (let i = 0; i < 7; i++) { const e = m * P * (1 - i / 6) * 0.92; g.fillStyle = `rgba(${L.dirt},${0.13 + i * 0.03})`; g.beginPath(); g.roundRect(m * P - e, m * P - e, w * P + 2 * e, h * P + 2 * e, e + P * 0.25); g.fill(); }
    for (let i = 0; i < w * h * 26; i++) { g.fillStyle = R() < 0.5 ? 'rgba(60,44,22,0.13)' : 'rgba(255,240,200,0.12)'; g.fillRect(m * P * 0.5 + R() * (w + m) * P, m * P * 0.5 + R() * (h + m) * P, 1 + R() * 2, 1 + R() * 1.5); }
    this.dirtCache.set(key, cv); return cv;
  }

  // Bridges: a deck over the water, drawn along the direction the road runs (b.a). scene.bridges = [{ id, cells, a, hp, dead }].
  // A fallen bridge leaves a stump at each bank.
  drawBridges(scene, X, Y, Z) {
    const list = scene.bridges; if (!list || !list.length) return;
    const g = this.g, n = this.map.n, L = this.land(), ow = Math.max(1.5, Z * 0.05) * (STYLE.outline === 'thin' ? 0.6 : 1), hi = STYLE.detail === 'high';
    for (const b of list) {
      let q = this.brInfo.get(b.id);
      if (!q) {      // centre and length of the deck, measured along the road
        const ux = Math.cos(b.a || 0), uy = Math.sin(b.a || 0); let cx = 0, cy = 0, lo = 1e9, hi2 = -1e9, wide = 0;
        for (const c of b.cells) { cx += (c % n) + 0.5; cy += ((c / n) | 0) + 0.5; } cx /= b.cells.length; cy /= b.cells.length;
        for (const c of b.cells) { const dx = (c % n) + 0.5 - cx, dy = ((c / n) | 0) + 0.5 - cy, t = dx * ux + dy * uy; lo = Math.min(lo, t); hi2 = Math.max(hi2, t); wide = Math.max(wide, Math.abs(dx * uy - dy * ux)); }
        q = { cx: cx + ux * (lo + hi2) / 2, cy: cy + uy * (lo + hi2) / 2, len: hi2 - lo + 1.9, wid: Math.min(2.3, Math.max(1.5, wide * 2 + 1)) }; this.brInfo.set(b.id, q);
      }
      const down = b.dead || !(b.hp > 0), hl = q.len / 2 * Z, hw = q.wid / 2 * Z, worn = !down && b.hp < (b.mhp || DEFS.bridge.hp) * 0.5;
      const part = (x0, x1, draw) => { draw(x0, -hw, x1 - x0, hw * 2); };
      const spans = down ? [[-hl, -hl * 0.52], [hl * 0.52, hl]] : [[-hl, hl]];
      g.save(); g.translate(X(q.cx), Y(q.cy)); g.rotate(b.a || 0);
      g.fillStyle = 'rgba(8,18,28,0.3)'; for (const [x0, x1] of spans) g.fillRect(x0 + Z * 0.1, -hw + Z * 0.16, x1 - x0, hw * 2);      // shadow on the water
      g.fillStyle = OUT; for (const [x0, x1] of spans) g.fillRect(x0 - ow, -hw - ow, x1 - x0 + 2 * ow, hw * 2 + 2 * ow);
      for (const [x0, x1] of spans) {
        g.fillStyle = down ? shade(L.stone, -0.28) : L.stone; g.fillRect(x0, -hw, x1 - x0, hw * 2);
        if (hi) { g.strokeStyle = 'rgba(0,0,0,0.17)'; g.lineWidth = Math.max(1, Z * 0.02); g.beginPath(); for (let x = x0 + Z * 0.5; x < x1 - 1; x += Z * 0.5) { g.moveTo(x, -hw); g.lineTo(x, hw); } g.stroke(); }      // slabs
        const kerb = Z * 0.17;
        for (const y of [-hw, hw - kerb]) { g.fillStyle = down ? shade(L.stoneHi, -0.3) : L.stoneHi; g.fillRect(x0, y, x1 - x0, kerb); g.fillStyle = OUT; g.fillRect(x0, y === -hw ? y + kerb - ow * 0.5 : y, x1 - x0, ow * 0.5); }
        if (hi && !down) { g.fillStyle = OUT; for (let x = x0 + Z * 0.25; x < x1; x += Z * 0.5) { g.fillRect(x - ow * 0.4, -hw, ow * 0.8, kerb * 0.6); g.fillRect(x - ow * 0.4, hw - kerb * 0.6, ow * 0.8, kerb * 0.6); } }      // rail posts
        if (!down && hi) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, Z * 0.03); g.setLineDash([Z * 0.3, Z * 0.3]); g.beginPath(); g.moveTo(x0 + Z * 0.2, 0); g.lineTo(x1 - Z * 0.2, 0); g.stroke(); g.setLineDash([]); }
      }
      if (down) {      // broken ends and soot
        g.fillStyle = OUT; for (const [x, s] of [[-hl * 0.52, 1], [hl * 0.52, -1]]) { g.beginPath(); g.moveTo(x - s * ow, -hw - ow); for (let i = 0; i <= 6; i++) g.lineTo(x + s * (i % 2 ? Z * 0.16 : 0), -hw + hw * 2 * i / 6); g.lineTo(x - s * ow, hw + ow); g.closePath(); g.fill(); }
        g.fillStyle = 'rgba(20,16,14,0.4)'; for (const [x0, x1] of spans) g.fillRect(x0, -hw, x1 - x0, hw * 2);
      } else if (worn) { g.fillStyle = 'rgba(20,16,14,0.42)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse((hash(b.id, i) - 0.5) * hl * 1.5, (hash(i, b.id) - 0.5) * hw * 1.2, Z * 0.3, Z * 0.2, hash(b.id + 3, i) * 3, 0, 7); g.fill(); } }
      if (b.sel) { g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, Z * 0.05); g.setLineDash([Z * 0.2, Z * 0.14]); g.strokeRect(-hl - Z * 0.15, -hw - Z * 0.15, hl * 2 + Z * 0.3, hw * 2 + Z * 0.3); g.setLineDash([]); }
      g.restore();
    }
  }

  // ---------- effects ----------
  puff(x, y, z, col, r, life, vz = 0.5, vx = 0, vy = 0) { this.fx.push({ k: 'p', x, y, z, vx, vy, vz, r, col, t0: this.t, life }); }
  boom(x, y, size, delay = 0, z = 0) {
    const q = this.opt.particles;
    this.fx.push({ k: 'b', x, y, z, size, t0: this.t + delay, life: 0.45, rot: Math.random() * 6 });
    for (let i = 0; i < (3 + size * 2) * q; i++) this.fx.push({ k: 'p', x: x + (Math.random() - 0.5) * size * 0.6, y: y + (Math.random() - 0.5) * size * 0.5, z: 0.2 + z, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.5, vz: 0.6 + Math.random() * 0.6, r: 0.16 + size * 0.1, col: '#5a5a62', t0: this.t + delay + 0.1 + Math.random() * 0.15, life: 0.9 + Math.random() * 0.5 });
    if (size >= 0.75 && STYLE.detail === 'high') {      // a shock ring and bits flying off
      if (!z) this.fx.push({ k: 'ring', x, y, r: size * 0.9, t0: this.t + delay, life: 0.35 });
      for (let i = 0; i < (1 + size * 2) * q; i++) { const a = Math.random() * 6.283, v = 0.8 + Math.random() * 1.6; this.fx.push({ k: 'd', x, y, z: 0.2 + z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, vz: 1.4 + Math.random() * 1.4, r: 0.03 + Math.random() * 0.035, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20, col: Math.random() < 0.5 ? '#4a4c52' : '#7a6a52', t0: this.t + delay, life: 0.6 + Math.random() * 0.35 }); }
    }
    if (size >= 0.5 && !z) this.decals.push({ x, y, r: 0.25 + size * 0.3 });
    if (this.decals.length > 400) this.decals.splice(0, 100);
  }
  // Turns a simulation event into something to look at.
  event(e) {
    const t = this.t;
    if (e.k === 's') {
      const d = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1, ux = (e.x2 - e.x1) / d, uy = (e.y2 - e.y1) / d;
      const z2 = (e.a2 || 0) * AIR, tall = (e.b && e.t === 'coil' ? 1.35 : e.b ? 0.45 : 0.3) + (e.a1 || 0) * AIR, mx = e.x1 + ux * 0.5, my = e.y1 + uy * 0.5;
      if (e.w === 'bullet' || e.w === 'mg' || (e.w === 'flak' && e.t !== 'sam')) { this.fx.push({ k: 'tr', x1: mx, y1: my, z1: tall, z2, x2: e.x2 + (Math.random() - 0.5) * 0.3, y2: e.y2 + (Math.random() - 0.5) * 0.3, t0: t, life: 0.09 }); this.fx.push({ k: 'fl', x: mx, y: my, z: tall, r: 0.12, t0: t, life: 0.06 }); if (e.w === 'flak') this.puff(e.x2 + (Math.random() - 0.5) * 0.6, e.y2 + (Math.random() - 0.5) * 0.4, z2 + (Math.random() - 0.5) * 0.3, '#3a3a40', 0.13, 0.5, 0.1); else if (!e.a2 && this.chance(0.5)) this.puff(e.x2 + (Math.random() - 0.5) * 0.3, e.y2 + (Math.random() - 0.5) * 0.3, 0.05, '#d8cba6', 0.06, 0.3, 0.5); }
      else if (e.w === 'fire') { for (let i = 0; i < 5; i++) { const f = i / 5; this.fx.push({ k: 'p', x: e.x1 + ux * (0.5 + f * (d - 0.5)), y: e.y1 + uy * (0.5 + f * (d - 0.5)), z: tall * (1 - f) + 0.15, vx: ux * 0.6, vy: uy * 0.6, vz: 0.4, r: 0.12 + f * 0.16, col: f < 0.5 ? '#ffe066' : '#ff8a1e', t0: t + f * 0.12, life: 0.3 }); } }
      else if (e.w === 'arc') { this.fx.push({ k: 'z', x1: e.x1, y1: e.y1, z1: tall, x2: e.x2, y2: e.y2, t0: t, life: 0.28, seed: Math.random() * 1000 }); this.fx.push({ k: 'fl', x: e.x2, y: e.y2, z: 0.2, r: 0.45, t0: t, life: 0.2, col: '#bff3ff' }); this.decals.push({ x: e.x2, y: e.y2, r: 0.3 }); }
      else {
        const lob = e.w === 'he', life = lob ? Math.min(1.1, 0.25 + d * 0.09) : Math.min(0.3, d * 0.05);
        this.fx.push({ k: 'sh', x1: mx, y1: my, z1: tall, z2, x2: e.x2, y2: e.y2, arc: lob && !e.a1 ? Math.min(2.2, d * 0.28) : 0, t0: t, life: e.a1 && lob ? 0.45 : life, rocket: e.t === 'kat' || e.w === 'at' || e.w === 'rocket' || e.w === 'flak' });
        this.fx.push({ k: 'fl', x: mx, y: my, z: tall, r: lob ? 0.3 : 0.22, t0: t, life: 0.09 });
        if (!e.a1 && this.chance(0.8)) this.puff(mx, my, tall, '#e8e4d8', 0.12, 0.45, 0.25, ux * 0.5, uy * 0.5);       // muzzle smoke
        this.boom(e.x2, e.y2, lob ? 0.8 + e.sp * 0.4 : 0.35, e.a1 && lob ? 0.45 : life, z2);
      }
    } else if (e.k === 'ud' && e.wet) {      // went down with a bridge
      this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 0.7, t0: t, life: 0.5 });
      for (let i = 0; i < 5; i++) this.puff(e.x + (Math.random() - 0.5) * 0.4, e.y + (Math.random() - 0.5) * 0.3, 0.1, '#dff1f8', 0.13, 0.6, 1.1, (Math.random() - 0.5) * 0.6, 0);
    } else if (e.k === 'brd') {
      for (let i = 0; i < 5; i++) this.boom(e.x + (Math.random() - 0.5) * 2.2, e.y + (Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 0.7, i * 0.1);
      for (let i = 0; i < 10; i++) this.puff(e.x + (Math.random() - 0.5) * 2.4, e.y + (Math.random() - 0.5) * 2.4, 0.1, '#dff1f8', 0.18, 0.9, 1.4, (Math.random() - 0.5) * 0.8, 0);
    } else if (e.k === 'cap') {
      this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 1.7, t0: t, life: 0.6 }); this.fx.push({ k: 'tx', x: e.x, y: e.y - 0.6, txt: 'OVERTAGET', t0: t, life: 1.8 });
    } else if (e.k === 'hl') { this.fx.push({ k: 'tx', x: e.x, y: e.y - 0.3, txt: '+', col: '#7cf07c', t0: t, life: 0.7 });
    } else if (e.k === 'mn') {      // a minefield goes off: a blast, a fountain of earth and a crater
      this.boom(e.x, e.y, 1.25);
      for (let i = 0; i < 9 * this.opt.particles; i++) this.puff(e.x + (Math.random() - 0.5) * 0.5, e.y + (Math.random() - 0.5) * 0.4, 0.1, i % 2 ? '#7d6846' : '#ab9468', 0.12 + Math.random() * 0.08, 0.75, 1.5 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.7);
      this.fx.push({ k: 'tx', x: e.x, y: e.y - 0.3, txt: 'MINE!', col: '#ff9a6a', t0: t, life: 1.2 });
    } else if (e.k === 'nl') {      // the rocket climbs out of its silo on a pillar of smoke
      this.fx.push({ k: 'rk', x: e.x - 0.2, y: e.y + 0.14, up: 1, t0: t, life: 2.4 });
      for (let i = 0; i < 18 * this.opt.particles; i++) this.puff(e.x - 0.2 + (Math.random() - 0.5) * 0.9, e.y + 0.3 + (Math.random() - 0.5) * 0.6, 0.1, '#ece8dc', 0.2 + Math.random() * 0.16, 1.5 + Math.random() * 0.6, 0.45, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.3);
      this.shakeT = t; this.shakeLife = 0.9; this.shakeAmp = 0.05;
    } else if (e.k === 'nk') {      // the bomb: a blinding ball, a mushroom cloud, rings rolling out and scorched ground
      const r = e.r, q = this.opt.particles;
      this.fx.push({ k: 'nuke', x: e.x, y: e.y, r, t0: t, life: 6 });
      for (let i = 0; i < 3; i++) this.fx.push({ k: 'ring', x: e.x, y: e.y, r: r * (1.1 + i * 0.55), t0: t + i * 0.16, life: 0.9 + i * 0.25 });
      for (let i = 0; i < 12 * q; i++) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r; this.boom(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.85, 0.9 + Math.random() * 0.9, 0.15 + Math.random() * 1.1); }
      for (let i = 0; i < 16 * q; i++) { const a = Math.random() * 6.283, d = r * (0.5 + Math.random() * 0.7); this.puff(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.85, 0.1, '#5c5550', 0.3 + Math.random() * 0.25, 2.2 + Math.random() * 1.6, 0.35, Math.cos(a) * 1.1, Math.sin(a) * 0.8); }
      this.decals.push({ x: e.x, y: e.y, r: r * 0.95 }, { x: e.x, y: e.y, r: r * 0.6 });
      this.shakeT = t; this.shakeLife = 1.8; this.shakeAmp = 0.3;
    } else if (e.k === 'ud') {
      if (e.c === 'inf') { for (let i = 0; i < 4; i++) this.puff(e.x + (Math.random() - 0.5) * 0.3, e.y, 0.2, '#f1f1ea', 0.14, 0.5, 0.8, (Math.random() - 0.5), 0); }
      else if (e.c === 'air') { this.boom(e.x, e.y, 1.1, 0, AIR); for (let i = 0; i < 6; i++) this.puff(e.x, e.y, AIR * (1 - i / 6), '#3c3c42', 0.16, 0.9, -0.3, 0, 0); this.boom(e.x, e.y, 0.7, 0.5); this.decals.push({ x: e.x, y: e.y, r: 0.45, wreck: 1, t0: t + 0.5, rot: Math.random() * 3 }); }
      else { this.boom(e.x, e.y, 1); this.decals.push({ x: e.x, y: e.y, r: 0.5, wreck: 1, t0: t, rot: Math.random() * 3 }); }
    } else if (e.k === 'bd') {
      const k = Math.max(2, e.w * e.h);
      for (let i = 0; i < k + 1; i++) this.boom(e.x + (Math.random() - 0.5) * e.w * 0.8, e.y + (Math.random() - 0.5) * e.h * 0.8, 0.7 + Math.random() * 0.8, i * 0.12);
      this.decals.push({ x: e.x, y: e.y, r: Math.max(e.w, e.h) * 0.55, rubble: 1, w: e.w, h: e.h, seed: (e.x * 31 + e.y * 7) | 0, t0: t });
      const o = this.colors && this.colors[e.o]; if (o && BD[e.t]) this.fx.push({ k: 'col', x: e.x, y: e.y, sp: sprite(e.t, this.S, { color: o.color, faction: o.faction, dmg: this.opt.damage ? 2 : 0 }), t0: t, life: e.t === 'wall' ? 0.25 : 0.6 });
    } else if (e.k === 'c') this.fx.push({ k: 'tx', x: e.x, y: e.y, txt: '+' + e.v, t0: t, life: 1.3 });
    else if (e.k === 'a') this.pings.push({ x: e.x, y: e.y, t0: t });
  }

  // ---------- frame ----------
  // scene: { buildings, units, ore (Uint8Array|string), fog: {explored, vis} | null, colors, me, overlay, radarOn }
  draw(scene, time) {
    const g = this.g, c = this.cam, dpr = this.dpr, Z = c.z * dpr, W = this.cv.width, H = this.cv.height, n = this.map.n, S = this.S, k = Z / S, opt = this.opt;
    this.t = time; this.colors = scene.colors;
    const sk = Math.max(0, 1 - (time - this.shakeT) / (this.shakeLife || 1)), ox = sk ? (Math.random() - 0.5) * sk * this.shakeAmp * Z : 0, oy = sk ? (Math.random() - 0.5) * sk * this.shakeAmp * Z : 0;
    const X = x => (x - c.x) * Z + W / 2 + ox, Y = y => (y - c.y) * Z + H / 2 + oy;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = this.land().sky; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
    const x0 = Math.max(0, Math.floor(c.x - W / Z / 2)), y0 = Math.max(0, Math.floor(c.y - H / Z / 2)), x1 = Math.min(n, Math.ceil(c.x + W / Z / 2)), y1 = Math.min(n, Math.ceil(c.y + H / Z / 2));
    const TP = this.TP;
    g.drawImage(this.terrain, x0 * TP, y0 * TP, (x1 - x0) * TP, (y1 - y0) * TP, X(x0), Y(y0), (x1 - x0) * Z, (y1 - y0) * Z);
    this.drawBridges(scene, X, Y, Z);
    const col = o => scene.colors[o] || { color: 0, faction: 'A' };
    const colB = b => b.neutral ? { color: scene.colors[b.o] ? scene.colors[b.o].color : -1, faction: 'N' } : col(b.o);
    const vis = scene.fog ? scene.fog.vis : null, mine = scene.mine || (() => true);
    const inView = (x, y, m = 3) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
    // gather what is on screen
    const list = [], air = [];
    for (const b of scene.buildings) { if (b.dead || !inView(b.x + 1, b.y + 1, 5)) continue; const d = BD[b.t]; list.push({ key: b.y + d.h - 0.01, b, d }); }
    for (const u of scene.units) {
      if (u.dead || !inView(u.x, u.y)) continue;
      if (vis && !mine(u.o) && !vis[(u.y | 0) * n + (u.x | 0)]) continue;
      if (UD[u.t].air) air.push(u); else list.push({ key: u.y, u });
    }
    list.sort((a, b) => a.key - b.key); air.sort((a, b) => a.y - b.y);
    // worn ground around the buildings
    if (STYLE.detail === 'high') for (const it of list) { if (!it.b || it.d.wall || it.d.mine || it.b.gone) continue; const b = it.b, d = it.d, cv = this.dirt(d.w, d.h); g.drawImage(cv, X(b.x - 0.7), Y(b.y - 0.7), (d.w + 1.4) * Z, (d.h + 1.4) * Z); }
    // ore
    const ore = scene.ore, isStr = typeof ore === 'string';
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = isStr ? parseInt(ore[y * n + x], 36) : ore[y * n + x]; if (!v) continue;
      g.drawImage(this.oreSp[(v > 8 ? 2 : v > 4 ? 1 : 0) * 4 + ((hash(x, y) * 4) | 0)], X(x), Y(y), Z, Z);
    }
    // scorch marks, rubble and wrecks
    for (const d of this.decals) {
      if (d.x < x0 - 3 || d.x > x1 + 3 || d.y < y0 - 3 || d.y > y1 + 3 || (d.t0 && d.t0 > time)) continue;
      g.fillStyle = 'rgba(40,36,30,0.42)'; g.beginPath(); g.ellipse(X(d.x), Y(d.y), d.r * Z, d.r * Z * 0.8, 0, 0, 7); g.fill();
      if (d.rubble) { const R = mulberry32(d.seed); for (let i = 0; i < 5 + d.w * d.h; i++) { const px = X(d.x + (R() - 0.5) * d.w * 0.8), py = Y(d.y + (R() - 0.5) * d.h * 0.8), s = (0.1 + R() * 0.14) * Z; g.fillStyle = OUT; g.fillRect(px - s / 2 - 2 * dpr, py - s / 2 - 2 * dpr, s + 4 * dpr, s * 0.8 + 4 * dpr); g.fillStyle = R() < 0.5 ? '#8d8f8a' : '#6c6e6a'; g.fillRect(px - s / 2, py - s / 2, s, s * 0.8); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px - s / 2, py - s / 2, s, s * 0.22); } }
      if (d.wreck) {      // a burnt-out hull: tracks, a turret knocked askew and a bent barrel
        const rot = d.rot || 0.3, q = Z * 0.01;
        g.save(); g.translate(X(d.x), Y(d.y)); g.rotate(rot); g.lineJoin = 'round'; g.lineCap = 'round';
        g.fillStyle = OUT; g.beginPath(); g.roundRect(-39 * q, -28 * q, 78 * q, 56 * q, 8 * q); g.fill();
        g.fillStyle = '#2a2b2e'; g.fillRect(-34 * q, -23 * q, 68 * q, 46 * q);
        g.fillStyle = '#505257'; g.beginPath(); g.moveTo(-30 * q, -13 * q); g.lineTo(26 * q, -13 * q); g.lineTo(31 * q, -4 * q); g.lineTo(27 * q, 13 * q); g.lineTo(-30 * q, 13 * q); g.closePath(); g.fill();
        g.strokeStyle = '#3a3b3f'; g.lineWidth = 2 * q; g.beginPath(); for (let i = -30; i <= 30; i += 7) { g.moveTo(i * q, -22 * q); g.lineTo(i * q, -15 * q); g.moveTo(i * q, 15 * q); g.lineTo(i * q, 22 * q); } g.stroke();
        g.fillStyle = '#1d1e20'; g.beginPath(); g.ellipse(-2 * q, 1 * q, 13 * q, 10 * q, 0, 0, 7); g.fill();
        g.translate(9 * q, -9 * q); g.rotate(1.1 + rot);
        g.strokeStyle = OUT; g.lineWidth = 9 * q; g.beginPath(); g.moveTo(0, 0); g.lineTo(24 * q, 0); g.stroke(); g.strokeStyle = '#46484c'; g.lineWidth = 4.5 * q; g.stroke();
        g.fillStyle = OUT; g.beginPath(); g.ellipse(0, 0, 13 * q, 11 * q, 0, 0, 7); g.fill(); g.fillStyle = '#5c5e63'; g.beginPath(); g.ellipse(0, 0, 10 * q, 8 * q, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.ellipse(-3 * q, -3 * q, 5 * q, 3 * q, 0, 0, 7); g.fill();
        g.restore();
      }
      if ((d.wreck || d.rubble) && opt.anim && time - d.t0 < (d.rubble ? 14 : 9)) {       // still burning
        const s = d.rubble ? Math.max(d.w, d.h) * 0.35 : 0.15;
        if (this.chance(d.rubble ? 0.3 : 0.14)) this.puff(d.x + (Math.random() - 0.5) * s * 2, d.y + (Math.random() - 0.5) * s, 0.15, '#4a4a50', 0.14, 1.3, 0.8, 0.2);
        if (time - d.t0 < 5 && this.chance(0.12)) this.puff(d.x + (Math.random() - 0.5) * s * 2, d.y + (Math.random() - 0.5) * s, 0.1, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23e', 0.1, 0.35, 0.8);
      }
    }
    const blit = (sp, px, py, a = 1) => { if (a !== 1) g.globalAlpha = a; g.drawImage(sp.cv, px - sp.ax * k, py - sp.ay * k, sp.cv.width * k, sp.cv.height * k); if (a !== 1) g.globalAlpha = 1; };
    // shadows first
    if (opt.shadows) {
      g.globalAlpha = 0.24;
      for (const it of list) {
        if (it.b) { const b = it.b, o = colB(b), sp = sprite(b.t, S, { color: o.color, faction: o.faction }); if (sp.sh && !(b.an && (b.gone || time < b.an.t0 + b.an.dur))) g.drawImage(sp.sh.cv, X(b.x + it.d.w / 2) - sp.sh.ax * k, Y(b.y + it.d.h / 2) - sp.sh.ay * k, sp.sh.cv.width * k, sp.sh.cv.height * k); }
        else { const u = it.u, r = UD[u.t].r; g.fillStyle = '#000'; g.beginPath(); g.ellipse(X(u.x + r * 0.25), Y(u.y + r * 0.2), r * 1.15 * Z, r * 0.8 * Z, 0, 0, 7); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    const tickNow = scene.tick ?? -999, anim = opt.anim;
    for (const it of list) {
      if (it.b) {
        const b = it.b, d = it.d, o = colB(b);
        const fr = !FRAMES[b.t] || !anim ? 0 : b.t === 'hq' ? (b.busy ? Math.floor(time * 7) % 8 : 0) : b.t === 'rad' ? (b.off ? 0 : Math.floor(time * 7) % 16) : b.t === 'coil' ? (tickNow - b.shot < 4 || (!b.off && Math.floor(time * 2 + b.id) % 5 === 0) ? 1 : 0) : Math.floor(time * 4 + b.id) % 2;
        const px = X(b.x + d.w / 2), py = Y(b.y + d.h / 2), a = b.ghost ? 0.8 : 1, low = b.hp < b.mhp * 0.5, bad = b.hp < b.mhp * 0.25;
        if (b.an) { const p = (time - b.an.t0) / b.an.dur; if (p < 1) { this.rise(b, d, o, px, py, Math.max(0, p), b.an.k === 'sell', X, Y, Z, k); continue; } if (b.gone) continue; }
        blit(sprite(b.t, S, { color: o.color, faction: o.faction, frame: fr, dmg: opt.damage && !b.ghost ? (bad ? 2 : low ? 1 : 0) : 0 }), px, py, a);
        const tr = TURRET[b.t]; if (tr) blit(sprite(tr, S, { dir: dir16(b.ax ?? 0.7, b.ay ?? 0.7), color: o.color, faction: o.faction }), px, py, a);
        if (b.off && Math.floor(time * 2) % 2 === 0) this.icon(px, py - d.h * Z * 0.5, '⚡', '#ffd23e');
        if (anim && !b.ghost) {
          if (low && this.chance(0.12)) this.puff(b.x + d.w * (0.25 + Math.random() * 0.5), b.y + d.h * (0.3 + Math.random() * 0.4), 0.7, bad ? '#3c3c42' : '#77777e', 0.2, 1.2, 0.9, 0.2);
          if (bad && this.chance(0.15)) this.puff(b.x + d.w * (0.3 + Math.random() * 0.4), b.y + d.h * (0.3 + Math.random() * 0.4), 0.5, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23e', 0.14, 0.4, 0.9);
          if (b.t === 'pow' && !b.off && this.chance(0.07)) { const P = o.faction === 'P'; this.puff(b.x + 1 + (P ? 0.28 : 0.6), b.y + 1 + (P ? -0.2 : Math.random() < 0.5 ? -0.5 : 0.2), P ? 1.25 : 1.4, '#f4f4ee', P ? 0.2 : 0.11, 1.6, 0.7, 0.18); }
          if (b.t === 'fac' && !b.off && this.chance(0.04)) this.puff(b.x + 2.55, b.y + 0.45, 1.75, '#8a8a90', 0.12, 1.4, 0.7, 0.15);
        }
        if (b.neutral) { if (b.sel) this.selRing(px, py + 0.2 * Z, 1.15 * Z); }
        else if (b.hp < b.mhp || b.sel) this.hpBar(px, py - (d.h / 2 + 0.25) * Z - (d.h > 1 ? 0.5 * Z : 0.3 * Z), d.w * Z * 0.8, b.hp / b.mhp);
      } else {
        const u = it.u, o = col(u.o), px = X(u.x), py = Y(u.y), d = UD[u.t];
        if (u.sel) this.selRing(px, py, d.r * Z);
        if (isInf(u.t)) {
          const dx = u.aim ? u.ax : u.fx, dy = u.aim ? u.ay : u.fy;
          blit(sprite(u.t, S, { dir: dir8(dx, dy), color: o.color, faction: o.faction, frame: u.mv ? 1 + (Math.floor(time * 7 + u.id) % 2) : 0 }), px, py);
        } else {
          const tr = TURRET[u.t], body = !tr && u.aim ? dir16(u.ax, u.ay) : dir16(u.fx, u.fy);
          const bob = u.mv ? Math.sin(time * 22 + u.id) * 0.012 * Z : 0;
          blit(sprite(u.t, S, { dir: body, color: o.color, faction: o.faction, frame: u.load ? 1 : 0 }), px, py + bob);
          if (tr) { const aim = u.aim || tickNow - u.shot < 15, ax = aim ? u.ax : u.fx, ay = aim ? u.ay : u.fy, rc = tickNow - u.shot < 2 ? 0.05 * Z : 0; blit(sprite(tr, S, { dir: dir16(ax, ay), color: o.color, faction: o.faction }), px - ax * rc, py - ay * rc + bob); }
          if (u.mv && this.chance(0.1)) this.puff(u.x - u.fx * 0.4, u.y - u.fy * 0.4, 0.05, '#cdbf9a', 0.09, 0.5, 0.25);
          if (u.hp < u.mhp * 0.4 && this.chance(0.1)) this.puff(u.x + (Math.random() - 0.5) * 0.2, u.y, 0.3, u.hp < u.mhp * 0.2 ? '#3c3c42' : '#6c6c74', 0.1, 0.9, 0.8, 0.1);
        }
        if (u.g >= 0 && scene.showGroups) { g.fillStyle = OUT; g.beginPath(); g.arc(px, py - 0.75 * Z, 0.13 * Z, 0, 7); g.fill(); g.fillStyle = GROUP_COL[u.g]; g.beginPath(); g.arc(px, py - 0.75 * Z, 0.09 * Z, 0, 7); g.fill(); }
        if (u.hp < u.mhp) this.hpBar(px, py - (d.cls === 'inf' ? 0.62 : 0.7) * Z, (d.cls === 'inf' ? 0.4 : 0.8) * Z, u.hp / u.mhp);
      }
    }
    // aircraft fly above everything on the ground
    for (const u of air) {
      const o = col(u.o), d = UD[u.t], alt = (u.alt || 0) * AIR, px = X(u.x), py = Y(u.y - alt * KZ);
      if (opt.shadows) { g.globalAlpha = 0.22; g.fillStyle = '#000'; g.beginPath(); g.ellipse(X(u.x + 0.1 + alt * 0.42), Y(u.y + 0.08 + alt * 0.2), 0.42 * Z, 0.26 * Z, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
      if (u.sel) this.selRing(px, py + 0.1 * Z, 0.5 * Z);
      const dx = u.aim && d.hover ? u.ax : u.fx, dy = u.aim && d.hover ? u.ay : u.fy, wob = alt > 0.2 && d.hover ? Math.sin(time * 3 + u.id) * 0.03 * Z : 0;
      blit(sprite(u.t, S, { dir: dir16(dx, dy), color: o.color, faction: o.faction, frame: FRAMES[u.t] && (u.alt || 0) > 0.02 ? Math.floor(time * 15) % 2 : 0 }), px, py + wob);
      if (u.hp < u.mhp * 0.4 && this.chance(0.2)) this.puff(u.x, u.y, alt, '#4a4a50', 0.1, 0.8, 0.2);
      if (u.g >= 0 && scene.showGroups) { g.fillStyle = OUT; g.beginPath(); g.arc(px, py - 0.6 * Z, 0.13 * Z, 0, 7); g.fill(); g.fillStyle = GROUP_COL[u.g]; g.beginPath(); g.arc(px, py - 0.6 * Z, 0.09 * Z, 0, 7); g.fill(); }
      if (u.hp < u.mhp) this.hpBar(px, py - 0.55 * Z, 0.8 * Z, u.hp / u.mhp);
    }
    this.drawFx(X, Y, Z, time);
    // shroud
    if (scene.fog) {
      this.updateFog(scene.fog);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(this.fogCv, X(0), Y(0), n * Z, n * Z);
    }
    // where an A-bomb is about to land (a: 0 at launch, 1 at impact): a closing reticle, and the rocket coming down at the end
    for (const q of scene.aims || []) {
      const px = X(q.x), py = Y(q.y), R = q.r * Z, beat = 0.5 + 0.5 * Math.sin(time * (8 + q.a * 14));
      g.lineWidth = 6 * dpr; g.strokeStyle = OUT; g.setLineDash([14 * dpr, 9 * dpr]); g.lineDashOffset = -time * 40 * dpr; g.beginPath(); g.ellipse(px, py, R, R * 0.85, 0, 0, 7); g.stroke();
      g.lineWidth = 3 * dpr; g.strokeStyle = `rgba(255,${Math.round(70 + beat * 120)},50,1)`; g.stroke(); g.setLineDash([]);
      const rr = R * (1 - q.a) * 0.9 + 6 * dpr;
      for (const [w, col] of [[5, OUT], [2.4, '#ffd23e']]) { g.lineWidth = w * dpr; g.strokeStyle = col; g.beginPath(); g.ellipse(px, py, rr, rr * 0.85, 0, 0, 7); g.moveTo(px - rr - 8 * dpr, py); g.lineTo(px - rr * 0.4, py); g.moveTo(px + rr * 0.4, py); g.lineTo(px + rr + 8 * dpr, py); g.moveTo(px, py - rr * 0.85 - 8 * dpr); g.lineTo(px, py - rr * 0.34); g.moveTo(px, py + rr * 0.34); g.lineTo(px, py + rr * 0.85 + 8 * dpr); g.stroke(); }
      this.icon(px, py - R * 0.85 - 14 * dpr, '☢', beat > 0.5 ? '#ffd23e' : '#ff5a3a');
      if (q.a > 0.72) { const f = (q.a - 0.72) / 0.28, z = (1 - f) * (1 - f) * 11; this.rocket(X(q.x + z * 0.12), Y(q.y - z * KZ), Z, false); }
    }
    const fl = 1 - (time - this.flashT) / 1.1;
    if (fl > 0) { g.fillStyle = `rgba(255,251,232,${(fl * fl * 0.92).toFixed(3)})`; g.fillRect(0, 0, W, H); }
    if (scene.overlay) scene.overlay(g, X, Y, Z, dpr);
  }
  // A building coming up out of the ground (or going back down when it is sold).
  rise(b, d, o, px, py, p, sell, X, Y, Z, k) {
    const g = this.g, sp = sprite(b.t, this.S, { color: o.color, faction: o.faction }), w = sp.cv.width * k, h = sp.cv.height * k, left = px - sp.ax * k, top = py - sp.ay * k;
    const q = p - 1, r = sell ? 1 - p * p : Math.max(0, 1 + 1.9 * q * q * q + 0.9 * q * q);   // a small bounce at the top
    g.fillStyle = 'rgba(96,78,48,.5)'; g.beginPath(); g.roundRect(X(b.x) + 0.05 * Z, Y(b.y) + 0.05 * Z, (d.w - 0.1) * Z, (d.h - 0.1) * Z, 0.12 * Z); g.fill();
    g.save(); g.beginPath(); g.rect(left - 6, top - h * 0.15, w + 12, h * 1.15 + 1); g.clip();
    g.drawImage(sp.cv, left, top + (1 - r) * h, w, h); g.restore();
    if (this.chance(0.75)) this.puff(b.x + Math.random() * d.w, b.y + d.h - 0.2 + Math.random() * 0.25, 0.05, '#e6dcc0', 0.15 + Math.random() * 0.1, 0.55, 0.35, (Math.random() - 0.5) * 0.9, 0.05);
  }
  // the A-bomb's rocket, about one cell long, nose up or nose down
  rocket(px, py, Z, up) {
    const g = this.g, L = Z * 0.95, w = Z * 0.17, d = up ? -1 : 1, ow = Math.max(1.5, Z * 0.045);
    const body = () => { g.beginPath(); g.moveTo(px - w, py - d * L * 0.25); g.lineTo(px - w, py + d * L * 0.45); g.quadraticCurveTo(px, py + d * L * 1.02, px + w, py + d * L * 0.45); g.lineTo(px + w, py - d * L * 0.25); g.closePath(); };
    g.lineJoin = 'round';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(px + sx * w, py - d * L * 0.05); g.lineTo(px + sx * w * 2.3, py - d * L * 0.32); g.lineTo(px + sx * w, py - d * L * 0.25); g.closePath(); g.lineWidth = ow * 2; g.strokeStyle = OUT; g.stroke(); g.fillStyle = '#c8402f'; g.fill(); }      // fins
    g.fillStyle = '#ffd23e'; g.beginPath(); g.moveTo(px - w * 0.7, py - d * L * 0.25); g.lineTo(px, py - d * L * (0.6 + Math.random() * 0.25)); g.lineTo(px + w * 0.7, py - d * L * 0.25); g.closePath(); g.fill();      // flame
    g.lineWidth = ow * 2; g.strokeStyle = OUT; body(); g.stroke(); g.fillStyle = '#f1efe6'; g.fill();
    g.save(); body(); g.clip(); g.fillStyle = '#c8402f'; g.fillRect(px - w, py + d * L * (up ? 1.02 : 0.52), w * 2, d * (up ? -1 : 1) * L * 0.5); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(px + w * 0.25, py - L * 1.1, w, L * 2.2); g.restore();
  }
  selRing(px, py, r) {
    const g = this.g, dpr = this.dpr; r = Math.max(r, 7 * dpr);
    for (const [w, c] of [[5, OUT], [2.2, '#ffffff']]) { g.strokeStyle = c; g.lineWidth = w * dpr; g.beginPath(); g.ellipse(px, py, r * 1.25, r * 0.85, 0, 0, 7); g.stroke(); }
  }
  icon(px, py, ch, colr) {
    const g = this.g, s = 15 * this.dpr;
    g.font = `900 ${s}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4 * this.dpr; g.strokeStyle = OUT; g.strokeText(ch, px, py); g.fillStyle = colr; g.fillText(ch, px, py);
  }
  hpBar(px, py, w, f) {
    const g = this.g, h = 4 * this.dpr; w = Math.max(w, 14 * this.dpr);
    g.fillStyle = OUT; g.fillRect(px - w / 2 - 1.5 * this.dpr, py - 1.5 * this.dpr, w + 3 * this.dpr, h + 3 * this.dpr);
    g.fillStyle = f > 0.5 ? '#4fdc4a' : f > 0.25 ? '#ffd23e' : '#ff4a3a'; g.fillRect(px - w / 2, py, w * Math.max(0, f), h);
  }
  updateFog(fog) {
    const key = fog.key; if (key === this.fogKey) return; this.fogKey = key;
    const d = this.fogImg.data, e = fog.explored, v = fog.vis, N = e.length;
    // soften the edge: blur the darkness a little so the shroud has no stair-steps
    const n = this.map.n, A = this.fogA || (this.fogA = new Float32Array(N)), T = this.fogT || (this.fogT = new Float32Array(N));
    for (let i = 0; i < N; i++) A[i] = !e[i] ? 255 : v && v[i] ? 0 : 100;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; T[i] = (A[x > 0 ? i - 1 : i] + A[i] * 2 + A[x < n - 1 ? i + 1 : i]) / 4; }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; A[i] = (T[y > 0 ? i - n : i] + T[i] * 2 + T[y < n - 1 ? i + n : i]) / 4; }
    }
    for (let i = 0; i < N; i++) { d[i * 4] = 8; d[i * 4 + 1] = 11; d[i * 4 + 2] = 16; d[i * 4 + 3] = !e[i] ? Math.max(A[i], 200) : A[i]; }
    this.fogCv.getContext('2d').putImageData(this.fogImg, 0, 0);
  }
  drawFx(X, Y, Z, t) {
    const g = this.g, dpr = this.dpr, keep = [];
    for (const f of this.fx) {
      const a = (t - f.t0) / f.life; if (a >= 1) { continue; } keep.push(f); if (a < 0) continue;
      if (f.k === 'p') {
        const dt = t - f.t0, px = X(f.x + f.vx * dt), py = Y(f.y + f.vy * dt - (f.z + f.vz * dt) * KZ), r = f.r * Z * (0.6 + a * 0.9);
        g.globalAlpha = 1 - a * a; g.fillStyle = OUT; g.beginPath(); g.arc(px, py, r + 1.6 * dpr, 0, 7); g.fill(); g.fillStyle = f.col; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(px - r * 0.28, py - r * 0.3, r * 0.45, 0, 7); g.fill(); g.globalAlpha = 1;
      } else if (f.k === 'b') {
        const px = X(f.x), py = Y(f.y - (0.2 + (f.z || 0)) * KZ), r = f.size * Z * (0.35 + a * 0.5);
        const star = (rr, colr, pts) => { g.beginPath(); for (let i = 0; i < pts * 2; i++) { const an = f.rot + i * Math.PI / pts, q = i % 2 ? rr * 0.58 : rr; g.lineTo(px + Math.cos(an) * q, py + Math.sin(an) * q * 0.85); } g.closePath(); g.fillStyle = colr; g.fill(); };
        g.globalAlpha = a < 0.6 ? 1 : 1 - (a - 0.6) / 0.4;
        g.lineJoin = 'round'; star(r + 2.5 * dpr, OUT, 9); star(r, '#ff7a1e', 9); star(r * 0.72, '#ffd23e', 8); star(r * 0.4, '#fffbe0', 7); g.globalAlpha = 1;
      } else if (f.k === 'fl') {
        const px = X(f.x), py = Y(f.y - f.z * KZ), r = f.r * Z;
        g.fillStyle = f.col || '#fff3a0'; g.beginPath(); for (let i = 0; i < 10; i++) { const an = i * Math.PI / 5 + f.t0 * 9, q = i % 2 ? r * 0.45 : r; g.lineTo(px + Math.cos(an) * q, py + Math.sin(an) * q); } g.closePath(); g.fill();
      } else if (f.k === 'tr') {
        g.strokeStyle = '#fff1a0'; g.lineWidth = 2 * dpr; g.lineCap = 'round'; g.beginPath();
        const s = a * 0.6, e = Math.min(1, s + 0.5), lx = v => f.x1 + (f.x2 - f.x1) * v, ly = v => f.y1 + (f.y2 - f.y1) * v - (f.z1 * (1 - v) + (f.z2 || 0) * v) * KZ;
        g.moveTo(X(lx(s)), Y(ly(s))); g.lineTo(X(lx(e)), Y(ly(e))); g.stroke();
      } else if (f.k === 'sh') {
        const x = f.x1 + (f.x2 - f.x1) * a, y = f.y1 + (f.y2 - f.y1) * a, z = f.z1 * (1 - a) + (f.z2 || 0) * a + f.arc * 4 * a * (1 - a), px = X(x), py = Y(y - z * KZ), r = (f.arc ? 0.09 : 0.06) * Z;
        if (f.rocket && this.chance(0.6)) this.puff(x, y, z, '#e9e9e2', 0.07, 0.35, 0.1);
        g.fillStyle = OUT; g.beginPath(); g.arc(px, py, r + 1.5 * dpr, 0, 7); g.fill(); g.fillStyle = f.rocket ? '#ff5a3a' : '#ffd23e'; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
      } else if (f.k === 'z') {
        const R = mulberry32((f.seed + Math.floor(t * 30)) | 0), sx = X(f.x1), sy = Y(f.y1 - f.z1 * KZ), ex = X(f.x2), ey = Y(f.y2 - 0.2 * KZ);
        const pts = [[sx, sy]]; for (let i = 1; i < 7; i++) pts.push([sx + (ex - sx) * i / 7 + (R() - 0.5) * Z * 0.5, sy + (ey - sy) * i / 7 + (R() - 0.5) * Z * 0.5]); pts.push([ex, ey]);
        g.lineJoin = 'round'; g.lineCap = 'round';
        for (const [w, colr] of [[7, '#2a7bd6'], [4, '#9fe9ff'], [1.6, '#ffffff']]) { g.strokeStyle = colr; g.lineWidth = w * dpr; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
      } else if (f.k === 'col') {
        const sp = f.sp, k = Z / this.S, w = sp.cv.width * k, h = sp.cv.height * k, left = X(f.x) - sp.ax * k + (Math.random() - 0.5) * 0.07 * Z, top = Y(f.y) - sp.ay * k;
        g.save(); g.beginPath(); g.rect(left - 8, top, w + 16, h + 1); g.clip(); g.drawImage(sp.cv, left, top + a * a * h, w, h); g.restore();
      } else if (f.k === 'tx') {
        const px = X(f.x), py = Y(f.y - 0.6 - a * 0.9);
        g.globalAlpha = 1 - a * a * a; g.font = `900 ${14 * dpr}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4 * dpr; g.strokeStyle = OUT; g.strokeText(f.txt, px, py); g.fillStyle = f.col || '#ffd23e'; g.fillText(f.txt, px, py); g.globalAlpha = 1;
      } else if (f.k === 'ring') {
        const r = f.r * Z * (0.3 + a * 0.9);
        g.globalAlpha = (1 - a) * 0.75; g.strokeStyle = '#fff3c4'; g.lineWidth = (3.5 - a * 2.5) * dpr; g.beginPath(); g.ellipse(X(f.x), Y(f.y), r, r * 0.78, 0, 0, 7); g.stroke(); g.globalAlpha = 1;
      } else if (f.k === 'rk') {      // the rocket leaving its silo: slowly at first, then gone
        const z = 0.35 + a * a * 16, x = f.x + a * a * 0.6;
        if (this.chance(0.9)) this.puff(x + (Math.random() - 0.5) * 0.2, f.y, z - 0.6, a < 0.3 ? '#ffe9b0' : '#ece8dc', 0.16 + Math.random() * 0.1, 0.9, -0.5, (Math.random() - 0.5) * 0.5, 0);
        this.rocket(X(x), Y(f.y - z * KZ), Z, true);
      } else if (f.k === 'nuke') {    // the mushroom cloud: a glowing ball that rises on a stem, turns to smoke and thins out
        const px = X(f.x), gy = Y(f.y), R = f.r * Z, up = Math.min(1, a * 2.4), rise = 1 - (1 - up) * (1 - up), hot = Math.max(0, 1 - a * 3.4), fade = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
        const smoke = mix('#fff3c2', mix('#ff9632', '#8d837c', Math.min(1, a * 2.2)), Math.min(1, a * 5)), lite = shade(smoke, 0.16), dark = shade(smoke, -0.2), ow = Math.max(2, Z * 0.06);
        if (hot > 0) { g.globalAlpha = hot * 0.85; g.fillStyle = '#fffbe8'; g.beginPath(); g.ellipse(px, gy, R * (0.45 + a * 3), R * (0.45 + a * 3) * 0.82, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
        const H = f.r * 1.45 * Z * KZ * rise + R * 0.15 * a, cr = R * (0.3 + 0.24 * rise + 0.1 * a), sw = R * (0.17 + 0.05 * rise), br = R * (0.3 + 0.75 * Math.min(1, a * 2));
        // painted around (cx, cy), the point on the ground under the cloud: dust rolling outwards, the stem, the cap
        const paint = (q, cx, cy) => {
          const blobs = [], N = 11;
          for (let i = 0; i < N; i++) { const an = i / N * 6.283 + 0.3; blobs.push([cx + Math.cos(an) * br, cy + Math.sin(an) * br * 0.8 - R * 0.05, R * (0.2 + 0.06 * ((i * 7) % 3))]); }
          const capY = cy - H, cap = [[0, -0.2, 1], [-0.82, 0.14, 0.7], [0.82, 0.14, 0.7], [-0.4, 0.34, 0.6], [0.42, 0.34, 0.6], [0, 0.42, 0.5]].map(([x, y, r]) => [cx + x * cr, capY + y * cr, r * cr]);
          const stem = () => { q.beginPath(); q.moveTo(cx - sw * 1.5, cy); q.quadraticCurveTo(cx - sw * 0.7, cy - H * 0.5, cx - sw, capY + cr * 0.3); q.lineTo(cx + sw, capY + cr * 0.3); q.quadraticCurveTo(cx + sw * 0.7, cy - H * 0.5, cx + sw * 1.5, cy); q.closePath(); };
          const circles = (list, grow, col) => { q.fillStyle = col; q.beginPath(); for (const [x, y, r] of list) { q.moveTo(x + r + grow, y); q.arc(x, y, r + grow, 0, 7); } q.fill(); };
          circles(blobs, ow, OUT); circles(blobs, 0, dark);
          q.lineWidth = ow * 2; q.strokeStyle = OUT; q.lineJoin = 'round'; stem(); q.stroke(); q.fillStyle = smoke; q.fill();
          q.fillStyle = dark; q.beginPath(); q.moveTo(cx + sw * 0.3, capY + cr * 0.3); q.lineTo(cx + sw, capY + cr * 0.3); q.quadraticCurveTo(cx + sw * 0.7, cy - H * 0.5, cx + sw * 1.5, cy); q.lineTo(cx + sw * 0.6, cy); q.quadraticCurveTo(cx + sw * 0.15, cy - H * 0.5, cx + sw * 0.3, capY + cr * 0.3); q.fill();
          circles(cap, ow, OUT); circles(cap, 0, smoke);
          circles([[cap[0][0] + cr * 0.3, cap[0][1] + cr * 0.34, cr * 0.5], [cap[2][0] + cr * 0.05, cap[2][1] + cr * 0.12, cr * 0.42]], 0, dark);
          circles([[cap[0][0] - cr * 0.28, cap[0][1] - cr * 0.3, cr * 0.5], [cap[1][0] - cr * 0.1, cap[1][1] - cr * 0.16, cr * 0.34]], 0, lite);
          if (hot > 0) { q.globalAlpha = hot; circles([[cx, capY, cr * 0.75]], 0, '#fff6c8'); q.globalAlpha = 1; }
        };
        if (fade >= 1) paint(g, px, gy);
        else {      // thinning out: painted on a sheet of its own first, so the parts do not show through each other
          const pad = ow + 4, hw = Math.ceil(br + R * 0.36 + pad), top = Math.ceil(H + cr * 1.25 + pad), cw = hw * 2, ch = top + Math.ceil(br * 0.8 + R * 0.36 + pad);
          const sheet = this.cloudCv || (this.cloudCv = mk(8, 8)); if (sheet.width < cw || sheet.height < ch) { sheet.width = Math.max(sheet.width, cw); sheet.height = Math.max(sheet.height, ch); }
          const q = sheet.getContext('2d'); q.clearRect(0, 0, sheet.width, sheet.height); paint(q, hw, top);
          g.globalAlpha = fade; g.drawImage(sheet, 0, 0, cw, ch, px - hw, gy - top, cw, ch); g.globalAlpha = 1;
        }
      } else if (f.k === 'd') {
        const dt = t - f.t0, z = Math.max(0, f.z + f.vz * dt - 4.2 * dt * dt), s = f.r * Z;
        g.save(); g.translate(X(f.x + f.vx * dt), Y(f.y + f.vy * dt - z * KZ)); g.rotate(f.rot + dt * f.spin);
        g.fillStyle = OUT; g.fillRect(-s - 1.2 * dpr, -s * 0.7 - 1.2 * dpr, s * 2 + 2.4 * dpr, s * 1.4 + 2.4 * dpr); g.fillStyle = f.col; g.fillRect(-s, -s * 0.7, s * 2, s * 1.4); g.restore();
      }
    }
    this.fx = keep;
  }

  // ---------- radar ----------
  drawRadar(cv, scene, time) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, n = this.map.n, s = w / n;
    g.imageSmoothingEnabled = false;
    if (!scene.radarOn) {
      g.fillStyle = '#10161c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? '#1c2630' : '#25313d'; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 2); }
      g.fillStyle = '#7f93a6'; g.font = `700 ${Math.round(w / 13)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('INGEN RADAR', w / 2, h / 2 - w / 22); g.font = `500 ${Math.round(w / 18)}px system-ui, sans-serif`; g.fillText('Byg en radarstation', w / 2, h / 2 + w / 18);
    } else {
      g.drawImage(this.radarBase, 0, 0, w, h);
      if (time - this.oreAt > 1.5 || this.oreAt < 0) {
        this.oreAt = time; const d = this.oreImg.data, ore = scene.ore, isStr = typeof ore === 'string';
        for (let i = 0; i < n * n; i++) { const v = isStr ? ore[i] !== '0' : ore[i]; d[i * 4] = 240; d[i * 4 + 1] = 190; d[i * 4 + 2] = 30; d[i * 4 + 3] = v ? 255 : 0; }
        this.oreCv.getContext('2d').putImageData(this.oreImg, 0, 0);
      }
      g.drawImage(this.oreCv, 0, 0, w, h);
      const vis = scene.fog ? scene.fog.vis : null, mine = scene.mine || (() => true);
      for (const b of scene.bridges || []) if (!b.dead && b.hp > 0) { g.fillStyle = '#c9b48a'; for (const c of b.cells) g.fillRect((c % n) * s, ((c / n) | 0) * s, Math.max(1.5, s), Math.max(1.5, s)); }
      for (const b of scene.buildings) { if (b.dead || BD[b.t].mine) continue; const d = BD[b.t], o = scene.colors[b.o]; g.fillStyle = b.neutral && !o ? '#f4f1e8' : DEFS.colors[o ? o.color : 0].main; g.fillRect(b.x * s, b.y * s, Math.max(2, d.w * s), Math.max(2, d.h * s)); if (b.neutral) { g.strokeStyle = '#10161c'; g.lineWidth = 1; g.strokeRect(b.x * s + 0.5, b.y * s + 0.5, Math.max(2, d.w * s) - 1, Math.max(2, d.h * s) - 1); } }
      for (const u of scene.units) { if (u.dead || (vis && !mine(u.o) && !vis[(u.y | 0) * n + (u.x | 0)])) continue; const o = scene.colors[u.o]; g.fillStyle = DEFS.colors[o ? o.color : 0].light; g.fillRect(u.x * s - 1, u.y * s - 1, 2.4, 2.4); }
      if (scene.fog) { this.updateFog(scene.fog); g.drawImage(this.fogCv, 0, 0, w, h); }
      for (const p of this.pings) { const a = (time - p.t0) / 3; if (a > 1 || a < 0) continue; g.strokeStyle = `rgba(255,70,50,${1 - a})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x * s, p.y * s, 4 + (a * 3 % 1) * 16, 0, 7); g.stroke(); }
      this.pings = this.pings.filter(p => time - p.t0 < 3);
    }
    if (!scene.radarOn) return;
    const on = scene.radarT0 != null ? (time - scene.radarT0) / 1.1 : 2;
    if (on < 1) {   // the picture rolls down the screen when the radar comes online
      const yy = on * h; g.fillStyle = '#10161c'; g.fillRect(0, yy, w, h - yy);
      for (let i = 0; i < 70; i++) { g.fillStyle = Math.random() < 0.5 ? '#1c2630' : '#2c3c4a'; g.fillRect(Math.random() * w, yy + Math.random() * (h - yy), 3 + Math.random() * 14, 2); }
      g.fillStyle = '#8cf07c'; g.fillRect(0, yy - 1, w, 3); return;
    }
    const c = this.cam, vw = this.w / c.z * s, vh = this.h / c.z * s;
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(c.x * s - vw / 2, c.y * s - vh / 2, vw, vh);
    // the enemy camps that have been found: a ring in the general's colour (gold with a cross when an attack is planned)
    const k = w / (cv.clientWidth || w);      // canvas pixels per screen pixel: the markers keep their size on a small radar
    for (const q of scene.camps || []) {
      const px = q.x * s, py = q.y * s, r = (q.on ? 7.5 + Math.sin(time * 6) * 1.2 : 6) * k, col = DEFS.colors[q.color] || DEFS.colors[0];
      g.lineWidth = 4.5 * k; g.strokeStyle = '#10161c'; g.beginPath(); g.arc(px, py, r, 0, 7); g.stroke();
      g.lineWidth = 2.2 * k; g.strokeStyle = q.atk ? '#ffd23e' : '#ffffff'; g.stroke();
      g.fillStyle = col.main; g.beginPath(); g.arc(px, py, r * 0.52, 0, 7); g.fill();
      if (q.atk) { g.lineWidth = 2 * k; g.strokeStyle = '#ffd23e'; g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(px + dx * r * 1.15, py + dy * r * 1.15); g.lineTo(px + dx * r * 1.9, py + dy * r * 1.9); } g.stroke(); }
    }
  }
}
