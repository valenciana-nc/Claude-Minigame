// Headless ANSI toolkit tests. Run: npm test
import assert from 'node:assert/strict';
import { diffFrame, diffRows, setTitle, syncFrame } from '../src/ansi.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

test('diffFrame returns an empty string for an unchanged frame', () => {
  const frame = 'line one\nline two';
  assert.equal(diffFrame(frame, frame), '');
  assert.equal(diffFrame('', ''), '');
});

test('diffFrame emits only the changed rows, each cursor-positioned', () => {
  // The expected values are literal cursor-move sequences now, not the
  // module's own constants — comparing diffFrame() against its own export
  // would pass even if the sequence were wrong.
  assert.equal(diffFrame('a\nb\nc', 'a\nB\nc'), '\x1b[2;1HB');
  assert.equal(
    diffFrame('a\nb\nc', 'A\nb\nC'),
    '\x1b[1;1HA\x1b[3;1HC',
    'unchanged middle row is skipped, order is top to bottom',
  );
});

test('diffFrame emits every row for the first frame', () => {
  assert.equal(diffFrame('', 'one\ntwo'), '\x1b[1;1Hone\x1b[2;1Htwo', 'the first frame must always be emitted');
});

test('diffFrame outputs reconstruct the frame when replayed onto a screen', () => {
  // The point of the diff is fewer bytes for the same visible screen:
  // replay each diff onto a mock screen and check it matches the frame
  // after every step, including a colored row and an identical frame.
  const frames = [
    'aaa\nbbb\nccc',
    'aaa\nbXb\nccc',
    'a\x1b[31mY\x1b[0ma\nbXb\nccc',
    'a\x1b[31mY\x1b[0ma\nbXb\nccc', // identical: emits nothing
    'zzz\nyyy\nxxx',
  ];
  const screen = ['', '', ''];
  let prev = '';
  for (const frame of frames) {
    const out = diffFrame(prev, frame);
    // Split on each cursor move; the rest of a chunk is the row text,
    // color escapes included, exactly as the terminal would print it.
    for (const chunk of out.split(/(?=\x1b\[\d+;1H)/).filter(Boolean)) {
      const m = chunk.match(/^\x1b\[(\d+);1H([\s\S]*)$/);
      assert.ok(m, 'every diff chunk starts with a cursor move: ' + JSON.stringify(chunk));
      screen[Number(m[1]) - 1] = m[2];
    }
    assert.equal(screen.join('\n'), frame);
    prev = frame;
  }
});

test('diffRows matches diffFrame on the same frames, without the join/split round-trip', () => {
  // The CLI renders rows and diffs them directly; diffFrame is the
  // join-then-split form and must agree with it row for row, or the two
  // paths would paint different screens.
  const pairs = [
    [['a', 'b', 'c'], ['a', 'B', 'c']],
    [['a', 'b', 'c'], ['A', 'b', 'C']],
    [[], ['one', 'two']],
    [['same'], ['same']],
    [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']],
  ];
  for (const [prev, next] of pairs) {
    assert.equal(diffRows(prev, next), diffFrame(prev.join('\n'), next.join('\n')),
      `diffRows must match diffFrame for ${JSON.stringify(prev)} -> ${JSON.stringify(next)}`);
  }
  assert.equal(diffRows(null, ['one', 'two']), '\x1b[1;1Hone\x1b[2;1Htwo',
    'a null previous frame must emit every row');
  assert.equal(diffRows([], []), '', 'two empty frames emit nothing');
});

test('diffRows outputs reconstruct the frame when replayed onto a screen', () => {
  const frames = [
    ['aaa', 'bbb', 'ccc'],
    ['aaa', 'bXb', 'ccc'],
    ['a\x1b[31mY\x1b[0ma', 'bXb', 'ccc'],
    ['a\x1b[31mY\x1b[0ma', 'bXb', 'ccc'], // identical: emits nothing
    ['zzz', 'yyy', 'xxx'],
  ];
  const screen = ['', '', ''];
  let prev = null;
  for (const frame of frames) {
    const out = diffRows(prev, frame);
    for (const chunk of out.split(/(?=\x1b\[\d+;1H)/).filter(Boolean)) {
      const m = chunk.match(/^\x1b\[(\d+);1H([\s\S]*)$/);
      assert.ok(m, 'every diff chunk starts with a cursor move: ' + JSON.stringify(chunk));
      screen[Number(m[1]) - 1] = m[2];
    }
    assert.deepEqual(screen, frame);
    prev = frame;
  }
});

test('syncFrame wraps a frame in DEC 2026 markers; empty stays empty', () => {
  // Expected values are literal, not built from the module's own constants
  // — same rule as the diffFrame test above.
  assert.equal(syncFrame('abc'), '\x1b[?2026habc\x1b[?2026l');
  assert.equal(syncFrame(''), '', 'a diffed-out frame must emit no bare markers');
});

test('syncFrame pairs with diffFrame: unchanged frames emit nothing', () => {
  assert.equal(syncFrame(diffFrame('same', 'same')), '');
  assert.equal(syncFrame(diffFrame('old', 'new')), '\x1b[?2026h\x1b[1;1Hnew\x1b[?2026l');
});

test('setTitle wraps the title and strips control characters', () => {
  // a control character in the title could inject terminal sequences;
  // setTitle strips them. The expected value is literal, not built from
  // the module's own constants — same rule as the diffFrame test.
  assert.equal(setTitle('Claude Runner'), '\x1b]0;Claude Runner\x07');
  assert.equal(setTitle('a\x1bb\x7fc'), '\x1b]0;abc\x07', 'ESC and DEL must be stripped');
  assert.equal(setTitle('a\nb'), '\x1b]0;ab\x07', 'newlines must be stripped');
});

console.log(`\n${passed} tests passed 🎨`);
