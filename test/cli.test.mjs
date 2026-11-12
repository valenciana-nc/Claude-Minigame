// Headless CLI tests for bin/clawd.js (snapshot mode + arg handling).
// Snapshot mode runs without a TTY, so it can be exercised with spawnSync.
// Run: npm test
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'clawd.js');

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

function run(args, env = {}) {
  // A 9999-frame snapshot run prints ~15 MB; spawnSync's 1 MB default
  // maxBuffer would kill it, so allow plenty of headroom.
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
}

function frameCount(out) {
  return out.split('\n').filter((l) => l.startsWith('--- frame')).length;
}

test('--snapshot=2 prints 2 frames (equals form)', () => {
  const r = run(['--snapshot=2', '--plain', '--seed', '7']);
  assert.equal(r.status, 0, 'the --flag=value form must reach snapshot mode');
  assert.equal(frameCount(r.stdout), 2, 'expected the 2 requested frames');
});

test('--seed=7 matches --seed 7 output', () => {
  const a = run(['--snapshot', '2', '--plain', '--seed=7']);
  const b = run(['--snapshot', '2', '--plain', '--seed', '7']);
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout, 'both spellings must seed the same run');
});

test('--skin=claude snapshot renders the cloud skin', () => {
  // '▟' only appears in the cloud sprite's rounded corners, never in the
  // crab or the scenery, so it distinguishes the skins in plain mode.
  const claude = run(['--snapshot', '1', '--plain', '--seed', '7', '--skin=claude']);
  const clawd = run(['--snapshot', '1', '--plain', '--seed', '7']);
  assert.equal(claude.status, 0);
  assert.ok(claude.stdout.includes('▟'), 'claude skin must render its cloud sprite');
  assert.ok(!clawd.stdout.includes('▟'), 'default skin must stay the crab');
});

test('a poisoned hi file falls back to 0 instead of printing Infinity or junk in the HUD', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-hi-'));
  try {
    for (const bad of ['{"hi": 1e400}', '{"hi": "abc"}', '{"hi": -5}']) {
      fs.writeFileSync(path.join(home, '.claude-minigame.json'), bad);
      const r = run(['--snapshot', '1', '--every', '1', '--plain', '--seed', '7'], { HOME: home });
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('HI 00000'), `poisoned hi ${bad} must fall back to HI 00000`);
      assert.ok(!r.stdout.includes('Infinity') && !r.stdout.includes('abc'), 'no poisoned value may reach the HUD');
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('--every larger than the tick budget still prints every requested frame', () => {
  const r = run(['--snapshot', '2', '--every', '99999', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 2, 'a wild --every must not swallow the frames');
});

test('--snapshot 500 --every 25 prints all 500 frames, not just the 400 that fit the old budget', () => {
  const r = run(['--snapshot', '500', '--every', '25', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 500);
});

test('a huge piped snapshot run prints every frame instead of losing its tail', () => {
  // process.exit() used to truncate buffered stdout when piped: this
  // printed a random 1253–5482 of 9999 frames. 20000 asks for more than
  // the 9999-frame cap, so all 9999 must arrive.
  const r = run(['--snapshot', '20000', '--every', '25', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 9999, 'piped output must not be truncated by process.exit()');
});

test('--snapshot abc falls back to the default 8 frames instead of printing nothing', () => {
  const r = run(['--snapshot', 'abc', '--plain', '--seed', '7']);
  assert.equal(r.status, 0, 'garbage --snapshot must still exit 0');
  assert.equal(frameCount(r.stdout), 8, 'expected the default 8 frames');
});

test('--snapshot 0 falls back to the default instead of printing nothing', () => {
  const r = run(['--snapshot', '0', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 8);
});

test('--every 0 falls back to the default interval', () => {
  const r = run(['--snapshot', '2', '--every', '0', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 2, 'both requested frames must still print');
});

test('snapshot runs are deterministic for a fixed seed', () => {
  const a = run(['--snapshot', '3', '--plain', '--seed', '7']);
  const b = run(['--snapshot', '3', '--plain', '--seed', '7']);
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout, 'same seed must render byte-identical frames');
});

test('--help exits 0 and names the game', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('Clawd Runner'), 'help should name the game');
});

test('interactive mode without a TTY exits 1 with a clear message', () => {
  const r = run([]);
  assert.equal(r.status, 1, 'piped stdin/stdout is not a terminal');
  assert.ok(r.stderr.includes('needs a real terminal'), 'should explain why it refused');
});

console.log(`\n${passed} tests passed 🖥️`);
