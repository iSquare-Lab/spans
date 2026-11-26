import { describe, expect, it } from 'vitest';
import { generate, LEVELS, type Difficulty } from '../src/generator.ts';
import { Game } from '../src/game.ts';
import { isSolved, makePuzzle } from '../src/puzzle.ts';
import { solve } from '../src/solver.ts';

describe('the rules', () => {
  // 2 — 2 on one row, a 1 below each: a square with a gap.
  const square = makePuzzle(3, 3, [
    { x: 0, y: 0, need: 2 },
    { x: 2, y: 0, need: 2 },
    { x: 0, y: 2, need: 1 },
    { x: 2, y: 2, need: 1 },
  ]);

  it('finds the islands that see each other and the bridges that would cross', () => {
    expect(square.edges.map((e) => [e.a, e.b, e.horizontal])).toEqual([[0, 1, true], [0, 2, false], [1, 3, false], [2, 3, true]]);
    const cross = makePuzzle(3, 3, [
      { x: 1, y: 0, need: 1 }, { x: 0, y: 1, need: 1 }, { x: 2, y: 1, need: 1 }, { x: 1, y: 2, need: 1 },
    ]);
    const h = cross.edges.find((e) => e.horizontal)!, v = cross.edges.find((e) => !e.horizontal)!;
    expect(cross.crossings[h.id]).toEqual([v.id]);
  });

  it('needs every count right and every island connected', () => {
    expect(isSolved(square, [1, 1, 1, 0])).toBe(true);
    expect(isSolved(square, [2, 0, 0, 1])).toBe(false);
    expect(solve(square, 5).solutions).toEqual([[1, 1, 1, 0]]);
  });
});

describe('generated puzzles', () => {
  for (const difficulty of Object.keys(LEVELS) as Difficulty[]) {
    it(`${difficulty}: same seed, same puzzle, one solution, the right size`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const made = generate(difficulty, seed);
        expect(generate(difficulty, seed).puzzle.islands).toEqual(made.puzzle.islands);
        const result = solve(made.puzzle, 2);
        expect(result.solutions).toHaveLength(1);
        expect(isSolved(made.puzzle, made.solution)).toBe(true);
        const [min, max] = LEVELS[difficulty].islands;
        expect(made.puzzle.islands.length).toBeGreaterThanOrEqual(min);
        expect(made.puzzle.islands.length).toBeLessThanOrEqual(max);
        expect(made.puzzle.islands.every((i) => i.need >= 1 && i.need <= 8)).toBe(true);
        if (difficulty === 'easy') expect(result.guesses).toBe(0);
      }
    });
  }
});

describe('a game', () => {
  it('cycles 0, 1, 2, 0, refuses crossings, and undoes', () => {
    const cross = makePuzzle(3, 3, [
      { x: 1, y: 0, need: 1 }, { x: 0, y: 1, need: 1 }, { x: 2, y: 1, need: 1 }, { x: 1, y: 2, need: 1 },
    ]);
    const game = new Game(cross, cross.edges.map(() => 0));
    const h = cross.edges.find((e) => e.horizontal)!.id, v = cross.edges.find((e) => !e.horizontal)!.id;
    expect(game.next(h)).toBe(1);
    game.set(h, 1);
    expect(game.next(v)).toBeNull();
    expect(game.next(h)).toBe(2);
    game.set(h, 2);
    expect(game.next(h)).toBe(0);
    expect(game.undo()).toBe(h);
    expect(game.bridges[h]).toBe(1);
  });

  it('solves any puzzle by following its hints alone', () => {
    for (const difficulty of Object.keys(LEVELS) as Difficulty[]) {
      for (let seed = 100; seed < 106; seed++) {
        const { puzzle, solution } = generate(difficulty, seed);
        const game = new Game(puzzle, solution);
        // A wrong start: a bridge the solution does not have, where one exists.
        const wrong = solution.findIndex((v) => v < 2);
        game.set(wrong, solution[wrong] + 1);
        let steps = 0;
        for (let h = game.hint(); h; h = game.hint()) {
          game.set(h.edge, h.value);
          if (++steps > 500) throw new Error('hints never finish');
        }
        expect(game.solved()).toBe(true);
        expect(game.bridges).toEqual(solution);
      }
    }
  });
});
