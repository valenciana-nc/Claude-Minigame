// Pixel art. Recreated by eye from the Claude Code welcome screen.
// Convention: ' ' = transparent, '.' = opaque background (paints a space —
// used for Clawd's eyes), anything else = drawn in the sprite's color.

export const CRAB = {
  w: 8,
  color: 'O',
  // claws up, square head, two dark eyes, little legs
  runA: [
    ' ▝▖▄▄▗▘ ',
    '▗██████▖',
    '▐█.██.█▌',
    ' ▌▌  ▐▐ ',
  ],
  runB: [
    ' ▝▖▄▄▗▘ ',
    '▗██████▖',
    '▐█.██.█▌',
    ' ▘▌  ▐▝ ',
  ],
  jump: [
    ' ▝▖▄▄▗▘ ',
    '▗██████▖',
    '▐█.██.█▌',
    '  ▀▘▝▀  ',
  ],
  dead: [
    ' ▝▖▄▄▗▘ ',
    '▗██████▖',
    '▐█x██x█▌',
    ' ▌▌  ▐▐ ',
  ],
  duckA: [
    '▗▄▄▄▄▄▄▄▖',
    '▐█.██.█▛▘',
  ],
  duckB: [
    '▗▄▄▄▄▄▄▄▖',
    '▐█.██.█▛▘',
  ],
};

// Obstacles. Ground cacti ("segfaults") and flying bugs.
export const CACTI = [
  { w: 2, h: 2, color: 'G', rows: ['▟▖', '▐▌'] },
  { w: 3, h: 3, color: 'G', rows: ['▗▙ ', '▐█▌', '▐█▌'] },
  { w: 5, h: 2, color: 'G', rows: ['▟▖ ▟▖', '▐▌ ▐▌'] },
  { w: 6, h: 3, color: 'G', rows: [' ▟▖▙ ', '▐█▌█▌ ', '▐█▌█▌ '] },
];

export const BUG = {
  w: 3,
  h: 1,
  color: 'M',
  frames: ['}o{', ')o('],
};

export const CLOUD = { color: 'D', rows: ['░░░░░'] };

export const TITLE = 'C L A W D   R U N N E R';
export const SUBTITLE = 'the unofficial Claude Code minigame';
