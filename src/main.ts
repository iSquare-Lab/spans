import '@fontsource-variable/outfit';
import './style.css';
import { playBlocked, playBridge, playIsland, playSolved, setSound } from './audio.ts';
import { dailySeed, dayNumber, formatTime, spokenTime, streak, today } from './daily.ts';
import { Game } from './game.ts';
import { generate, type Difficulty } from './generator.ts';
import { blockers, directionName, edgeBetween, neighbour } from './puzzle.ts';
import { center, draw, layout, readColors, type Colors, type View } from './render.ts';
import { loadGame, loadPrefs, loadStats, saveGame, savePrefs, saveStats, saveTheme, type Kind } from './storage.ts';

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
const win = $('win');

const prefs = loadPrefs();
let stats = loadStats();
setSound(prefs.sound);

let game!: Game;
let seed = 0;
let date = today();
let elapsed = 0;
let runningSince: number | null = null;
let solvedShown = false;
let colors: Colors = readColors(document.documentElement);
let size = { w: 0, h: 0 };
const view: View = { cell: 0, ox: 0, oy: 0, cursor: 0, showCursor: false, drag: null, hint: null, celebrate: 0 };

// ── Starting a puzzle ──────────────────────────────────────────────────────────────────────────────────────────────

function practiceSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

function start(difficulty: Difficulty, kind: Kind, fresh = false): void {
  persist();
  prefs.difficulty = difficulty;
  prefs.kind = kind;
  savePrefs(prefs);
  date = today();
  const saved = fresh ? null : loadGame(difficulty, kind);
  if (kind === 'daily') {
    seed = dailySeed(date, difficulty);
  } else {
    seed = saved && !saved.solved ? saved.seed : practiceSeed();
  }
  const usable = saved && saved.seed === seed && (kind === 'practice' || saved.date === date);
  const made = generate(difficulty, seed);
  game = new Game(made.puzzle, made.solution, usable ? saved.bridges : undefined);
  game.hints = usable ? saved.hints : 0;
  elapsed = usable ? saved.elapsed : 0;
  solvedShown = usable ? saved.solved : false;
  runningSince = null;
  view.cursor = 0;
  view.hint = null;
  view.celebrate = 0;
  win.hidden = true;
  hintText.textContent = '';
  updateChrome();
  resize();
  if (!solvedShown) resume();
  status.textContent = `${title()}. ${game.puzzle.islands.length} islands.`;
}

function title(): string {
  const names = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  return prefs.kind === 'daily' ? `Daily #${dayNumber(date)} · ${names[prefs.difficulty]}` : `Practice · ${names[prefs.difficulty]}`;
}

function persist(): void {
  if (!game) return;
  pause();
  saveGame(prefs.difficulty, prefs.kind, { seed, bridges: game.bridges, elapsed, hints: game.hints, solved: solvedShown, date });
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function resume(): void {
  if (runningSince === null && !solvedShown && document.visibilityState === 'visible') runningSince = performance.now();
}
function pause(): void {
  if (runningSince !== null) {
    elapsed += performance.now() - runningSince;
    runningSince = null;
  }
}
const timeNow = () => elapsed + (runningSince === null ? 0 : performance.now() - runningSince);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // A daily puzzle left open past midnight moves on to the new day's.
    if (prefs.kind === 'daily' && today() !== date) start(prefs.difficulty, 'daily');
    else resume();
  } else persist();
});
window.addEventListener('pagehide', persist);

// ── Changing bridges ───────────────────────────────────────────────────────────────────────────────────────────────

function cycle(edgeId: number): void {
  if (solvedShown) return;
  const next = game.next(edgeId);
  const edge = game.puzzle.edges[edgeId];
  if (next === null) {
    playBlocked();
    const other = game.puzzle.edges[blockers(game.puzzle, game.bridges, edgeId)[0]];
    status.textContent = `A bridge between ${game.name(edge.a)} and ${game.name(edge.b)} would cross the bridge between ${game.name(other.a)} and ${game.name(other.b)}.`;
    return;
  }
  const before = [game.count(edge.a) === game.puzzle.islands[edge.a].need, game.count(edge.b) === game.puzzle.islands[edge.b].need];
  game.set(edgeId, next);
  view.hint = null;
  hintText.textContent = '';
  afterChange(edgeId, before);
}

