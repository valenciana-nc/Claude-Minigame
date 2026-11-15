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
//
// Chunks are tokenized one character at a time: under load a terminal can
// coalesce several keypresses into a single `data` chunk (two quick spaces,
// an arrow key plus the next press, a trailing ESC), and the old code handled
// the whole chunk as one key, so every press in it was silently dropped.

export function createKeyHandler({ onAction, windowMs = 50, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  let pending = null; // timeout id while a lone ESC / partial sequence is buffered
  let buf = '';       // buffered ESC or partial sequence (e.g. '\x1b[')
  // Byte classes of a CSI / SS3 sequence (ECMA-48): parameter bytes 0x30–0x3f
  // (digits, ';', '?', '<', '=', '>', '!'), intermediates 0x20–0x2f, and
  // final bytes 0x40–0x7e. Anything else can't continue a sequence.
  const isParam = (ch) => ch >= '0' && ch <= '?';        // 0x30–0x3f
  const isIntermediate = (ch) => ch >= ' ' && ch <= '/'; // 0x20–0x2f
  const isFinal = (ch) => ch >= '@' && ch <= '~';        // 0x40–0x7e

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
    if (key === ' ' || key === '\x1b[A' || key === '\x1bOA' || key === 'w' || key === 'W') return void onAction('jump');
    if (key === '\x1b[B' || key === '\x1bOB' || key === 's' || key === 'S') return void onAction('duck');
    if (key === 'p' || key === 'P') return void onAction('pause');
    if (key === 'r' || key === 'R') return void onAction('restart');
    // unknown keys are ignored
  }

  function cancel() {
    if (pending !== null) { clearTimeoutFn(pending); pending = null; }
    buf = '';
  }

  // Feed one character of a chunk into the sequence state machine. A chunk
  // is processed left to right; a character that can't continue the buffered
  // partial sequence ends it — a complete sequence is handled, a broken one
  // is dropped — and the character itself is then fed again as fresh input,
  // so no keypress is ever lost to the sequence it followed.
  function feed(ch) {
    if (buf === '') {
      if (ch === '\x1b') buf = '\x1b';
      else handle(ch);
      return;
    }
    if (buf === '\x1b') {
      if (ch === '\x1b') return; // double ESC: re-buffer, quit exactly once via the timer
      if (ch === '[' || ch === 'O') { buf += ch; return; }
      // A lone ESC followed by a key that can't start a sequence was a quit
      // press, not the head of one: fire it, then handle the key itself.
      buf = '';
      handle('\x1b');
      feed(ch);
      return;
    }
    if (buf === '\x1bO') {
      // SS3: one final byte completes it (e.g. ESC O A = ↑ in application
      // cursor-key mode). Anything else breaks the sequence.
      if (isFinal(ch)) { const seq = buf + ch; buf = ''; handle(seq); }
      else { buf = ''; feed(ch); }
      return;
    }
    // CSI: parameter / intermediate bytes extend it, a final byte ends it.
    if (isParam(ch) || isIntermediate(ch)) { buf += ch; return; }
    if (isFinal(ch)) { const seq = buf + ch; buf = ''; handle(seq); return; }
    buf = '';
    feed(ch);
  }

  // Feed one raw-mode `data` chunk. Chunks are usually single keys or a whole
  // escape sequence, but may also be a fragment of one — including fragments
  // split into three or more pieces (ESC, '[', 'A'), which the old code
  // dropped: the '[' fragment was handled as a dead sequence and the 'A'
  // then arrived alone and was ignored — or several keys coalesced into one
  // chunk. The state machine above sorts all of that out one character at a
  // time; `buf` carries a partial sequence across chunks.
  function data(key) {
    if (pending !== null) { clearTimeoutFn(pending); pending = null; }
    for (const ch of key) feed(ch);
    if (buf !== '') arm();
  }

  return { data, cancel };
}
