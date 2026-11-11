// Plays whole AI-only matches headless and prints what happened. Run: npm test
import { newGame, addBot, startGame, resolveRound, buildSnapshot, powerState } from '../public/shared/engine.js';
import { createSim } from '../public/shared/sim.js';

const bots = +process.argv[2] || 4, rounds = +process.argv[3] || 25, seed = +process.argv[4] || 12345;
const g = newGame({ name: 'Selvtest', seed, roundHours: 0 });
for (let i = 0; i < bots; i++) addBot(g);
g.players[0].kind = 'human';   // keeps the match going until a real winner is found
g.players[0].kind = 'ai';
startGame(g, 0);
console.log('kort', g.map.n + 'x' + g.map.n, 'start', g.map.starts.map(s => s.x + ',' + s.y).join(' '));

// determinism: the same snapshot must give the same result twice
const s0 = buildSnapshot(g), r1 = JSON.stringify(createSim(s0).run()), r2 = JSON.stringify(createSim(JSON.parse(JSON.stringify(s0))).run());
console.log('deterministisk:', r1 === r2 ? 'ja' : 'NEJ');

for (let r = 1; r <= rounds && g.phase === 'play'; r++) {
  const t0 = Date.now();
  // keep the match alive although nobody is human
  const alive = g.players.filter(p => p.alive);
  alive[0].kind = 'human'; alive[0].wasBot = true;
  const fake = alive[0];
  // let the fake human still act as AI
  const { aiTurn } = await import('../public/shared/ai.js');
  const { mulberry32 } = await import('../public/shared/util.js');
  aiTurn(g, fake, mulberry32(r * 7919));
  resolveRound(g, 0);
  fake.kind = 'ai';
  if (g.phase === 'over' && g.players.filter(p => p.alive).length > 1) { g.phase = 'play'; g.winner = null; }
  const ms = Date.now() - t0;
  console.log(`R${r} (${ms} ms)` + (g.last.out.length ? '  UDE: ' + g.last.out.join(', ') : ''));
  for (const p of g.players) {
    if (!p.alive) continue;
    const ps = powerState(p), rep = p.report || {};
    console.log(`  ${p.name.padEnd(15)} ${p.faction} $${String(p.money).padStart(6)} +${String(rep.income || 0).padStart(5)}  byg ${String(p.buildings.length).padStart(2)}  strøm ${ps.use}/${ps.prod}  hær ${JSON.stringify(p.army)}  tab ${JSON.stringify(rep.lost || {})} bLost ${rep.bLost || 0} kills ${rep.killed || 0}`);
  }
}
console.log('fase:', g.phase, 'vinder:', JSON.stringify(g.winner), 'JSON-størrelse:', JSON.stringify(g).length);
