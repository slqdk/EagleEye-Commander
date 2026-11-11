// EagleEye Commander — server. No dependencies: plain Node (20+), games stored as JSON files.
//   PORT=8080 DATA_DIR=/var/lib/eagleeye-commander node server/server.js
//   HOST=127.0.0.1 limits it to one network interface (default: all).
//   TRUSTED_PROXY=203.0.113.7 names a reverse proxy that is not on the server's own network (see clientIp below).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { newGame, addPlayer, addBot, act, maybeResolve, view, replayOf, upgrade, GameError } from '../public/shared/engine.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');
const DATA = process.env.DATA_DIR || process.env.JF_DATA || path.join(ROOT, '..', 'data');   // JF_DATA: the name before 2.3.2
const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || undefined;
fs.mkdirSync(DATA, { recursive: true });
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8')).version;

const keyFile = path.join(DATA, 'secret.key');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(keyFile, 'utf8').trim();

// ---------- storage ----------
// Every match is one JSON file. `index` holds a few facts about each of them (for the front page and the deadlines);
// `games` holds the matches that are in use right now. A match nobody has touched for a while is dropped from memory
// and read again when somebody comes back.
const games = new Map(), usedAt = new Map(), index = new Map();
const fileOf = code => path.join(DATA, code + '.json');
const validCode = c => /^[A-Z0-9]{6}$/.test(c);
const now = () => Math.floor(Date.now() / 1000);
const meta = g => ({ code: g.code, name: g.name, phase: g.phase, round: g.round, created: g.created || 0, deadline: g.deadline || 0, host: g.host,
  opts: { map: g.opts.map, money: g.opts.money, diplo: g.opts.diplo, open: g.opts.open, roundHours: g.opts.roundHours },
  players: g.players.map(p => ({ id: p.id, name: p.name, kind: p.kind, alive: p.alive, ready: p.ready })), winner: g.winner ? g.winner.names : null });
function read(code) { const g = upgrade(JSON.parse(fs.readFileSync(fileOf(code), 'utf8'))); g.code = code; g.savedRev = g.rev; return g; }
function load(code) {
  code = String(code || '').toUpperCase().trim();
  if (!validCode(code)) return null;
  usedAt.set(code, Date.now());
  if (games.has(code)) return games.get(code);
  try { const g = read(code); games.set(code, g); return g; } catch { return null; }
}
function save(g) {
  const tmp = fileOf(g.code) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(g)); fs.renameSync(tmp, fileOf(g.code));
  g.savedRev = g.rev; index.set(g.code, meta(g)); usedAt.set(g.code, Date.now());
}
function touch(g) { maybeResolve(g, now()); if (g.savedRev !== g.rev) save(g); }
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (const b of crypto.randomBytes(6)) c += A[b % A.length]; if (!fs.existsSync(fileOf(c))) return c; }
}
for (const f of fs.readdirSync(DATA)) {
  if (!f.endsWith('.json') || !validCode(f.slice(0, -5))) continue;
  try { index.set(f.slice(0, -5), meta(read(f.slice(0, -5)))); } catch (e) { console.error('Kan ikke læse', f, e.message); }
}

