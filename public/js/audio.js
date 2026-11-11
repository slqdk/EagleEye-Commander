// EagleEye Commander — sound.
//  * Effects and music are synthesised in the browser (no files).
//  * Voices are recorded lines in one file, audio/voices.mp3 (made by tools/make_voices.py);
//    if that file cannot be loaded, the browser's own speech synthesis reads a few basic lines instead.
//  * What is on and how loud it is comes from the player's settings (settings.js) and follows them while playing.
import { VOICE_INDEX, VOICE_VERSION } from './voiceindex.js';
import { cfg, onCfg } from './settings.js';

let ctx = null, master = null, voiceBus = null, musicBus = null;
const SFX_GAIN = 0.62, VOICE_GAIN = 1.28;   // at the default volumes this gives the levels the mix was balanced at

// The voice file is fetched straight away; it is decoded once the player has clicked something.
let packBuf = null, packState = 'idle';
const packBytes = (() => {
  try {
    if (typeof window !== 'undefined' && window.JF_VOICE_B64) { const bin = atob(window.JF_VOICE_B64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return Promise.resolve(u8.buffer); }
    return fetch('audio/voices.mp3?v=' + VOICE_VERSION).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  } catch { return Promise.resolve(null); }
})();

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = SFX_GAIN * cfg.sfxVol; master.connect(comp);
    voiceBus = ctx.createGain(); voiceBus.gain.value = VOICE_GAIN * cfg.voiceVol; voiceBus.connect(comp);
    const mcomp = ctx.createDynamicsCompressor(); mcomp.threshold.value = -14; mcomp.ratio.value = 4; mcomp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(mcomp);
    packState = 'loading';
    packBytes.then(b => b ? ctx.decodeAudioData(b) : null).then(buf => { packBuf = buf; packState = buf ? 'ready' : 'failed'; }, () => { packState = 'failed'; });
    music.attach(ctx, musicBus);
  } catch { ctx = null; }
}

