#!/usr/bin/env node
// Clawd Runner — terminal CLI. `claude-run` to play, ctrl+click the crab in your
// Claude Code statusline to launch (see tools/ for the clawd:// protocol setup).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../src/engine.js';
import { sanitizeHi } from '../src/util.js';
import { botAction } from '../src/bot.js';
import { createKeyHandler } from '../src/input.js';
import { altScreenOn, altScreenOff, clear, setTitle, diffRows, syncFrame } from '../src/ansi.js';

const APP_TITLE = 'Claude Runner';

const args = process.argv.slice(2).filter((a) => !a.startsWith('clawd://'));
if (args[0] === 'run') args.shift();
// A flag may be spelled `--name value` or `--name=value`. The `=` form
// used to be silently ignored: `--snapshot=8` fell through to interactive
// mode, `--seed=7` played a random run, `--skin=claude` stayed the crab.
const flag = (name) => args.some((a) => a === name || a.startsWith(name + '='));
const opt = (name, dflt) => {
  const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return dflt;
  if (args[i].startsWith(name + '=')) {
    const v = args[i].slice(name.length + 1);
    return v ? v : dflt;
  }
  return args[i + 1] ? args[i + 1] : dflt;
};

if (flag('--help') || flag('-h')) {
  console.log(`Clawd Runner — the unofficial Claude Code minigame

  claude-run                play
  claude-run --snapshot N   render N frames of a bot run as plain text (debug/CI)
  claude-run --seed S       deterministic run
  claude-run --skin claude  play as the Claude Code cloud instead of the crab
  claude-run --plain        no colors

  legacy: clawd run also works

  keys: SPACE/↑ jump · ↓/S duck (dive in mid-air) · P pause · R restart · Q quit · ^Z suspend`);
  process.exit(0);
}

const HI_FILE = path.join(os.homedir(), '.claude-minigame.json');
function loadHi() {
  try {
    const hi = JSON.parse(fs.readFileSync(HI_FILE, 'utf8')).hi;
    // sanitizeHi() (src/util.js) is the shared guard, also used by the
    // Engine constructor: only a finite non-negative number is a high
    // score; anything else starts at 0.
    return sanitizeHi(hi);
  } catch { return 0; }
}
function saveHi(hi) {
  try { fs.writeFileSync(HI_FILE, JSON.stringify({ hi })); } catch { /* shrug */ }
}

const seed = Number(opt('--seed', Date.now() % 2 ** 31));
const skin = String(opt('--skin', 'clawd')).toLowerCase() === 'claude' ? 'claude' : 'clawd';

// ---------- snapshot mode: headless bot run, prints frames ----------
if (flag('--snapshot')) {
  // A numeric flag with garbage/zero/negative input (--snapshot abc, --every 0)
  // used to make the print loop exit 0 having printed nothing: NaN and 0 both
  // fail the loop condition from the start. Coerce to a positive integer,
  // falling back to the default, so a typo still shows a run.
  const positiveInt = (raw, dflt) => {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : dflt;
  };
  const frames = positiveInt(opt('--snapshot', 8), 8);
  const game = new Engine({ width: 78, height: 18, seed, hi: loadHi(), skin });
  game.input('jump'); // leave title screen
  const dt = 1 / 30;
  let printed = 0, ticks = 0;
  // The print loop below is capped at MAX_TICKS so a wild --every can't
  // hang the run — but that cap used to silently swallow the request:
  // --every 99999 printed nothing and --snapshot 500 --every 25 printed
  // only 400 frames, both exiting 0. Clamp both knobs so the requested
  // frames always fit inside the tick budget.
  const MAX_TICKS = 10000;
  const printEvery = Math.min(
    positiveInt(opt('--every', 25), 25),
    Math.max(1, Math.floor((MAX_TICKS - 1) / frames)),
  );
  const frameBudget = Math.min(frames, MAX_TICKS - 1);
  while (printed < frameBudget && ticks < MAX_TICKS) {
    // The bot decides the press; the loop just feeds it to the sim.
    const action = botAction(game);
    if (action) game.input(action);
    game.tick(dt);
    if (++ticks % printEvery === 0) {
      printed++;
      // Synchronous writes: console.log() to a pipe is async, so the
      // process.exit(0) below used to truncate a big run's tail (a piped
      // --snapshot 20000 printed a random 1253–7197 of 9999 frames, and an
      // async drain-wait can't work here — execution would fall through
      // into interactive mode before the callback fires). writeSync
      // completes before returning, so the exit can't cut output short.
      // A closed pipe (e.g. `| head`) makes writeSync throw EPIPE — Node
      // ignores SIGPIPE, so the classic silent death never happens and the
      // run instead dies with a stack trace. Exit quietly, like any Unix
      // filter would; anything else still throws.
      try {
        fs.writeSync(1, `--- frame ${ticks} score=${game.score} mode=${game.mode} y=${game.y.toFixed(1)} obstacles=${game.obstacles.length}\n${game.render({ color: !flag('--plain') })}\n`);
      } catch (err) {
        if (err && err.code === 'EPIPE') process.exit(0);
        throw err;
      }
    }
  }
  process.exit(0);
}

