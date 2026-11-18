// Pure helpers shared across modules — no game state, no terminal I/O.
// Things that used to live in engine.js only because something else
// imported them from there now live here, so engine.js is just the Engine.
// The layout constants the sim and the view both need live here too, so
// neither module has to import them from the other.
export const CRAB_X = 5;          // crab's fixed screen column
export const NIGHT_EVERY = 2400;  // distance cols per day/night phase

// One canonical high-score guard, shared by the Engine constructor (direct
// API users) and loadHi() in bin/clawd.js (the saved file). A hand-edited
// or corrupt hi used to poison the HUD: {"hi": 1e400} parses to Infinity
// and prints "HI Infinity" forever (no score can ever beat it), and
// {"hi": "abc"} printed "HI 00abc". The two copies of this guard used to
// live in engine.js and bin/clawd.js separately, so a fix to one could
// silently leave the other poisoning the score. Only a finite
// non-negative number is a high score; anything else starts at 0.
export function sanitizeHi(hi) {
  return Number.isFinite(hi) ? Math.max(0, Math.floor(hi)) : 0;
}

// The snapshot bot (bin/clawd.js) needs the nearest obstacle still ahead of
// the crab on every tick. A filter().sort() per tick allocates two fresh
// arrays per frame for a list that never holds more than a handful of
// obstacles; one linear scan finds the same obstacle with no allocation.
// Ties keep the first in list order, exactly like the stable sort did.
export function nearestObstacle(obstacles, aheadX) {
  let next = null;
  for (const ob of obstacles) {
    if (ob.x + ob.w > aheadX && (!next || ob.x < next.x)) next = ob;
  }
  return next;
}
