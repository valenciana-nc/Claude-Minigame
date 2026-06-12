// Clawd Runner game engine. Pure simulation + rendering to a string.
// No terminal I/O here — bin/clawd.js owns the screen and keyboard.

import { COLORS, RESET } from './ansi.js';
import { CACTI, FLYERS, CLOUDS, CRAB, TITLE, SUBTITLE } from './sprites.js';

const CRAB_X = 5;          // crab's fixed screen column
const GRAVITY = 52;        // rows / s^2
const JUMP_VY = 21;        // rows / s  (apex ≈ 4.2 rows, hang ≈ 0.8 s)
const FASTFALL = 2.4;      // gravity multiplier while fast-falling (↓ in air)
const DUCK_TIME = 0.5;     // s per duck press
const JUMP_BUFFER = 0.12;  // s — a jump pressed this soon before landing still fires
const DEATH_COOLDOWN = 0.5;
const NIGHT_EVERY = 2400;  // distance cols per day/night phase
const MAX_PARTICLES = 160;

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

// Smooth value noise in [0,1] — rolling hills / dunes.
function smoothNoise(x) {
  const xi = Math.floor(x), f = x - xi;
  const a = (hash2(xi, 7) % 1000) / 1000, b = (hash2(xi + 1, 7) % 1000) / 1000;
  const u = f * f * (3 - 2 * f);
  return a * (1 - u) + b * u;
}

export class Engine {
  constructor({ width = 80, height = 20, seed = (Date.now() % 2 ** 31) | 0, hi = 0 } = {}) {
    this.seed = seed;
    this.hi = hi;
    this.mode = 'title';
    this.t = 0;
    this.runCount = 0;
    this.resize(width, height);
    this._initRun();
  }

  resize(width, height) {
    this.W = Math.max(60, Math.min(120, width));
    this.H = Math.max(15, Math.min(30, height));
    this.groundRow = this.H - 2;
    this.grid = Array.from({ length: this.H }, () => new Array(this.W).fill(' '));
    this.col = Array.from({ length: this.H }, () => new Array(this.W).fill(''));
  }

  _initRun() {
    this.runCount += 1;
    this.rng = mulberry32(this.seed + this.runCount);          // gameplay (spawns)
    this.vrng = mulberry32((this.seed ^ 0x9e3779b9) + this.runCount); // visuals (particles)
    this.dist = 0;
    this.speed = 17;
    this.y = 0;        // rows above ground
    this.vy = 0;
    this.duckT = 0;
    this.fastFall = false;
    this.jumpBufferT = 0;
    this.dustT = 0;
    this.obstacles = [];
    this.particles = [];
    this.spawnIn = 38 + this.rng() * 26;
    this.deadT = 0;
    this.paused = false;
    this.newBest = false;
    this.flashT = 0;
    this.shakeT = 0;
    this.popupT = 0;
    this.popupMsg = '';
    this.lastHundred = 0;
  }

  get score() { return Math.floor(this.dist / 5); }
  get night() { return Math.floor(this.dist / NIGHT_EVERY) % 2 === 1; }
  get difficulty() { return Math.min(1, this.dist / 2600); } // 0 → 1 over the first ~2.6k

