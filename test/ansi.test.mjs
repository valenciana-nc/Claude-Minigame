// Headless ANSI toolkit tests. Run: npm test
import assert from 'node:assert/strict';
import { dedupeFrame, setTitle } from '../src/ansi.js';

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

test('setTitle wraps the title and strips control characters', () => {
  // A control character in the title could inject terminal sequences;
  // setTitle strips them. The expected value is literal, not built from
  // the module's own constants — same rule as the dedupeFrame test.
  assert.equal(setTitle('Claude Runner'), '\x1b]0;Claude Runner\x07');
  assert.equal(setTitle('a\x1bb\x7fc'), '\x1b]0;abc\x07', 'ESC and DEL must be stripped');
  assert.equal(setTitle('a\nb'), '\x1b]0;ab\x07', 'newlines must be stripped');
});

console.log(`\n${passed} tests passed 🎨`);
