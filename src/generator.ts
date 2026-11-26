import { makePuzzle, type Bridges, type Island, type Puzzle } from './puzzle.ts';
import { solve } from './solver.ts';

// A small, fast, seeded random generator (mulberry32), so a seed always gives the same puzzle.
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A text seed ("spans:2026-11-26:hard") as a number (32-bit FNV-1a).
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export const LEVELS: Record<Difficulty, { size: number; islands: [number, number]; loops: number; guesses: [number, number] }> = {
  // Easy: solved by reasoning alone. Medium and hard need a few longer chains of reasoning.
  easy: { size: 7, islands: [10, 13], loops: 0.25, guesses: [0, 0] },
  medium: { size: 9, islands: [17, 22], loops: 0.45, guesses: [1, 12] },
  hard: { size: 12, islands: [28, 36], loops: 0.6, guesses: [4, 400] },
};

export type Generated = { puzzle: Puzzle; solution: Bridges; attempts: number };

// How many times growing a solution tries to add an island before it settles for what it has.
const GROW_TRIES = 4000;
// The chance that a bridge from the island it grew from is double, and that a loop bridge is.
const DOUBLE_CHANCE = 0.4;
const LOOP_DOUBLE_CHANCE = 0.3;

// Grows a solution from one island, then keeps it only if it has exactly one solution and fits the difficulty.
export function generate(difficulty: Difficulty, seed: number): Generated {
  const level = LEVELS[difficulty];
  const rand = random(seed);
  for (let attempt = 1; ; attempt++) {
    const puzzle = grow(level.size, level.size, level.islands, level.loops, rand);
    if (!puzzle) continue;
    const { solutions, guesses } = solve(puzzle, 2);
    if (solutions.length !== 1) continue;
    if (guesses < level.guesses[0] || guesses > level.guesses[1]) continue;
    return { puzzle, solution: solutions[0], attempts: attempt };
  }
}

// Grid cells while growing.
const EMPTY = 0, ISLAND = 1, BRIDGE = 2;

function grow(width: number, height: number, [minIslands, maxIslands]: [number, number], loops: number, rand: () => number): Puzzle | null {
  const target = minIslands + Math.floor(rand() * (maxIslands - minIslands + 1));
  const grid = new Uint8Array(width * height);
  const islands: { x: number; y: number }[] = [];
  const links: { a: number; b: number; count: number }[] = [];
  const index = (x: number, y: number) => y * width + x;
  const islandAt = new Map<number, number>();
  const place = (x: number, y: number) => {
    grid[index(x, y)] = ISLAND;
    islandAt.set(index(x, y), islands.length);
    islands.push({ x, y });
    return islands.length - 1;
  };
  // Islands side by side look cramped and give little to reason about.
  const crowded = (x: number, y: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && grid[index(nx, ny)] === ISLAND) return true;
    }
    return false;
  };
  place(Math.floor(rand() * width), Math.floor(rand() * height));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  let tries = 0;
  while (islands.length < target && tries < GROW_TRIES) {
    tries++;
    const from = Math.floor(rand() * islands.length);
    const [dx, dy] = dirs[Math.floor(rand() * 4)];
    const length = 2 + Math.floor(rand() * Math.max(1, Math.floor(Math.max(width, height) / 2)));
    const { x, y } = islands[from];
    const tx = x + dx * length, ty = y + dy * length;
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
    if (grid[index(tx, ty)] !== EMPTY || crowded(tx, ty)) continue;
    let clear = true;
    for (let s = 1; s < length; s++) if (grid[index(x + dx * s, y + dy * s)] !== EMPTY) clear = false;
    if (!clear) continue;
    for (let s = 1; s < length; s++) grid[index(x + dx * s, y + dy * s)] = BRIDGE;
    const to = place(tx, ty);
    links.push({ a: from, b: to, count: rand() < DOUBLE_CHANCE ? 2 : 1 });
  }
  if (islands.length < minIslands) return null;
  // Extra bridges between islands that already see each other over empty water make loops, which make the puzzle
  // less of a tree to peel from the leaves.
  for (let i = 0; i < islands.length; i++) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      let x = islands[i].x + dx, y = islands[i].y + dy;
      const path: number[] = [];
      while (x < width && y < height && grid[index(x, y)] === EMPTY) {
        path.push(index(x, y));
        x += dx;
        y += dy;
      }
      if (x >= width || y >= height || grid[index(x, y)] !== ISLAND || path.length === 0) continue;
      const j = islandAt.get(index(x, y))!;
      if (rand() >= loops) continue;
      for (const cell of path) grid[cell] = BRIDGE;
      links.push({ a: i, b: j, count: rand() < LOOP_DOUBLE_CHANCE ? 2 : 1 });
    }
  }
  const need = islands.map(() => 0);
  for (const link of links) {
    need[link.a] += link.count;
    need[link.b] += link.count;
  }
  // Every island has a bridge, and at most two on each of four sides, so each number is 1 to 8.
  return makePuzzle(width, height, islands.map((island, i): Omit<Island, 'id'> => ({ ...island, need: need[i] })));
}
