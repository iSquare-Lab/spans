import { describe, expect, it } from 'vitest';
import { dailySeed, dayNumber, formatTime, streak, today } from '../src/daily.ts';

describe('daily puzzles', () => {
  it('numbers days from the first one and seeds by date and size', () => {
    expect(dayNumber('2026-11-26')).toBe(1);
    expect(dayNumber('2027-01-01')).toBe(37);
    expect(dailySeed('2026-11-26', 'hard')).toBe(dailySeed('2026-11-26', 'hard'));
    expect(dailySeed('2026-11-26', 'hard')).not.toBe(dailySeed('2026-11-27', 'hard'));
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('counts a streak of days in a row, not broken by today being open', () => {
    const solved = { ms: 1, hints: 0 };
    const stats = { daily: { '2026-11-24': { easy: solved }, '2026-11-25': { hard: solved } }, best: {}, solved: 2 };
    expect(streak(stats, '2026-11-26')).toBe(2);
    expect(streak(stats, '2026-11-25')).toBe(2);
    expect(streak(stats, '2026-11-28')).toBe(0);
  });

  it('formats times', () => {
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(3_726_000)).toBe('1:02:06');
  });
});
