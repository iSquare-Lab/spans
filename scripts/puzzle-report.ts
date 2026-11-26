// Prints, for some seeds of each difficulty, how long a puzzle takes to make and how hard it is.
import { generate, LEVELS, type Difficulty } from '../src/generator.ts';
import { solve } from '../src/solver.ts';

const avg = (a: number[]) => (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);

const seeds = Number(process.argv[2] ?? 20);
for (const difficulty of Object.keys(LEVELS) as Difficulty[]) {
  const times: number[] = [], islands: number[] = [], guesses: number[] = [], attempts: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const made = generate(difficulty, seed * 7919);
    times.push(performance.now() - t0);
    islands.push(made.puzzle.islands.length);
    attempts.push(made.attempts);
    guesses.push(solve(made.puzzle, 2).guesses);
  }
  console.log(`${difficulty.padEnd(6)} islands ${avg(islands)}  guesses ${avg(guesses)}  attempts ${avg(attempts)}  ms avg ${avg(times)}  max ${Math.max(...times).toFixed(0)}`);
}
