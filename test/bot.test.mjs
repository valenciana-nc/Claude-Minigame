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

test('a dead game restarts only after the death cooldown', () => {
  const g = runningGame();
  g.mode = 'dead';
  g.deadT = 0.3;
  assert.equal(botAction(g), null, 'too soon after dying');
  g.deadT = 0.7;
  assert.equal(botAction(g), 'restart');
});

console.log(`\n${passed} tests passed 🤖`);
