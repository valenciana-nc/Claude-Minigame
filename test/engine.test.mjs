// Headless engine tests. Run: npm test
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

test('every rendered line is exactly W chars (plain mode)', () => {
  const g = new Engine({ width: 78, height: 18, seed: 1 });
  g.input('jump');
  for (let i = 0; i < 400; i++) {
    g.tick(1 / 30);
    if (i % 50 === 0) {
      for (const line of g.render({ color: false }).split('\n')) {
        assert.equal(line.length, g.W, `line width ${line.length} != ${g.W}`);
      }
    }
  }
});

test('jump lifts the crab and gravity brings it back', () => {
  const g = new Engine({ width: 78, height: 18, seed: 2 });
  g.input('jump'); // start
  g.input('jump'); // actual jump
  g.tick(0.2);
  assert.ok(g.y > 1, 'crab should be airborne');
  for (let i = 0; i < 60; i++) g.tick(1 / 30);
  assert.equal(g.y, 0, 'crab should land');
});

test('running into a cactus kills the crab', () => {
  const g = new Engine({ width: 78, height: 18, seed: 3 });
  g.input('jump');
  g.obstacles.push({ kind: 'cactus', x: 20, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  for (let i = 0; i < 200 && g.mode !== 'dead'; i++) g.tick(1 / 30);
  assert.equal(g.mode, 'dead');
});

test('jumping over a cactus survives', () => {
  const g = new Engine({ width: 78, height: 18, seed: 4 });
  g.input('jump');
  g.spawnIn = 1e9; // no random spawns
  g.obstacles.push({ kind: 'cactus', x: 24, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  let jumped = false;
  for (let i = 0; i < 300; i++) {
    const ob = g.obstacles[0];
    if (!jumped && ob && (ob.x - 8) / g.speed < 0.45) { g.input('jump'); jumped = true; }
    g.tick(1 / 30);
  }
  assert.equal(g.mode, 'run', 'crab should have cleared the cactus');
});

test('ducking under a high bug survives, standing dies', () => {
  const duck = new Engine({ width: 78, height: 18, seed: 5 });
  duck.input('jump');
  duck.spawnIn = 1e9;
  duck.obstacles.push({ kind: 'bug', x: 18, fly: 2, w: 3, h: 1 });
  for (let i = 0; i < 120; i++) { duck.input('duck'); duck.tick(1 / 30); }
  assert.equal(duck.mode, 'run', 'ducking crab should survive a fly-height-2 bug');

  const stand = new Engine({ width: 78, height: 18, seed: 5 });
  stand.input('jump');
  stand.spawnIn = 1e9;
  stand.obstacles.push({ kind: 'bug', x: 18, fly: 2, w: 3, h: 1 });
  for (let i = 0; i < 120 && stand.mode !== 'dead'; i++) stand.tick(1 / 30);
  assert.equal(stand.mode, 'dead', 'standing crab should eat the bug');
});

test('night mode renders stars without exploding', () => {
  const g = new Engine({ width: 78, height: 18, seed: 6 });
  g.input('jump');
  g.dist = 2500; // forced night
  g.tick(1 / 30);
  assert.ok(g.night);
  const out = g.render({ color: false });
  assert.ok(out.includes('·'), 'expected stars at night');
});

test('restart resets the run and keeps hi-score', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7, hi: 0 });
  g.input('jump');
  g.dist = 600;
  g.obstacles.push({ kind: 'cactus', x: 8, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  for (let i = 0; i < 60 && g.mode !== 'dead'; i++) g.tick(1 / 30);
  assert.equal(g.mode, 'dead');
  const hi = g.hi;
  assert.ok(hi >= 120, 'hi should record the run');
  g.tick(0.6);
  g.input('jump'); // restart after cooldown
  assert.equal(g.mode, 'run');
  assert.equal(g.score, 0);
  assert.equal(g.hi, hi);
});

console.log(`\n${passed} tests passed 🦀`);
