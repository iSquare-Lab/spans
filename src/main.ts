import '@fontsource-variable/outfit';
import './style.css';
import { playBlocked, playBridge, playIsland, playSolved, setSound } from './audio.ts';
import { dailySeed, dayNumber, formatTime, spokenTime, streak, today } from './daily.ts';
import { Game } from './game.ts';
import { generate, type Difficulty } from './generator.ts';
import { bindBoard, bindShortcuts } from './input.ts';
import { blockers, directionName } from './puzzle.ts';
import { animating, draw, layout, readColors, type Colors, type View } from './render.ts';
import { loadGame, loadPrefs, loadStats, loadTheme, saveGame, savePrefs, saveStats, saveTheme, type Kind } from './storage.ts';

// How long the solved glow lasts, the pause before the solved card, how long a hint stays lit, and how long the share
// button says "Copied".
const SOLVED_GLOW_MS = 1400;
const WIN_CARD_DELAY_MS = 650;
const HINT_MS = 4000;
const COPIED_MS = 1800;

const ICONS: Record<string, string> = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/>',
  theme: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 15a7 7 0 1 0 1.3-8.2L4 10"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
for (const el of document.querySelectorAll<HTMLElement>('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const frame = $('board-frame');
const ctx = canvas.getContext('2d')!;
const status = $('board-status');
const hintText = $('hint-text');
const timerEl = $('timer');
const win = $<HTMLDialogElement>('win');
const helpDialog = $<HTMLDialogElement>('help-dialog');
const kindRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="kind"]')];
const difficultyRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="difficulty"]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const narrow = window.matchMedia('(max-width: 900px)');

const prefs = loadPrefs();
const stats = loadStats();
setSound(prefs.sound);

let active: Game | undefined;
let seed = 0;
let date = today();
let elapsed = 0;
let runningSince: number | null = null;
let solvedShown = false;
let glowStart: number | null = null;
let winTimer: number | undefined;
let colors: Colors = readColors(document.documentElement);
let size = { w: 0, h: 0 };
const view: View = {
  cell: 0,
  ox: 0,
  oy: 0,
  cursor: 0,
  showCursor: false,
  selected: null,
  drag: null,
  hint: null,
  celebrate: 0,
  reducedMotion: reducedMotion.matches,
};

// The puzzle being played. Only undefined while the first one is made, before any input can reach it.
const current = (): Game => active!;

// ── Starting a puzzle ──────────────────────────────────────────────────────────────────────────────────────────────

function practiceSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

function start(difficulty: Difficulty, kind: Kind, fresh = false): void {
  persist();
  window.clearTimeout(winTimer);
  if (win.open) win.close();
  prefs.difficulty = difficulty;
  prefs.kind = kind;
  savePrefs(prefs);
  date = today();
  const stored = fresh ? null : loadGame(difficulty, kind);
  seed = kind === 'daily' ? dailySeed(date, difficulty) : stored && !stored.solved ? stored.seed : practiceSeed();
  const made = generate(difficulty, seed);
  // A saved game counts only for this very puzzle: same seed, same day for a daily, a bridge count for every edge.
  const saved =
    stored && stored.seed === seed && (kind === 'practice' || stored.date === date) && stored.bridges.length === made.puzzle.edges.length
      ? stored
      : null;
  active = new Game(made.puzzle, made.solution, saved?.bridges);
  active.hints = saved?.hints ?? 0;
  elapsed = saved?.elapsed ?? 0;
  solvedShown = saved?.solved ?? false;
  runningSince = null;
  glowStart = null;
  view.cursor = 0;
  view.selected = null;
  view.hint = null;
  view.celebrate = 0;
  hintText.textContent = '';
  updateChrome();
  resize();
  resume();
  showTime();
  status.textContent = `${title()}. ${active.puzzle.islands.length} islands.`;
}

function title(): string {
  const names = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  return prefs.kind === 'daily' ? `Daily #${dayNumber(date)} · ${names[prefs.difficulty]}` : `Practice · ${names[prefs.difficulty]}`;
}

