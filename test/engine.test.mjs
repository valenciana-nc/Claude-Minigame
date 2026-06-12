// Headless engine tests. Run: npm test
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { FLYERS } from '../src/sprites.js';

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

test('restart clears pause state', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.input('pause');
  assert.equal(g.paused, true);
  g.input('restart');
  const dist = g.dist;
  g.tick(1 / 30);
  assert.equal(g.mode, 'run');
  assert.equal(g.paused, false);
  assert.ok(g.dist > dist, 'restarted run should advance immediately');
});

test('fast-fall: ducking in the air slams the crab down quicker', () => {
  const a = new Engine({ width: 78, height: 18, seed: 8 });
  const b = new Engine({ width: 78, height: 18, seed: 8 });
  for (const g of [a, b]) { g.input('jump'); g.input('jump'); } // start, then jump
  for (let i = 0; i < 6; i++) { a.tick(1 / 40); b.tick(1 / 40); } // rise together
  for (let i = 0; i < 10; i++) { a.input('duck'); a.tick(1 / 40); b.tick(1 / 40); }
  assert.ok(b.y > 0, 'control crab should still be airborne');
  assert.ok(a.y < b.y, `fast-falling crab should be lower (${a.y.toFixed(2)} < ${b.y.toFixed(2)})`);
});

test('jump buffer: a press just before landing fires a hop on touchdown', () => {
  const g = new Engine({ width: 78, height: 18, seed: 8 });
  g.input('jump'); g.input('jump');
  while (g.y > 0.3) g.tick(1 / 60);     // fall almost to the ground
  g.input('jump');                       // buffered (still airborne)
  for (let i = 0; i < 4; i++) g.tick(1 / 60);
  assert.ok(g.y > 0.2, 'buffered jump should re-launch right after landing');
});

test('a low flyer must be jumped — ducking does not save you', () => {
  const duck = new Engine({ width: 78, height: 18, seed: 9 });
  duck.input('jump'); duck.spawnIn = 1e9;
  duck.obstacles.push({ kind: 'flyer', x: 18, fly: 0, f: FLYERS[0], w: 3, h: 1 });
  for (let i = 0; i < 120 && duck.mode !== 'dead'; i++) { duck.input('duck'); duck.tick(1 / 40); }
  assert.equal(duck.mode, 'dead', 'ducking a ground-level flyer should fail');

  const jump = new Engine({ width: 78, height: 18, seed: 9 });
  jump.input('jump'); jump.spawnIn = 1e9;
  jump.obstacles.push({ kind: 'flyer', x: 26, fly: 0, f: FLYERS[0], w: 3, h: 1 });
  let hopped = false;
  for (let i = 0; i < 200; i++) {
    const ob = jump.obstacles[0];
    if (!hopped && ob && (ob.x - 9) / jump.speed < 0.4) { jump.input('jump'); hopped = true; }
    jump.tick(1 / 40);
  }
  assert.equal(jump.mode, 'run', 'jumping the low flyer should clear it');
});

test('spawn gaps stay reachable: a competent bot clears well into the hard zone', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const e = new Engine({ width: 78, height: 18, seed });
    e.input('jump');
    for (let i = 0; i < 6000 && e.mode !== 'dead'; i++) {
      const f = e.obstacles.filter((o) => o.x + o.w > 8).sort((p, q) => p.x - q.x)[0];
      if (f && e.mode === 'run') {
        const flying = f.kind !== 'cactus';
        const lead = (f.x - 10) / (e.speed * (f.speedMul || 1)); // anticipate fast flyers

        if ((!flying || f.fly === 0) && e.y === 0 && lead < 0.4 && lead > -0.02) e.input('jump');
        if (flying && f.fly === 2 && e.y === 0 && lead < 0.28) e.input('duck');
      }
      e.tick(1 / 40);
    }
    assert.ok(e.score >= 200, `seed ${seed} only reached ${e.score} — gaps may be unfair`);
  }
});

test('the orange Clawd runner renders at width W in every state', () => {
  const c = new Engine({ width: 78, height: 18, seed: 2 });
  c.input('jump');
  for (let i = 0; i < 200; i++) {
    if (i === 30) c.input('jump');   // sample an airborne frame
    if (i === 90) c.input('duck');   // sample a duck frame
    c.tick(1 / 40);
    for (const line of c.render({ color: false }).split('\n')) {
      assert.equal(line.length, c.W, 'every line must render at exactly W');
    }
  }
});

console.log(`\n${passed} tests passed 🦀`);
