// Minimal ANSI toolkit. No deps, truecolor (Windows Terminal, iTerm2, etc).

export const ESC = '\x1b';
export const RESET = `${ESC}[0m`;

// Color table. Keys are single chars so the render grid can store one per cell.
export const COLORS = {
  O: `${ESC}[38;2;217;119;87m`,        // Clawd orange (#D97757)
  o: `${ESC}[2;38;2;217;119;87m`,      // dim orange
  B: `${ESC}[1;38;2;217;119;87m`,      // bold orange
  G: `${ESC}[38;2;128;166;100m`,       // cactus green
  M: `${ESC}[38;2;197;134;192m`,       // bug magenta
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

// OSC 8 terminal hyperlink — the whole trick behind "ctrl+click the crab".
export function link(text, url) {
  return `${ESC}]8;;${url}\x07${text}${ESC}]8;;\x07`;
}
