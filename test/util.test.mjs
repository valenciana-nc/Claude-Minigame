// Tests for the pure helpers in src/util.js. Run: npm test
import assert from 'node:assert/strict';
import { nearestObstacle } from '../src/util.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

test('nearestObstacle returns null when nothing is ahead of the crab', () => {
  assert.equal(nearestObstacle([], 8), null);
  // x + w <= aheadX means fully past: x=5,w=3 ends at 8, x=0,w=2 ends at 2.
  assert.equal(nearestObstacle([{ x: 5, w: 3 }, { x: 0, w: 2 }], 8), null);
});

test('nearestObstacle picks the smallest x still ahead, ties keep list order', () => {
  const a = { x: 30, w: 2 }, b = { x: 20, w: 3 }, c = { x: 20, w: 1 };
  assert.equal(nearestObstacle([a, b, c], 8), b);
  assert.equal(nearestObstacle([c, b], 8), c, 'stable-sort parity: first of the tie wins');
  assert.equal(nearestObstacle([{ x: 4, w: 3 }, b], 8), b, 'a fully-past obstacle is skipped');
});

test('nearestObstacle agrees with the filter().sort() selection it replaces', () => {
  // Randomized oracle check: the old per-tick selection, verbatim.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 200; t++) {
    const list = Array.from({ length: Math.floor(rnd() * 6) }, () => ({
      x: Math.floor(rnd() * 60) - 10, w: 1 + Math.floor(rnd() * 5),
    }));
    const oracle = list.filter((o) => o.x + o.w > 8).sort((p, q) => p.x - q.x)[0] ?? null;
    assert.equal(nearestObstacle(list, 8), oracle);
  }
});

console.log(`\n${passed} tests passed 🧰`);
