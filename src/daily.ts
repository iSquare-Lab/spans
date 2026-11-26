import { hashSeed, type Difficulty } from './generator.ts';
import type { Stats } from './storage.ts';

// The first daily puzzle. Puzzle numbers count from it.
const FIRST_DAY = Date.UTC(2026, 10, 26);

// The local calendar date as "YYYY-MM-DD", so a new puzzle starts at midnight wherever the player is.
export function today(now = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - FIRST_DAY) / 86400000) + 1;
}

export function dailySeed(date: string, difficulty: Difficulty): number {
  return hashSeed(`spans:${date}:${difficulty}`);
}

function previousDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  return today(t);
}

// Days in a row, up to today, with at least one daily puzzle solved. Today not solved yet does not break it.
export function streak(stats: Stats, date: string): number {
  let day = stats.daily[date] && Object.keys(stats.daily[date]).length ? date : previousDay(date);
  let count = 0;
  while (stats.daily[day] && Object.keys(stats.daily[day]).length) {
    count++;
    day = previousDay(day);
  }
  return count;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function spokenTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  parts.push(`${sec} second${sec === 1 ? '' : 's'}`);
  return parts.join(' ');
}
