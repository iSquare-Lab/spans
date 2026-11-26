import { describe, expect, it } from 'vitest';
import { generate, LEVELS, type Difficulty } from '../src/generator.ts';
import { Game } from '../src/game.ts';
import { isSolved, makePuzzle } from '../src/puzzle.ts';
import { fullRanges, propagate, solve } from '../src/solver.ts';

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

describe('the solver', () => {
  // 1 . 1
  // . . .
  // 2 . 2   Two closed pairs (1–1, and 2–2 with a double bridge) fit the counts but leave the islands apart.
  const pairs = makePuzzle(3, 3, [
    { x: 0, y: 0, need: 1 },
    { x: 2, y: 0, need: 1 },
    { x: 0, y: 2, need: 2 },
    { x: 2, y: 2, need: 2 },
  ]);
  const edge = (a: number, b: number) => pairs.edges.find((e) => e.a === a && e.b === b)!.id;

  it('never joins two 1s, nor two 2s with a double bridge, when other islands are left', () => {
    const r = fullRanges(pairs);
    expect(propagate(pairs, r)).toBe(true);
    expect(r.hi[edge(0, 1)]).toBe(0);
    expect(r.hi[edge(2, 3)]).toBe(1);
    const solution = pairs.edges.map(() => 0);
    solution[edge(0, 2)] = 1;
    solution[edge(1, 3)] = 1;
    solution[edge(2, 3)] = 1;
    expect(Array.from(r.lo)).toEqual(solution);
    expect(solve(pairs, 5).solutions).toEqual([solution]);
  });

  it('lets two islands alone be a pair', () => {
    expect(solve(makePuzzle(3, 1, [{ x: 0, y: 0, need: 1 }, { x: 2, y: 0, need: 1 }]), 5).solutions).toEqual([[1]]);
    expect(solve(makePuzzle(3, 1, [{ x: 0, y: 0, need: 2 }, { x: 2, y: 0, need: 2 }]), 5).solutions).toEqual([[2]]);
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

  it('starts over with no bridges and nothing to undo', () => {
    const square = makePuzzle(3, 3, [
      { x: 0, y: 0, need: 2 }, { x: 2, y: 0, need: 2 }, { x: 0, y: 2, need: 1 }, { x: 2, y: 2, need: 1 },
    ]);
    const game = new Game(square, [1, 1, 1, 0]);
    game.set(0, 1);
    game.set(1, 2);
    game.restart();
    expect(game.bridges).toEqual([0, 0, 0, 0]);
    expect(game.history).toEqual([]);
    expect(game.undo()).toBeNull();
    // Starting over an empty board changes nothing.
    game.restart();
    expect(game.bridges).toEqual([0, 0, 0, 0]);
  });

  it('gives hints in order: a wrong bridge, then a forced one, then one from the solution', () => {
    // 2 — 2 above, a 1 below each: the rules force every bridge from an empty board.
    const square = makePuzzle(3, 3, [
      { x: 0, y: 0, need: 2 }, { x: 2, y: 0, need: 2 }, { x: 0, y: 2, need: 1 }, { x: 2, y: 2, need: 1 },
    ]);
    const game = new Game(square, [1, 1, 1, 0]);
    game.set(3, 1);
    expect(game.hint()).toMatchObject({ kind: 'wrong', edge: 3, value: 0, text: 'One bridge between the 1 at row 3, column 1 and the 1 at row 3, column 3 is not part of the solution.' });
    game.set(3, 0);
    expect(game.hint()).toMatchObject({ kind: 'forced', edge: 0, value: 1, text: 'The 2 at row 1, column 1 needs a bridge east to the 2 at row 1, column 3.' });

    // A hard puzzle needs more than reasoning from the start, so following forced hints runs out and a reveal follows.
    const { puzzle, solution } = generate('hard', 7);
    const hard = new Game(puzzle, solution);
    const kinds: string[] = [];
    for (let h = hard.hint(); h; h = hard.hint()) {
      kinds.push(h.kind);
      if (h.kind === 'reveal') {
        expect(h.text).toMatch(/^In the solution, the \d at row \d+, column \d+ has (a bridge|two bridges) (north|south|east|west) to the \d at row \d+, column \d+\.$/);
        // A reveal comes only when nothing is forced: the board as it stands forces no further bridge.
        break;
      }
      hard.set(h.edge, h.value);
    }
    expect(kinds.at(-1)).toBe('reveal');
    expect(kinds.slice(0, -1).every((k) => k === 'forced')).toBe(true);
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
