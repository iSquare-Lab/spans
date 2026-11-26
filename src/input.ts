import type { Game } from './game.ts';
import { edgeBetween, neighbour, type Puzzle } from './puzzle.ts';
import { center, type View } from './render.ts';

// Pointer and keyboard input on the board, and the letter shortcuts. What a gesture means is decided here; what it does
// to the game is left to the callbacks main.ts passes in.

// ── Where things are ─────────────────────────────────────────────────────────────────────────────────────────────

// The island under a point, within half a cell of its centre.
export function islandAt(puzzle: Puzzle, view: View, px: number, py: number): number | undefined {
  let best: number | undefined, bestD = view.cell * 0.5;
  for (const island of puzzle.islands) {
    const [cx, cy] = center(view, island.x, island.y);
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      best = island.id;
    }
  }
  return best;
}

// The edge whose line passes closest to a point in open water, within about half a cell.
export function edgeAt(puzzle: Puzzle, view: View, px: number, py: number): number | undefined {
  let best: number | undefined, bestD = view.cell * 0.45;
  for (const edge of puzzle.edges) {
    const a = puzzle.islands[edge.a], b = puzzle.islands[edge.b];
    const [ax, ay] = center(view, a.x, a.y), [bx, by] = center(view, b.x, b.y);
    const inside = edge.horizontal ? px > ax && px < bx : py > ay && py < by;
    if (!inside) continue;
    const d = edge.horizontal ? Math.abs(py - ay) : Math.abs(px - ax);
    if (d < bestD) {
      bestD = d;
      best = edge.id;
    }
  }
  return best;
}

// The island reached by an arrow: the one it sees in that direction, or else the nearest one roughly that way.
export function step(puzzle: Puzzle, from: number, dx: number, dy: number): number | undefined {
  const seen = neighbour(puzzle, from, dx, dy);
  if (seen !== undefined) return seen;
  const me = puzzle.islands[from];
  let best: number | undefined, bestScore = Infinity;
  for (const island of puzzle.islands) {
    const ahead = (island.x - me.x) * dx + (island.y - me.y) * dy;
    if (ahead <= 0) continue;
    const side = Math.abs((island.x - me.x) * dy + (island.y - me.y) * dx);
    const score = ahead + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = island.id;
    }
  }
  return best;
}

// A tap on an island: with another island selected that it sees, it builds between them; otherwise it selects the
// tapped island, or clears the selection when that island was already selected.
export type Tap = { build: number } | { select: number | null };

export function tapIsland(puzzle: Puzzle, selected: number | null, island: number): Tap {
  if (selected !== null && selected !== island) {
    const edge = edgeBetween(puzzle, selected, island);
    if (edge) return { build: edge.id };
  }
  return { select: selected === island ? null : island };
}

// ── The board ────────────────────────────────────────────────────────────────────────────────────────────────────

export type BoardActions = {
  game(): Game | undefined;
  // Cycles the bridges on an edge: 0 → 1 → 2 → 0.
  build(edge: number): void;
  // A tap picked an island, or cleared the pick (null).
  select(island: number | null): void;
  // The keyboard moved to an island.
  moveTo(island: number): void;
  // Shift and an arrow found no island that way.
  noIsland(dx: number, dy: number): void;
  // Something on the board changed and needs drawing.
  redraw(): void;
};

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function bindBoard(canvas: HTMLCanvasElement, view: View, actions: BoardActions): void {
  let down: { island?: number; x: number; y: number; moved: boolean } | null = null;

  const pointAt = (e: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  canvas.addEventListener('pointerdown', (e) => {
    // Only the main button (touch and pen report it too): a right-click keeps its context menu.
    if (e.button !== 0) return;
    const game = actions.game();
    if (!game) return;
    const [x, y] = pointAt(e);
    // The keyboard ring hides while the pointer is in use; a tap shows its own selection instead.
    view.showCursor = false;
    down = { island: islandAt(game.puzzle, view, x, y), x, y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    actions.redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!down || down.island === undefined) return;
    const [x, y] = pointAt(e);
    if (Math.hypot(x - down.x, y - down.y) > view.cell * 0.25) down.moved = true;
    if (down.moved) {
      view.drag = { from: down.island, x, y };
      actions.redraw();
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    const game = actions.game();
    if (!down || !game) return;
    const [x, y] = pointAt(e);
    const start = down;
    down = null;
    view.drag = null;
    actions.redraw();
    if (start.island === undefined) {
      // A tap on the water cycles the bridge it lies on and clears the selection.
      actions.select(null);
      if (Math.hypot(x - start.x, y - start.y) < view.cell * 0.5) {
        const edge = edgeAt(game.puzzle, view, x, y);
        if (edge !== undefined) actions.build(edge);
      }
      return;
    }
    view.cursor = start.island;
    if (start.moved) {
      // A drag builds towards the island it points at.
      const dx = x - start.x, dy = y - start.y;
      const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const other = neighbour(game.puzzle, start.island, sx, sy);
      actions.select(null);
      if (other !== undefined) actions.build(edgeBetween(game.puzzle, start.island, other)!.id);
      return;
    }
    const tap = tapIsland(game.puzzle, view.selected, start.island);
    if ('build' in tap) {
      actions.select(null);
      actions.build(tap.build);
    } else actions.select(tap.select);
  });

  canvas.addEventListener('pointercancel', () => {
    down = null;
    view.drag = null;
    actions.redraw();
  });

  canvas.addEventListener('keydown', (e) => {
    const game = actions.game();
    if (!game) return;
    if (e.key === 'Escape' && view.selected !== null) {
      actions.select(null);
      return;
    }
    const arrow = ARROWS[e.key];
    if (!arrow) return;
    e.preventDefault();
    view.showCursor = true;
    actions.select(null);
    const from = view.cursor ?? 0;
    if (e.shiftKey) {
      const other = neighbour(game.puzzle, from, arrow[0], arrow[1]);
      if (other === undefined) actions.noIsland(arrow[0], arrow[1]);
      else actions.build(edgeBetween(game.puzzle, from, other)!.id);
      return;
    }
    const to = step(game.puzzle, from, arrow[0], arrow[1]);
    if (to !== undefined) {
      view.cursor = to;
      actions.moveTo(to);
    }
    actions.redraw();
  });

  // The keyboard ring shows only when the board got focus from the keyboard, not from a tap.
  canvas.addEventListener('focus', () => {
    view.showCursor = canvas.matches(':focus-visible');
    actions.redraw();
  });
  canvas.addEventListener('blur', () => {
    view.showCursor = false;
    actions.redraw();
  });
}

// ── Shortcuts ────────────────────────────────────────────────────────────────────────────────────────────────────

export type Shortcuts = Record<'undo' | 'hint' | 'restart' | 'newPuzzle' | 'sound', () => void>;

// Letter shortcuts work only while focus is on the board or in the game panel (WCAG 2.1.4), never with a dialog open.
export function bindShortcuts(scopes: HTMLElement[], shortcuts: Shortcuts): void {
  const keys: Record<string, keyof Shortcuts> = { u: 'undo', h: 'hint', r: 'restart', n: 'newPuzzle', m: 'sound' };
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || e.metaKey || e.altKey) return;
    if (!(e.target instanceof Node) || !scopes.some((scope) => scope.contains(e.target as Node))) return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (key === 'z') {
        e.preventDefault();
        shortcuts.undo();
      }
      return;
    }
    const name = keys[key];
    if (name) shortcuts[name]();
  });
}
