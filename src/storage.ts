import type { Difficulty } from './generator.ts';

// Everything Spans keeps lives in this browser's localStorage, under "spans:". Nothing is sent anywhere.
// Stored data can be old or edited by hand, so everything read back is checked before it is used.

export type Kind = 'daily' | 'practice';

export type SavedGame = { seed: number; bridges: number[]; elapsed: number; hints: number; solved: boolean; date?: string };

export type Solve = { ms: number; hints: number };

export type Stats = {
  // Daily puzzles solved, by local date ("2026-11-26") and difficulty.
  daily: Record<string, Partial<Record<Difficulty, Solve>>>;
  // Fastest solve without hints, by difficulty.
  best: Partial<Record<Difficulty, number>>;
  solved: number;
};

export type Prefs = { difficulty: Difficulty; kind: Kind; sound: boolean };

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isDuration = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(`spans:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`spans:${key}`, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the game still works, it just does not remember */
  }
}

// A saved game, or null when the value is not one. Whether its bridges fit the puzzle is checked once the puzzle is
// made, since a practice game's seed decides which puzzle that is.
export function parseSavedGame(value: unknown): SavedGame | null {
  if (!isRecord(value)) return null;
  const { seed, bridges, elapsed, hints, solved, date } = value;
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) >= 2 ** 32) return null;
  if (!Array.isArray(bridges) || !bridges.every((b) => b === 0 || b === 1 || b === 2)) return null;
  if (!isDuration(elapsed) || !isCount(hints)) return null;
  if (solved !== undefined && typeof solved !== 'boolean') return null;
  if (date !== undefined && (typeof date !== 'string' || !DATE.test(date))) return null;
  return { seed: seed as number, bridges: bridges as number[], elapsed, hints, solved: solved ?? false, ...(date === undefined ? {} : { date }) };
}

// Stats with every entry that does not have the right shape left out.
export function parseStats(value: unknown): Stats {
  const stats: Stats = { daily: {}, best: {}, solved: 0 };
  if (!isRecord(value)) return stats;
  if (isRecord(value.daily)) {
    for (const [date, day] of Object.entries(value.daily)) {
      if (!DATE.test(date) || !isRecord(day)) continue;
      const kept: Partial<Record<Difficulty, Solve>> = {};
      for (const difficulty of DIFFICULTIES) {
        const solve = day[difficulty];
        if (isRecord(solve) && isDuration(solve.ms) && isCount(solve.hints)) kept[difficulty] = { ms: solve.ms, hints: solve.hints };
      }
      if (Object.keys(kept).length) stats.daily[date] = kept;
    }
  }
  if (isRecord(value.best)) {
    for (const difficulty of DIFFICULTIES) {
      const ms = value.best[difficulty];
      if (isDuration(ms)) stats.best[difficulty] = ms;
    }
  }
  if (isCount(value.solved)) stats.solved = value.solved;
  return stats;
}

export const loadGame = (difficulty: Difficulty, kind: Kind) => parseSavedGame(read(`game:${kind}:${difficulty}`));
export const saveGame = (difficulty: Difficulty, kind: Kind, game: SavedGame) => write(`game:${kind}:${difficulty}`, game);

export const loadStats = () => parseStats(read('stats'));
export const saveStats = (stats: Stats) => write('stats', stats);

export function loadPrefs(): Prefs {
  const prefs = read('prefs');
  const p = isRecord(prefs) ? prefs : {};
  return {
    difficulty: p.difficulty === 'easy' || p.difficulty === 'hard' ? p.difficulty : 'medium',
    kind: p.kind === 'practice' ? 'practice' : 'daily',
    sound: p.sound !== false,
  };
}
export const savePrefs = (prefs: Prefs) => write('prefs', prefs);

// The theme picked with the theme button, if any. It is stored as plain text, as public/theme-init.js reads it.
export function loadTheme(): 'light' | 'dark' | null {
  try {
    const theme = window.localStorage.getItem('spans:theme');
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}
export function saveTheme(theme: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem('spans:theme', theme);
  } catch {
    /* storage unavailable */
  }
}
