// Headless tests for src/input.js (ESC / arrow-key disambiguation). Run: npm test
import assert from 'node:assert/strict';
import { createKeyHandler } from '../src/input.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

// Fake timers so the suite never waits on real time.
function harness() {
  const actions = [];
  const timers = new Map();
  let nextId = 1;
  const h = createKeyHandler({
    onAction: (a) => actions.push(a),
    setTimeoutFn: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
    clearTimeoutFn: (id) => { timers.delete(id); },
  });
  return {
    h,
    actions,
    pendingTimers: () => timers.size,
    fireTimers: () => { for (const fn of [...timers.values()]) fn(); timers.clear(); },
  };
}

test('a handler with no onAction never crashes', () => {
  // Every other option had a default, but onAction did not: a bare
  // createKeyHandler() threw TypeError on the first mapped key — even
  // asynchronously, when a buffered ESC's timer fired.
  const timers = new Map();
  let nextId = 1;
  const h = createKeyHandler({
    setTimeoutFn: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
    clearTimeoutFn: (id) => { timers.delete(id); },
  });
  assert.doesNotThrow(() => {
    h.data(' ');
    h.data('\x1b[A');
    h.data('\x1b');
    for (const fn of [...timers.values()]) fn();
    timers.clear();
    h.data('q');
  }, 'keys without a listener must be dropped silently, not throw');
});

test('plain keys map to actions', () => {
  const t = harness();
  t.h.data(' '); t.h.data('w'); t.h.data('s'); t.h.data('S');
  t.h.data('p'); t.h.data('r'); t.h.data('q');
  assert.deepEqual(t.actions, ['jump', 'jump', 'duck', 'duck', 'pause', 'restart', 'quit']);
});

test('uppercase keys map to the same actions', () => {
  // handle() accepts W/Q/P/R, but only lowercase w/s and uppercase S
  // were exercised — an uppercase-only player could silently lose keys.
  const t = harness();
  t.h.data('W'); t.h.data('Q'); t.h.data('P'); t.h.data('R');
  assert.deepEqual(t.actions, ['jump', 'quit', 'pause', 'restart']);
});

test('ctrl+C quits', () => {
  const t = harness();
  t.h.data('\x03');
  assert.deepEqual(t.actions, ['quit']);
});

test('a whole arrow-key sequence in one chunk just works', () => {
  const t = harness();
  t.h.data('\x1b[A');
  t.h.data('\x1b[B');
  assert.deepEqual(t.actions, ['jump', 'duck']);
  assert.equal(t.pendingTimers(), 0, 'no ESC buffering needed for whole sequences');
});

test('a lone ESC quits once the window elapses', () => {
  const t = harness();
  t.h.data('\x1b');
  assert.deepEqual(t.actions, [], 'must not quit immediately — it may be a split sequence');
  assert.equal(t.pendingTimers(), 1);
  t.fireTimers();
  assert.deepEqual(t.actions, ['quit']);
});

test('a split arrow-key sequence jumps instead of quitting', () => {
  const t = harness();
  t.h.data('\x1b');   // first fragment — buffered, no action yet
  t.h.data('[A');     // second fragment — recombined into '\x1b[A'
  assert.deepEqual(t.actions, ['jump'], 'split ↑ must jump, not quit');
  t.fireTimers();     // the buffered timer was cancelled — nothing more may fire
  assert.deepEqual(t.actions, ['jump']);
});

test('a split ↓ sequence ducks instead of quitting', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('[B');
  assert.deepEqual(t.actions, ['duck']);
});

test('a sequence split into three chunks still jumps', () => {
  const t = harness();
  t.h.data('\x1b'); // fragment 1
  t.h.data('[');    // fragment 2 — a bare CSI prefix, not a dead sequence
  t.h.data('A');    // fragment 3 — completes '\x1b[A'
  assert.deepEqual(t.actions, ['jump'], 'ESC + [ + A must jump, not drop the key');
  assert.equal(t.pendingTimers(), 0);
});

