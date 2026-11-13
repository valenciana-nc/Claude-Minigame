// Headless renderer tests for src/render.js (via Engine.render).
// The Renderer was only covered indirectly through engine behaviour —
// nothing locked its screens, its no-mutation promise, or its caches.
// Run: npm test
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

function killCrab(g) {
  g.obstacles.push({ kind: 'cactus', x: 8, c: { w: 2, h: 2, rows: ['▟▖', '▐▌'], color: 'G' }, w: 2, h: 2 });
  for (let i = 0; i < 60 && g.mode !== 'dead'; i++) g.tick(1 / 30);
  assert.equal(g.mode, 'dead');
}

test('render never mutates the engine it reads', () => {
  // The renderer header promises it only reads engine state; a future
  // _put or cache change that wrote back (e.g. normalizing dist) would
  // silently corrupt the sim, so snapshot everything but the Renderer.
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.dist = 2500; // night, so the star cache also runs
  for (let i = 0; i < 40; i++) g.tick(1 / 30);
  const snap = (e) => JSON.stringify(e, (k, v) => (k === 'renderer' ? undefined : v));
  const before = snap(g);
  g.render({ color: true });
  g.render({ color: false });
  assert.equal(snap(g), before, 'rendering must leave every engine field untouched');
});

test('the title screen shows the controls and the start prompt', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  assert.equal(g.mode, 'title');
  const frame = g.render({ color: false });
  assert.ok(frame.includes('press SPACE to scuttle'), 'title must tell the player how to start');
  assert.ok(frame.includes('SPACE jump'), 'title must show the controls line');
  assert.ok(frame.includes('CLAWD RUNNER'), 'title must name the game');
});

test('the game-over screen celebrates a new best and reports an old one', () => {
  const best = new Engine({ width: 78, height: 18, seed: 7, hi: 0 });
  best.input('jump');
  best.dist = 600;
  killCrab(best);
  assert.equal(best.newBest, true);
  const bestFrame = best.render({ color: false });
  assert.ok(bestFrame.includes('G A M E   O V E R'), 'dead screen must say game over');
  assert.ok(bestFrame.includes('NEW BEST!'), 'a beaten best must be celebrated');

  const old = new Engine({ width: 78, height: 18, seed: 7, hi: 9999 });
  old.input('jump');
  killCrab(old);
  assert.equal(old.newBest, false);
  const oldFrame = old.render({ color: false });
  assert.ok(oldFrame.includes('best 9999'), 'an unbeaten best must be reported');
  assert.ok(!oldFrame.includes('NEW BEST!'), 'no celebration without a beaten best');
});

test('the paused screen says PAUSED', () => {
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.input('pause');
  assert.ok(g.render({ color: false }).includes('P A U S E D'), 'paused screen must say so');
});

test('the 100-point milestone popup appears in the frame', () => {
  // Crossing score 100 sets the popup + score flash; nothing asserted the
  // message ever reached a rendered frame (a render-side filter or a
  // wrong row could swallow it silently).
  const g = new Engine({ width: 78, height: 18, seed: 7 });
  g.input('jump');
  g.dist = 500; // score 100 on the next tick
  g.tick(1 / 30);
  assert.equal(g.score, 100);
  assert.equal(g.popupMsg, '100 — keep scuttling!');
  assert.ok(g.popupT > 0, 'the popup timer must be running');
  assert.ok(g.flashT > 0, 'the score flash must be running');
  assert.ok(g.render({ color: false }).includes('keep scuttling'), 'the popup must be drawn');
});

test('rendering holds exact line widths at the smallest and largest sizes', () => {
  for (const [w, h] of [[60, 15], [120, 30]]) {
    const g = new Engine({ width: w, height: h, seed: 7 });
    g.input('jump');
    for (let i = 0; i < 60; i++) {
      g.tick(1 / 30);
      const lines = g.render({ color: false }).split('\n');
      assert.equal(lines.length, g.H, `expected ${g.H} lines at ${w}x${h}`);
      for (const line of lines) assert.equal(line.length, g.W, `line width must be ${g.W}`);
    }
  }
});

test('night stars survive a night-phase change (star cache rebuilds)', () => {
  // The star field is cached per night phase; when dist crosses into the
  // next night the cache must rebuild, not serve the old phase's field
  // (or an empty one) for the new size.
  const g = new Engine({ width: 78, height: 18, seed: 6 });
  g.input('jump');
  g.dist = 2500; // night, phase 1
  g.tick(1 / 30);
  assert.ok(g.night);
  assert.ok(g.render({ color: false }).includes('·'), 'expected stars in night phase 1');
  g.dist = 7300; // night again, phase 3 — the cache key changed
  g.tick(1 / 30);
  assert.ok(g.night, 'still night after the phase change');
  assert.ok(g.render({ color: false }).includes('·'), 'stars must survive a night-phase change');
});

console.log(`\n${passed} tests passed 🖼️`);
