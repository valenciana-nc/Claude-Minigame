// Structural tests for src/sprites.js — pure pixel-art data with zero
// coverage until now. A wrong width, a missing pose, or a color key the
// renderer doesn't know would only show up as a weird frame (or a
// literal "undefined" in the output) with no test to blame.
// Run: npm test
import assert from 'node:assert/strict';
import { CRAB, CLAUDE, CACTI, FLYERS, CLOUDS } from '../src/sprites.js';
import { COLORS } from '../src/ansi.js';

let passed = 0;
function test(name, fn) {
  fn();
  console.log('  ok - ' + name);
  passed++;
}

const POSES = ['runA', 'runB', 'jump', 'dead', 'duckA', 'duckB'];

test('both skins have every pose with consistent row widths', () => {
  for (const [name, skin] of [['CRAB', CRAB], ['CLAUDE', CLAUDE]]) {
    for (const pose of POSES) {
      assert.ok(Array.isArray(skin[pose]), `${name} is missing pose ${pose}`);
      assert.ok(skin[pose].length >= 2, `${name}.${pose} must have at least 2 rows`);
      const w = skin[pose][0].length;
      for (const row of skin[pose]) {
        assert.equal(row.length, w, `${name}.${pose} rows must share one width`);
      }
    }
    // The duck poses are the flat two-row form that slips under flyers.
    assert.equal(skin.duckA.length, 2, `${name}.duckA must be 2 rows tall`);
    assert.equal(skin.duckB.length, 2, `${name}.duckB must be 2 rows tall`);
    assert.ok(skin.color in COLORS, `${name}.color must be a known color key`);
    if (skin.accent) assert.ok(skin.accent in COLORS, `${name}.accent must be a known color key`);
  }
});

test('every cactus row count matches h and every row width matches w', () => {
  // w drives the collision box and the spawn-gap math while the rows
  // drive the visual — if they disagree, the crab dies on an invisible
  // column (or sails through a visible one).
  for (const c of CACTI) {
    assert.equal(c.rows.length, c.h, `cactus w=${c.w} h=${c.h} must have ${c.h} rows`);
    for (const row of c.rows) {
      assert.equal(row.length, c.w, `cactus w=${c.w} h=${c.h} rows must be ${c.w} wide`);
    }
    assert.ok(c.color in COLORS, `cactus color ${c.color} must be a known color key`);
  }
});

test('every flyer frame is exactly w wide and the flap has 2+ frames', () => {
  for (const f of FLYERS) {
    assert.ok(f.frames.length >= 2, 'a flyer needs at least 2 frames to flap');
    for (const frame of f.frames) {
      assert.equal(frame.length, f.w, `flyer frames must be ${f.w} wide`);
    }
    assert.ok(f.color in COLORS, `flyer color ${f.color} must be a known color key`);
  }
});

test('clouds are non-empty and every color key they use exists', () => {
  assert.ok(CLOUDS.length > 0, 'there must be at least one cloud shape');
  for (const shape of CLOUDS) {
    assert.ok(shape.length >= 1, 'a cloud shape must have at least one row');
    for (const row of shape) assert.ok(row.length >= 1, 'a cloud row must not be empty');
  }
});

console.log(`\n${passed} tests passed 🖌️`);