function afterChange(edgeId: number, before: boolean[]): void {
  const edge = game.puzzle.edges[edgeId];
  const count = game.bridges[edgeId];
  const after = [game.count(edge.a) === game.puzzle.islands[edge.a].need, game.count(edge.b) === game.puzzle.islands[edge.b].need];
  if ((after[0] && !before[0]) || (after[1] && !before[1])) playIsland();
  else playBridge(count);
  const A = game.puzzle.islands[edge.a], B = game.puzzle.islands[edge.b];
  status.textContent = `${count === 0 ? 'No bridge' : count === 1 ? 'One bridge' : 'Two bridges'} ${directionName(Math.sign(B.x - A.x), Math.sign(B.y - A.y))} from ${game.name(edge.a)} to ${game.name(edge.b)}. ${describeIsland(view.cursor ?? edge.a)}`;
  resume();
  updateChrome();
  persist();
  resume();
  if (game.solved()) solved();
}

function solved(): void {
  pause();
  solvedShown = true;
  const ms = Math.round(elapsed);
  stats.solved++;
  if (prefs.kind === 'daily') {
    stats.daily[date] ??= {};
    stats.daily[date][prefs.difficulty] ??= { ms, hints: game.hints };
  }
  if (game.hints === 0 && (stats.best[prefs.difficulty] === undefined || ms < stats.best[prefs.difficulty]!)) stats.best[prefs.difficulty] = ms;
  saveStats(stats);
  persist();
  playSolved();
  const startAt = performance.now();
  const glow = (t: number) => {
    view.celebrate = Math.max(0, 1 - (t - startAt) / 1400);
    if (view.celebrate > 0) requestAnimationFrame(glow);
  };
  requestAnimationFrame(glow);
  $('win-time').textContent = formatTime(ms);
  $('win-kicker').textContent = title();
  $('win-text').textContent =
    (game.hints ? `With ${game.hints} hint${game.hints === 1 ? '' : 's'}. ` : 'No hints. ') +
    (prefs.kind === 'daily' ? `Day streak: ${streak(stats, date)}. A new daily puzzle comes at midnight.` : 'Another one is ready when you are.');
  $('win-next').textContent = prefs.kind === 'daily' ? nextDailyLabel() : 'New puzzle';
  setTimeout(() => {
    win.hidden = false;
    $('win-next').focus();
  }, 650);
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
  if (solvedShown) return;
  const h = game.hint();
  if (!h) return;
  game.hints++;
  view.hint = { edge: h.edge, until: performance.now() + 4000 };
  const edge = game.puzzle.edges[h.edge];
  view.cursor = edge.a;
  hintText.textContent = h.kind === 'wrong' ? `${h.text} Tap it to change it.` : h.text;
  persist();
  resume();
  updateChrome();
}

// ── Screen ───────────────────────────────────────────────────────────────────────────────────────────────────────

function updateChrome(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#kind [data-kind]')) b.setAttribute('aria-checked', String(b.dataset.kind === prefs.kind));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#difficulty [data-difficulty]')) {
    const d = b.dataset.difficulty as Difficulty;
    b.setAttribute('aria-checked', String(d === prefs.difficulty));
    b.classList.toggle('done-today', prefs.kind === 'daily' && Boolean(stats.daily[date]?.[d]));
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
  ($('undo-btn') as HTMLButtonElement).disabled = solvedShown || game.history.length === 0;
  ($('hint-btn') as HTMLButtonElement).disabled = solvedShown;
  ($('reset-btn') as HTMLButtonElement).disabled = solvedShown || game.bridges.every((b) => b === 0);
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
  Object.assign(view, layout(side, side, game));
}
new ResizeObserver(() => game && resize()).observe(frame);

function frameLoop(t: number): void {
  if (game && size.w) draw(ctx, size.w, size.h, game, view, colors, t);
  timerEl.textContent = game ? formatTime(timeNow()) : '0:00';
  requestAnimationFrame(frameLoop);
}

