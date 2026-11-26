import type { Difficulty } from './generator.ts';

// Everything Spans keeps lives in this browser's localStorage, under "spans:". Nothing is sent anywhere.

export type Kind = 'daily' | 'practice';

export type SavedGame = { seed: number; bridges: number[]; elapsed: number; hints: number; solved: boolean; date?: string };

export type Stats = {
  // Daily puzzles solved, by local date ("2026-11-26") and difficulty.
  daily: Record<string, Partial<Record<Difficulty, { ms: number; hints: number }>>>;
  // Fastest solve without hints, by difficulty.
  best: Partial<Record<Difficulty, number>>;
  solved: number;
};

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`spans:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
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

export const loadGame = (difficulty: Difficulty, kind: Kind) => read<SavedGame>(`game:${kind}:${difficulty}`);
export const saveGame = (difficulty: Difficulty, kind: Kind, game: SavedGame) => write(`game:${kind}:${difficulty}`, game);

export function loadStats(): Stats {
  const stats = read<Stats>('stats');
  return { daily: stats?.daily ?? {}, best: stats?.best ?? {}, solved: stats?.solved ?? 0 };
}
export const saveStats = (stats: Stats) => write('stats', stats);

export function loadPrefs(): { difficulty: Difficulty; kind: Kind; sound: boolean } {
  const prefs = read<{ difficulty: Difficulty; kind: Kind; sound: boolean }>('prefs');
  return {
    difficulty: prefs?.difficulty === 'easy' || prefs?.difficulty === 'hard' ? prefs.difficulty : 'medium',
    kind: prefs?.kind === 'practice' ? 'practice' : 'daily',
    sound: prefs?.sound !== false,
  };
}
export const savePrefs = (prefs: { difficulty: Difficulty; kind: Kind; sound: boolean }) => write('prefs', prefs);

export function saveTheme(theme: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem('spans:theme', theme);
  } catch {
    /* ignore */
  }
}