// ---------- effects ----------
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(type, f0, f1, dur, vol, t = ctx.currentTime, a = 0.005) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, a, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function burst(freq, q, dur, vol, t = ctx.currentTime, type = 'lowpass', f1 = freq) {
  const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = type; f.frequency.setValueAtTime(freq, t); if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
const last = {};
const GAP = { mg: 0.07, cannon: 0.08, boom: 0.09, rocket: 0.12, zap: 0.12, flame: 0.12, tick: 0.045, cash: 0.06, bigboom: 0.2, radio: 0.3, construct: 0.4, door: 0.3, siren: 1.5, nuke: 1 };

export function sfx(name, vol = 1) {
  if (!cfg.sfx || !ctx || vol <= 0.02) return;
  const t = ctx.currentTime; if (last[name] && t - last[name] < (GAP[name] || 0.03)) return; last[name] = t;
  const v = Math.min(1, vol);
  switch (name) {
    case 'click': tone('square', 900, 600, 0.05, 0.12 * v); break;
    case 'tick': tone('square', 1400, 1400, 0.02, 0.05 * v); break;
    case 'ready': tone('triangle', 660, 660, 0.12, 0.3 * v); tone('triangle', 990, 990, 0.22, 0.3 * v, t + 0.1); break;
    case 'place': tone('sine', 150, 50, 0.22, 0.6 * v); burst(900, 1, 0.18, 0.35 * v); break;
    // hammering while a building goes up: `vol` doubles as the length in seconds here
    case 'construct': for (let i = 0, n = Math.max(2, Math.round(vol / 0.19)); i < n; i++) { const tt = t + i * 0.19 + (i % 2) * 0.03; burst(2400 + (i % 3) * 500, 6, 0.07, 0.2, tt, 'bandpass'); tone('square', 1900 + (i % 3) * 260, 1500, 0.05, 0.05, tt); tone('sine', 120, 70, 0.08, 0.25, tt); } break;
    case 'sink': tone('sine', 140, 38, 0.7, 0.5 * v); burst(500, 0.7, 0.7, 0.3 * v, t, 'lowpass', 90); break;
    case 'door': burst(300, 1.5, 0.45, 0.22 * v, t, 'bandpass', 700); tone('sawtooth', 70, 95, 0.4, 0.1 * v); break;
    case 'powerup': tone('sawtooth', 120, 880, 0.7, 0.1 * v); tone('square', 880, 1320, 0.15, 0.1 * v, t + 0.7); tone('square', 1320, 1320, 0.2, 0.1 * v, t + 0.86); break;
    case 'sell': for (let i = 0; i < 4; i++) tone('square', 1300 + i * 220, 1300 + i * 220, 0.05, 0.1 * v, t + i * 0.055); break;
    case 'cash': tone('square', 1700, 2300, 0.05, 0.07 * v); break;
    case 'error': tone('sawtooth', 160, 110, 0.22, 0.22 * v); break;
    case 'mg': burst(2600, 2, 0.05, 0.22 * v, t, 'bandpass'); break;
    case 'cannon': tone('sine', 170, 45, 0.25, 0.5 * v); burst(1400, 0.8, 0.16, 0.35 * v); break;
    case 'rocket': burst(700, 3, 0.4, 0.22 * v, t, 'bandpass', 2600); break;
    case 'flame': burst(1200, 0.6, 0.35, 0.16 * v, t, 'bandpass', 500); break;
    case 'zap': tone('sawtooth', 1800, 180, 0.24, 0.2 * v); burst(5000, 4, 0.2, 0.2 * v, t, 'bandpass'); break;
    case 'boom': tone('sine', 110, 35, 0.4, 0.5 * v); burst(600, 0.7, 0.4, 0.4 * v, t, 'lowpass', 120); break;
    case 'bigboom': tone('sine', 90, 28, 0.9, 0.7 * v); burst(900, 0.7, 0.9, 0.55 * v, t, 'lowpass', 80); break;
    // an air-raid siren winding up, and the long rumble of the bomb
    case 'siren': for (let i = 0; i < 2; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * 0.95; o.type = 'sawtooth'; o.frequency.setValueAtTime(330, tt); o.frequency.linearRampToValueAtTime(620, tt + 0.5); o.frequency.linearRampToValueAtTime(330, tt + 0.95); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.16 * v, tt + 0.08); g.gain.setValueAtTime(0.16 * v, tt + 0.85); g.gain.linearRampToValueAtTime(0.0001, tt + 0.95); o.connect(g); g.connect(master); o.start(tt); o.stop(tt + 1); } break;
    case 'nuke': tone('sine', 70, 22, 3.2, 0.9 * v); tone('sine', 140, 30, 1.4, 0.5 * v); burst(1400, 0.5, 0.5, 0.7 * v, t, 'lowpass', 200); burst(500, 0.6, 3.4, 0.6 * v, t + 0.05, 'lowpass', 50); burst(2400, 0.8, 1.6, 0.18 * v, t + 0.3, 'bandpass', 300); break;
    case 'alert': tone('square', 620, 620, 0.14, 0.16 * v); tone('square', 470, 470, 0.14, 0.16 * v, t + 0.16); tone('square', 620, 620, 0.14, 0.16 * v, t + 0.32); break;
    case 'drum': tone('sine', 120, 50, 0.3, 0.7 * v); tone('sine', 120, 50, 0.3, 0.7 * v, t + 0.22); tone('sine', 160, 60, 0.5, 0.8 * v, t + 0.44); burst(3000, 1, 0.12, 0.2 * v, t + 0.44, 'highpass'); break;
    case 'radio': burst(1900, 5, 0.07, 0.16 * v, t, 'bandpass'); tone('square', 1250, 1250, 0.035, 0.05 * v, t + 0.02); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.3, 0.3 * v, t + i * 0.16)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.4, 0.3 * v, t + i * 0.22)); break;
  }
}

