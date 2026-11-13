// Pixel art. Recreated by eye from the Claude Code welcome screen.
// Convention: ' ' = transparent, '.' = opaque background (paints a space —
// used for Clawd's eyes), anything else = drawn in the sprite's color.

export const CRAB = {
  color: 'O',
  // Square-bodied Clawd, traced pixel-for-pixel from the mascot: flat-topped
  // head, two wide-set dark eyes, a cheek band that bulges one pixel wider on
  // each side, then four stubby legs (two left, two right) with a center gap.
  runA: [
    ' █████████ ',
    ' █.█████.█ ',
    '███████████',
    ' █████████ ',
    ' █ █   █ █ ',
  ],
  runB: [
    ' █████████ ',
    ' █.█████.█ ',
    '███████████',
    ' █████████ ',
    '  █ █ █ █  ',
  ],
  jump: [
    ' █████████ ',
    ' █.█████.█ ',
    '███████████',
    ' █████████ ',
    '  ██   ██  ',
  ],
  dead: [
    ' █████████ ',
    ' █x█████x█ ',
    '███████████',
    ' █████████ ',
    ' █ █   █ █ ',
  ],
  // Ducking flattens Clawd to two rows so he visibly slips under mid flyers.
  duckA: [
    '██.█████.██',
    ' █ █   █ █ ',
  ],
  duckB: [
    '██.█████.██',
    '  █ █ █ █  ',
  ],
};

// Alternate skin: the Claude Code app icon — a round, puffy blue-violet cloud
// with a white `>_` terminal prompt dead-centre, plus small legs. Rounded with
// the three-quarter blocks ▟▙▜▛ so the corners read soft, not square.
// Convention adds '#' = accent (white prompt); '█'/▟▙▜▛ = body; ' ' transparent.
export const CLAUDE = {
  color: 'C',
  accent: 'W',
  // A round cloud: domed top (▄ caps), full equator, rounded bottom (▀ caps),
  // white `>_` prompt dead-centre, four little legs.
  runA: [
    '  ▄█████▄  ',
    ' ▟█#█████▙ ',
    '████#█##███',
    ' ▜█#█████▛ ',
    '  ▀█████▀  ',
    '  █ █ █ █  ',
  ],
  runB: [
    '  ▄█████▄  ',
    ' ▟█#█████▙ ',
    '████#█##███',
    ' ▜█#█████▛ ',
    '  ▀█████▀  ',
    '   █ █ █ █ ',
  ],
  jump: [
    '  ▄█████▄  ',
    ' ▟█#█████▙ ',
    '████#█##███',
    ' ▜█#█████▛ ',
    '  ▀█████▀  ',
    '   █   █   ',
  ],
  dead: [
    '  ▄█████▄  ',
    ' ▟█x█████▙ ',
    '████x█xx███',
    ' ▜█x█████▛ ',
    '  ▀█████▀  ',
    '  █ █ █ █  ',
  ],
  duckA: [
    '▄███#█#███▄',
    '  █ █ █ █  ',
  ],
  duckB: [
    '▄███#█#███▄',
    '   █ █ █ █ ',
  ],
};

// Ground obstacles — "segfaults": jagged green crash-stacks in the same blocky
// style as Clawd. Sorted loosely easy→hard; `tier` gates them by distance.
export const CACTI = [
  { w: 1, h: 1, color: 'G', tier: 0, rows: ['█'] },                         // pebble
  { w: 2, h: 2, color: 'G', tier: 0, rows: ['██', '██'] },                  // stub
  { w: 1, h: 3, color: 'G', tier: 1, rows: ['█', '█', '█'] },               // spike
  { w: 3, h: 2, color: 'G', tier: 1, rows: ['█ █', '███'] },                // forked
  { w: 3, h: 3, color: 'G', tier: 2, rows: ['█ █', '███', ' █ '] },         // saguaro
  { w: 5, h: 2, color: 'G', tier: 2, rows: ['█ █ █', '█████'] },            // comb
  { w: 3, h: 3, color: 'G', tier: 3, rows: ['█ █', '███', '█ █'] },         // gnarly
  { w: 5, h: 3, color: 'G', tier: 3, rows: ['█ █ █', '█████', ' █ █ '] },   // cluster
];

// Flying enemies — picked by species, placed at a `fly` height the engine sets.
// One row tall so duck/jump math stays clean; multi-frame wing-beats so they
// read as actively flapping toward you, not a static sprite sliding past.
export const FLYERS = [
  { w: 3, color: 'M', frames: ['\\o/', '-o-', '/o\\', '-o-'] }, // moth — full up→down flap
  { w: 3, color: 'P', frames: ['<×>', '>×<'] },                 // glitch — skitters/jitters
  { w: 5, color: 'M', frames: ['╲▂█▂╱', '─▆█▆─', '╱▀█▀╲', '─▆█▆─'] }, // big bird — wingbeats
];
// Parallax clouds — soft, dim, various sizes. One or two rows.
export const CLOUDS = [
  ['░░░'],
  ['░▒░'],
  [' ░░░ ', '░▒▒▒░'],
  ['░░▒░░'],
];

export const TITLE = 'C L A W D   R U N N E R';
export const SUBTITLE = 'the unofficial Claude Code minigame';
