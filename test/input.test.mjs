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

test('plain keys map to actions', () => {
  const t = harness();
  t.h.data(' '); t.h.data('w'); t.h.data('s'); t.h.data('S');
  t.h.data('p'); t.h.data('r'); t.h.data('q');
  assert.deepEqual(t.actions, ['jump', 'jump', 'duck', 'duck', 'pause', 'restart', 'quit']);
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

test('cancel() drops a buffered ESC', () => {
  const t = harness();
  t.h.data('\x1b');
  t.h.cancel();
  t.fireTimers();
  assert.deepEqual(t.actions, [], 'cancelled ESC must never quit');
});

test('unknown keys are ignored', () => {
  const t = harness();
  t.h.data('x');
  t.h.data('\x1b[Z'); // e.g. shift+tab — not a game key
  assert.deepEqual(t.actions, []);
});

console.log(`\n${passed} tests passed ⌨️`);
