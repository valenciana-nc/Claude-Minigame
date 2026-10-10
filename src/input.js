// Keyboard disambiguation for raw-mode terminals.
//
// Arrow keys arrive as escape sequences (e.g. '\x1b[A'), but a terminal may
// split the sequence across `data` chunks. A lone '\x1b' chunk is ambiguous:
// it could be ESC (quit) or the head of a split arrow key. Quitting on it
// immediately means a split ↑/↓ can kill the game mid-run.
//
// This buffers a lone ESC for `windowMs` and only treats it as a quit when
// nothing follows. A second chunk recombines into the full sequence.
// Pure logic — no terminal I/O — so it can be unit tested.

export function createKeyHandler({ onAction, windowMs = 50, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  let pending = null; // timeout id while a lone ESC is being disambiguated

  function handle(key) {
    if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') return void onAction('quit');
    if (key === ' ' || key === '\x1b[A' || key === 'w' || key === 'W') return void onAction('jump');
    if (key === '\x1b[B' || key === 's' || key === 'S') return void onAction('duck');
    if (key === 'p' || key === 'P') return void onAction('pause');
    if (key === 'r' || key === 'R') return void onAction('restart');
    // unknown keys are ignored
  }

  function cancel() {
    if (pending !== null) { clearTimeoutFn(pending); pending = null; }
  }

  // Feed one raw-mode `data` chunk. Chunks are usually single keys or a whole
  // escape sequence, but may also be a fragment of one.
  function data(key) {
    if (pending !== null) {
      cancel();              // a chunk followed the lone ESC — it's a sequence
      handle('\x1b' + key);
      return;
    }
    if (key === '\x1b') {
      pending = setTimeoutFn(() => { pending = null; handle('\x1b'); }, windowMs);
      return;
    }
    handle(key);
  }

  return { data, cancel };
}
