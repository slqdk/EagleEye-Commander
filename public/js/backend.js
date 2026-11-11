// EagleEye Commander — two ways to run a match behind the same interface:
// Remote talks to the Node server; Local runs the very same rules in the browser (skirmish against AI).
import { newGame, addPlayer, addBot, startGame, act, maybeResolve, view, replayOf, upgrade, GameError } from '../shared/engine.js';

const store = s => ({
  get: k => { try { return s().getItem(k); } catch { return null; } },
  set: (k, v) => { try { s().setItem(k, v); } catch {} },
  del: k => { try { s().removeItem(k); } catch {} },
});
const LS = store(() => localStorage), SS = store(() => sessionStorage);
export { LS };

// The browser keeps a login for every match it has taken part in: [{ t: token, code, game, name }], newest first.
export const Tokens = {
  all() {
    let l = []; try { l = JSON.parse(LS.get('jf2-tokens') || '[]'); } catch {}
    if (!Array.isArray(l)) l = [];
    const old = LS.get('jf2-token');      // the single login kept by versions before 2.4
    if (old) { if (!l.some(e => e.t === old)) l.unshift({ t: old, code: old.split('.')[0] }); LS.del('jf2-token'); Tokens.save(l); }
    return l.filter(e => e && typeof e.t === 'string');
  },
  save(l) { LS.set('jf2-tokens', JSON.stringify(l.slice(0, 40))); },
  add(t, game, name) { const [code, id] = t.split('.'); Tokens.save([{ t, code, game, name }, ...Tokens.all().filter(e => !(e.code === code && e.t.split('.')[1] === id))]); },
  drop(t) { Tokens.save(Tokens.all().filter(e => e.t !== t)); },
};

export class Remote {
  constructor(token) { this.token = token; this.kind = 'remote'; SS.set('jf2-cur', token); }
  static async call(op, body) {
    const r = await fetch('api/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({ error: 'Serveren svarede ikke.' }));
    if (!r.ok || j.error) throw new Error(j.error || 'Serverfejl.');
    return j;
  }
  static async available() { try { const r = await fetch('api/health', { method: 'POST' }); const j = await r.json(); return !!j.ok; } catch { return false; } }
  static async enter(op, body) { const j = await Remote.call(op, body); Tokens.add(j.token, j.view.name, j.view.me.name); return [new Remote(j.token), j.view]; }
  static current() { return SS.get('jf2-cur'); }      // the match that was open in this tab before a reload
  // The front page: my matches (with the login that opens each) and the open ones. Logins the server no longer knows are forgotten.
  static async list() {
    const l = Tokens.all(), j = await Remote.call('list', { tokens: l.map(e => e.t) });
    const live = new Set(j.mine.map(m => m.i));
    if (live.size < l.length) Tokens.save(l.filter((e, i) => live.has(i)));
    return { open: j.open, now: j.now, mine: j.mine.map(m => ({ ...m, token: l[m.i].t })) };
  }
  async state(rev) { const j = await Remote.call('state', { token: this.token, rev }); return j.same ? null : j.view; }
  async act(a) { return (await Remote.call('act', { token: this.token, act: a })).view; }
  async replay() { return (await Remote.call('replay', { token: this.token })).snap; }
  leave() { SS.del('jf2-cur'); }
}

export class Local {
  constructor(game) { this.game = game; this.kind = 'local'; this.pid = game.players.find(p => p.kind === 'human').id; }
  static create({ name, faction, bots, botFactions = [], peace = 2, map, size, theme, money }) {
    const g = newGame({ name: 'Træfning', seed: (Math.random() * 2 ** 32) >>> 0, roundHours: 0, peace, map, size, theme, money, diplo: 'fixed', open: false });
    addPlayer(g, { name: name || 'General', faction });
    for (let i = 0; i < bots; i++) addBot(g, botFactions[i]);
    startGame(g, 0);
    const b = new Local(g); b.save(); return b;
  }
  static load() { try { const s = LS.get('jf2-local'); if (!s) return null; const g = JSON.parse(s); return g && g.v === 2 ? new Local(upgrade(g)) : null; } catch { return null; } }
  save() { LS.set('jf2-local', JSON.stringify(this.game)); }
  now() { return Math.floor(Date.now() / 1000); }
  async state(rev) { return rev === this.game.rev ? null : view(this.game, this.pid, this.now()); }
  async act(a) {
    try { act(this.game, this.pid, a, this.now()); maybeResolve(this.game, this.now()); }
    catch (e) { if (e instanceof GameError) throw new Error(e.message); throw e; }
    this.save(); return view(this.game, this.pid, this.now());
  }
  async replay() { return replayOf(this.game); }
  leave() {}
  static clear() { LS.del('jf2-local'); }
}
