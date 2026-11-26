import type { Game } from './game.ts';

export type Colors = {
  water: string;
  grid: string;
  island: string;
  islandText: string;
  islandEdge: string;
  done: string;
  doneText: string;
  over: string;
  overText: string;
  bridge: string;
  cursor: string;
  hint: string;
  hintEdge: string;
};

export function readColors(el: HTMLElement): Colors {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    water: v('--water'),
    grid: v('--water-dot'),
    island: v('--island'),
    islandText: v('--island-text'),
    islandEdge: v('--island-edge'),
    done: v('--done'),
    doneText: v('--done-text'),
    over: v('--over'),
    overText: v('--over-text'),
    bridge: v('--bridge'),
    cursor: v('--cursor'),
    hint: v('--hint'),
    hintEdge: v('--hint-edge'),
  };
}

export type View = {
  cell: number;
  ox: number;
  oy: number;
  // The island the keyboard is on, shown with a ring when the board has keyboard focus.
  cursor: number | null;
  showCursor: boolean;
  // The island picked by a tap, shown with a ring until a second tap builds from it.
  selected: number | null;
  // A drag from an island towards the pointer.
  drag: { from: number; x: number; y: number } | null;
  hint: { edge: number; until: number } | null;
  // 0..1 while the solved glow plays.
  celebrate: number;
  // Set when the player asks for reduced motion: the hint stays still instead of pulsing.
  reducedMotion: boolean;
};

// Space around the grid, in cells, so the ring around a corner island stays clear of the board's edge.
const MARGIN = 0.1;

// Whether the board still changes on its own at this moment: a hint fading out or the solved glow.
export function animating(view: View, now: number): boolean {
  return (view.hint !== null && view.hint.until > now) || view.celebrate > 0;
}

export function layout(width: number, height: number, game: Game): Pick<View, 'cell' | 'ox' | 'oy'> {
  const { puzzle } = game;
  const cell = Math.floor(Math.min(width / (puzzle.width + 2 * MARGIN), height / (puzzle.height + 2 * MARGIN)));
  return { cell, ox: Math.floor((width - cell * puzzle.width) / 2), oy: Math.floor((height - cell * puzzle.height) / 2) };
}

export function center(view: View, x: number, y: number): [number, number] {
  return [view.ox + (x + 0.5) * view.cell, view.oy + (y + 0.5) * view.cell];
}

export function draw(ctx: CanvasRenderingContext2D, width: number, height: number, game: Game, view: View, colors: Colors, now: number): void {
  const { puzzle, bridges } = game;
  const { cell } = view;
  const radius = cell * 0.36;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.water;
  ctx.fillRect(0, 0, width, height);

  // The hint's edge, under the dots and bridges: an outline that stands out from the water, filled with a pulse, or
  // with a steady glow when motion is reduced.
  if (view.hint && view.hint.until > now) {
    const edge = puzzle.edges[view.hint.edge];
    const a = puzzle.islands[edge.a], b = puzzle.islands[edge.b];
    const [ax, ay] = center(view, a.x, a.y), [bx, by] = center(view, b.x, b.y);
    const outline = Math.max(1.5, cell * 0.04);
    const line = (color: string, lineWidth: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    line(colors.hintEdge, cell * 0.42);
    line(colors.water, cell * 0.42 - 2 * outline);
    const pulse = view.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now / 180);
    ctx.globalAlpha = 0.25 + 0.35 * pulse;
    line(colors.hint, cell * 0.42 - 2 * outline);
    ctx.globalAlpha = 1;
  }

  // Dots where islands could be, so distances are easy to read.
  ctx.fillStyle = colors.grid;
  for (let y = 0; y < puzzle.height; y++) {
    for (let x = 0; x < puzzle.width; x++) {
      const [cx, cy] = center(view, x, y);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.2, cell * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Bridges.
  ctx.strokeStyle = colors.bridge;
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(2, cell * 0.075);
  for (const edge of puzzle.edges) {
    const count = bridges[edge.id];
    if (!count) continue;
    const a = puzzle.islands[edge.a], b = puzzle.islands[edge.b];
    const [ax, ay] = center(view, a.x, a.y), [bx, by] = center(view, b.x, b.y);
    const offsets = count === 2 ? [-cell * 0.11, cell * 0.11] : [0];
    for (const o of offsets) {
      ctx.beginPath();
      if (edge.horizontal) {
        ctx.moveTo(ax + radius, ay + o);
        ctx.lineTo(bx - radius, by + o);
      } else {
        ctx.moveTo(ax + o, ay + radius);
        ctx.lineTo(bx + o, by - radius);
      }
      ctx.stroke();
    }
  }

  // The bridge being dragged.
  if (view.drag) {
    const from = puzzle.islands[view.drag.from];
    const [fx, fy] = center(view, from.x, from.y);
    const dx = view.drag.x - fx, dy = view.drag.y - fy;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    ctx.strokeStyle = colors.cursor;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([cell * 0.12, cell * 0.1]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(horizontal ? view.drag.x : fx, horizontal ? fy : view.drag.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Islands.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(cell * 0.4)}px 'Outfit Variable', 'Outfit', system-ui, sans-serif`;
  for (const island of puzzle.islands) {
    const [cx, cy] = center(view, island.x, island.y);
    const count = game.count(island.id);
    const done = count === island.need;
    const over = count > island.need;
    if (view.celebrate > 0) {
      ctx.fillStyle = colors.done;
      ctx.globalAlpha = 0.35 * view.celebrate;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.2 + 0.5 * view.celebrate), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = done ? colors.done : colors.island;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, cell * 0.05);
    ctx.strokeStyle = over ? colors.over : done ? colors.done : colors.islandEdge;
    ctx.stroke();
    if (over) {
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + cell * 0.06, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = done ? colors.doneText : over ? colors.overText : colors.islandText;
    ctx.fillText(String(island.need), cx, cy + cell * 0.02);
  }

  const ring = (id: number) => {
    const island = puzzle.islands[id];
    const [cx, cy] = center(view, island.x, island.y);
    ctx.strokeStyle = colors.cursor;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + cell * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (view.showCursor && view.cursor !== null) ring(view.cursor);
  if (view.selected !== null && !(view.showCursor && view.selected === view.cursor)) ring(view.selected);
}