function persist(): void {
  if (!active) return;
  pause();
  saveGame(prefs.difficulty, prefs.kind, { seed, bridges: active.bridges, elapsed, hints: active.hints, solved: solvedShown, date });
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────────────────────────

let timerId: number | undefined;

// The clock runs while the puzzle is open, unsolved, visible and not covered by the help.
function resume(): void {
  if (runningSince !== null || solvedShown || helpDialog.open || document.visibilityState !== 'visible') return;
  runningSince = performance.now();
  showTime();
}
function pause(): void {
  if (runningSince === null) return;
  elapsed += performance.now() - runningSince;
  runningSince = null;
  showTime();
}
const timeNow = () => elapsed + (runningSince === null ? 0 : performance.now() - runningSince);

// Writes the time, then, while the clock runs, again when the next second starts.
function showTime(): void {
  window.clearTimeout(timerId);
  const ms = timeNow();
  timerEl.textContent = formatTime(ms);
  if (runningSince !== null) timerId = window.setTimeout(showTime, 1000 - (ms % 1000));
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // A daily puzzle left open past midnight moves on to the new day's.
    if (prefs.kind === 'daily' && today() !== date) start(prefs.difficulty, 'daily');
    else resume();
  } else persist();
});
window.addEventListener('pagehide', persist);

// ── Changing bridges ───────────────────────────────────────────────────────────────────────────────────────────────

const complete = (island: number) => current().count(island) === current().puzzle.islands[island].need;

function cycle(edgeId: number): void {
  const game = current();
  if (solvedShown) return;
  const next = game.next(edgeId);
  const edge = game.puzzle.edges[edgeId];
  if (next === null) {
    playBlocked();
    const other = game.puzzle.edges[blockers(game.puzzle, game.bridges, edgeId)[0]];
    status.textContent = `A bridge between ${game.name(edge.a)} and ${game.name(edge.b)} would cross the bridge between ${game.name(other.a)} and ${game.name(other.b)}.`;
    return;
  }
  const before = [complete(edge.a), complete(edge.b)];
  game.set(edgeId, next);
  view.hint = null;
  hintText.textContent = '';
  const after = [complete(edge.a), complete(edge.b)];
  if ((after[0] && !before[0]) || (after[1] && !before[1])) playIsland();
  else playBridge(next);
  const A = game.puzzle.islands[edge.a], B = game.puzzle.islands[edge.b];
  const bridges = next === 0 ? 'No bridge' : next === 1 ? 'One bridge' : 'Two bridges';
  status.textContent = `${bridges} ${directionName(Math.sign(B.x - A.x), Math.sign(B.y - A.y))} from ${game.name(edge.a)} to ${game.name(edge.b)}. ${describeIsland(edge.a)} ${describeIsland(edge.b)}`;
  updateChrome();
  persist();
  resume();
  redraw();
  if (game.solved()) solved();
}

function solved(): void {
  const game = current();
  pause();
  solvedShown = true;
  const ms = Math.round(elapsed);
  stats.solved++;
  if (prefs.kind === 'daily') {
    stats.daily[date] ??= {};
    stats.daily[date][prefs.difficulty] ??= { ms, hints: game.hints };
  }
  const best = stats.best[prefs.difficulty];
  if (game.hints === 0 && (best === undefined || ms < best)) stats.best[prefs.difficulty] = ms;
  saveStats(stats);
  persist();
  playSolved();
  if (!view.reducedMotion) {
    glowStart = performance.now();
    redraw();
  }
  $('win-time').textContent = formatTime(ms);
  $('win-kicker').textContent = title();
  $('win-text').textContent =
    (game.hints ? `With ${game.hints} hint${game.hints === 1 ? '' : 's'}. ` : 'No hints. ') +
    (prefs.kind === 'daily' ? `Day streak: ${streak(stats, date)}. A new daily puzzle comes at midnight.` : 'Another one is ready when you are.');
  $('win-next').textContent = prefs.kind === 'daily' ? nextDailyLabel() : 'New puzzle';
  winTimer = window.setTimeout(() => win.showModal(), WIN_CARD_DELAY_MS);
  status.textContent = `Solved in ${spokenTime(ms)}.`;
  updateChrome();
}

// After a daily puzzle: the next size not solved today, else practice at the same size.
function nextDaily(): { difficulty: Difficulty; kind: Kind } {
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  const done = stats.daily[date] ?? {};
  const open = order.find((d) => !done[d]);
  return open ? { difficulty: open, kind: 'daily' } : { difficulty: prefs.difficulty, kind: 'practice' };
}
function nextDailyLabel(): string {
  const next = nextDaily();
  return next.kind === 'daily' ? `Daily ${next.difficulty}` : 'Practice';
}

// ── Hints ────────────────────────────────────────────────────────────────────────────────────────────────────────