// ── Pointer ──────────────────────────────────────────────────────────────────────────────────────────────────────

function pointAt(e: PointerEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function islandAt(px: number, py: number): number | undefined {
  let best: number | undefined, bestD = view.cell * 0.5;
  for (const island of game.puzzle.islands) {
    const [cx, cy] = center(view, island.x, island.y);
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      best = island.id;
    }
  }
  return best;
}

// The edge whose line passes closest to a point in open water, within half a cell.
function edgeAt(px: number, py: number): number | undefined {
  let best: number | undefined, bestD = view.cell * 0.45;
  for (const edge of game.puzzle.edges) {
    const a = game.puzzle.islands[edge.a], b = game.puzzle.islands[edge.b];
    const [ax, ay] = center(view, a.x, a.y), [bx, by] = center(view, b.x, b.y);
    const inside = edge.horizontal ? px > ax && px < bx : py > ay && py < by;
    if (!inside) continue;
    const d = edge.horizontal ? Math.abs(py - ay) : Math.abs(px - ax);
    if (d < bestD) {
      bestD = d;
      best = edge.id;
    }
  }
  return best;
}

let down: { island?: number; x: number; y: number; moved: boolean } | null = null;

canvas.addEventListener('pointerdown', (e) => {
  if (!game) return;
  const [x, y] = pointAt(e);
  view.showCursor = false;
  down = { island: islandAt(x, y), x, y, moved: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!down || down.island === undefined) return;
  const [x, y] = pointAt(e);
  if (Math.hypot(x - down.x, y - down.y) > view.cell * 0.25) down.moved = true;
  if (down.moved) view.drag = { from: down.island, x, y };
});

canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const [x, y] = pointAt(e);
  const start = down;
  down = null;
  view.drag = null;
  if (start.island !== undefined) {
    if (start.moved) {
      const dx = x - start.x, dy = y - start.y;
      const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const other = neighbour(game.puzzle, start.island, sx, sy);
      if (other !== undefined) cycle(edgeBetween(game.puzzle, start.island, other)!.id);
      view.cursor = start.island;
    } else {
      // A tap on an island next to the selected one builds between them; otherwise it selects.
      const edge = view.cursor !== null && view.cursor !== start.island ? edgeBetween(game.puzzle, view.cursor, start.island) : undefined;
      if (edge) cycle(edge.id);
      else {
        view.cursor = start.island;
        status.textContent = describeIsland(start.island);
      }
    }
    return;
  }
  if (Math.hypot(x - start.x, y - start.y) < view.cell * 0.5) {
    const edge = edgeAt(x, y);
    if (edge !== undefined) cycle(edge);
  }
});
canvas.addEventListener('pointercancel', () => {
  down = null;
  view.drag = null;
});

// ── Keyboard ─────────────────────────────────────────────────────────────────────────────────────────────────────

function describeIsland(id: number): string {
  const island = game.puzzle.islands[id];
  const count = game.count(id);
  const state = count === island.need ? 'complete' : count > island.need ? `${count - island.need} too many` : `${island.need - count} to go`;
  return `Island ${island.need} at row ${island.y + 1}, column ${island.x + 1}: ${count} of ${island.need} bridges, ${state}.`;
}

// The island reached by an arrow: the one it sees in that direction, or else the nearest one roughly that way.
function step(from: number, dx: number, dy: number): number | undefined {
  const seen = neighbour(game.puzzle, from, dx, dy);
  if (seen !== undefined) return seen;
  const me = game.puzzle.islands[from];
  let best: number | undefined, bestScore = Infinity;
  for (const island of game.puzzle.islands) {
    const ax = (island.x - me.x) * dx + (island.y - me.y) * dy;
    if (ax <= 0) continue;
    const side = Math.abs((island.x - me.x) * dy + (island.y - me.y) * dx);
    const score = ax + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = island.id;
    }
  }
  return best;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

