import { isConnected, type Bridges, type Puzzle } from './puzzle.ts';

// Each edge's possible bridges as a range [lo, hi] within 0..2.
export type Ranges = { lo: Int8Array; hi: Int8Array };

export function fullRanges(puzzle: Puzzle): Ranges {
  const n = puzzle.edges.length;
  const lo = new Int8Array(n);
  const hi = new Int8Array(n).fill(2);
  return { lo, hi };
}

const copy = (r: Ranges): Ranges => ({ lo: r.lo.slice(), hi: r.hi.slice() });

// Narrows the ranges with the rules a person reasons with: an island's count, crossings, and no group closed off from
// the others. Returns false when no solution fits.
export function propagate(puzzle: Puzzle, r: Ranges): boolean {
  const { islands, edgesOf, edges, crossings } = puzzle;
  const many = islands.length > 2;
  for (const edge of edges) {
    // Two islands that need 1 each, or 2 each with a double bridge, would form a closed pair.
    if (many && islands[edge.a].need === 1 && islands[edge.b].need === 1 && r.hi[edge.id] > 0) r.hi[edge.id] = 0;
    if (many && islands[edge.a].need === 2 && islands[edge.b].need === 2 && r.hi[edge.id] > 1) r.hi[edge.id] = 1;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const island of islands) {
      let min = 0, max = 0;
      for (const e of edgesOf[island.id]) {
        min += r.lo[e];
        max += r.hi[e];
      }
      if (island.need < min || island.need > max) return false;
      for (const e of edgesOf[island.id]) {
        const lo = Math.max(r.lo[e], island.need - (max - r.hi[e]));
        const hi = Math.min(r.hi[e], island.need - (min - r.lo[e]));
        if (lo > hi) return false;
        if (lo !== r.lo[e] || hi !== r.hi[e]) {
          r.lo[e] = lo;
          r.hi[e] = hi;
          changed = true;
        }
      }
    }
    for (const edge of edges) {
      if (r.lo[edge.id] === 0) continue;
      for (const other of crossings[edge.id]) {
        if (r.lo[other] > 0) return false;
        if (r.hi[other] > 0) {
          r.hi[other] = 0;
          changed = true;
        }
      }
    }
    if (!changed && !groupsCanJoin(puzzle, r)) return false;
  }
  return true;
}

// False when the islands can no longer all be joined: either the possible bridges leave them apart, or a group joined
// by certain bridges has no possible bridge left to the rest.
function groupsCanJoin(puzzle: Puzzle, r: Ranges): boolean {
  const n = puzzle.islands.length;
  const maybe: Bridges = Array.from(r.hi);
  if (!isConnected(puzzle, maybe)) return false;
  const group = new Int32Array(n).fill(-1);
  let groups = 0;
  for (let start = 0; start < n; start++) {
    if (group[start] >= 0) continue;
    const members = [start];
    group[start] = groups;
    for (let i = 0; i < members.length; i++) {
      for (const e of puzzle.edgesOf[members[i]]) {
        if (r.lo[e] === 0) continue;
        const edge = puzzle.edges[e];
        const other = edge.a === members[i] ? edge.b : edge.a;
        if (group[other] < 0) {
          group[other] = groups;
          members.push(other);
        }
      }
    }
    if (members.length < n) {
      let open = false;
      for (const m of members) {
        for (const e of puzzle.edgesOf[m]) {
          const edge = puzzle.edges[e];
          const other = edge.a === m ? edge.b : edge.a;
          if (group[other] !== groups && r.hi[e] > 0) open = true;
        }
      }
      if (!open) return false;
    }
    groups++;
  }
  return true;
}

export type SolveResult = { solutions: Bridges[]; guesses: number };

// Finds up to `limit` solutions. `guesses` counts the times reasoning alone was not enough and the solver had to try
// a value: 0 means a person can solve it step by step without guessing.
export function solve(puzzle: Puzzle, limit = 2, start?: Ranges): SolveResult {
  const solutions: Bridges[] = [];
  let guesses = 0;
  const search = (r: Ranges): void => {
    if (solutions.length >= limit) return;
    if (!propagate(puzzle, r)) return;
    let pick = -1, best = 3;
    for (let e = 0; e < puzzle.edges.length; e++) {
      const width = r.hi[e] - r.lo[e];
      if (width > 0 && width < best) {
        best = width;
        pick = e;
      }
    }
    if (pick < 0) {
      const bridges = Array.from(r.lo);
      if (isConnected(puzzle, bridges)) solutions.push(bridges);
      return;
    }
    guesses++;
    for (let v = r.hi[pick]; v >= r.lo[pick]; v--) {
      const next = copy(r);
      next.lo[pick] = v;
      next.hi[pick] = v;
      search(next);
      if (solutions.length >= limit) return;
    }
  };
  search(start ? copy(start) : fullRanges(puzzle));
  return { solutions, guesses };
}
