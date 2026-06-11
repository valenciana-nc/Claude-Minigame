// Minimal Claude Code statusline with a clickable Clawd that launches the game.
//
// In ~/.claude/settings.json:
//   "statusLine": { "type": "command", "command": "node <ABSOLUTE PATH>/tools/statusline-basic.js" }
//
// Already have a statusline? Just splice the three CRAB lines into yours.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw); } catch { /* fall back to defaults */ }
  const model = (d.model && d.model.display_name) || 'Claude';
  const dir = ((d.workspace && d.workspace.current_dir) || d.cwd || '').split(/[\\/]/).pop();

  // CRAB: ctrl+click to play (requires the clawd:// protocol, see tools/install-protocol.ps1)
  const ORANGE = '\x1b[38;2;217;119;87m', DIM = '\x1b[2m', RESET = '\x1b[0m';
  const link = (t, u) => '\x1b]8;;' + u + '\x07' + t + '\x1b]8;;\x07';
  const crab = link(ORANGE + '▐▛▜▌' + RESET + DIM + ' play' + RESET, 'clawd://play');

  process.stdout.write([model, dir].filter(Boolean).join(' | ') + '  ' + crab);
});