// ---------- login ----------
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 32);
const tokenFor = (g, p) => { const body = g.code + '.' + p.id; return body + '.' + sign(body); };
function fromToken(tok) {
  const m = /^([A-Z0-9]{6})\.(\d+)\.([\w-]+)$/.exec(String(tok || ''));
  if (!m || sign(m[1] + '.' + m[2]) !== m[3]) throw new GameError('Log ind igen.');
  const g = load(m[1]); if (!g) throw new GameError('Kampen findes ikke længere.');
  const p = g.players.find(q => q.id === +m[2]); if (!p) throw new GameError('Log ind igen.');
  return [g, p];
}
function hashPin(pin, salt = crypto.randomBytes(12).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function checkPin(pin) { pin = String(pin || ''); if (pin.length < 4 || pin.length > 40) throw new GameError('PIN-koden skal være mindst 4 tegn.'); return pin; }
const made = new Map();      // new matches per address, so nobody can fill the disk
function mayCreate(ip) {
  const t = now(), m = made.get(ip);
  if (m && t - m.at < 3600 && m.n >= 20) throw new GameError('Du har oprettet mange kampe. Vent en times tid.');
  if (!m || t - m.at >= 3600) made.set(ip, { n: 1, at: t }); else m.n++;
}
const fails = new Map();
function throttle(ip) {
  const t = now(), f = fails.get(ip);
  if (f && f.n >= 8 && t - f.at < 600) throw new GameError('For mange forsøg. Vent ti minutter.');
  if (f && t - f.at >= 600) fails.delete(ip);
}
function failed(ip) { const f = fails.get(ip) || { n: 0, at: now() }; f.n++; fails.set(ip, f); }

// ---------- API ----------
const api = {
  health: (b, ip) => ({ ok: true, v: 2, version: VERSION, node: process.version, you: ip, games: index.size, loaded: games.size }),
  // The front page: the matches this browser has a login for, and the open ones that still wait for generals.
  list(b) {
    const mine = [], t = now();
    (Array.isArray(b.tokens) ? b.tokens.slice(0, 40) : []).forEach((tok, i) => {
      const m = /^([A-Z0-9]{6})\.(\d+)\.([\w-]+)$/.exec(String(tok || ''));
      if (!m || sign(m[1] + '.' + m[2]) !== m[3]) return;
      const g = index.get(m[1]), p = g && g.players.find(q => q.id === +m[2]); if (!p) return;
      const humans = g.players.filter(q => q.kind === 'human' && q.alive);
      mine.push({ i, code: g.code, name: g.name, phase: g.phase, round: g.round, deadline: g.deadline, you: p.name, alive: p.alive, host: g.host === p.id,
        turn: g.phase === 'play' && p.alive && !p.ready, waiting: g.phase === 'play' ? humans.filter(q => !q.ready && q.id !== p.id).map(q => q.name) : [],
        players: g.players.map(q => q.name), winner: g.winner });
    });
    const open = [...index.values()].filter(g => g.phase === 'lobby' && g.opts.open && g.players.length < 6 && t - g.created < 14 * 86400)
      .sort((a, b) => b.created - a.created).slice(0, 30)
      .map(g => ({ code: g.code, name: g.name, created: g.created, host: (g.players.find(q => q.id === g.host) || {}).name || '', players: g.players.map(q => q.name), opts: g.opts }));
    return { mine, open, now: t };
  },
  create(b, ip) {
    const pin = checkPin(b.pin); mayCreate(ip);
    const g = newGame({ name: String(b.game || '').trim().slice(0, 24) || 'Operation Ørneøje', seed: crypto.randomBytes(4).readUInt32LE(0), now: now(),
      roundHours: b.roundHours ?? 24, peace: b.peace ?? 2, map: b.map, theme: b.theme, money: b.money, diplo: b.diplo, open: b.open });
    g.code = newCode();
    const p = addPlayer(g, { name: b.name, faction: b.faction, auth: hashPin(pin), now: now() });
    for (let i = 0; i < Math.max(0, Math.min(5, b.bots | 0)); i++) addBot(g);
    games.set(g.code, g); save(g);
    return { token: tokenFor(g, p), view: view(g, p.id, now()) };
  },
  join(b, ip) {
    throttle(ip);
    const g = load(b.code); if (!g) { failed(ip); throw new GameError('Ukendt invitationskode.'); }
    const p = addPlayer(g, { name: b.name, faction: b.faction, auth: hashPin(checkPin(b.pin)), now: now() });
    save(g);
    return { token: tokenFor(g, p), view: view(g, p.id, now()) };
  },
  login(b, ip) {
    throttle(ip);
    const g = load(b.code), name = String(b.name || '').trim().toLowerCase();
    const p = g && g.players.find(q => q.kind === 'human' && q.name.toLowerCase() === name);
    if (!p || !p.auth || hashPin(String(b.pin || ''), p.auth.salt).hash !== p.auth.hash) { failed(ip); throw new GameError('Forkert kode, navn eller PIN.'); }
    touch(g);
    return { token: tokenFor(g, p), view: view(g, p.id, now()) };
  },
  state(b) {
    const [g, p] = fromToken(b.token); touch(g);
    return b.rev === g.rev ? { same: true, now: now() } : { view: view(g, p.id, now()) };
  },
  act(b) {
    const [g, p] = fromToken(b.token); touch(g);
    act(g, p.id, b.act || {}, now()); touch(g);
    return { view: view(g, p.id, now()) };
  },
  replay(b) { const [g] = fromToken(b.token); return { snap: replayOf(g) }; },
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };

// Static files are revalidated on every load (ETag), so an update reaches everyone at once, and text is sent gzipped.
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
const packed = new Map();   // file -> { tag, raw, gz }
// The path of a request, without the query. (Not `new URL`: it throws on a path such as "//", and that stopped the server.)
const pathOf = req => { const u = String(req.url || '/'), q = u.indexOf('?'); return q < 0 ? u : u.slice(0, q); };
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(pathOf(req)); } catch { res.writeHead(400).end(); return; }
  if (p.includes('\0')) { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    const ext = path.extname(file), tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.mp3' ? 'public, max-age=2592000' : 'no-cache', ETag: tag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, head).end(); return; }
    let c = packed.get(file);
    if (!c || c.tag !== tag) {
      let raw; try { raw = fs.readFileSync(file); } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
      c = { tag, raw, gz: TEXT.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null };
      packed.set(file, c);
    }
    const gz = c.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (gz) head['Content-Encoding'] = 'gzip';
    res.writeHead(200, head).end(req.method === 'HEAD' ? undefined : gz ? c.gz : c.raw);
  });
}

