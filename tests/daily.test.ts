import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailySeed, dayNumber, formatTime, spokenTime, streak, today } from '../src/daily.ts';

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

  it('keeps a streak across the end of a month and a year', () => {
    const solved = { ms: 1, hints: 0 };
    const stats = { daily: { '2026-12-30': { easy: solved }, '2026-12-31': { easy: solved }, '2027-01-01': { hard: solved } }, best: {}, solved: 3 };
    expect(streak(stats, '2027-01-01')).toBe(3);
    const months = { daily: { '2027-02-28': { easy: solved }, '2027-03-01': { easy: solved } }, best: {}, solved: 2 };
    expect(streak(months, '2027-03-01')).toBe(2);
  });

  describe('across a daylight saving change', () => {
    const before = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'Europe/Berlin';
    });
    afterAll(() => {
      process.env.TZ = before;
    });

    it('counts a day of 23 or 25 hours as one day', () => {
      const solved = { ms: 1, hints: 0 };
      // Clocks go forward on 2026-03-29 and back on 2026-10-25 in Berlin.
      const spring = { daily: { '2026-03-28': { easy: solved }, '2026-03-29': { easy: solved }, '2026-03-30': { easy: solved } }, best: {}, solved: 3 };
      expect(streak(spring, '2026-03-30')).toBe(3);
      const autumn = { daily: { '2026-10-24': { easy: solved }, '2026-10-25': { easy: solved }, '2026-10-26': { easy: solved } }, best: {}, solved: 3 };
      expect(streak(autumn, '2026-10-26')).toBe(3);
      expect(today(new Date(2026, 2, 29, 23, 30))).toBe('2026-03-29');
    });
  });

  it('formats times', () => {
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(3_726_000)).toBe('1:02:06');
  });

  it('speaks times in words', () => {
    expect(spokenTime(0)).toBe('0 seconds');
    expect(spokenTime(1_999)).toBe('1 second');
    expect(spokenTime(61_000)).toBe('1 minute 1 second');
    expect(spokenTime(125_400)).toBe('2 minutes 5 seconds');
    expect(spokenTime(3_726_000)).toBe('62 minutes 6 seconds');
  });
});
