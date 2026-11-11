// EagleEye Commander — two ways to run a match behind the same interface:
// Remote talks to the Node server; Local runs the very same rules in the browser (skirmish against AI).
import { newGame, addPlayer, addBot, startGame, act, maybeResolve, view, replayOf, GameError } from '../shared/engine.js';

const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
export { LS };

export class Remote {
  constructor(token) { this.token = token; this.kind = 'remote'; }
  static async call(op, body) {
    const r = await fetch('api/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({ error: 'Serveren svarede ikke.' }));
    if (!r.ok || j.error) throw new Error(j.error || 'Serverfejl.');
    return j;
  }
  static async available() { try { const r = await fetch('api/health', { method: 'POST' }); const j = await r.json(); return !!j.ok; } catch { return false; } }
  static async enter(op, body) { const j = await Remote.call(op, body); LS.set('jf2-token', j.token); return [new Remote(j.token), j.view]; }
  async state(rev) { const j = await Remote.call('state', { token: this.token, rev }); return j.same ? null : j.view; }
  async act(a) { return (await Remote.call('act', { token: this.token, act: a })).view; }
  async replay() { return (await Remote.call('replay', { token: this.token })).snap; }
  leave() { LS.del('jf2-token'); }
}

export class Local {
  constructor(game) { this.game = game; this.kind = 'local'; this.pid = game.players.find(p => p.kind === 'human').id; }
  static create({ name, faction, bots, botFactions = [], peace = 2 }) {
    const g = newGame({ name: 'Træfning', seed: (Math.random() * 2 ** 32) >>> 0, roundHours: 0, peace });
    addPlayer(g, { name: name || 'General', faction });
    for (let i = 0; i < bots; i++) addBot(g, botFactions[i]);
    startGame(g, 0);
    const b = new Local(g); b.save(); return b;
  }
  static load() { try { const s = LS.get('jf2-local'); if (!s) return null; const g = JSON.parse(s); return g && g.v === 2 ? new Local(g) : null; } catch { return null; } }
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
