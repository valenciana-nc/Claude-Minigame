// Headless CLI tests for bin/clawd.js (snapshot mode + arg handling).
// Snapshot mode runs without a TTY, so it can be exercised with spawnSync.
// Run: npm test
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'clawd.js');

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
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
