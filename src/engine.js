// Clawd Runner game engine. Pure simulation + rendering to a string.
// No terminal I/O here — bin/clawd.js owns the screen and keyboard.

import { COLORS, RESET } from './ansi.js';
import { CRAB, CACTI, BUG, CLOUD, TITLE, SUBTITLE } from './sprites.js';

const CRAB_X = 5;          // crab's fixed screen column
const GRAVITY = 42;        // rows / s^2
const JUMP_VY = 19;        // rows / s
const DUCK_TIME = 0.55;    // s per duck press
const DEATH_COOLDOWN = 0.5;
const NIGHT_EVERY = 2400;  // distance cols per day/night phase

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Engine {
  constructor({ width = 80, height = 20, seed = (Date.now() % 2 ** 31) | 0, hi = 0 } = {}) {
    this.resize(width, height);
    this.seed = seed;
    this.hi = hi;
    this.mode = 'title';
    this.t = 0;
    this._initRun();
  }

  resize(width, height) {
    this.W = Math.max(60, Math.min(100, width));
    this.H = Math.max(15, Math.min(26, height));
    this.groundRow = this.H - 2;
  }

  _initRun() {
    this.rng = mulberry32(this.seed + (this.runCount = (this.runCount || 0) + 1));
    this.dist = 0;
    this.speed = 19;
    this.y = 0;        // rows above ground
    this.vy = 0;
    this.duckT = 0;
    this.obstacles = [];
    this.spawnIn = 40 + this.rng() * 30;
    this.deadT = 0;
    this.newBest = false;
    this.flashT = 0;
    this.lastHundred = 0;
  }

  get score() { return Math.floor(this.dist / 5); }
  get night() { return Math.floor(this.dist / NIGHT_EVERY) % 2 === 1; }

  input(action) {
    if (action === 'quit') return 'quit';
    if (action === 'restart') { this._initRun(); this.mode = 'run'; return; }
    if (action === 'pause' && this.mode === 'run') { this.paused = !this.paused; return; }
    if (action === 'jump') {
      if (this.mode === 'title') { this.mode = 'run'; return; }
      if (this.mode === 'dead') {
        if (this.deadT >= DEATH_COOLDOWN) { this._initRun(); this.mode = 'run'; }
        return;
      }
      if (this.paused) return;
      if (this.y === 0) { this.vy = JUMP_VY; this.duckT = 0; }
      return;
    }
    if (action === 'duck' && this.mode === 'run' && !this.paused) {
      if (this.y === 0) this.duckT = DUCK_TIME;
    }
  }

  tick(dt) {
    this.t += dt;
    if (this.mode === 'dead') { this.deadT += dt; return; }
    if (this.mode !== 'run' || this.paused) return;

    this.speed = 19 + Math.min(23, this.dist / 220);
    this.dist += this.speed * dt;
    if (this.flashT > 0) this.flashT -= dt;
    const hundred = Math.floor(this.score / 100);
    if (hundred > this.lastHundred) { this.lastHundred = hundred; this.flashT = 0.6; }

    // crab vertical physics
    if (this.vy !== 0 || this.y > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }
    if (this.duckT > 0) this.duckT -= dt;

    // obstacles scroll left
    for (const ob of this.obstacles) ob.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((ob) => ob.x > -8);

    this.spawnIn -= this.speed * dt;
    if (this.spawnIn <= 0) this._spawn();

    if (this._collides()) {
      this.mode = 'dead';
      this.deadT = 0;
      if (this.score > this.hi) { this.hi = this.score; this.newBest = true; }
    }
  }

  _spawn() {
    const canBug = this.dist > 500;
    if (canBug && this.rng() < 0.3) {
      const fly = this.rng() < 0.5 ? 2 : 5; // 2 = duck or jump, 5 = run under
      this.obstacles.push({ kind: 'bug', x: this.W + 3, fly, w: BUG.w, h: 1 });
    } else {
      const c = CACTI[Math.floor(this.rng() * CACTI.length)];
      this.obstacles.push({ kind: 'cactus', x: this.W + 3, c, w: c.w, h: c.h });
    }
    const minGap = 26 + this.speed * 0.9;
    this.spawnIn = minGap + this.rng() * 48;
  }

  _collides() {
    const ducking = this.duckT > 0 && this.y === 0;
    const crabLo = Math.round(this.y);
    const crabHi = crabLo + (ducking ? 1 : 2); // forgiving: ignore claw row
    const cx0 = CRAB_X + 1, cx1 = CRAB_X + CRAB.w - 2;
    for (const ob of this.obstacles) {
      const ox0 = ob.x + 0.4, ox1 = ob.x + ob.w - 0.4;
      if (ox1 < cx0 || ox0 > cx1) continue;
      const oLo = ob.kind === 'bug' ? ob.fly : 0;
      const oHi = ob.kind === 'bug' ? ob.fly : ob.h - 1;
      if (oHi >= crabLo && oLo <= crabHi) return true;
    }
    return false;
  }

  // --- rendering ---------------------------------------------------------

  _blank() {
    this.grid = Array.from({ length: this.H }, () => new Array(this.W).fill(' '));
    this.col = Array.from({ length: this.H }, () => new Array(this.W).fill(''));
  }

  _put(x, y, rows, colorKey) {
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r];
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === ' ') continue;
        const gx = Math.round(x) + i, gy = y + r;
        if (gx < 0 || gx >= this.W || gy < 0 || gy >= this.H) continue;
        this.grid[gy][gx] = ch === '.' ? ' ' : ch;
        this.col[gy][gx] = ch === '.' ? '' : colorKey;
      }
    }
  }

  _text(x, y, str, colorKey) {
    this._put(x, y, [str.replaceAll(' ', '.')], colorKey);
  }

  _center(y, str, colorKey) {
    this._text(Math.floor((this.W - str.length) / 2), y, str, colorKey);
  }

  render({ color = true } = {}) {
    this._blank();
    const night = this.night;

    // sky: stars at night, clouds always
    if (night) {
      const phase = Math.floor(this.dist / NIGHT_EVERY);
      for (let r = 1; r < 7; r++) {
        for (let c = 0; c < this.W; c++) {
          const h = hash2(c + phase * 31, r);
          if (h % 41 === 0) { this.grid[r][c] = '·'; this.col[r][c] = 'S'; }
          else if (h % 173 === 0) { this.grid[r][c] = '*'; this.col[r][c] = 'S'; }
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const cx = this.W - (((this.dist * 0.35) + i * 167) % (this.W + 30)) + 12;
      this._put(cx, [2, 4, 3][i], CLOUD.rows, 'D');
    }

    // ground line, scrolling pebble pattern
    const g = this.grid[this.groundRow], gc = this.col[this.groundRow];
    for (let c = 0; c < this.W; c++) {
      const h = hash2(c + Math.floor(this.dist), 7);
      g[c] = h % 13 === 0 ? '╌' : '▔';
      gc[c] = night ? 'S' : 'D';
    }

    // obstacles
    for (const ob of this.obstacles) {
      if (ob.kind === 'bug') {
        const frame = BUG.frames[Math.floor(this.t * 6) % 2];
        this._put(ob.x, this.groundRow - 1 - ob.fly, [frame], BUG.color);
      } else {
        this._put(ob.x, this.groundRow - ob.c.h, ob.c.rows, night ? 'S' : ob.c.color);
      }
    }

    // crab
    const ducking = this.duckT > 0 && this.y === 0 && this.mode === 'run';
    let art;
    if (this.mode === 'dead') art = CRAB.dead;
    else if (ducking) art = Math.floor(this.t * 8) % 2 ? CRAB.duckA : CRAB.duckB;
    else if (this.y > 0) art = CRAB.jump;
    else art = Math.floor(this.dist / 4) % 2 ? CRAB.runA : CRAB.runB;
    const crabTop = this.groundRow - Math.round(this.y) - art.length;
    this._put(CRAB_X, crabTop, art, 'O');

    // HUD
    const hudColor = this.flashT > 0 ? 'Y' : 'D';
    const hud = `HI ${String(this.hi).padStart(5, '0')}  ${String(this.score).padStart(5, '0')}`;
    this._text(this.W - hud.length - 1, 0, hud, hudColor);
    this._text(1, 0, 'CLAWD RUNNER', 'o');
    if (night) this._text(15, 0, '☾', 'S');

    if (this.mode === 'title') {
      this._center(Math.floor(this.H / 2) - 3, TITLE, 'B');
      this._center(Math.floor(this.H / 2) - 1, SUBTITLE, 'D');
      this._center(Math.floor(this.H / 2) + 1, 'SPACE jump · ↓ duck · P pause · Q quit', 'W');
      this._center(Math.floor(this.H / 2) + 3, 'press SPACE to scuttle', 'o');
    } else if (this.mode === 'dead') {
      this._center(Math.floor(this.H / 2) - 3, 'G A M E   O V E R', 'R');
      const line = this.newBest ? `score ${this.score} · NEW BEST!` : `score ${this.score} · best ${this.hi}`;
      this._center(Math.floor(this.H / 2) - 1, line, this.newBest ? 'Y' : 'W');
      this._center(Math.floor(this.H / 2) + 1, 'SPACE restart · Q quit', 'D');
    } else if (this.paused) {
      this._center(Math.floor(this.H / 2), 'P A U S E D', 'W');
    }

    // help line
    this._text(1, this.H - 1, 'SPACE jump   ↓/S duck   P pause   R restart   Q quit', 'D');

    // flush grid -> string
    const out = [];
    for (let r = 0; r < this.H; r++) {
      let line = '', cur = '';
      for (let c = 0; c < this.W; c++) {
        const key = color ? this.col[r][c] : '';
        if (key !== cur) {
          line += cur ? RESET : '';
          line += key ? COLORS[key] : '';
          cur = key;
        }
        line += this.grid[r][c];
      }
      if (cur) line += RESET;
      out.push(line);
    }
    return out.join('\n');
  }
}
