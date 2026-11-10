// Headless ANSI toolkit tests. Run: npm test
import assert from 'node:assert/strict';
import { dedupeFrame } from '../src/ansi.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

test('dedupeFrame returns an empty string for an unchanged frame', () => {
  const frame = 'line one\nline two';
  assert.equal(dedupeFrame(frame, frame), '');
  assert.equal(dedupeFrame('', ''), '');
});

test('dedupeFrame returns home + frame when the frame changed', () => {
  // The expected value is the literal home sequence now, not the module's
  // own constant — comparing dedupeFrame() against its own export would
  // pass even if the sequence were wrong.
  const home = '\x1b[H';
  assert.equal(dedupeFrame('old', 'new'), home + 'new');
  assert.equal(dedupeFrame('', 'first'), home + 'first', 'the first frame must always be emitted');
});

console.log(`\n${passed} tests passed 🎨`);
