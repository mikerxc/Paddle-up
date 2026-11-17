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
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.18, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

export function playRoundCue(settings: Pick<Settings, "soundOn" | "vibrateOn">) {
  if (settings.vibrateOn && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate([45, 50, 45, 50, 90]);
    } catch {
      /* Some browsers expose vibrate and then refuse it. */
    }
  }
  if (!settings.soundOn) return;
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;
  tone(ctx, 784, now, 0.12);
  tone(ctx, 1046, now + 0.14, 0.18);
}
