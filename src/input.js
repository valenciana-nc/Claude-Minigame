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
  let pending = null; // timeout id while a lone ESC / partial sequence is buffered
  let buf = '';       // buffered ESC or partial CSI sequence (e.g. '\x1b[')
  // A CSI sequence still waiting for its final byte: ESC [ + params only.
  const CSI_PREFIX = /^\x1b\[[0-9;?]*$/;

  function arm() {
    pending = setTimeoutFn(() => {
      pending = null;
      const seq = buf; buf = '';
      // Only a lone ESC counts as quit; a partial CSI that never completed
      // (e.g. ESC '[' with no final byte) is dropped, never treated as ESC.
      if (seq === '\x1b') handle('\x1b');
    }, windowMs);
  }

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
    buf = '';
  }

  // Feed one raw-mode `data` chunk. Chunks are usually single keys or a whole
  // escape sequence, but may also be a fragment of one — including fragments
  // split into three or more pieces (ESC, '[', 'A'), which the old code
  // dropped: the '[' fragment was handled as a dead sequence and the 'A'
  // then arrived alone and was ignored.
  function data(key) {
    if (pending !== null) {
      clearTimeoutFn(pending); pending = null;
      if (key === '\x1b') { buf = '\x1b'; arm(); return; } // double ESC: re-buffer
      if (key.startsWith('\x1b')) { buf = ''; handle(key); return; } // fresh sequence wins
      buf += key;
      if (CSI_PREFIX.test(buf)) { arm(); return; } // still incomplete — wait for the final byte
      handle(buf); buf = '';
      return;
    }
    if (key === '\x1b') {
      buf = '\x1b';
      arm();
      return;
    }
    handle(key);
  }

  return { data, cancel };
}