test('a sequence split into three chunks still ducks', () => {
  const t = harness();
  t.h.data('\x1b'); t.h.data('['); t.h.data('B');
  assert.deepEqual(t.actions, ['duck']);
});

test('a parameterized CSI split across chunks never quits', () => {
  const t = harness();
  t.h.data('\x1b'); t.h.data('[1;5'); t.h.data('A'); // e.g. shift+↑, not a game key
  assert.deepEqual(t.actions, [], 'an incomplete CSI must not become a quit');
  t.fireTimers();
  assert.deepEqual(t.actions, []);
});

test('an ESC followed by a whole sequence jumps instead of swallowing it', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('\x1b[A');
  assert.deepEqual(t.actions, ['jump']);
});

test('a partial CSI arriving as its own chunk still jumps', () => {
  // The terminal can split an arrow key as '\x1b[' + 'A' — the first chunk
  // is only a CSI prefix, not a complete key, so it must be buffered and
  // recombined, not dropped as an unknown sequence.
  const t = harness();
  t.h.data('\x1b[');
  assert.deepEqual(t.actions, [], 'a bare CSI prefix must not act yet');
  t.h.data('A');
  assert.deepEqual(t.actions, ['jump'], 'CSI prefix + final byte must jump');
  assert.equal(t.pendingTimers(), 0);
});

test('a partial CSI after a buffered ESC still jumps', () => {
  // ESC, then a fresh partial CSI, then the final byte: the middle chunk
  // used to be handled (and dropped) immediately, losing the arrow press.
  const t = harness();
  t.h.data('\x1b');
  t.h.data('\x1b[');
  t.h.data('A');
  assert.deepEqual(t.actions, ['jump']);
  assert.equal(t.pendingTimers(), 0);
});

test('a partial parameterized CSI arriving fresh never quits', () => {
  const t = harness();
  t.h.data('\x1b[1;5'); // e.g. ctrl+↑ split before its final byte
  t.h.data('A');
  assert.deepEqual(t.actions, [], 'an incomplete CSI must not become a quit');
  t.fireTimers();
  assert.deepEqual(t.actions, []);
});

test('cancel() drops a buffered ESC', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.cancel();
  t.fireTimers();
  assert.deepEqual(t.actions, [], 'cancelled ESC must never quit');
});

test('a double ESC quits exactly once', () => {
  // Two quick ESC presses re-buffer instead of quitting twice: the
  // second ESC replaces the pending one, and the timer fires once.
  const t = harness();
  t.h.data('\x1b');
  t.h.data('\x1b');
  assert.deepEqual(t.actions, [], 'the second ESC must re-buffer, not quit yet');
  t.fireTimers();
  assert.deepEqual(t.actions, ['quit'], 'the buffered ESC must quit exactly once');
});

test('a buffered ESC followed by a plain key still quits instead of swallowing both', () => {
  // ESC, then SPACE inside the window: the ESC was a quit press, not the
  // head of a sequence — the old code glued them into one unknown "key"
  // ('\x1b ') and dropped both, so the quit silently never happened.
  const t = harness();
  t.h.data('\x1b');
  t.h.data(' ');
  assert.deepEqual(t.actions, ['quit', 'jump'], 'the buffered ESC must quit, then the key still lands');
});

test('a buffered ESC followed by Q quits (once via the ESC, once via Q)', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('q');
  assert.equal(t.actions[0], 'quit', 'the buffered ESC must fire the quit');
});

test('a buffered ESC followed by O does not quit — it may open an SS3 sequence', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('O');
  t.fireTimers();
  assert.deepEqual(t.actions, [], 'ESC + O must not become a quit');
});

test('several keys coalesced into one chunk all land', () => {
  // Under load a terminal can deliver two quick presses in a single `data`
  // chunk; the old code handled the whole chunk as one key, so '  ' (two
  // spaces, e.g. key-repeat while holding jump) produced no action at all.
  const t = harness();
  t.h.data('  ');
  assert.deepEqual(t.actions, ['jump', 'jump'], 'two spaces in one chunk must jump twice');
  t.h.data('pq');
  assert.deepEqual(t.actions, ['jump', 'jump', 'pause', 'quit'], 'P then Q in one chunk must pause, then quit');
});

