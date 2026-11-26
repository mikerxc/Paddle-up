import type { Settings } from "../model.ts";

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!audio) audio = new Ctor();
  return audio;
}

function tone(ctx: AudioContext, frequency: number, when: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  // One voice at a time, loud enough to carry outside, still under full scale.
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.82, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

/** Call from the first tap so iPhone will actually play the round chime. */
export function unlockAudio() {
  const ctx = context();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function playRoundCue(settings: Pick<Settings, "soundOn">) {
  if (!settings.soundOn) return;
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => tone(ctx, frequency, now + index * 0.2, 0.18));
}