// Who is calling (for the login throttle). A forwarded address is believed only when the caller is a proxy close by:
// on this machine, on one of its own networks, on a private network, or listed in TRUSTED_PROXY (addresses or
// networks, comma separated). Even then only the address that proxy added itself (the last one) counts; the rest of
// the header can be made up by anyone.
let near = null, nearAt = 0;
function nearList() {
  if (near && Date.now() - nearAt < 60000) return near;
  const l = new net.BlockList();
  for (const [a, bits] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['169.254.0.0', 16]]) l.addSubnet(a, bits, 'ipv4');
  l.addAddress('::1', 'ipv6'); l.addSubnet('fc00::', 7, 'ipv6'); l.addSubnet('fe80::', 10, 'ipv6');
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) {
    const bits = +String(i.cidr || '').split('/')[1];
    if (Number.isInteger(bits)) try { l.addSubnet(i.address, bits, net.isIPv6(i.address) ? 'ipv6' : 'ipv4'); } catch {}
  }
  for (const t of String(process.env.TRUSTED_PROXY || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const [a, bits] = t.split('/'), fam = net.isIPv6(a) ? 'ipv6' : 'ipv4';
    try { if (bits === undefined) l.addAddress(a, fam); else l.addSubnet(a, +bits, fam); } catch { console.error('TRUSTED_PROXY: kan ikke læse "' + t + '"'); }
  }
  near = l; nearAt = Date.now();
  return l;
}
function clientIp(req) {
  let peer = req.socket.remoteAddress || '';
  if (peer.startsWith('::ffff:') && net.isIPv4(peer.slice(7))) peer = peer.slice(7);
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!fwd.length || !net.isIP(peer) || !nearList().check(peer, net.isIPv6(peer) ? 'ipv6' : 'ipv4')) return peer;
  return fwd[fwd.length - 1];
}

// No request may stop the server: whatever goes wrong while answering one is logged and answered with an error.
const server = http.createServer((req, res) => {
  try { handle(req, res); } catch (e) { console.error(e); try { res.writeHead(500).end(); } catch {} }
});
function handle(req, res) {
  const m = /\/api\/(\w+)$/.exec(pathOf(req));
  if (!m) return serveStatic(req, res);
  const op = Object.hasOwn(api, m[1]) ? api[m[1]] : null, ip = clientIp(req);
  const send = (code, obj) => {
    const head = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }; let out = JSON.stringify(obj);
    if (out.length > 1400 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) { out = zlib.gzipSync(out, { level: 5 }); head['Content-Encoding'] = 'gzip'; }
    res.writeHead(code, head).end(out);
  };
  if (!op) return send(404, { error: 'Ukendt kald.' });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 300000) req.destroy(); });
  req.on('end', () => {
    let b;
    try { b = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'Ugyldigt kald.' }); }
    if (!b || typeof b !== 'object') return send(400, { error: 'Ugyldigt kald.' });
    try { send(200, op(b, ip)); }
    catch (e) {
      if (e instanceof GameError) send(400, { error: e.message });
      else { console.error(e); send(500, { error: 'Serverfejl.' }); }
    }
  });
}

// Once a minute: deadlines also pass when nobody is looking, and matches nobody uses leave the memory
// (a finished one after ten minutes, any other after six hours; they stay on disk).
setInterval(() => {
  const t = now();
  for (const m of index.values()) {
    if (m.phase !== 'play' || !m.deadline || t < m.deadline) continue;
    const g = load(m.code); if (g) { try { touch(g); } catch (e) { console.error(m.code, e); } }
  }
  for (const [code, g] of games) {
    const idle = Date.now() - (usedAt.get(code) || 0);
    if (idle > (g.phase === 'over' ? 600e3 : 6 * 3600e3)) { games.delete(code); usedAt.delete(code); }
  }
  for (const [ip, f] of fails) if (t - f.at >= 600) fails.delete(ip);
  for (const [ip, m] of made) if (t - m.at >= 3600) made.delete(ip);
}, 60000).unref();

server.listen(PORT, HOST, () => console.log(`EagleEye Commander ${VERSION} lytter på http://${HOST || 'localhost'}:${PORT}  (data: ${DATA})`));
