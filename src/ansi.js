// Minimal ANSI toolkit. No deps, truecolor (Windows Terminal, iTerm2, etc).

// Internal only: no importer uses ESC directly (bin imports the built
// sequences, render imports COLORS/RESET), so it is not exported.
const ESC = '\x1b';
export const RESET = `${ESC}[0m`;

// Color table. Keys are single chars so the render grid can store one per cell.
export const COLORS = {
  O: `${ESC}[38;2;217;119;87m`,        // Clawd orange (#D97757)
  o: `${ESC}[2;38;2;217;119;87m`,      // dim orange
  B: `${ESC}[1;38;2;217;119;87m`,      // bold orange
  G: `${ESC}[38;2;128;166;100m`,       // cactus green
  g: `${ESC}[38;2;86;112;70m`,         // dim cactus (night / far)
  M: `${ESC}[38;2;197;134;192m`,       // bug magenta
  P: `${ESC}[38;2;160;120;220m`,       // glitch purple flyer
  C: `${ESC}[38;2;124;114;236m`,       // Claude Code blue-violet (the runner)
  E: `${ESC}[38;2;104;86;72m`,         // distant dune silhouette
  c: `${ESC}[38;2;196;200;210m`,       // near cloud (bright)
  y: `${ESC}[38;2;240;201;120m`,       // sun
  t: `${ESC}[38;2;170;150;120m`,       // dust / sand
  D: `${ESC}[2m`,                      // dim
  W: `${ESC}[97m`,                     // bright white
  Y: `${ESC}[1;33m`,                   // score flash
  R: `${ESC}[1;31m`,                   // game over
  S: `${ESC}[2;36m`,                   // night stars
};

export const altScreenOn = `${ESC}[?1049h${ESC}[?25l${ESC}[2J${ESC}[H`;
export const altScreenOff = `${ESC}[?1049l${ESC}[?25h`;
export const clear = `${ESC}[2J`;

// Row-level frame diff — the cheap half of the buffer-diffing terminal UIs
// (blessed, Ink) use: they only emit what changed since the last frame.
// Full per-cell diffing is overkill here, but whole-frame dedup left ~78%
// of the bytes on the table: measured on a 120-tick bot run, only ~2 of 18
// rows change per frame on average (max 5) — the ground scrolls one row at
// a time and the crab animates every other tick, while the sky, HUD and
// help line sit still for frames at a time. So emit only the changed rows,
// each positioned with an absolute cursor move; unchanged rows are never
// re-emitted. Returns '' when the frame is unchanged, so the caller can
// skip the write entirely. Every row is exactly W cells wide (render()
// paints every cell), so overwriting a row can never leave stale trailing
// characters from the previous frame. A first frame (prev '') emits every
// row. Row count only changes on resize, and the resize handler resets the
// caller's prev to '', so a shorter frame can never leave stale rows.
export function diffFrame(prev, frame) {
  if (prev === frame) return '';
  const prevRows = prev ? prev.split('\n') : [];
  const rows = frame.split('\n');
  let out = '';
  for (let r = 0; r < rows.length; r++) {
    if (prevRows[r] !== rows[r]) out += `${ESC}[${r + 1};1H${rows[r]}`;
  }
  return out;
}

// Synchronized output (DEC 2026): `ESC[?2026h` asks a supporting terminal
// to hold everything until `ESC[?2026l`, then paint the block atomically —
// no tearing if the terminal repaints mid-frame at 40 fps. Terminals that
// don't know the mode ignore the set/reset (private modes are a no-op by
// convention), and multiplexers that drop the markers just fall back to
// painting as the bytes arrive — the old behavior, never breakage.
// Supported by iTerm2, Kitty, WezTerm, Ghostty, Alacritty ≥ 0.13, modern
// xterm, and Windows Terminal; VTE/gnome-terminal not yet. Both markers ride
// in the same write as the frame, so they always pair in the stream — a kill
// between ticks can't strand the terminal in sync mode.
// Internal only: the only consumer is syncFrame() below — no importer
// uses the markers directly, so they are not exported.
const syncStart = `${ESC}[?2026h`;
const syncEnd = `${ESC}[?2026l`;
// Wrap one emitted frame. Empty output stays empty, so a deduped frame
// emits no bare markers at all.
export function syncFrame(out) {
  return out ? syncStart + out + syncEnd : '';
}
export const setTitle = (title) => `${ESC}]0;${String(title).replace(/[\x00-\x1f\x7f]/g, '')}\x07`;
