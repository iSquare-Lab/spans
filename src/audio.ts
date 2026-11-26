// Small synthesised sounds (Web Audio), no sound files. Created on the first sound, after a click or a key press.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

// A wooden knock, higher for a second plank.
export const playBridge = (count: number) => tone(count === 2 ? 392 : count === 1 ? 330 : 220, 0, 0.12, 0.12, 'triangle');
export const playBlocked = () => tone(140, 0, 0.18, 0.08, 'square');
export const playIsland = () => {
  tone(659, 0, 0.25, 0.06);
  tone(988, 0.05, 0.3, 0.04);
};
export const playSolved = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 0.08));
