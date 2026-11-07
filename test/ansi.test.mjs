// Headless ANSI toolkit tests. Run: npm test
import assert from 'node:assert/strict';
import { dedupeFrame, home } from '../src/ansi.js';

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
  assert.equal(dedupeFrame('old', 'new'), home + 'new');
  assert.equal(dedupeFrame('', 'first'), home + 'first', 'the first frame must always be emitted');
});

console.log(`\n${passed} tests passed 🎨`);
