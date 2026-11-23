// Clawd Runner renderer — turns Engine state into a frame string.
//
// The Engine owns the simulation only; everything that paints cells lives
// here: the grid buffers, the star cache, sprites, HUD, and screen shake.
// The renderer reads the engine it is given and never mutates it, so
// render() is pure given the engine's state.

import { COLORS, RESET } from './ansi.js';
import { FLYERS, CLOUDS, TITLE, SUBTITLE } from './sprites.js';
import { CRAB_X, NIGHT_EVERY } from './util.js';

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Lattice values for smoothNoise, memoized: the hill row re-hashes the
// same lattice points every frame — adjacent columns share them, and the
// row only slides ~0.012 * dist per frame — so the per-frame hill cost
// was 2 * W hash2 calls for values that almost never change. Keyed by the
// integer lattice index only (the value is a pure function of it), so the
// cache is safe to share across renderers. Capped and cleared rather than
// grown forever on very long runs; cleared values just recompute.
const _lattice = new Map();
function lattice(i) {
  let v = _lattice.get(i);
  if (v === undefined) {
    v = (hash2(i, 7) % 1000) / 1000;
    if (_lattice.size >= 8192) _lattice.clear();
    _lattice.set(i, v);
  }
  return v;
}

// Smooth value noise in [0,1] — rolling hills / dunes.
function smoothNoise(x) {
  const xi = Math.floor(x), f = x - xi;
  const a = lattice(xi), b = lattice(xi + 1);
  const u = f * f * (3 - 2 * f);
  return a * (1 - u) + b * u;
}

// One composed row -> string, with the color state machine (emit a color
// escape only when the key changes, reset at the end). Both flush paths in
// render() share it: the fast path passes the grid row straight through,
// the shake path passes a shifted copy built for that row.
function flushRow(chars, keys, color) {
  let line = '', cur = '';
  for (let c = 0; c < chars.length; c++) {
    const key = color ? keys[c] : '';
    if (key !== cur) {
      line += cur ? RESET : '';
      line += key ? COLORS[key] : '';
      cur = key;
    }
    line += chars[c];
  }
  if (cur) line += RESET;
  return line;
}

export class Renderer {
  constructor() {
    // Buffers are (re)built lazily for the engine's size on the first
    // render after a resize, so Engine.resize() stays a pure sim concern.
    this.grid = null; // [H][W] chars
    this.col = null;  // [H][W] color keys
    this._stars = null;
    this._ground = null; // cached pebble row: { W, dist, chars }
    this.g = null; // engine being rendered; set for the duration of render()
  }

  _ensureBuffers() {
    const { W, H } = this.g;
    if (!this.grid || this.grid.length !== H || this.grid[0].length !== W) {
      this.grid = Array.from({ length: H }, () => new Array(W).fill(' '));
      this.col = Array.from({ length: H }, () => new Array(W).fill(''));
    }
  }

  _blank() {
    for (let r = 0; r < this.g.H; r++) {
      this.grid[r].fill(' ');
      this.col[r].fill('');
    }
  }