// ---------- voices ----------
// One line plays at a time. Alarms (3) cut in, the radio operator (2) queues up behind himself, units (1) interrupt each other.
let cur = null; const queue = [], said = {}, lastPick = {};
const pick = (list, key) => { let i = (Math.random() * list.length) | 0; if (list.length > 1 && i === lastPick[key]) i = (i + 1) % list.length; lastPick[key] = i; return list[i]; };
function startClip(clip, prio) {
  const t = ctx.currentTime, src = ctx.createBufferSource(), g = ctx.createGain(), a = Math.max(0, clip[0] - 0.03), d = clip[1] + 0.07;
  src.buffer = packBuf; g.gain.value = prio === 1 ? 0.9 : 1; src.connect(g); g.connect(voiceBus); src.start(t, a, d);
  cur = { src, g, prio, end: t + d }; music.duck(true);
  src.onended = () => { if (!cur || cur.src !== src) return; cur = null; const n = queue.shift(); if (n) startClip(n.clip, n.prio); else music.duck(false); };
}
function playClip(clip, prio) {
  const t = ctx.currentTime;
  if (cur && t < cur.end - 0.05) {
    if (prio < cur.prio) return;
    if (prio === cur.prio && prio === 2) { if (queue.length < 2) queue.push({ clip, prio }); return; }
    const old = cur; cur = null; queue.length = 0; old.src.onended = null; old.g.gain.setTargetAtTime(0, t, 0.012); old.src.stop(t + 0.07);
  }
  startClip(clip, prio);
}
const SPEECH = {   // spoken by the browser only when the recorded voices are unavailable
  building: 'Construction underway.', ready: 'Building is good to go.', unit: 'Unit reporting for duty.', nomoney: 'Negative. Not enough funds.', lowpower: 'Warning. Power is critical.',
  cant: "Negative. Can't build there.", attack: 'Contact! Base is taking fire!', harv: 'Harvester is taking fire!', lost: 'We lost a building!', orders: 'Copy that. Orders confirmed.',
  battle: 'All units, move out!', won: 'Outstanding, commander. The field is ours.', defeat: "We've been overrun. Fall back.",
  nukein: 'Incoming warhead! Take cover!', nukeout: 'Warhead is away.', nukeready: 'Warhead is standing by, commander.',
};
function speak(text, pitch) {
  if (!window.speechSynthesis || !text) return;
  try {
    if (speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance(text), vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
    u.lang = 'en-US'; if (vs.length) u.voice = vs.find(v => /david|mark|guy|alex|fred|aaron|male/i.test(v.name)) || vs[0];
    u.rate = 1.15; u.pitch = pitch; sfx('radio'); speechSynthesis.speak(u);
  } catch {}
}
const HOLD = { unitlost: 9000, attack: 6000, harv: 6000, lost: 3000 };
export function say(key) {
  if (!cfg.voice || !ctx) return;
  const now = Date.now(); if (said[key] && now - said[key] < (HOLD[key] || 2500)) return; said[key] = now;
  if (packState === 'ready') { const v = VOICE_INDEX.a[key]; if (v) playClip(pick(v, key), key === 'attack' || key === 'harv' || key === 'lost' || key === 'won' || key === 'defeat' || key === 'nukein' || key === 'nukeout' ? 3 : 2); }
  else if (packState === 'failed') speak(SPEECH[key], 0.7);
}
// A unit answers: kind 's' when it is selected, 'g' when it is sent off.
export function unitSay(type, kind) {
  if (!cfg.voice || !cfg.unitVoice || !ctx) return;
  if (packState === 'ready') { const u = VOICE_INDEX.u[type]; if (u && u[kind]) playClip(pick(u[kind], type + kind), 1); }
  else if (packState === 'failed') speak(kind === 's' ? 'Ready.' : 'Moving out.', 1);
}
export const voiceState = () => packState;

// ---------- music ----------
// Three original marches, played live by a small synthesiser band. Each bar is scheduled a moment before it is due.
// Level 0 = planning (drums, bass and pads), 1 = adds guitars, 2 = battle (everything, with the lead melody).
const SCALE = [0, 2, 3, 5, 7, 8, 10];   // natural minor
const deg = (root, d) => root + SCALE[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const hz = n => 440 * 2 ** ((n - 69) / 12);
export const SONGS = [
  { name: 'Stålmarch', bpm: 112, root: 40, form: 'AABBAACBB', sec: {
    A: { ch: [0, 0, 5, 6], k: 'X.......X.x.....', s: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xx'], h: 'x.x.x.x.x.x.x.x.', st: 'x...x...x...x...', rim: 'x.xxx.xxx.xxx.xx',
      g: ['0.000.0.0.000.0.', '0.000.0.0.000.0.', '0.000.0.0.000.0.', '0.000.0.0.0.2.4.'], b: '0...0.0.0...0.0.', pad: ['L...............', '................', 'L...............', 'L.......s.......'] },
    B: { ch: [0, 2, 6, 3], k: 'X..x..x.X..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', st: 'x...x...x...x...', g: 'S.......0.0.0.0.', b: '0..0..0.0..0..0.', pad: 'L...............',
      l: [[[0, 7, 3], [4, 9, 2], [6, 8, 2], [8, 7, 4], [12, 4, 4]], [[0, 9, 3], [4, 11, 2], [6, 10, 2], [8, 9, 6], [14, 8, 2]], [[0, 8, 3], [4, 10, 2], [6, 9, 2], [8, 8, 4], [12, 6, 4]], [[0, 7, 4], [4, 5, 4], [8, 3, 4], [12, 4, 4]]] },
    C: { ch: [0, 0, 0, 0], k: 'X.......X.......', s: ['................', '................', '............x...', 'x.x.x.xxxxxxxxxx'], h: '................', st: 'x...x...x...x...', rim: 'x.xxx.xxx.xxx.xx', ck: '....x.......x...',
      b: 'L...............', pad: ['L...............', '................', '................', '................'] } } },
  { name: 'Malmfeber', bpm: 126, root: 45, form: 'AABBABB', arp0: true, sec: {
    A: { ch: [0, 5, 2, 6], k: 'X...x...X...x...', s: '....x.......x...', h: '..o...o...o...o.', hh: 'x.xxx.xxx.xxx.xx', b: '0.7.0.7.0.7.0.7.', a: '0247420402474204', g: '..0...0...0..0.0', pad: 'L...............' },
    B: { ch: [0, 3, 6, 2], k: 'X...x...X...x.x.', s: '....x.......x...', h: '..o...o...o...o.', hh: 'xxxxxxxxxxxxxxxx', b: '0.7.0.7.0.7.0.7.', a: '0247420402474204', g: 'S.......S...0.0.', pad: 'L...............',
      l: [[[0, 4, 2], [2, 7, 2], [4, 9, 4], [8, 8, 2], [10, 7, 2], [12, 4, 4]], [[0, 5, 2], [2, 7, 2], [4, 10, 4], [8, 9, 2], [10, 7, 2], [12, 5, 4]], [[0, 6, 2], [2, 8, 2], [4, 10, 4], [8, 9, 2], [10, 8, 2], [12, 6, 4]], [[0, 9, 4], [4, 8, 2], [6, 7, 2], [8, 6, 4], [12, 8, 4]]] } } },
  { name: 'Jernregn', bpm: 92, root: 38, form: 'AABABB', sec: {
    A: { ch: [0, 0, 6, 5], k: 'X.....x...x.....', s: ['........x.......', '........x.......', '........x.......', '........x...xxxx'], h: 'x...x...x...x...', ck: '....x.......x...', st: 'x.......x.......',
      g: ['S.............00', 'S.............00', 'S.............00', 'S...........0.0.'], b: '0.....0...0.....', pad: 'L...............',
      l: [[[0, 7, 8], [8, 8, 4], [12, 9, 4]], [[0, 11, 8], [8, 9, 8]], [[0, 8, 8], [8, 6, 8]], [[0, 7, 6], [6, 5, 6], [12, 4, 4]]] },
    B: { ch: [3, 3, 0, 4], k: 'X.x...x.X.x...x.', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', ck: '....x.......x...', g: '0.0.S...0.0.S...', b: '0.0...0.0.0...0.', pad: 'L.......L.......',
      l: [[[0, 10, 4], [4, 9, 4], [8, 7, 8]], [[0, 10, 4], [4, 12, 4], [8, 11, 8]], [[0, 9, 4], [4, 7, 4], [8, 8, 4], [12, 9, 4]], [[0, 8, 8], [8, 11, 4], [12, 8, 4]]] } } },
];
export const songNames = SONGS.map(s => s.name);

// The band: every instrument is a few oscillators and filters created per note.
export class Band {
  constructor(c, dest) {
    this.c = c; this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(dest);
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.nb = nb;
    const len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(1, len, c.sampleRate);
    for (let ch = 0; ch < 1; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2; }
    this.rev = c.createConvolver(); this.rev.buffer = ir; const rg = c.createGain(); rg.gain.value = 0.2; this.rev.connect(rg); rg.connect(this.out);
    const curve = k => { const a = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); } return a; };
    const bq = (type, f, q = 0.7, gain = 0) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
    const ws = c.createWaveShaper(); ws.curve = curve(5); ws.oversample = '2x';
    const gOut = c.createGain(); gOut.gain.value = 0.34;
    this.gIn = chain(c.createGain(), bq('highpass', 110), ws, bq('peaking', 1300, 0.9, 6), bq('lowpass', 3600), gOut, this.out);   // guitar amplifier
    const ws2 = c.createWaveShaper(); ws2.curve = curve(1.8);
    const bOut = c.createGain(); bOut.gain.value = 0.3;
    this.bIn = chain(c.createGain(), ws2, bq('lowpass', 1400), bOut, this.out);                                                    // bass amplifier
    this.dl = c.createDelay(1); const fb = c.createGain(); fb.gain.value = 0.3; const dg = c.createGain(); dg.gain.value = 0.45;
    this.dl.connect(fb); fb.connect(this.dl); this.dl.connect(dg); dg.connect(this.out);                                            // echo for the lead
    // one shared filter per instrument family: a note is then just its oscillators and an envelope
    const bus = (f, ...to) => { for (const n of to) f.connect(n); return f; };
    this.hatB = bus(bq('highpass', 7500), this.out); this.snB = bus(bq('bandpass', 1900, 0.8), this.out, this.rev); this.rimB = bus(bq('bandpass', 2600, 2.5), this.out);
    this.stB = bus(bq('bandpass', 420, 0.7), this.out); this.plB = bus(bq('lowpass', 2600, 1.5), this.out, this.dl); this.ldB = bus(bq('lowpass', 4200, 0.8), this.out, this.dl, this.rev);
  }
  nz(t, dur) { const s = this.c.createBufferSource(); s.buffer = this.nb; s.loop = true; s.start(t, Math.random() * 0.9); s.stop(t + dur + 0.02); return s; }
  ad(g, t, a, v, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  hold(g, t, a, v, len, r = 0.06) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a + 0.005, len - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + len); }
  osc(type, f, t, dur, det = 0) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.start(t); o.stop(t + dur + 0.03); return o; }
  flt(type, f, q = 0.7) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  kick(t, v) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    this.ad(g, t, 0.003, 0.62 * v, 0.26); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3);
    const ng = c.createGain(); this.ad(ng, t, 0.001, 0.5 * v, 0.02); this.nz(t, 0.02).connect(ng); ng.connect(this.snB);   // the beater's knock
  }
  snare(t, v) {
    const c = this.c, g = c.createGain(); this.ad(g, t, 0.002, 0.95 * v, 0.17); this.nz(t, 0.18).connect(g); g.connect(this.snB);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); this.ad(og, t, 0.002, 0.3 * v, 0.1); o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.12);
  }
  rim(t, v) { const g = this.c.createGain(); this.ad(g, t, 0.001, 0.7 * v, 0.045); this.nz(t, 0.05).connect(g); g.connect(this.rimB); }
  hat(t, v, open) { const g = this.c.createGain(); this.ad(g, t, 0.001, 0.42 * v, open ? 0.17 : 0.035); this.nz(t, open ? 0.18 : 0.04).connect(g); g.connect(this.hatB); }
  stomp(t, v) {
    const c = this.c, g = c.createGain(); this.ad(g, t, 0.004, 0.42 * v, 0.14); this.nz(t, 0.15).connect(g); g.connect(this.stB);
    const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1); this.ad(og, t, 0.004, 0.16 * v, 0.13); o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.15);
  }
  clank(t, v) {
    const g = this.c.createGain(), f = this.flt('bandpass', 2300, 1.2); this.ad(g, t, 0.001, 0.13 * v, 0.32); f.connect(g); g.connect(this.out); g.connect(this.rev);
    for (const r of [1, 1.47, 2.09, 2.78]) this.osc('square', 620 * r, t, 0.33).connect(f);
  }
  bass(t, n, len, v, dark) {
    const c = this.c, g = c.createGain(), sub = c.createGain(); this.hold(g, t, 0.006, (dark ? 0.5 : 0.7) * v, len, 0.05); sub.gain.value = 0.35;
    this.osc('sawtooth', hz(n), t, len).connect(g); this.osc('sawtooth', hz(n + 12), t, len, 5).connect(g); this.osc('square', hz(n - 12), t, len).connect(sub); sub.connect(g); g.connect(this.bIn);
  }
  chug(t, n, len, v, mute) {
    const g = this.c.createGain(), dur = mute ? Math.min(len, 0.1) : len;
    if (mute) this.ad(g, t, 0.003, 0.5 * v, dur); else this.hold(g, t, 0.004, 0.42 * v, dur, 0.07);
    for (const [semi, det] of [[0, -6], [7, 5], [12, 0]]) this.osc('sawtooth', hz(n + semi), t, dur, det).connect(g);
    g.connect(this.gIn);
  }
  pad(t, notes, len, v) {
    const g = this.c.createGain(), f = this.flt('lowpass', 500, 0.7); f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(3200, t + 0.06); f.frequency.exponentialRampToValueAtTime(900, t + len);
    this.ad(g, t, 0.02, 0.17 * v, len + 0.12);
    for (const n of notes) { this.osc('sawtooth', hz(n), t, len + 0.12, -9).connect(f); this.osc('sawtooth', hz(n), t, len + 0.12, 9).connect(f); }
    f.connect(g); g.connect(this.out); g.connect(this.rev);
  }
  pluck(t, n, v) { const g = this.c.createGain(); this.ad(g, t, 0.003, 0.26 * v, 0.15); this.osc('sawtooth', hz(n), t, 0.16).connect(g); g.connect(this.plB); }
  lead(t, n, len, v) {
    const c = this.c, g = c.createGain(), a = this.osc('square', hz(n), t, len), b = this.osc('sawtooth', hz(n), t, len, 8);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(10, t + Math.min(len, 0.3)); lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune); lfo.start(t); lfo.stop(t + len + 0.03);
    this.hold(g, t, 0.015, 0.2 * v, len, 0.08); a.connect(g); b.connect(g); g.connect(this.ldB);
  }
  // Schedules one bar of a song, starting at time t0. Returns the length of the bar in seconds.
  bar(song, secKey, bi, t0, lvl) {
    const S = song.sec[secKey], sd = 60 / song.bpm / 4, at = i => t0 + i * sd, P = p => p == null ? null : Array.isArray(p) ? p[bi % p.length] : p;
    const cd = S.ch[bi % S.ch.length], root = song.root, soft = lvl === 0 ? 0.7 : 1;
    this.dl.delayTime.setValueAtTime(sd * 3, t0);
    const k = P(S.k), s = P(S.s), h = P(S.h), hh = P(S.hh), st = P(S.st), rim = P(S.rim), ck = P(S.ck), g = P(S.g), b = P(S.b), a = P(S.a), pad = P(S.pad);
    for (let i = 0; i < 16; i++) {
      const t = at(i);
      if (k && k[i] !== '.' && (lvl > 0 || k[i] === 'X')) this.kick(t, (k[i] === 'X' ? 1 : 0.75) * soft);
      if (s && s[i] !== '.' && lvl > 0) this.snare(t, s === 'x.x.x.xxxxxxxxxx' ? 0.35 + i * 0.045 : s[i + 1] === 'x' || s[i - 1] === 'x' ? 0.6 : 1);
      if (rim && rim[i] !== '.' && lvl === 0) this.rim(t, i % 4 === 0 ? 1 : 0.55);
      if (h && h[i] !== '.') this.hat(t, soft * (i % 4 === 0 ? 1 : 0.7), h[i] === 'o');
      if (hh && hh[i] !== '.' && lvl > 1) this.hat(t, 0.45, false);
      if (st && st[i] !== '.') this.stomp(t, lvl > 1 ? 0.5 : 0.8);
      if (ck && ck[i] !== '.' && lvl > 0) this.clank(t, 1);
      const until = (p, i0) => { let j = i0 + 1; while (j < 16 && p[j] === '.') j++; return j - i0; };
      if (b && b[i] !== '.') { const L = b[i] === 'L'; this.bass(t, deg(root - 12, cd + (L ? 0 : +b[i])), (L ? until(b, i) : Math.min(until(b, i), 2) * 0.9) * sd, soft, lvl === 0); }
      if (g && g[i] !== '.' && lvl > 0) { const S2 = g[i] === 'S'; this.chug(t, deg(root, cd + (S2 ? 0 : +g[i])), (S2 ? until(g, i) : 1) * sd, lvl > 1 ? 1 : 0.8, !S2); }
      if (a && a[i] !== '.' && (lvl > 0 || song.arp0)) this.pluck(t, deg(root + 12, cd + +a[i]), lvl === 0 ? 0.6 : 1);
      if (pad && pad[i] !== '.') this.pad(t, [0, 2, 4].map(x => deg(root + 12, cd + x)), (pad[i] === 'L' ? Math.min(until(pad, i), 10) : 2) * sd, lvl === 0 ? 1.3 : 1);
    }
    if (S.l && lvl > 1) for (const [i, d, len] of S.l[bi % S.l.length]) this.lead(at(i), deg(root + 24, d), len * sd * 0.95, 1);
    if (S.l && lvl === 0) for (const [i, d] of S.l[bi % S.l.length]) this.pluck(at(i), deg(root + 12, d), 0.9);   // while planning, the melody is only hinted at
    return 16 * sd;
  }
}