canvas.addEventListener('keydown', (e) => {
  const arrow = ARROWS[e.key];
  if (!arrow || !game) return;
  e.preventDefault();
  view.showCursor = true;
  const from = view.cursor ?? 0;
  if (e.shiftKey) {
    const other = neighbour(game.puzzle, from, arrow[0], arrow[1]);
    if (other === undefined) {
      status.textContent = `No island ${directionName(arrow[0], arrow[1])} of this one.`;
      playBlocked();
    } else cycle(edgeBetween(game.puzzle, from, other)!.id);
    return;
  }
  const to = step(from, arrow[0], arrow[1]);
  if (to !== undefined) {
    view.cursor = to;
    status.textContent = describeIsland(to);
  }
});
canvas.addEventListener('focus', () => {
  view.showCursor = true;
});
canvas.addEventListener('blur', () => {
  view.showCursor = false;
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.altKey || (document.querySelector('dialog[open]') && e.key !== 'Escape')) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey) return;
  switch (e.key.toLowerCase()) {
    case 'u': undo(); break;
    case 'h': hint(); break;
    case 'r': restart(); break;
    case 'n': if (prefs.kind === 'practice') start(prefs.difficulty, 'practice', true); break;
    case 'm': toggleSound(); break;
  }
});

function undo(): void {
  if (solvedShown) return;
  const edge = game.undo();
  if (edge === null) return;
  playBridge(game.bridges[edge]);
  status.textContent = `Undone. ${describeIsland(game.puzzle.edges[edge].a)}`;
  view.hint = null;
  updateChrome();
  persist();
  resume();
}

function restart(): void {
  if (solvedShown || game.bridges.every((b) => b === 0)) return;
  if (!window.confirm('Remove every bridge and start this puzzle over? The clock keeps running.')) return;
  game.restart();
  status.textContent = 'Every bridge removed.';
  updateChrome();
  persist();
  resume();
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

// ── Buttons ──────────────────────────────────────────────────────────────────────────────────────────────────────

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('reset-btn').addEventListener('click', restart);
$('new-btn').addEventListener('click', () => start(prefs.difficulty, 'practice', true));
$('sound-btn').addEventListener('click', toggleSound);
$('theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme')
    ? document.documentElement.getAttribute('data-theme') === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  saveTheme(next);
  colors = readColors(document.documentElement);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  colors = readColors(document.documentElement);
});
for (const b of document.querySelectorAll<HTMLButtonElement>('#kind [data-kind]')) {
  b.addEventListener('click', () => b.dataset.kind !== prefs.kind && start(prefs.difficulty, b.dataset.kind as Kind));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#difficulty [data-difficulty]')) {
  b.addEventListener('click', () => b.dataset.difficulty !== prefs.difficulty && start(b.dataset.difficulty as Difficulty, prefs.kind));
}
// Arrow keys move within a radio group, as in any set of radio buttons.
for (const group of document.querySelectorAll<HTMLElement>('.segmented')) {
  group.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.focus();
    next.click();
    e.preventDefault();
  });
}

$('win-close').addEventListener('click', () => {
  win.hidden = true;
  canvas.focus();
});
$('win-next').addEventListener('click', () => {
  if (prefs.kind === 'daily') {
    const next = nextDaily();
    start(next.difficulty, next.kind, next.kind === 'practice');
  } else start(prefs.difficulty, 'practice', true);
  canvas.focus();
});
$('win-share').addEventListener('click', async () => {
  const text = `Spans · ${title()} · ${formatTime(elapsed)}${game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ' · no hints'}`;
  const button = $('win-share');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Could not copy';
  }
  setTimeout(() => (button.textContent = 'Copy result'), 1800);
});

const helpDialog = $<HTMLDialogElement>('help-dialog');
$('help-btn').addEventListener('click', () => helpDialog.showModal());
$('help-close').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (e) => e.target === helpDialog && helpDialog.close());

soundButton();
start(prefs.difficulty, prefs.kind);
// First visit: show how to play once.
try {
  if (!window.localStorage.getItem('spans:seen-help')) {
    window.localStorage.setItem('spans:seen-help', '1');
    helpDialog.showModal();
  }
} catch {
  /* ignore */
}
requestAnimationFrame(frameLoop);