function hint(): void {
  const game = current();
  if (solvedShown) return;
  const h = game.hint();
  if (!h) return;
  game.hints++;
  view.hint = { edge: h.edge, until: performance.now() + HINT_MS };
  view.cursor = game.puzzle.edges[h.edge].a;
  hintText.textContent =
    h.kind === 'wrong' ? `${h.text} Tap the bridge, or press Shift and an arrow from either island, to cycle it: one, two, none.` : h.text;
  persist();
  resume();
  updateChrome();
  redraw();
}

// ── Screen ───────────────────────────────────────────────────────────────────────────────────────────────────────

function updateChrome(): void {
  const game = current();
  for (const r of kindRadios) r.checked = r.value === prefs.kind;
  for (const r of difficultyRadios) {
    r.checked = r.value === prefs.difficulty;
    r.parentElement!.classList.toggle('done-today', prefs.kind === 'daily' && Boolean(stats.daily[date]?.[r.value as Difficulty]));
  }
  $('puzzle-title').textContent = title();
  $('puzzle-sub').textContent = prefs.kind === 'daily'
    ? `${new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })} · the same puzzle for everyone`
    : 'A fresh puzzle, just for you';
  const islands = game.puzzle.islands;
  const done = islands.filter((i) => game.count(i.id) === i.need).length;
  $('progress-bar').style.width = `${(100 * done) / islands.length}%`;
  $('progress-text').textContent = solvedShown ? 'Solved' : `${done} of ${islands.length} islands complete`;
  const best = stats.best[prefs.difficulty];
  $('best').textContent = best === undefined ? '–' : formatTime(best);
  const days = streak(stats, date);
  $('streak-count').textContent = String(days);
  $('streak').textContent = days ? `${days} day${days === 1 ? '' : 's'}` : '';
  $('streak').title = 'Days in a row with a daily puzzle solved';
  $('solved-count').textContent = String(stats.solved);
  $<HTMLButtonElement>('undo-btn').disabled = solvedShown || game.history.length === 0;
  $<HTMLButtonElement>('hint-btn').disabled = solvedShown;
  $<HTMLButtonElement>('reset-btn').disabled = solvedShown || game.bridges.every((b) => b === 0);
  $('new-btn').hidden = prefs.kind === 'daily';
  canvas.setAttribute('aria-label', `${title()}: ${islands.length} islands, ${done} complete`);
}

function resize(): void {
  const rect = frame.getBoundingClientRect();
  const side = Math.floor(Math.min(rect.width, rect.height || rect.width));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  canvas.width = Math.round(side * dpr);
  canvas.height = Math.round(side * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  size = { w: side, h: side };
  Object.assign(view, layout(side, side, current()));
  redraw();
}
new ResizeObserver(() => active && resize()).observe(frame);

// Moving the window to a screen with another pixel ratio changes no CSS size, so it is watched on its own.
function watchPixelRatio(): void {
  window
    .matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    .addEventListener('change', () => {
      if (active) resize();
      watchPixelRatio();
    }, { once: true });
}
watchPixelRatio();
// The numbers use the web font: draw again once it has arrived, in case the first paint came before it.
void document.fonts.ready.then(() => redraw());

// The board is drawn only when something changed, and on every frame only while a hint or the solved glow runs.
let frameRequested = false;
function redraw(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(paint);
}
function paint(t: number): void {
  frameRequested = false;
  if (!active || !size.w) return;
  view.celebrate = glowStart === null ? 0 : Math.max(0, 1 - (t - glowStart) / SOLVED_GLOW_MS);
  if (view.celebrate === 0) glowStart = null;
  draw(ctx, size.w, size.h, active, view, colors, t);
  if (animating(view, t)) redraw();
}

// ── Input ────────────────────────────────────────────────────────────────────────────────────────────────────────

function describeIsland(id: number): string {
  const island = current().puzzle.islands[id];
  const count = current().count(id);
  const state = count === island.need ? 'complete' : count > island.need ? `${count - island.need} too many` : `${island.need - count} to go`;
  return `Island ${island.need} at row ${island.y + 1}, column ${island.x + 1}: ${count} of ${island.need} bridges, ${state}.`;
}

bindBoard(canvas, view, {
  game: () => active,
  build: cycle,
  select: (island) => {
    if (island === view.selected) return;
    view.selected = island;
    if (island !== null) status.textContent = `${describeIsland(island)} Selected: tap an island it sees to build a bridge.`;
    redraw();
  },
  moveTo: (island) => {
    status.textContent = describeIsland(island);
  },
  noIsland: (dx, dy) => {
    status.textContent = `No island ${directionName(dx, dy)} of this one.`;
    playBlocked();
  },
  redraw,
});

bindShortcuts([canvas, $('panel')], {
  undo,
  hint,
  restart,
  newPuzzle: () => prefs.kind === 'practice' && start(prefs.difficulty, 'practice', true),
  sound: toggleSound,
});

function undo(): void {
  const game = current();
  if (solvedShown) return;
  const edge = game.undo();
  if (edge === null) return;
  playBridge(game.bridges[edge]);
  status.textContent = `Undone. ${describeIsland(game.puzzle.edges[edge].a)}`;
  view.hint = null;
  hintText.textContent = '';
  updateChrome();
  persist();
  resume();
  redraw();
}

function restart(): void {
  const game = current();
  if (solvedShown || game.bridges.every((b) => b === 0)) return;
  if (!window.confirm('Remove every bridge and start this puzzle over? The clock keeps running.')) return;
  game.restart();
  view.selected = null;
  view.hint = null;
  hintText.textContent = '';
  status.textContent = 'Every bridge removed.';
  updateChrome();
  persist();
  resume();
  redraw();
}

function toggleSound(): void {
  prefs.sound = !prefs.sound;
  setSound(prefs.sound);
  savePrefs(prefs);
  soundButton();
}
function soundButton(): void {
  const b = $('sound-btn');
  b.setAttribute('aria-pressed', String(prefs.sound));
  b.innerHTML = icon(prefs.sound ? 'sound' : 'mute');
}

// ── Buttons and settings ─────────────────────────────────────────────────────────────────────────────────────────

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('reset-btn').addEventListener('click', restart);
$('new-btn').addEventListener('click', () => start(prefs.difficulty, 'practice', true));
$('sound-btn').addEventListener('click', toggleSound);

function setTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
  colors = readColors(document.documentElement);
  redraw();
}
$('theme-btn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  setTheme(next);
});
// Without a theme picked in Spans, the board follows the system's.
systemDark.addEventListener('change', () => loadTheme() === null && setTheme(systemDark.matches ? 'dark' : 'light'));
reducedMotion.addEventListener('change', () => {
  view.reducedMotion = reducedMotion.matches;
  redraw();
});