export const music = {
  band: null, bus: null, on: false, level: 0, si: cfg.track === 'auto' ? (Math.random() * SONGS.length) | 0 : +cfg.track % SONGS.length, sec: 0, bi: 0, next: 0, timer: 0, ducked: false,
  attach(c, bus) { this.c = c; this.bus = bus; this.band = new Band(c, bus); if (cfg.music) this.start(); },
  vol() { return cfg.musicVol * 0.36 * (this.ducked ? 0.45 : 1) * (this.level === 0 ? 1.6 : 1); },
  apply(tc = 0.25) { if (this.bus) this.bus.gain.setTargetAtTime(this.on ? this.vol() : 0, this.c.currentTime, tc); },
  start() { if (!this.c || this.on) return; this.on = true; this.next = this.c.currentTime + 0.15; this.apply(0.6); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 90); this.tick(); },
  stop() { this.on = false; clearInterval(this.timer); this.apply(0.15); },
  setLevel(l) { this.level = l; this.apply(0.8); },
  duck(d) { this.ducked = d; this.apply(d ? 0.05 : 0.35); },
  skip() { this.pick((this.si + 1) % SONGS.length); },
  pick(i) { this.si = i % SONGS.length; this.sec = 0; this.bi = 0; },
  get title() { return SONGS[this.si].name; },
  tick() {
    if (!this.on || !this.c) return;
    if (this.next < this.c.currentTime - 0.3) this.next = this.c.currentTime + 0.1;   // the tab was asleep: start again from now
    while (this.next < this.c.currentTime + 0.6) {
      const song = SONGS[this.si];
      this.next += this.band.bar(song, song.form[this.sec], this.bi, this.next, this.level);
      if (++this.bi >= 4) { this.bi = 0; if (++this.sec >= song.form.length) { this.sec = 0; if (cfg.track === 'auto') this.si = (this.si + 1) % SONGS.length; } }
    }
  },
};
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!music.c) return; if (document.hidden) { if (music.on) { music.stop(); music.paused = true; } } else if (music.paused) { music.paused = false; if (cfg.music) music.start(); } });
// settings changed while playing
onCfg((k, v) => {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (k === 'sfxVol') master.gain.setTargetAtTime(SFX_GAIN * v, t, 0.03);
  else if (k === 'voiceVol') voiceBus.gain.setTargetAtTime(VOICE_GAIN * v, t, 0.03);
  else if (k === 'voice' && !v && cur) { const old = cur; cur = null; queue.length = 0; old.src.onended = null; old.g.gain.setTargetAtTime(0, t, 0.012); old.src.stop(t + 0.07); music.duck(false); }
  else if (k === 'music') { if (v) music.start(); else music.stop(); }
  else if (k === 'musicVol') music.apply(0.05);
  else if (k === 'track' && v !== 'auto') music.pick(+v);
});
