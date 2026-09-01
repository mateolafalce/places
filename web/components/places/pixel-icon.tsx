/* Hand-drawn sprite icons.
 *
 * Lucide's strokes are vector curves; next to a room built out of 1px art they
 * read as a different product. Each icon below is a literal 10x10 pixel grid,
 * '#' meaning "fill this cell", so the glyphs sit on the same grid as the
 * sprites in the hall and scale by whole pixels at any size. */

const GRID = 10;

const ICONS = {
  pin: [
    '...####...',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '...####...',
    '....##....',
    '....##....',
    '....##....',
    '.....#....',
  ],
  'pin-off': [
    '#..####...',
    '.#######..',
    '..######..',
    '...#####..',
    '..#.####..',
    '.#.####...',
    '#...##....',
    '....##....',
    '...##.....',
    '..#.......',
  ],
  plus: [
    '..........',
    '..........',
    '....##....',
    '....##....',
    '..######..',
    '..######..',
    '....##....',
    '....##....',
    '..........',
    '..........',
  ],
  minus: [
    '..........',
    '..........',
    '..........',
    '..........',
    '..######..',
    '..######..',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  close: [
    '..........',
    '.##....##.',
    '.###..###.',
    '..######..',
    '...####...',
    '...####...',
    '..######..',
    '.###..###.',
    '.##....##.',
    '..........',
  ],
  sparkle: [
    '...#......',
    '...#......',
    '.#####....',
    '...#......',
    '...#......',
    '..........',
    '.......#..',
    '......###.',
    '.......#..',
    '..........',
  ],
  json: [
    '..######..',
    '..#....##.',
    '..#.....#.',
    '..#.###.#.',
    '..#.....#.',
    '..#.###.#.',
    '..#.....#.',
    '..#.###.#.',
    '..#######.',
    '..........',
  ],
  png: [
    '.########.',
    '.#......#.',
    '.#.#....#.',
    '.#......#.',
    '.#...##.#.',
    '.#..#####.',
    '.########.',
    '..######..',
    '...####...',
    '....##....',
  ],
  reroll: [
    '#..####...',
    '##.#..##..',
    '###....##.',
    '.#......#.',
    '#.......#.',
    '#.........',
    '##......#.',
    '.##....##.',
    '..######..',
    '..........',
  ],
  wand: [
    '.#......##',
    '###....###',
    '.#....###.',
    '.....###..',
    '....###...',
    '...###....',
    '..###.....',
    '.###....#.',
    '###....###',
    '##......#.',
  ],
} as const;

export type PixelIconName = keyof typeof ICONS;

/* Every grid above is plain ASCII, so index access is a cell, not a surrogate
 * half; each filled cell becomes one 1x1 square in the path. */
function toPath(rows: readonly string[]): string {
  let d = '';
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

const PATHS = Object.fromEntries(
  Object.entries(ICONS).map(([name, rows]) => [name, toPath(rows)]),
) as Record<PixelIconName, string>;

interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  className?: string;
}

export function PixelIcon({ name, size, className }: PixelIconProps) {
  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