  // --- input --------------------------------------------------------------

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
      if (this.y === 0) this._jump();
      else this.jumpBufferT = JUMP_BUFFER;   // buffered: fires the instant we land
      return;
    }
    if (action === 'duck' && this.mode === 'run' && !this.paused) {
      if (this.y === 0) this.duckT = DUCK_TIME;
      else this.fastFall = true;             // in the air → slam down
    }
  }

  _jump() {
    this.vy = JUMP_VY;
    this.duckT = 0;
    this.fastFall = false;
    for (let i = 0; i < 3; i++) {
      this._emit(CRAB_X + 2 + this.vrng() * 5, 0, -2 - this.vrng() * 5, 0.5, 0.25, '·', 't', 8);
    }
  }

  _land(speed) {
    const n = Math.min(7, 2 + Math.floor(speed / 4));
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this._emit(CRAB_X + 3 + this.vrng() * 5, 0, dir * (3 + this.vrng() * 7), 1 + this.vrng() * 2,
        0.3 + this.vrng() * 0.2, '·', 't', 13);
    }
  }

  // --- simulation ---------------------------------------------------------

  tick(dt) {
    this.t += dt;
    this._updateParticles(dt);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.popupT > 0) this.popupT -= dt;

    if (this.mode === 'dead') { this.deadT += dt; return; }
    if (this.mode !== 'run' || this.paused) return;

    // smooth speed ramp: 17 → ~48 cols/s, no kink
    this.speed = 17 + 31 * (this.dist / (this.dist + 1400));
    this.dist += this.speed * dt;
    if (this.flashT > 0) this.flashT -= dt;

    const hundred = Math.floor(this.score / 100);
    if (hundred > this.lastHundred) {
      this.lastHundred = hundred;
      this.flashT = 0.6;
      this.popupT = 1.0;
      this.popupMsg = `${hundred * 100} — keep scuttling!`;
    }

    // vertical physics, with fast-fall + landing detection
    if (this.vy !== 0 || this.y > 0) {
      const wasAir = this.y > 0;
      const grav = this.fastFall ? GRAVITY * FASTFALL : GRAVITY;
      this.vy -= grav * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) {
        const impact = -this.vy;
        this.vy = 0;
        this.fastFall = false;
        if (wasAir) this._land(impact);
        if (this.jumpBufferT > 0) this._jump();   // chain off a buffered press
      }
    }
    this.jumpBufferT = Math.max(0, this.jumpBufferT - dt);
    if (this.duckT > 0) this.duckT -= dt;

    // kick up dust while running on the ground
    this.dustT -= dt;
    if (this.y === 0 && this.dustT <= 0) {
      this.dustT = 0.07;
      const ch = ['·', '∙', '˙', '•'][Math.floor(this.vrng() * 4)];
      this._emit(CRAB_X + 1 + this.vrng() * 2, 0, -this.speed * 0.45 - this.vrng() * 4,
        1.2 + this.vrng() * 2, 0.3 + this.vrng() * 0.25, ch, 't', 9);
    }
    // occasional shooting star at night
    if (this.night && this.vrng() < 0.012) {
      this._emit(this.W * 0.5 + this.vrng() * this.W * 0.5, this.H - 5, -32 - this.vrng() * 16,
        -9 - this.vrng() * 7, 0.5, '╲', 'W', 0);
    }

    // obstacles scroll left; flyers beat forward faster than the ground scrolls
    for (const ob of this.obstacles) ob.x -= this.speed * (ob.speedMul || 1) * dt;
    // ...but a fast flyer must never overtake into an obstacle ahead of it — keep
    // at least a jump-and-recover gap so you never have to jump and duck at once.
    const safe = (2 * JUMP_VY / GRAVITY) * this.speed + 8;
    for (const ob of this.obstacles) {
      if (ob.kind !== 'flyer') continue;
      let bound = -Infinity;
      for (const other of this.obstacles) {
        if (other !== ob && other.x < ob.x) bound = Math.max(bound, other.x + other.w + safe);
      }
      if (ob.x < bound) ob.x = bound;
    }
    this.obstacles = this.obstacles.filter((ob) => ob.x > -8);

    this.spawnIn -= this.speed * dt;
    if (this.spawnIn <= 0) this._spawn();

    if (this._collides()) {
      this.mode = 'dead';
      this.deadT = 0;
      this.shakeT = 0.4;
      for (let i = 0; i < 22; i++) {
        const a = this.vrng() * Math.PI * 2;
        this._emit(CRAB_X + 5, 2, Math.cos(a) * (6 + this.vrng() * 16), 6 + this.vrng() * 10,
          0.5 + this.vrng() * 0.4, this.vrng() < 0.5 ? '▪' : '●', this.vrng() < 0.5 ? 'O' : 'o', 17);
      }
      if (this.score > this.hi) { this.hi = this.score; this.newBest = true; }
    }
  }

  _spawn() {
    const d = this.difficulty;
    // tier unlocks are spread out so difficulty never spikes all at once
    const tierMax = this.dist < 350 ? 0 : this.dist < 850 ? 1 : this.dist < 1500 ? 2 : 3;
    const pool = CACTI.filter((c) => c.tier <= tierMax);
    const canFly = this.dist > 550;
    let groupW = 0;
    let groupH = 1;

    if (canFly && this.rng() < 0.28) {
      // flying enemy — big bird is rare and late
      const idx = (this.dist > 1400 && this.rng() < 0.22) ? 2 : (this.rng() < 0.5 ? 0 : 1);
      const f = FLYERS[idx];
      const fly = this.rng() < 0.5 ? 0 : 2;        // 0 = must jump, 2 = must duck
      // flyers actively close in on the crab — a little faster than the ground
      this.obstacles.push({ kind: 'flyer', x: this.W + 3, fly, f, w: f.w, h: 1, speedMul: 1.3 });
      groupW = f.w;
    } else {
      const c = pool[Math.floor(this.rng() * pool.length)];
      this.obstacles.push({ kind: 'cactus', x: this.W + 3, c, w: c.w, h: c.h });
      groupW = c.w;
      groupH = c.h;
      // late-game combo: a second short cactus close enough to clear in one jump
      if (d > 0.5 && c.h <= 2 && this.rng() < 0.32) {
        const shortPool = pool.filter((p) => p.h <= 2);
        const c2 = shortPool[Math.floor(this.rng() * shortPool.length)];
        const gap = 2 + Math.floor(this.rng() * 2);
        this.obstacles.push({ kind: 'cactus', x: this.W + 3 + c.w + gap, c: c2, w: c2.w, h: c2.h });
        groupW += gap + c2.w;
        groupH = Math.max(groupH, c2.h);
      }
    }

    // Schedule the next spawn so the gap is always *reachable*. Tall obstacles
    // need an earlier launch, so they get extra setup room; slack keeps a floor
    // of breathing space even at max difficulty so a sharp player can always win.
    const jumpCols = (2 * JUMP_VY / GRAVITY) * this.speed;
    const tall = groupH >= 3 ? jumpCols * 0.22 : 0;
    const minGap = Math.max(16, jumpCols * 0.6) + tall;
    const slack = Math.max(10, jumpCols * (1.5 - d));
    this.spawnIn = groupW + minGap + this.rng() * slack;
  }

  _collides() {
    const ducking = this.duckT > 0 && this.y === 0;
    const crabLo = Math.round(this.y);
    const crabHi = crabLo + (ducking ? 1 : 2); // forgiving: only the lower body counts
    const cx0 = CRAB_X + 2, cx1 = CRAB_X + 8;
    for (const ob of this.obstacles) {
      const ox0 = ob.x + 0.4, ox1 = ob.x + ob.w - 0.4;
      if (ox1 < cx0 || ox0 > cx1) continue;
      const flying = ob.kind !== 'cactus';
      const oLo = flying ? ob.fly : 0;
      const oHi = flying ? ob.fly + (ob.h - 1) : ob.h - 1;
      if (oHi >= crabLo && oLo <= crabHi) return true;
    }
    return false;
  }

  // --- particles ----------------------------------------------------------

  _emit(x, y, vx, vy, life, char, color, g = 10) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life, max: life, char, color, g });
  }

  _updateParticles(dt) {
    if (!this.particles.length) return;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= p.g * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // --- rendering ----------------------------------------------------------

  _blank() {
    for (let r = 0; r < this.H; r++) {
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
        if (gx < 0 || gx >= this.W || gy < 0 || gy >= this.H) continue;
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
    this._text(Math.floor((this.W - str.length) / 2), y, str, colorKey);
  }

  _drawStars() {
    if (!this.night) return;
    const phase = Math.floor(this.dist / NIGHT_EVERY);
    for (let r = 1; r < this.groundRow - 6; r++) {
      for (let c = 0; c < this.W; c++) {
        const h = hash2(c + phase * 31, r);
        if (h % 47 === 0) { this.grid[r][c] = '·'; this.col[r][c] = 'S'; }
        else if (h % 199 === 0) { this.grid[r][c] = '*'; this.col[r][c] = 'S'; }
      }
    }
  }

  // A subtle, slow-scrolling dune crest on the horizon — one row, well above
  // the crab so the busy block sprites never fight the background.
  _drawHills() {
    const row = this.groundRow - 6;
    if (row < 2) return;
    const blocks = ' ▁▂▃▄▅';
    const key = this.night ? 'S' : 'E';
    for (let c = 0; c < this.W; c++) {
      const n = smoothNoise(c * 0.11 + this.dist * 0.012 + 100); // 0..1
      this.grid[row][c] = blocks[1 + Math.round(n * 4)];
      this.col[row][c] = key;
    }
  }

  _drawCelestial() {
    const cx = Math.floor(this.W * 0.7);
    if (this.night) this._put(cx + 1, 1, ['☾'], 'W');
    else this._put(cx, 1, [' ▄▄ ', '████', ' ▀▀ '], 'y');
  }

  _drawClouds() {
    const span = this.W + 24;
    for (let i = 0; i < 5; i++) {
      const shape = CLOUDS[i % CLOUDS.length];
      const far = i < 3;
      const speed = far ? 0.18 : 0.42;
      const x = this.W - (((this.dist * speed) + i * 53) % span) + 8;
      const yy = far ? 2 + (i % 2) : 1 + (i % 2) * 2;
      this._put(x, yy, shape, far ? 'D' : 'c');
    }
  }

  _drawParticles() {
    for (const p of this.particles) {
      const gx = Math.round(p.x), gy = this.groundRow - Math.round(p.y);
      if (gx < 0 || gx >= this.W || gy < 0 || gy >= this.H) continue;
      this.grid[gy][gx] = p.char;
      this.col[gy][gx] = (p.color === 't' && p.life < p.max * 0.4) ? 'D' : p.color;
    }
  }

  render({ color = true } = {}) {
    this._blank();
    const night = this.night;

    this._drawStars();
    this._drawHills();
    this._drawClouds();
    this._drawCelestial();

    // ground line, scrolling pebble pattern
    const g = this.grid[this.groundRow], gc = this.col[this.groundRow];
    for (let c = 0; c < this.W; c++) {
      const h = hash2(c + Math.floor(this.dist), 11);
      g[c] = h % 13 === 0 ? '╌' : '▔';
      gc[c] = night ? 'S' : 'D';
    }

    // obstacles
    for (const ob of this.obstacles) {
      if (ob.kind === 'cactus') {
        this._put(ob.x, this.groundRow - ob.c.h, ob.c.rows, night ? 'g' : ob.c.color);
      } else {
        const f = ob.f || FLYERS[0];
        const frame = f.frames[Math.floor(this.t * 11) % f.frames.length];
        this._put(ob.x, this.groundRow - 1 - ob.fly, [frame], f.color);
      }
    }

    // the runner - orange Clawd
    const C = CRAB;
    const ducking = this.duckT > 0 && this.y === 0 && this.mode === 'run';
    let art;
    if (this.mode === 'dead') art = C.dead;
    else if (ducking) art = Math.floor(this.t * 8) % 2 ? C.duckA : C.duckB;
    else if (this.y > 0) art = C.jump;
    else art = Math.floor(this.dist / 4) % 2 ? C.runA : C.runB;
    const crabTop = this.groundRow - Math.round(this.y) - art.length;
    this._put(CRAB_X, crabTop, art, C.color, C.accent);

    this._drawParticles();

    // HUD
    const hudColor = this.flashT > 0 ? 'Y' : 'D';
    const hud = `HI ${String(this.hi).padStart(5, '0')}  ${String(this.score).padStart(5, '0')}`;
    this._text(this.W - hud.length - 1, 0, hud, hudColor);
    this._text(1, 0, 'CLAWD RUNNER', 'o');

    if (this.popupT > 0 && this.mode === 'run') this._center(2, this.popupMsg, 'Y');

    if (this.mode === 'title') {
      this._center(Math.floor(this.H / 2) - 3, TITLE, 'B');
      this._center(Math.floor(this.H / 2) - 1, SUBTITLE, 'D');
      this._center(Math.floor(this.H / 2) + 1, 'SPACE jump · ↓ duck/dive · P pause · Q quit', 'W');
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
    this._text(1, this.H - 1, 'SPACE jump   ↓/S duck·dive   P pause   R restart   Q quit', 'D');

    // screen shake — shift the whole composed frame by a couple cells on death
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      const mag = Math.min(2, this.shakeT * 6);
      ox = Math.round(Math.sin(this.t * 63) * mag);
      oy = Math.round(Math.cos(this.t * 47) * mag * 0.5);
    }

    // flush grid -> string
    const out = [];
    for (let r = 0; r < this.H; r++) {
      const sr = r - oy;
      let line = '', cur = '';
      for (let c = 0; c < this.W; c++) {
        const sc = c - ox;
        const inb = sr >= 0 && sr < this.H && sc >= 0 && sc < this.W;
        const ch = inb ? this.grid[sr][sc] : ' ';
        const key = color && inb ? this.col[sr][sc] : '';
        if (key !== cur) {
          line += cur ? RESET : '';
          line += key ? COLORS[key] : '';
          cur = key;
        }
        line += ch;
      }
      if (cur) line += RESET;
      out.push(line);
    }
    return out.join('\n');
  }
}
