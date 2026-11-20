// Tests for the snapshot bot in src/bot.js. Run: npm test
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { botAction } from '../src/bot.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

function runningGame() {
  const g = new Engine({ width: 80, height: 20, seed: 7 });
  g.input('jump'); // leave the title screen
  return g;
}

test('an empty track needs no input', () => {
  assert.equal(botAction(runningGame()), null);
});

test('a close cactus makes the bot jump', () => {
  const g = runningGame();
  g.obstacles.push({ kind: 'cactus', x: 12, w: 3, h: 2 });
  assert.equal(botAction(g), 'jump');
});

test('a far cactus is ignored until it arrives', () => {
  const g = runningGame();
  g.obstacles.push({ kind: 'cactus', x: 60, w: 3, h: 2 });
  assert.equal(botAction(g), null);
});

test('a low flyer makes the bot jump, a mid flyer makes it duck', () => {
  const low = runningGame();
  low.obstacles.push({ kind: 'flyer', x: 12, w: 5, h: 1, fly: 0, speedMul: 1.3 });
  assert.equal(botAction(low), 'jump');
  const mid = runningGame();
  mid.obstacles.push({ kind: 'flyer', x: 12, w: 5, h: 1, fly: 2, speedMul: 1.3 });
  assert.equal(botAction(mid), 'duck');
});

test('the bot does nothing while airborne or on the title screen', () => {
  const air = runningGame();
  air.y = 3;
  air.obstacles.push({ kind: 'cactus', x: 12, w: 3, h: 2 });
  assert.equal(botAction(air), null, 'no double-jump while in the air');
  assert.equal(botAction(new Engine({ width: 80, height: 20, seed: 7 })), null, 'title screen');
});

test('the bot ignores obstacles already past the crab', () => {
  // nearestObstacle() skips them at the util level, but nothing checked
  // the bot itself stays quiet when the only obstacle is behind it — or
  // when a passed one sits next to a still-distant one.
  const passed = runningGame();
  passed.obstacles.push({ kind: 'cactus', x: 0, w: 3, h: 2 });
  assert.equal(botAction(passed), null, 'a cactus fully behind the crab needs no input');
  const mixed = runningGame();
  mixed.obstacles.push({ kind: 'cactus', x: 0, w: 3, h: 2 });
  mixed.obstacles.push({ kind: 'cactus', x: 60, w: 3, h: 2 });
  assert.equal(botAction(mixed), null, 'a passed cactus must not mask the far one into a jump');
});

test('the jump window has hard edges: too far, too late, and just right', () => {
  // The bot jumps when eta < 0.4 and eta > -0.02 (speed 17 at the start,
  // so eta = (x - 9) / 17). Nothing pinned either edge: a bot that jumped
  // a frame early or a frame late would still clear most cacti.
  const tooFar = runningGame();
  tooFar.obstacles.push({ kind: 'cactus', x: 16, w: 3, h: 2 }); // eta 0.41
  assert.equal(botAction(tooFar), null, 'eta above 0.4 must not jump yet');
  const justRight = runningGame();
  justRight.obstacles.push({ kind: 'cactus', x: 15, w: 3, h: 2 }); // eta 0.35
  assert.equal(botAction(justRight), 'jump', 'eta inside the window must jump');
  const almostPast = runningGame();
  almostPast.obstacles.push({ kind: 'cactus', x: 8.8, w: 3, h: 2 }); // eta -0.01
  assert.equal(botAction(almostPast), 'jump', 'eta just above -0.02 still jumps');
  const tooLate = runningGame();
  tooLate.obstacles.push({ kind: 'cactus', x: 8.5, w: 3, h: 2 }); // eta -0.03
  assert.equal(botAction(tooLate), null, 'eta below -0.02 is already past — jumping is pointless');
});

test('the duck window has a hard edge too: a far mid flyer waits', () => {
  // Duck fires when eta < 0.28 for a mid flyer (speedMul 1.3, so
  // eta = (x - 9) / 22.1). A bot that ducked the instant a flyer spawned
  // would stand up again before it arrived.
  const far = runningGame();
  far.obstacles.push({ kind: 'flyer', x: 16, w: 5, h: 1, fly: 2, speedMul: 1.3 }); // eta 0.32
  assert.equal(botAction(far), null, 'eta above 0.28 must not duck yet');
  const near = runningGame();
  near.obstacles.push({ kind: 'flyer', x: 14, w: 5, h: 1, fly: 2, speedMul: 1.3 }); // eta 0.23
  assert.equal(botAction(near), 'duck', 'eta inside the window must duck');
});

test('a dead game restarts only after the death cooldown', () => {
  const g = runningGame();
  g.mode = 'dead';
  g.deadT = 0.3;
  assert.equal(botAction(g), null, 'too soon after dying');
  g.deadT = 0.7;
  assert.equal(botAction(g), 'restart');
});

console.log(`\n${passed} tests passed 🤖`);