test('an arrow key plus the next press in one chunk both land', () => {
  const t = harness();
  t.h.data('\x1b[A ');
  assert.deepEqual(t.actions, ['jump', 'jump'], '↑ + SPACE in one chunk must jump twice');
  t.h.data(' \x1b[B');
  assert.deepEqual(t.actions, ['jump', 'jump', 'jump', 'duck'], 'SPACE + ↓ in one chunk must jump, then duck');
});

test('a trailing ESC in a coalesced chunk still quits', () => {
  // SPACE then ESC in one chunk: the space jumps, the ESC buffers and
  // quits once its window elapses — the old code dropped the whole chunk,
  // losing the jump and cancelling the quit.
  const t = harness();
  t.h.data(' \x1b');
  assert.deepEqual(t.actions, ['jump'], 'the SPACE must jump before the ESC is even resolved');
  t.fireTimers();
  assert.deepEqual(t.actions, ['jump', 'quit'], 'the trailing ESC must still quit');
});

test('a split sequence plus a trailing key in the next chunk both land', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('[A ');
  assert.deepEqual(t.actions, ['jump', 'jump'], 'the completed ↑ and the trailing SPACE must both jump');
});

test('SS3 arrow keys jump and duck', () => {
  // Terminals in application cursor-key mode (and some multiplexers) send
  // arrows as ESC O A / ESC O B instead of the CSI form; the old code
  // dropped them outright, so ↑/↓ did nothing there.
  const t = harness();
  t.h.data('\x1bOA');
  t.h.data('\x1bOB');
  assert.deepEqual(t.actions, ['jump', 'duck'], 'SS3 ↑/↓ must act like CSI ↑/↓');
  assert.equal(t.pendingTimers(), 0, 'a whole SS3 sequence needs no buffering');
});

test('an SS3 arrow split across chunks still acts', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.data('OA');
  assert.deepEqual(t.actions, ['jump'], 'ESC + OA must jump, not quit');
  t.h.data('\x1bO');
  t.h.data('B');
  assert.deepEqual(t.actions, ['jump', 'duck'], 'ESC O + B must duck');
  t.fireTimers();
  assert.deepEqual(t.actions, ['jump', 'duck'], 'no buffered ESC may fire after an SS3 key');
});

test('an SS3 arrow plus the next press in one chunk both land', () => {
  const t = harness();
  t.h.data('\x1bOA ');
  assert.deepEqual(t.actions, ['jump', 'jump'], 'SS3 ↑ + SPACE in one chunk must jump twice');
});

test('a whole parameterized CSI in one chunk is ignored, not a quit', () => {
  // The split form was pinned, but the common case — ctrl+↑ arriving
  // whole as '\x1b[1;5A' — takes the same path with no test on it.
  const t = harness();
  t.h.data('\x1b[1;5A');
  t.h.data('\x1b[1;5B');
  assert.deepEqual(t.actions, [], 'ctrl+arrows are not game keys');
  t.fireTimers();
  assert.deepEqual(t.actions, [], 'no buffered ESC may fire after a complete CSI');
  assert.equal(t.pendingTimers(), 0);
});

test('Ctrl+C during a partial CSI still quits', () => {
  // A control byte can't continue a CSI, so it breaks the sequence and
  // is fed as a fresh key — the quit must land instead of being swallowed
  // by the half-finished escape.
  const t = harness();
  t.h.data('\x1b[1');
  assert.deepEqual(t.actions, [], 'the partial CSI must not act yet');
  t.h.data('\x03');
  assert.deepEqual(t.actions, ['quit'], 'Ctrl+C must quit even mid-sequence');
  assert.equal(t.pendingTimers(), 0, 'no buffered ESC may fire after the quit');
});

test('unknown keys are ignored', () => {
  const t = harness();
  t.h.data('x');
  t.h.data('\x1b[Z'); // e.g. shift+tab — not a game key
  assert.deepEqual(t.actions, []);
});

console.log(`\n${passed} tests passed ⌨️`);
