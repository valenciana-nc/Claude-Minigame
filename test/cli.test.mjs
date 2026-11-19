// Headless CLI tests for bin/clawd.js (snapshot mode + arg handling).
// Snapshot mode runs without a TTY, so it can be exercised with spawnSync.
// Run: npm test
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

test('a saved hi displays in the HUD instead of starting at 0', () => {
  // The poisoned-hi test pins the fallback; nothing pinned the happy
  // path — a real saved best actually reaching the HUD.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-hi-'));
  try {
    fs.writeFileSync(path.join(home, '.claude-minigame.json'), '{"hi": 123}');
    const r = run(['--snapshot', '1', '--every', '1', '--plain', '--seed', '7'], { HOME: home });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('HI 00123'), 'a saved hi of 123 must show as HI 00123');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('malformed hi JSON and a missing hi file both fall back to 0', () => {
  // loadHi() catches JSON.parse failures and read failures; the bad-value
  // cases were covered, but a truncated file or a first run (no file at
  // all) took the same catch path with no test on it.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-hi-'));
  try {
    fs.writeFileSync(path.join(home, '.claude-minigame.json'), '{"hi": ');
    const bad = run(['--snapshot', '1', '--every', '1', '--plain', '--seed', '7'], { HOME: home });
    assert.equal(bad.status, 0);
    assert.ok(bad.stdout.includes('HI 00000'), 'malformed hi JSON must fall back to HI 00000');
    fs.rmSync(path.join(home, '.claude-minigame.json'));
    const missing = run(['--snapshot', '1', '--every', '1', '--plain', '--seed', '7'], { HOME: home });
    assert.equal(missing.status, 0);
    assert.ok(missing.stdout.includes('HI 00000'), 'a missing hi file must fall back to HI 00000');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('legacy `run` form still reaches snapshot mode', () => {
  const r = run(['run', '--snapshot', '2', '--plain', '--seed', '7']);
  assert.equal(r.status, 0, 'the legacy `clawd run` spelling must not fall through to interactive mode');
  assert.equal(frameCount(r.stdout), 2);
});

test('a garbage --seed still prints frames instead of crashing', () => {
  // Number('abc') is NaN, which mulberry32 coerces via `>>> 0`; the run
  // must stay playable (deterministic seed 0) rather than die.
  const r = run(['--snapshot', '2', '--plain', '--seed', 'abc']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 2);
});

test('snapshot without --plain carries ANSI escapes', () => {
  // Color-by-default was only asserted at the Engine level; nothing
  // checked the CLI actually emits color when --plain is absent.
  const r = run(['--snapshot', '1', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('\x1b['), 'default snapshot output must carry ANSI codes');
});

test('a clawd:// protocol arg is ignored', () => {
  // The protocol launcher can pass `clawd://play` as an argument; the
  // filter must drop it instead of letting it confuse flag parsing.
  const r = run(['clawd://play', '--snapshot', '2', '--plain', '--seed', '7']);
  assert.equal(r.status, 0);
  assert.equal(frameCount(r.stdout), 2);
});

test('-h exits 0 and names the game', () => {
  const r = run(['-h']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('Clawd Runner'), 'short help should name the game');
});

test('an unknown --skin stays the crab', () => {
  const r = run(['--snapshot', '1', '--plain', '--seed', '7', '--skin=banana']);
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('▟'), 'an unknown skin must fall back to the crab, not crash');
});

// --- interactive-mode tests under a real pty ---------------------------------
// `script` (util-linux) gives the game a pty, so signals and keypresses can
// be exercised the way a real terminal delivers them. If `script` is absent
// (or its flags differ, e.g. BSD script), these tests skip instead of failing.
const hasScript = (() => {
  try {
    return spawnSync('script', ['-qec', 'true', '/dev/null'], { encoding: 'utf8' }).status === 0;
  } catch { return false; }
})();

async function waitFor(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function testAsync(name, fn) {
  await fn();
  console.log('  ok - ' + name);
  passed++;
}

// Run the game in the foreground under `script`, with the game pid written
// to a file: `exec` makes node take over the shell's pid, so the file holds
// the game's pid. (A backgrounded game would lose its tty stdin — sh
// redirects a background job's stdin from /dev/null — so no `&` + `wait`.)
async function runPty({ setup = '', act }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-pty-'));
  const pidFile = path.join(dir, 'pid');
  const child = spawn('script', ['-qec', `${setup}echo $$ > ${pidFile}; exec node ${CLI}`, '/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString('utf8'); });
  child.stderr.on('data', (d) => { out += d.toString('utf8'); });
  try {
    const started = await waitFor(() => out.includes('\x1b[?1049h') && fs.existsSync(pidFile));
    assert.ok(started, 'the game must enter the alt screen under the pty');
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    await act(child, pid);
    const exited = await waitFor(() => child.exitCode !== null || child.signalCode !== null, 5000);
    assert.ok(exited, 'the game must exit after the action');
    return { status: child.exitCode, signal: child.signalCode, out };
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (hasScript) {
  await testAsync('Ctrl+\\ (SIGQUIT) restores the terminal instead of stranding it', async () => {
    const r = await runPty({ act: async (child, pid) => { process.kill(pid, 'SIGQUIT'); } });
    assert.equal(r.status, 0, 'SIGQUIT must exit cleanly, not 131 by default disposition');
    assert.ok(r.out.includes('\x1b[?1049l'), 'cleanup must leave the alt screen on SIGQUIT');
  });

  await testAsync('Q quits cleanly under a pty at 100x30', async () => {
    const r = await runPty({
      setup: 'stty cols 100 rows 30; ',
      act: async (child) => { child.stdin.write('q'); },
    });
    assert.equal(r.status, 0, 'Q must exit 0 under the pty');
    assert.ok(r.out.includes('thanks for playing'), 'quit must print the goodbye line');
    assert.ok(r.out.includes('\x1b[?1049l'), 'cleanup must leave the alt screen on quit');
  });
} else {
  console.log('  -- pty tests skipped: `script` unavailable');
}

await testAsync('a snapshot piped to a closed reader exits 0 with no stack trace', async () => {
  const child = spawn(process.execPath, [CLI, '--snapshot', '9999', '--every', '1', '--plain', '--seed', '7'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d.toString('utf8'); });
  // Close the read end as soon as output starts flowing: the next
  // writeSync must hit EPIPE instead of blocking forever on a dead pipe.
  child.stdout.once('data', () => { child.stdout.destroy(); });
  const exited = await waitFor(() => child.exitCode !== null || child.signalCode !== null, 10000);
  assert.ok(exited, 'the snapshot run must exit after its pipe closes');
  assert.equal(child.exitCode, 0, 'a closed pipe must exit 0, not crash with EPIPE');
  assert.ok(!err.includes('Error'), 'no stack trace may leak to stderr: ' + err.slice(0, 200));
  if (child.exitCode === null) child.kill('SIGKILL');
});

test('a terminal smaller than 61x16 is refused with a clear message', () => {
  if (!hasScript) { console.log('  -- skipped: `script` unavailable'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-small-'));
  const transcript = path.join(dir, 'typescript');
  try {
    const r = spawnSync('script', ['-qec', `stty cols 40 rows 10; node ${CLI}`, transcript], { encoding: 'utf8' });
    assert.equal(r.status, 1, 'a 40x10 terminal must exit 1, not start a wrapped mess');
    const text = fs.readFileSync(transcript, 'utf8');
    assert.ok(text.includes('bigger terminal'), 'must explain the terminal is too small');
    assert.ok(text.includes('40x10'), 'must report the actual size');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} tests passed 🖥️`);