  // `accentKey`, when given, recolors '#' cells (the skin's `>_` prompt) and
  // paints them as solid blocks — lets one sprite carry two colors.
  _put(x, y, rows, colorKey, accentKey) {
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r];
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === ' ') continue;
        const gx = Math.round(x) + i, gy = y + r;
        if (gx < 0 || gx >= this.g.W || gy < 0 || gy >= this.g.H) continue;
        if (ch === '.') { this.grid[gy][gx] = ' '; this.col[gy][gx] = ''; }
        else if (ch === '#' && accentKey) { this.grid[gy][gx] = '█'; this.col[gy][gx] = accentKey; }
        else { this.grid[gy][gx] = ch; this.col[gy][gx] = colorKey; }
      }
    }
  }

  _text(x, y, str, colorKey) {
    this._put(x, y, [str.replaceAll(' ', '.')], colorKey);
  }

  _center(y, str, colorKey) {
    this._text(Math.floor((this.g.W - str.length) / 2), y, str, colorKey);
  }

  _drawStars() {
    const g = this.g;
    if (!g.night) return;
    const phase = Math.floor(g.dist / NIGHT_EVERY);
    // The star field depends only on the night phase and the grid size, so
    // cache it instead of re-hashing every sky cell on every frame (~2.5k
    // hash calls per frame at max size). Rebuilt when phase or size changes.
    const cache = this._stars;
    if (!cache || cache.phase !== phase || cache.W !== g.W || cache.H !== g.H) {
      const cells = [];
      for (let r = 1; r < g.groundRow - 6; r++) {
        for (let c = 0; c < g.W; c++) {
          const h = hash2(c + phase * 31, r);
          if (h % 47 === 0) cells.push([r, c, '·']);
          else if (h % 199 === 0) cells.push([r, c, '*']);
        }
      }
      this._stars = { phase, W: g.W, H: g.H, cells };
    }
    for (const [r, c, ch] of this._stars.cells) {
      this.grid[r][c] = ch; this.col[r][c] = 'S';
    }
  }

  // A subtle, slow-scrolling dune crest on the horizon — one row, well above
  // the crab so the busy block sprites never fight the background.
  _drawHills() {
    const g = this.g;
    // No row guard needed: resize() clamps H to 15..30, so groundRow - 6
    // is always >= 7 and this row is always on screen.
    const row = g.groundRow - 6;
    const blocks = ' ▁▂▃▄▅';
    const key = g.night ? 'S' : 'E';
    for (let c = 0; c < g.W; c++) {
      const n = smoothNoise(c * 0.11 + g.dist * 0.012 + 100); // 0..1
      this.grid[row][c] = blocks[1 + Math.round(n * 4)];
      this.col[row][c] = key;
    }
  }

  _drawCelestial() {
    const g = this.g;
    const cx = Math.floor(g.W * 0.7);
    if (g.night) this._put(cx + 1, 1, ['☾'], 'W');
    else this._put(cx, 1, [' ▄▄ ', '████', ' ▀▀ '], 'y');
  }

  _drawClouds() {
    const g = this.g;
    const span = g.W + 24;
    for (let i = 0; i < 5; i++) {
      const shape = CLOUDS[i % CLOUDS.length];
      const far = i < 3;
      const speed = far ? 0.18 : 0.42;
      const x = g.W - (((g.dist * speed) + i * 53) % span) + 8;
      const yy = far ? 2 + (i % 2) : 1 + (i % 2) * 2;
      this._put(x, yy, shape, far ? 'D' : 'c');
    }
  }

  _drawParticles() {
    const g = this.g;
    for (const p of g.particles) {
      const gx = Math.round(p.x), gy = g.groundRow - Math.round(p.y);
      if (gx < 0 || gx >= g.W || gy < 0 || gy >= g.H) continue;
      this.grid[gy][gx] = p.char;
      this.col[gy][gx] = (p.color === 't' && p.life < p.max * 0.4) ? 'D' : p.color;
    }
  }

  // The frame as an array of row strings — the form the CLI diffs. render()
  // joins them for callers that want one string (snapshot mode, tests);
  // diffing the rows directly avoids joining the frame into one string
  // just for diffFrame() to split it apart again every tick.
  renderRows(engine, { color = true } = {}) {
    this.g = engine;
    this._ensureBuffers();
    const g = engine;
    this._blank();
    const night = g.night;

    this._drawStars();
    this._drawHills();
    this._drawClouds();
    this._drawCelestial();

    // ground line, scrolling pebble pattern. The pattern is a pure
    // function of floor(dist): advancing dist by k just shifts the row
    // left by k, so cache the chars and only hash the k cells that scroll
    // in on the right instead of re-hashing all W cells every frame.
    // Rebuilt on resize, on a backwards jump (restart, or a caller setting
    // dist directly), and on the first render.
    const dFloor = Math.floor(g.dist);
    let gc = this._ground;
    if (!gc || gc.W !== g.W || dFloor < gc.dist) {
      const chars = new Array(g.W);
      for (let c = 0; c < g.W; c++) chars[c] = hash2(c + dFloor, 11) % 13 === 0 ? '╌' : '▔';
      gc = this._ground = { W: g.W, dist: dFloor, chars };
    } else if (dFloor > gc.dist) {
      const k = Math.min(dFloor - gc.dist, g.W);
      gc.chars.copyWithin(0, k);
      for (let c = g.W - k; c < g.W; c++) gc.chars[c] = hash2(c + dFloor, 11) % 13 === 0 ? '╌' : '▔';
      gc.dist = dFloor;
    }
    const ground = this.grid[g.groundRow], groundCol = this.col[g.groundRow];
    for (let c = 0; c < g.W; c++) {
      ground[c] = gc.chars[c];
      groundCol[c] = night ? 'S' : 'D';
    }

    // obstacles
    for (const ob of g.obstacles) {
      if (ob.kind === 'cactus') {
        this._put(ob.x, g.groundRow - ob.c.h, ob.c.rows, night ? 'g' : ob.c.color);
      } else {
        const f = ob.f || FLYERS[0];
        const frame = f.frames[Math.floor(g.t * 11) % f.frames.length];
        this._put(ob.x, g.groundRow - 1 - ob.fly, [frame], f.color);
      }
    }

    // the runner - Clawd, or the Claude Code cloud skin
    const C = g.skin;
    const ducking = g.duckT > 0 && g.y === 0 && g.mode === 'run';
    let art;
    if (g.mode === 'dead') art = C.dead;
    else if (ducking) art = Math.floor(g.t * 8) % 2 ? C.duckA : C.duckB;
    else if (g.y > 0) art = C.jump;
    else art = Math.floor(g.dist / 4) % 2 ? C.runA : C.runB;
    const crabTop = g.groundRow - Math.round(g.y) - art.length;
    this._put(CRAB_X, crabTop, art, C.color, C.accent);

    this._drawParticles();

    // HUD
    const hudColor = g.flashT > 0 ? 'Y' : 'D';
    const hud = `HI ${String(g.hi).padStart(5, '0')}  ${String(g.score).padStart(5, '0')}`;
    this._text(g.W - hud.length - 1, 0, hud, hudColor);
    this._text(1, 0, 'CLAWD RUNNER', 'o');

    if (g.popupT > 0 && g.mode === 'run') this._center(2, g.popupMsg, 'Y');

    if (g.mode === 'title') {
      this._center(Math.floor(g.H / 2) - 3, TITLE, 'B');
      this._center(Math.floor(g.H / 2) - 1, SUBTITLE, 'D');
      this._center(Math.floor(g.H / 2) + 1, 'SPACE jump · ↓ duck/dive · P pause · Q quit · ^Z suspend', 'W');
      this._center(Math.floor(g.H / 2) + 3, 'press SPACE to scuttle', 'o');
    } else if (g.mode === 'dead') {
      this._center(Math.floor(g.H / 2) - 3, 'G A M E   O V E R', 'R');
      const line = g.newBest ? `score ${g.score} · NEW BEST!` : `score ${g.score} · best ${g.hi}`;
      this._center(Math.floor(g.H / 2) - 1, line, g.newBest ? 'Y' : 'W');
      this._center(Math.floor(g.H / 2) + 1, 'SPACE restart · Q quit', 'D');
    } else if (g.paused) {
      this._center(Math.floor(g.H / 2), 'P A U S E D', 'W');
    }

    // help line
    this._text(1, g.H - 1, 'SPACE jump   ↓/S duck·dive   P pause   R restart   Q quit', 'D');

    // screen shake — shift the whole composed frame by a couple cells on death
    let ox = 0, oy = 0;
    if (g.shakeT > 0) {
      const mag = Math.min(2, g.shakeT * 6);
      ox = Math.round(Math.sin(g.t * 63) * mag);
      oy = Math.round(Math.cos(g.t * 47) * mag * 0.5);
    }

    // flush grid -> rows. Screen shake is rare (only while shakeT > 0
    // right after a death), so the common no-shake frame takes a fast path
    // that skips the per-cell bounds math: with ox = oy = 0 every source
    // cell is in bounds by construction, and the general loop below is
    // only needed while the frame is actually shifted.
    const out = [];
    if (ox === 0 && oy === 0) {
      for (let r = 0; r < g.H; r++) out.push(flushRow(this.grid[r], this.col[r], color));
      return out;
    }
    for (let r = 0; r < g.H; r++) {
      const sr = r - oy;
      const chars = new Array(g.W), keys = new Array(g.W);
      for (let c = 0; c < g.W; c++) {
        const sc = c - ox;
        const inb = sr >= 0 && sr < g.H && sc >= 0 && sc < g.W;
        chars[c] = inb ? this.grid[sr][sc] : ' ';
        keys[c] = inb ? this.col[sr][sc] : '';
      }
      out.push(flushRow(chars, keys, color));
    }
    return out;
  }

  render(engine, { color = true } = {}) {
    return this.renderRows(engine, { color }).join('\n');
  }
}
