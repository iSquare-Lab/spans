import { bridgeCount, blockers, directionName, isSolved, type Bridges, type Puzzle } from './puzzle.ts';
import { propagate, fullRanges } from './solver.ts';

// One puzzle being played: the bridges built so far, the moves to undo, and the rules for changing a bridge.
export class Game {
  readonly puzzle: Puzzle;
  readonly solution: Bridges;
  bridges: Bridges;
  history: { edge: number; from: number }[] = [];
  hints = 0;

  constructor(puzzle: Puzzle, solution: Bridges, bridges?: Bridges) {
    this.puzzle = puzzle;
    this.solution = solution;
    this.bridges = bridges && bridges.length === puzzle.edges.length ? bridges.slice() : puzzle.edges.map(() => 0);
  }

  // The next count for an edge: 0 → 1 → 2 → 0. A bridge that would cross another one cannot be built.
  next(edge: number): number | null {
    const now = this.bridges[edge];
    const target = now === 2 ? 0 : now + 1;
    if (target > 0 && blockers(this.puzzle, this.bridges, edge).length) return null;
    return target;
  }

  set(edge: number, value: number): boolean {
    if (this.bridges[edge] === value) return false;
    this.history.push({ edge, from: this.bridges[edge] });
    this.bridges[edge] = value;
    return true;
  }

  undo(): number | null {
    const last = this.history.pop();
    if (!last) return null;
    this.bridges[last.edge] = last.from;
    return last.edge;
  }

  restart(): void {
    if (this.bridges.every((b) => b === 0)) return;
    this.bridges = this.bridges.map(() => 0);
    this.history = [];
  }

  count(island: number): number {
    return bridgeCount(this.puzzle, this.bridges, island);
  }

  solved(): boolean {
    return isSolved(this.puzzle, this.bridges);
  }

  // A hint, in the order a person would want one: first a bridge that is not part of the solution, then a bridge that
  // the rules force from what is built now, and only then a bridge from the solution.
  hint(): Hint | null {
    const { puzzle, bridges, solution } = this;
    if (this.solved()) return null;
    for (let e = 0; e < bridges.length; e++) {
      if (bridges[e] > solution[e]) return { kind: 'wrong', edge: e, value: solution[e], text: this.describeWrong(e) };
    }
    const ranges = fullRanges(puzzle);
    for (let e = 0; e < bridges.length; e++) ranges.lo[e] = bridges[e];
    if (propagate(puzzle, ranges)) {
      for (let e = 0; e < bridges.length; e++) {
        if (ranges.lo[e] > bridges[e] && ranges.lo[e] === solution[e]) {
          return { kind: 'forced', edge: e, value: ranges.lo[e], text: this.describeForced(e, ranges.lo[e]) };
        }
      }
    }
    for (let e = 0; e < bridges.length; e++) {
      if (bridges[e] < solution[e]) return { kind: 'reveal', edge: e, value: solution[e], text: this.describeForced(e, solution[e]) };
    }
    return null;
  }

  private describeWrong(edge: number): string {
    const { a, b } = this.puzzle.edges[edge];
    const many = this.bridges[edge] - this.solution[edge];
    return `${many === 2 ? 'These two bridges' : 'One bridge'} between ${this.name(a)} and ${this.name(b)} ${many === 2 ? 'are' : 'is'} not part of the solution.`;
  }

  private describeForced(edge: number, value: number): string {
    const { a, b } = this.puzzle.edges[edge];
    const A = this.puzzle.islands[a], B = this.puzzle.islands[b];
    const dir = directionName(Math.sign(B.x - A.x), Math.sign(B.y - A.y));
    const text = `${this.name(a)} needs ${value === 2 ? 'two bridges' : 'a bridge'} ${dir} to ${this.name(b)}.`;
    return text[0].toUpperCase() + text.slice(1);
  }

  name(island: number): string {
    const i = this.puzzle.islands[island];
    return `the ${i.need} at row ${i.y + 1}, column ${i.x + 1}`;
  }
}

export type Hint = { kind: 'wrong' | 'forced' | 'reveal'; edge: number; value: number; text: string };
