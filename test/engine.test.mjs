// Headless engine tests. Run: npm test
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { FLYERS, CRAB, CLAUDE } from '../src/sprites.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

test('non-finite dimensions fall back to defaults instead of crashing render', () => {
  const g = new Engine({ width: NaN, height: Infinity, seed: 1 });
  assert.equal(g.W, 80);
  assert.equal(g.H, 20);
  g.input('jump');
  for (let i = 0; i < 10; i++) g.tick(1 / 30);
  for (const line of g.render({ color: false }).split('\n')) {
    assert.equal(line.length, 80);
  }
  g.resize(NaN, NaN);
  assert.equal(g.W, 80);
  assert.equal(g.H, 20);
});

test('tick ignores a non-positive or non-finite dt instead of rewinding the sim', () => {
  const g = new Engine({ width: 78, height: 18, seed: 1 });
  g.input('jump');
  g.obstacles.push({ kind: 'flyer', x: 20, fly: 0, f: FLYERS[0], w: FLYERS[0].w, h: 1, speedMul: 1 });
  for (let i = 0; i < 10; i++) g.tick(1 / 30);
  const t = g.t, dist = g.dist;
  for (const bad of [-5, 0, NaN, Infinity]) g.tick(bad);
  assert.equal(g.t, t, 'sim time must not move backwards');
  assert.equal(g.dist, dist, 'distance must not rewind');
  // A negative t used to make the flyer frame index negative and crash render.
  assert.doesNotThrow(() => g.render({ color: false }));
});

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

test('hi-score updates live during the run, not only at death', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7, hi: 0 });
  g.input('jump');
  for (let i = 0; i < 60; i++) g.tick(1 / 30);
  assert.equal(g.mode, 'run');
  assert.ok(g.score > 0, 'run should have scored');
  assert.equal(g.hi, g.score, 'a beaten best must be recorded before death');
  assert.equal(g.newBest, true);
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

test('the claude skin renders at width W and falls back safely', () => {
  const g = new Engine({ width: 78, height: 18, seed: 11, skin: 'claude' });
  assert.equal(g.skin, CLAUDE, 'skin option should select the claude sprite');
  g.input('jump');
  for (let i = 0; i < 200; i++) {
    if (i === 30) g.input('jump');   // sample an airborne frame
    if (i === 90) g.input('duck');   // sample a duck frame
    g.tick(1 / 40);
    for (const line of g.render({ color: false }).split('\n')) {
      assert.equal(line.length, g.W, 'every line must render at exactly W');
    }
  }
  const fallback = new Engine({ width: 78, height: 18, seed: 11, skin: 'banana' });
  assert.equal(fallback.skin, CRAB, 'unknown skin names fall back to the crab');
});

test('color mode emits ANSI escapes, plain mode emits none', () => {
  // The default render path is color; nothing asserted it actually
  // produces escape sequences (or that --plain strips them).
  const g = new Engine({ width: 78, height: 18, seed: 2 });
  g.input('jump');
  for (let i = 0; i < 30; i++) g.tick(1 / 40);
  assert.ok(g.render({ color: true }).includes('\x1b['), 'color render must carry ANSI codes');
  assert.ok(!g.render({ color: false }).includes('\x1b'), 'plain render must be escape-free');
});

test('particle count never exceeds the cap over a long run', () => {
  const g = new Engine({ width: 78, height: 18, seed: 2 });
  g.input('jump');
  let maxSeen = 0, everAny = false;
  for (let i = 0; i < 3000 && g.mode !== 'dead'; i++) {
    if (i % 25 === 0) g.input('jump'); // jump + land + dust churn
    g.tick(1 / 40);
    maxSeen = Math.max(maxSeen, g.particles.length);
    if (g.particles.length > 0) everAny = true;
  }
  assert.ok(everAny, 'the run must actually emit particles (guards a vacuous pass)');
  assert.ok(maxSeen <= 160, `particles peaked at ${maxSeen}, over the 160 cap`);
});

test('night stars survive a resize (star cache rebuilds)', () => {
  // The star field is cached per phase + grid size (Nov 2 perf change);
  // a resize must rebuild it, not serve a stale field for the old size.
  const g = new Engine({ width: 78, height: 18, seed: 6 });
  g.input('jump');
  g.dist = 2500; // forced night
  g.tick(1 / 30);
  assert.ok(g.render({ color: false }).includes('·'), 'expected stars at night');
  g.resize(100, 20);
  g.tick(1 / 30);
  assert.ok(g.night, 'still night after the resize');
  assert.ok(g.render({ color: false }).includes('·'), 'stars must survive a resize');
});

test('death cooldown: jumping too soon after death does nothing', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7, hi: 0 });
  g.input('jump');
  g.obstacles.push({ kind: 'cactus', x: 8, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  for (let i = 0; i < 60 && g.mode !== 'dead'; i++) g.tick(1 / 30);
  assert.equal(g.mode, 'dead');
  g.input('jump'); // inside the 0.5 s cooldown — must not restart
  assert.equal(g.mode, 'dead', 'a jump during the death cooldown must be ignored');
  g.tick(0.6);
  g.input('jump');
  assert.equal(g.mode, 'run', 'the same jump after the cooldown restarts');
});

