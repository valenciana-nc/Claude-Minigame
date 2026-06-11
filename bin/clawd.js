#!/usr/bin/env node
// Clawd Runner — terminal CLI. `clawd` to play, ctrl+click the crab in your
// Claude Code statusline to launch (see tools/ for the clawd:// protocol setup).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../src/engine.js';
import { altScreenOn, altScreenOff, home, clear } from '../src/ansi.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('clawd://'));
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};

if (flag('--help') || flag('-h')) {
  console.log(`Clawd Runner — the unofficial Claude Code minigame

  clawd                play
  clawd --snapshot N   render N frames of a bot run as plain text (debug/CI)
  clawd --seed S       deterministic run
  clawd --plain        no colors

  keys: SPACE/↑ jump · ↓/S duck · P pause · R restart · Q quit`);
  process.exit(0);
}

const HI_FILE = path.join(os.homedir(), '.claude-minigame.json');
function loadHi() {
  try { return JSON.parse(fs.readFileSync(HI_FILE, 'utf8')).hi || 0; } catch { return 0; }
}
function saveHi(hi) {
  try { fs.writeFileSync(HI_FILE, JSON.stringify({ hi })); } catch { /* shrug */ }
}

const seed = Number(opt('--seed', Date.now() % 2 ** 31));

// ---------- snapshot mode: headless bot run, prints frames ----------
if (flag('--snapshot')) {
  const frames = Number(opt('--snapshot', 8));
  const game = new Engine({ width: 78, height: 18, seed, hi: loadHi() });
  game.input('jump'); // leave title screen
  const dt = 1 / 30;
  let printed = 0, ticks = 0;
  const printEvery = Number(opt('--every', 25));
  while (printed < frames && ticks < 10000) {
    // tiny bot: jump low stuff, ignore high bugs
    const next = game.obstacles.find((o) => o.x > 5);
    if (next && game.y === 0 && game.mode === 'run') {
      const eta = (next.x - 8) / game.speed;
      const low = next.kind !== 'bug' || next.fly <= 2;
      if (low && eta < 0.45) game.input('jump');
    }
    if (game.mode === 'dead' && game.deadT > 0.6) game.input('jump');
    game.tick(dt);
    if (++ticks % printEvery === 0) {
      printed++;
      console.log(`--- frame ${ticks} score=${game.score} mode=${game.mode} y=${game.y.toFixed(1)} obstacles=${game.obstacles.length}`);
      console.log(game.render({ color: !flag('--plain') }));
    }
  }
  process.exit(0);
}

// ---------- interactive mode ----------
if (!process.stdout.isTTY || !process.stdin.isTTY) {
  console.error('clawd needs a real terminal (try running it directly, not piped).');
  process.exit(1);
}

const game = new Engine({
  width: process.stdout.columns - 1,
  height: process.stdout.rows - 1,
  seed,
  hi: loadHi(),
});

let savedHi = game.hi;
let cleanedUp = false;
function cleanup(msg = '') {
  if (cleanedUp) return;
  cleanedUp = true;
  clearInterval(timer);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write(altScreenOff);
  if (msg) console.log(msg);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdout.write(altScreenOn);

process.stdin.on('data', (key) => {
  if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') {
    cleanup(`thanks for playing! best: ${game.hi} — run \`clawd\` anytime 🦀`);
    process.exit(0);
  }
  if (key === ' ' || key === '\x1b[A' || key === 'w' || key === 'W') game.input('jump');
  else if (key === '\x1b[B' || key === 's' || key === 'S') game.input('duck');
  else if (key === 'p' || key === 'P') game.input('pause');
  else if (key === 'r' || key === 'R') game.input('restart');
});

process.stdout.on('resize', () => {
  game.resize(process.stdout.columns - 1, process.stdout.rows - 1);
  process.stdout.write(clear);
});

process.on('exit', () => cleanup());
process.on('SIGINT', () => { cleanup(); process.exit(0); });

let last = Date.now();
const timer = setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.06, (now - last) / 1000);
  last = now;
  game.tick(dt);
  if (game.hi > savedHi && game.mode === 'dead') { savedHi = game.hi; saveHi(savedHi); }
  process.stdout.write(home + game.render());
}, 33);
