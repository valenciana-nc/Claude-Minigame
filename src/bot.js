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

import { nearestObstacle } from './util.js';

export function botAction(game) {
  const next = nearestObstacle(game.obstacles, 8);
  if (next && game.mode === 'run' && game.y === 0) {
    const eta = (next.x - 9) / (game.speed * (next.speedMul || 1));
    const flying = next.kind !== 'cactus';
    if ((!flying || next.fly === 0) && eta < 0.4 && eta > -0.02) return 'jump';
    if (flying && next.fly === 2 && eta < 0.28) return 'duck';
  }
  if (game.mode === 'dead' && game.deadT > 0.6) return 'restart';
  return null;
}
