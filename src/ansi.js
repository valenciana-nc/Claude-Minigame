// Minimal ANSI toolkit. No deps, truecolor (Windows Terminal, iTerm2, etc).

export const ESC = '\x1b';
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
export const home = `${ESC}[H`;
export const clear = `${ESC}[2J`;
export const setTitle = (title) => `${ESC}]0;${String(title).replace(/[\x00-\x1f\x7f]/g, '')}\x07`;

// OSC 8 terminal hyperlink — the whole trick behind "ctrl+click the crab".
export function link(text, url) {
  return `${ESC}]8;;${url}\x07${text}${ESC}]8;;\x07`;
}
