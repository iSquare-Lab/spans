import { describe, expect, it } from 'vitest';
import { dailySeed } from '../src/daily.ts';
import { generate, type Difficulty } from '../src/generator.ts';

// The daily puzzles of one fixed date, as [x, y, number] per island and bridges per edge. Everyone gets the same daily
// puzzle only while the generator stays the same, so a change here must be on purpose: it changes every past and
// future daily puzzle.
const DAY = '2026-11-26';
const GOLDEN: Record<Difficulty, { islands: number[][]; solution: number[] }> = {
  easy: {
    islands: [[6, 4, 4], [3, 4, 5], [6, 6, 3], [3, 2, 2], [2, 6, 2], [0, 2, 3], [1, 4, 2], [0, 5, 3], [6, 1, 2], [4, 5, 1], [4, 1, 3], [4, 3, 1], [1, 1, 1]],
    solution: [1, 2, 1, 2, 1, 2, 2, 1, 1, 1, 1, 0, 1, 0],
  },
  medium: {
    islands: [
      [2, 5, 4], [2, 7, 6], [5, 7, 2], [0, 5, 2], [0, 3, 3], [5, 3, 2], [5, 1, 4], [4, 5, 3], [8, 1, 3], [8, 4, 2], [0, 7, 2], [8, 7, 1],
      [6, 5, 5], [2, 1, 1], [0, 0, 1], [6, 8, 2], [6, 2, 1],
    ],
    solution: [1, 2, 2, 0, 1, 0, 1, 1, 0, 2, 1, 2, 1, 1, 2, 2, 1, 0, 1, 1],
  },
  hard: {
    islands: [
      [5, 3, 3], [5, 1, 4], [5, 8, 5], [0, 8, 3], [0, 5, 5], [11, 1, 2], [10, 3, 2], [2, 1, 3], [11, 8, 3], [2, 4, 2], [0, 0, 4], [4, 4, 4],
      [7, 8, 2], [10, 6, 4], [11, 11, 3], [6, 6, 4], [7, 11, 3], [0, 11, 2], [10, 9, 3], [4, 6, 2], [6, 4, 4], [2, 6, 1], [8, 4, 2], [4, 0, 3],
      [7, 0, 2], [3, 5, 2], [4, 2, 2], [9, 11, 2], [8, 9, 4], [9, 0, 1], [8, 7, 2], [5, 10, 3], [3, 10, 2], [1, 10, 1],
    ],
    solution: [
      1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 0, 2, 2, 0, 1, 0, 1, 1, 2, 1, 1, 0, 2, 2, 1, 0, 1, 0, 1, 0, 0, 2, 1, 2, 0, 2, 1, 1,
    ],
  },
};

describe(`the daily puzzles of ${DAY}`, () => {
  for (const difficulty of Object.keys(GOLDEN) as Difficulty[]) {
    it(`${difficulty} stays the same`, () => {
      const { puzzle, solution } = generate(difficulty, dailySeed(DAY, difficulty));
      expect(puzzle.islands.map((i) => [i.x, i.y, i.need])).toEqual(GOLDEN[difficulty].islands);
      expect(solution).toEqual(GOLDEN[difficulty].solution);
    });
  }
});
