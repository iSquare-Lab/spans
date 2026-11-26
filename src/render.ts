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
  bridge: string;
  cursor: string;
  hint: string;
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
    bridge: v('--bridge'),
    cursor: v('--cursor'),
    hint: v('--hint'),
  };
}

export type View = {
  cell: number;
  ox: number;
  oy: number;
  // The island the keyboard is on, shown with a ring when the board has keyboard focus.
  cursor: number | null;
  showCursor: boolean;
  // A drag from an island towards the pointer.
  drag: { from: number; x: number; y: number } | null;
  hint: { edge: number; until: number } | null;
  // 0..1 while the solved glow plays.
  celebrate: number;
};

export function layout(width: number, height: number, game: Game): Pick<View, 'cell' | 'ox' | 'oy'> {
  const { puzzle } = game;
  const cell = Math.floor(Math.min(width / puzzle.width, height / puzzle.height));
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

  // The hint's edge pulses under the bridges.
  if (view.hint && view.hint.until > now) {
    const edge = puzzle.edges[view.hint.edge];
    const a = puzzle.islands[edge.a], b = puzzle.islands[edge.b];
    const [ax, ay] = center(view, a.x, a.y), [bx, by] = center(view, b.x, b.y);
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    ctx.strokeStyle = colors.hint;
    ctx.globalAlpha = 0.25 + 0.35 * pulse;
    ctx.lineWidth = cell * 0.42;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = done ? colors.doneText : over ? colors.over : colors.islandText;
    ctx.fillText(String(island.need), cx, cy + cell * 0.02);
  }

  if (view.showCursor && view.cursor !== null) {
    const island = puzzle.islands[view.cursor];
    const [cx, cy] = center(view, island.x, island.y);
    ctx.strokeStyle = colors.cursor;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + cell * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }
}
