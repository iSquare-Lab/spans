// The rules of Spans. Islands sit on a grid, each with a number. Bridges run straight, horizontally or vertically,
// between two islands with nothing in between; two islands share at most two bridges; bridges never cross; every
// island has exactly as many bridges as its number; and all islands end up connected into one group.

export type Island = { id: number; x: number; y: number; need: number };

// A possible bridge between two islands that see each other along a row or a column. `a` is the left or upper one.
export type Edge = { id: number; a: number; b: number; horizontal: boolean };

export type Puzzle = {
  width: number;
  height: number;
  islands: Island[];
  edges: Edge[];
  // For each island, the edges that touch it.
  edgesOf: number[][];
  // For each edge, the edges it would cross.
  crossings: number[][];
};

// Bridges per edge: 0, 1 or 2.
export type Bridges = number[];

// Builds the edges and crossings for a set of islands on a width × height grid.
export function makePuzzle(width: number, height: number, islands: Omit<Island, 'id'>[]): Puzzle {
  const list: Island[] = islands.map((island, id) => ({ ...island, id }));
  const at = new Map<number, number>();
  for (const island of list) at.set(island.y * width + island.x, island.id);
  const edges: Edge[] = [];
  for (const island of list) {
    // Right and down only, so each pair is found once.
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      let x = island.x + dx, y = island.y + dy;
      while (x < width && y < height) {
        const other = at.get(y * width + x);
        if (other !== undefined) {
          edges.push({ id: edges.length, a: island.id, b: other, horizontal: dy === 0 });
          break;
        }
        x += dx;
        y += dy;
      }
    }
  }
  const edgesOf: number[][] = list.map(() => []);
  for (const edge of edges) {
    edgesOf[edge.a].push(edge.id);
    edgesOf[edge.b].push(edge.id);
  }
  const crossings: number[][] = edges.map(() => []);
  for (const h of edges) {
    if (!h.horizontal) continue;
    const ha = list[h.a], hb = list[h.b];
    for (const v of edges) {
      if (v.horizontal) continue;
      const va = list[v.a], vb = list[v.b];
      // They cross when the vertical one's column lies strictly inside the horizontal span and the row strictly inside
      // the vertical span.
      if (va.x > ha.x && va.x < hb.x && ha.y > va.y && ha.y < vb.y) {
        crossings[h.id].push(v.id);
        crossings[v.id].push(h.id);
      }
    }
  }
  return { width, height, islands: list, edges, edgesOf, crossings };
}

export function bridgeCount(puzzle: Puzzle, bridges: Bridges, island: number): number {
  let sum = 0;
  for (const edge of puzzle.edgesOf[island]) sum += bridges[edge];
  return sum;
}

// Whether every island can reach every other one over the bridges that are built.
export function isConnected(puzzle: Puzzle, bridges: Bridges): boolean {
  const n = puzzle.islands.length;
  if (n === 0) return true;
  const seen = new Uint8Array(n);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const island = stack.pop()!;
    for (const edgeId of puzzle.edgesOf[island]) {
      if (bridges[edgeId] === 0) continue;
      const edge = puzzle.edges[edgeId];
      const other = edge.a === island ? edge.b : edge.a;
      if (!seen[other]) {
        seen[other] = 1;
        count++;
        stack.push(other);
      }
    }
  }
  return count === n;
}

// The edges a bridge on `edge` would cross that already have one.
export function blockers(puzzle: Puzzle, bridges: Bridges, edge: number): number[] {
  return puzzle.crossings[edge].filter((other) => bridges[other] > 0);
}

export function isSolved(puzzle: Puzzle, bridges: Bridges): boolean {
  for (const island of puzzle.islands) if (bridgeCount(puzzle, bridges, island.id) !== island.need) return false;
  for (let edge = 0; edge < puzzle.edges.length; edge++) if (bridges[edge] > 0 && blockers(puzzle, bridges, edge).length) return false;
  return isConnected(puzzle, bridges);
}

// The edge between two islands, if they see each other.
export function edgeBetween(puzzle: Puzzle, a: number, b: number): Edge | undefined {
  for (const edgeId of puzzle.edgesOf[a]) {
    const edge = puzzle.edges[edgeId];
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) return edge;
  }
  return undefined;
}

// The island seen from `island` in a direction, if any.
export function neighbour(puzzle: Puzzle, island: number, dx: number, dy: number): number | undefined {
  for (const edgeId of puzzle.edgesOf[island]) {
    const edge = puzzle.edges[edgeId];
    const other = edge.a === island ? edge.b : edge.a;
    const o = puzzle.islands[other], me = puzzle.islands[island];
    if (Math.sign(o.x - me.x) === dx && Math.sign(o.y - me.y) === dy) return other;
  }
  return undefined;
}

export function directionName(dx: number, dy: number): string {
  if (dx > 0) return 'east';
  if (dx < 0) return 'west';
  return dy > 0 ? 'south' : 'north';
}