// ---------- interactive mode ----------
if (!process.stdout.isTTY || !process.stdin.isTTY) {
  console.error('clawd needs a real terminal (try running it directly, not piped).');
  process.exit(1);
}
// The engine clamps to a 60x15 minimum, so on a smaller terminal the
// 60-wide frame wraps every line into unreadable garbage — unplayable,
// and no clearer than a crash. Refuse up front with the size needed. A
// 0x0 size (a pty that reports nothing yet, e.g. under `script`) is
// "unknown", not small: the resize event fixes it up when the terminal
// gets a real size, so only a real too-small size refuses.
const cols = process.stdout.columns, rows = process.stdout.rows;
if ((cols > 0 && cols < 61) || (rows > 0 && rows < 16)) {
  console.error(`clawd needs a bigger terminal — at least 61x16, yours is ${cols}x${rows}.`);
  process.exit(1);
}

const game = new Engine({
  width: process.stdout.columns - 1,
  height: process.stdout.rows - 1,
  seed,
  hi: loadHi(),
  skin,
});

process.title = APP_TITLE;

let savedHi = game.hi;
// Declared up here (not `const` at the bottom with the interval) so cleanup()
// never trips over the temporal dead zone if startup throws before the timer
// exists — the exit handler still has to restore the terminal then.
let timer = null;
let cleanedUp = false;
// Last frame actually written, as row strings: diffRows() skips the write
// when the new frame is identical, so the title screen and a paused game
// stop re-emitting the same rows 40x/s, and emit only the changed rows
// otherwise. Reset to null on resize — the clear below wipes the screen,
// so the next frame must be re-emitted even if identical.
let lastRows = null;
// Whether the frame on screen was rendered while the game was static
// (title/paused): the static skip below must not eat the first frame of
// a newly static state — pausing mid-run changes the screen to PAUSED,
// so the transition tick still renders and only later ticks skip.
let lastWasStatic = false;
// One place for the persistence rule, used both by the interval (death saves
// a beaten best promptly) and by cleanup (quit mid-run must not lose one).
function saveIfBeaten() {
  if (game.hi > savedHi) { savedHi = game.hi; saveHi(savedHi); }
}
function cleanup(msg = '') {
  if (cleanedUp) return;
  cleanedUp = true;
  saveIfBeaten();
  clearInterval(timer);
  // Terminal restore must never throw: cleanup() also runs from the
  // uncaught-exception path, and a throw there would strand the terminal
  // in raw mode on the alt screen a second time.
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { /* already gone */ }
  try { process.stdout.write(altScreenOff); } catch { /* stdout already broken */ }
  if (msg) console.log(msg);
}