test('pause blocks jumping and freezes the run', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.input('pause');
  assert.equal(g.paused, true);
  g.input('jump'); // paused — must not launch
  assert.equal(g.y, 0, 'a paused crab must stay on the ground');
  const dist = g.dist;
  g.tick(1 / 30);
  assert.equal(g.dist, dist, 'a paused run must not advance');
  g.input('pause'); // unpause
  g.tick(1 / 30);
  assert.ok(g.dist > dist, 'unpausing must resume the run');
});

test('pause freezes the clock and the rendered frame', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.input('jump'); // dust particles in the air
  for (let i = 0; i < 30; i++) g.tick(1 / 30);
  // A flyer on screen guarantees the frame would animate if the clock ran:
  // its wing frame is Math.floor(t * 11) % frames.length.
  g.obstacles.push({ kind: 'flyer', x: 20, fly: 0, f: FLYERS[0], w: FLYERS[0].w, h: 1, speedMul: 1 });
  g.input('pause');
  const t = g.t;
  const frame = g.render({ color: false });
  for (let i = 0; i < 30; i++) {
    g.tick(1 / 30);
    assert.equal(g.render({ color: false }), frame, 'a paused frame must not change');
  }
  assert.equal(g.t, t, 'sim time must not advance while paused');
  g.input('pause'); // unpause
  for (let i = 0; i < 10; i++) g.tick(1 / 30);
  assert.ok(g.t > t, 'unpausing must resume the clock');
  assert.notEqual(g.render({ color: false }), frame, 'unpausing must animate again (guards a vacuous pass)');
});

test('a large dt cannot tunnel an obstacle past the crab', () => {
  // One tick(1) used to move a cactus from x=20 to x=3 in a single step,
  // jumping clean over the crab's collision window without ever colliding.
  const g = new Engine({ width: 78, height: 18, seed: 3 });
  g.input('jump');
  g.spawnIn = 1e9;
  g.obstacles.push({ kind: 'cactus', x: 20, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  g.tick(1);
  assert.equal(g.mode, 'dead', 'the cactus must cross the crab, not teleport past it');
});

test('a large dt still launches a jump instead of collapsing the arc', () => {
  // One tick(0.5) used to collapse the whole jump into a single Euler
  // step: vy went negative at once and y never left 0.
  const g = new Engine({ width: 78, height: 18, seed: 2 });
  g.input('jump');
  g.input('jump');
  g.tick(0.5);
  assert.ok(g.y > 0, 'a jump must leave the ground even on a big step');
  for (let i = 0; i < 120; i++) g.tick(1 / 30);
  assert.equal(g.y, 0, 'the crab must still land (guards a vacuous pass)');
});

test('an absurd dt is capped instead of wedging the sim', () => {
  const g = new Engine({ width: 78, height: 18, seed: 2 });
  g.input('jump');
  g.tick(3600); // must return promptly — total dt caps at 1 s
  assert.ok(g.t <= 1, 'sim time must not advance by the full absurd step');
  assert.doesNotThrow(() => g.render({ color: false }));
});

test('duck and pause are no-ops on the title screen', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  assert.equal(g.mode, 'title');
  g.input('duck');
  g.input('pause');
  assert.equal(g.mode, 'title', 'title screen must not react to duck/pause');
  assert.equal(g.paused, false);
  assert.equal(g.duckT, 0);
});

test('same seed renders byte-identical frames across a full run', () => {
  // Locks the determinism the snapshot workflow relies on (manual md5
  // checks): same seed + same inputs must produce the same frames, so a
  // refactor that changes the sim shows up here instead of in a diff.
  function play(seed) {
    const g = new Engine({ width: 78, height: 18, seed });
    g.input('jump');
    const frames = [];
    for (let i = 0; i < 600 && g.mode !== 'dead'; i++) {
      const f = g.obstacles.filter((o) => o.x + o.w > 8).sort((p, q) => p.x - q.x)[0];
      if (f && g.mode === 'run') {
        const flying = f.kind !== 'cactus';
        const lead = (f.x - 10) / (g.speed * (f.speedMul || 1));
        if ((!flying || f.fly === 0) && g.y === 0 && lead < 0.4 && lead > -0.02) g.input('jump');
        if (flying && f.fly === 2 && g.y === 0 && lead < 0.28) g.input('duck');
      }
      g.tick(1 / 40);
      if (i % 50 === 0) frames.push(g.render({ color: false }));
    }
    return frames.join('\n===\n');
  }
  const a = play(42), b = play(42);
  assert.equal(a, b, 'same seed must render identically');
  assert.notEqual(a, play(43), 'different seeds must diverge (guards a vacuous pass)');
});

test('render fast path and shake path agree when the shake offset is zero', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  for (let i = 0; i < 120; i++) g.tick(1 / 30); // mid-run scene, obstacles + dust
  const plain = g.render({ color: false });
  const colored = g.render();
  // A dying shake so small its offset rounds to zero still takes the
  // general (shifted) loop; the output must be identical to the fast path.
  g.shakeT = 0.01;
  assert.equal(g.render({ color: false }), plain);
  assert.equal(g.render(), colored);
  // And a real shake still shifts the frame instead of crashing or
  // changing its dimensions: H lines, each W chars when plain.
  g.shakeT = 0.4;
  g.t = Math.PI / 126; // sin(t*63) = 1, so ox = 2, oy = 0
  const shaken = g.render({ color: false }).split('\n');
  assert.equal(shaken.length, 18);
  for (const line of shaken) assert.equal(line.length, 78);
  assert.notEqual(shaken.join('\n'), plain, 'a real shake must visibly shift the frame');
});

console.log(`\n${passed} tests passed 🦀`);
