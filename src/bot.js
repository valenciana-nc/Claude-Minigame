// Snapshot bot — the tiny auto-player that drives --snapshot runs.
//
// Pure decision logic over Engine state, no terminal I/O: given the game,
// return the one input the bot would press this tick ('jump', 'duck', or
// 'restart'), or null when it should do nothing. It used to live inline in
// bin/clawd.js's print loop, which mixed CLI orchestration with game AI
// and left the decisions untestable except through a full subprocess run.
// The loop now just asks botAction() and feeds the answer to game.input().
//
// The bot is deliberately dumb: jump cacti and low flyers as they arrive,
// duck under mid flyers, restart shortly after dying. It exists to exercise
// the sim deterministically, not to play well.

import { CRAB_X, nearestObstacle } from './util.js';

// The bot's decision points, derived from the crab's screen column so a
// CRAB_X move can't silently desync the bot from the collision box
// (engine._collides spans CRAB_X+2..CRAB_X+8): an obstacle still counts
// as ahead while its right edge is past CRAB_X+3, and jump timing is
// measured against the crab's front-center, CRAB_X+4.
const AHEAD_X = CRAB_X + 3;
const JUMP_X = CRAB_X + 4;

export function botAction(game) {
  const next = nearestObstacle(game.obstacles, AHEAD_X);
  if (next && game.mode === 'run' && game.y === 0) {
    const eta = (next.x - JUMP_X) / (game.speed * (next.speedMul || 1));
    const flying = next.kind !== 'cactus';
    if ((!flying || next.fly === 0) && eta < 0.4 && eta > -0.02) return 'jump';
    if (flying && next.fly === 2 && eta < 0.28) return 'duck';
  }
  if (game.mode === 'dead' && game.deadT > 0.6) return 'restart';
  return null;
}