// Registered before raw mode / the alt screen are entered, so a throw
// during startup still restores the terminal instead of stranding it.
process.on('exit', () => cleanup());
process.on('SIGINT', () => { cleanup(); process.exit(0); });
// SIGTERM / SIGHUP / SIGQUIT bypass the normal exit path, so without these
// the shell is left in raw mode on the alt screen. Restore the terminal
// explicitly, same as Ctrl+C does.
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGHUP', () => { cleanup(); process.exit(0); });
// Ctrl+\ (SIGQUIT) used to kill the process by default disposition, leaving
// the shell in raw mode on the alt screen. Restore first, like the rest.
process.on('SIGQUIT', () => { cleanup(); process.exit(0); });
// A throw inside the 40 fps loop (or anywhere else) used to do the same:
// die with the terminal unusable. Restore, report the error, exit 1.
process.on('uncaughtException', (err) => { cleanup(); console.error(err); process.exit(1); });

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdout.write(setTitle(APP_TITLE) + altScreenOn);

// ESC/arrow-key disambiguation lives in src/input.js: a lone ESC chunk is
// buffered briefly so a split arrow-key sequence can't quit the game mid-run.
const keys = createKeyHandler({
  onAction: (action) => {
    if (action === 'quit') {
      keys.cancel();
      cleanup(`thanks for playing! best: ${game.hi} — run \`claude-run\` anytime 🦀`);
      process.exit(0);
    }
    if (action === 'suspend') {
      // Ctrl+Z in raw mode arrives as a byte (ISIG is off, so the driver
      // never sends SIGTSTP itself): stop ourselves so the shell can take
      // the terminal back, and let SIGCONT bring the game back. Drop any
      // half-typed escape sequence first, or its timer would fire the
      // moment we resume and quit the game out from under the player.
      keys.cancel();
      try { process.stdin.setRawMode(false); } catch { /* already gone */ }
      process.stdout.write(altScreenOff);
      process.kill(process.pid, 'SIGTSTP');
      return;
    }
    game.input(action);
  },
});
process.stdin.on('data', (key) => keys.data(key));

process.stdout.on('resize', () => {
  game.resize(process.stdout.columns - 1, process.stdout.rows - 1);
  process.stdout.write(clear);
  lastRows = null;
});

process.stdin.on('error', () => { cleanup(); process.exit(0); });
// A dead stdout (terminal closed, output piped somewhere gone) must end
// the game, not leave it drawing into the void on a broken stream.
process.stdout.on('error', () => { cleanup(); process.exit(0); });

let last = Date.now();
// Resuming from Ctrl+Z: the shell sends SIGCONT on `fg`. Re-enter raw
// mode and the alt screen from scratch — the shell may have printed
// job-control noise on the main screen while we were stopped — and reset
// the clock so the first tick after resume is not a huge clamped step.
// Registered here, after `last` exists, rather than with the other
// signal handlers above: a SIGCONT can only arrive once the event loop
// is running, but there is no reason to lean on that.
process.on('SIGCONT', () => {
  try { process.stdin.setRawMode(true); } catch { /* stdin gone — the error handler exits */ }
  process.stdout.write(setTitle(APP_TITLE) + altScreenOn);
  lastRows = null;
  last = Date.now();
});
timer = setInterval(() => {
  const now = Date.now();
  // Clamp both ways: a backwards clock must not feed a negative step into
  // the sim (engine.tick also ignores those, this keeps `last` sane too).
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  game.tick(dt);
  if (game.mode === 'dead') saveIfBeaten();
  // A title or paused screen never changes between ticks (the engine pins
  // that with isFrameStatic), so composing it 40x/s is pure waste — the
  // diff would drop the identical frame anyway. Skip the render once the
  // static frame is on screen; lastRows === null after a resize or SIGCONT
  // means the screen was cleared and still needs its first frame, and
  // lastWasStatic === false means the state just became static (e.g. the
  // pause key was just pressed), so the transition frame still renders.
  if (game.isFrameStatic && lastRows !== null && lastWasStatic) return;
  const rows = game.renderRows();
  // Synchronized output (DEC 2026, src/ansi.js): a supporting terminal
  // paints the whole frame atomically instead of mid-write, so the 40 fps
  // redraw can't tear. Diffed-out frames emit nothing, markers included.
  process.stdout.write(syncFrame(diffRows(lastRows, rows)));
  lastRows = rows;
  lastWasStatic = game.isFrameStatic;
}, 25); // ~40 fps for smoother scrolling
