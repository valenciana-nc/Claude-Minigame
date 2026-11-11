// Pure helpers shared across modules — no game state, no terminal I/O.
// Things that used to live in engine.js only because something else
// imported them from there now live here, so engine.js is just the Engine.

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