// Native radios: arrow keys move and check within a group, and each group is one tab stop.
function switched(difficulty: Difficulty, kind: Kind): void {
  start(difficulty, kind);
  // On a narrow screen the panel is below the board: bring the new board back into view.
  if (narrow.matches) frame.scrollIntoView({ block: 'nearest', behavior: view.reducedMotion ? 'auto' : 'smooth' });
}
for (const r of kindRadios) r.addEventListener('change', () => r.checked && switched(prefs.difficulty, r.value as Kind));
for (const r of difficultyRadios) r.addEventListener('change', () => r.checked && switched(r.value as Difficulty, prefs.kind));

// The solved card: Escape and "Look at it" both close it and go back to the board.
$('win-close').addEventListener('click', () => win.close());
win.addEventListener('close', () => canvas.focus());
$('win-next').addEventListener('click', () => {
  if (prefs.kind === 'daily') {
    const next = nextDaily();
    start(next.difficulty, next.kind, next.kind === 'practice');
  } else start(prefs.difficulty, 'practice', true);
});
$('win-share').addEventListener('click', async () => {
  const hints = current().hints;
  const text = `Spans · ${title()} · ${formatTime(elapsed)}${hints ? ` · ${hints} hint${hints === 1 ? '' : 's'}` : ' · no hints'}`;
  const button = $('win-share');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Could not copy';
  }
  window.setTimeout(() => (button.textContent = 'Copy result'), COPIED_MS);
});

// The help stops the clock while it is open. When it closes, focus goes back to what opened it: the Help button,
// or the board after the first-visit help.
let helpOpener: HTMLElement | null = null;
function openHelp(opener: HTMLElement | null = null): void {
  helpOpener = opener;
  pause();
  helpDialog.showModal();
}
$('help-btn').addEventListener('click', () => openHelp($('help-btn')));
$('help-close').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (e) => e.target === helpDialog && helpDialog.close());
helpDialog.addEventListener('close', () => {
  resume();
  (helpOpener ?? canvas).focus();
});

soundButton();
start(prefs.difficulty, prefs.kind);
// First visit: show how to play once.
try {
  if (!window.localStorage.getItem('spans:seen-help')) {
    window.localStorage.setItem('spans:seen-help', '1');
    openHelp();
  }
} catch {
  /* storage unavailable: skip the first-visit help */
}
