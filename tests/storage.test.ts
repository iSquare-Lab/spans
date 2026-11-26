import { describe, expect, it } from 'vitest';
import { parseSavedGame, parseStats } from '../src/storage.ts';

describe('saved games read back', () => {
  const good = { seed: 123, bridges: [0, 1, 2], elapsed: 1500.5, hints: 1, solved: false, date: '2026-11-26' };

  it('keeps a well-formed game', () => {
    expect(parseSavedGame(good)).toEqual(good);
    // Older saves may lack the date and the solved flag.
    expect(parseSavedGame({ seed: 0, bridges: [], elapsed: 0, hints: 0 })).toEqual({ seed: 0, bridges: [], elapsed: 0, hints: 0, solved: false });
  });

  it('turns anything else into null', () => {
    for (const bad of [
      null,
      'text',
      42,
      [good],
      { ...good, seed: '123' },
      { ...good, seed: 1.5 },
      { ...good, seed: -1 },
      { ...good, seed: 2 ** 32 },
      { ...good, bridges: 'nope' },
      { ...good, bridges: [0, 3] },
      { ...good, bridges: [0, -1] },
      { ...good, bridges: [0, 1.5] },
      { ...good, bridges: [0, '1'] },
      { ...good, elapsed: -1 },
      { ...good, elapsed: Number.POSITIVE_INFINITY },
      { ...good, elapsed: Number.NaN },
      { ...good, elapsed: '10' },
      { ...good, hints: -1 },
      { ...good, hints: 0.5 },
      { ...good, solved: 'yes' },
      { ...good, date: 20261126 },
      { ...good, date: 'yesterday' },
    ]) {
      expect(parseSavedGame(bad)).toBeNull();
    }
  });
});

describe('stats read back', () => {
  it('starts empty from nothing or from junk', () => {
    const empty = { daily: {}, best: {}, solved: 0 };
    expect(parseStats(null)).toEqual(empty);
    expect(parseStats('junk')).toEqual(empty);
    expect(parseStats([1, 2])).toEqual(empty);
    expect(parseStats({ daily: 'x', best: [], solved: -3 })).toEqual(empty);
  });

  it('keeps the good entries and drops the bad ones', () => {
    const stats = parseStats({
      daily: {
        '2026-11-25': { easy: { ms: 60000, hints: 0 }, medium: { ms: -5, hints: 0 }, giant: { ms: 1, hints: 0 } },
        '2026-11-26': { hard: { ms: 90000, hints: 2 } },
        '2026-11-27': { easy: { ms: 1000, hints: 'none' } },
        'not a date': { easy: { ms: 1000, hints: 0 } },
        '2026-11-28': null,
      },
      best: { easy: 60000, medium: 'fast', hard: Number.NaN, giant: 5 },
      solved: 7,
    });
    expect(stats).toEqual({
      daily: { '2026-11-25': { easy: { ms: 60000, hints: 0 } }, '2026-11-26': { hard: { ms: 90000, hints: 2 } } },
      best: { easy: 60000 },
      solved: 7,
    });
    expect(parseStats({ solved: 2.5 }).solved).toBe(0);
  });
});
