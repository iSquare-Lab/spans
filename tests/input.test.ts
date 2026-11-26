import { describe, expect, it } from 'vitest';
import { edgeAt, islandAt, step, tapIsland } from '../src/input.ts';
import { makePuzzle } from '../src/puzzle.ts';
import type { View } from '../src/render.ts';

// 0 . 1
// . . .
// 2 . 3   with a lone island 4 off to the right of 1's row, out of 0's sight.
const puzzle = makePuzzle(5, 3, [
  { x: 0, y: 0, need: 2 },
  { x: 2, y: 0, need: 3 },
  { x: 0, y: 2, need: 1 },
  { x: 2, y: 2, need: 1 },
  { x: 4, y: 0, need: 1 },
]);
const view: View = {
  cell: 10, ox: 0, oy: 0, cursor: 0, showCursor: false, selected: null, drag: null, hint: null, celebrate: 0, reducedMotion: false,
};

describe('tapping islands', () => {
  it('selects the first island, builds on a neighbour it sees, and drops a second tap on itself', () => {
    expect(tapIsland(puzzle, null, 0)).toEqual({ select: 0 });
    const edge = puzzle.edges.find((e) => e.a === 0 && e.b === 1)!;
    expect(tapIsland(puzzle, 0, 1)).toEqual({ build: edge.id });
    expect(tapIsland(puzzle, 0, 0)).toEqual({ select: null });
  });

  it('moves the selection to an island the selected one cannot see', () => {
    expect(tapIsland(puzzle, 0, 3)).toEqual({ select: 3 });
    expect(tapIsland(puzzle, 0, 4)).toEqual({ select: 4 });
  });
});

describe('finding things on the board', () => {
  it('finds the island under a point and the bridge line under the water', () => {
    expect(islandAt(puzzle, view, 5, 5)).toBe(0);
    expect(islandAt(puzzle, view, 15, 5)).toBeUndefined();
    const top = puzzle.edges.find((e) => e.a === 0 && e.b === 1)!;
    expect(edgeAt(puzzle, view, 15, 6)).toBe(top.id);
    expect(edgeAt(puzzle, view, 15, 15)).toBeUndefined();
  });

  it('moves by arrow to the island in sight, else the nearest one that way', () => {
    expect(step(puzzle, 0, 1, 0)).toBe(1);
    expect(step(puzzle, 2, 0, -1)).toBe(0);
    expect(step(puzzle, 3, 1, 0)).toBe(4);
    expect(step(puzzle, 0, -1, 0)).toBeUndefined();
  });
});
