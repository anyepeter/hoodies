"use client";

// The admin's optional "ding" for new orders and messages: two soft notes made with Web Audio (no sound file).
// Off until turned on in Admin → Notifications & app; the choice is remembered on this device.
// Browsers only let a page make sound after the person has interacted with it, so the audio context is
// unlocked on the first tap or key press.

const KEY = "akz_admin_chime";
let ctx: AudioContext | null = null;

export function chimeEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the toggle just won't be remembered */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call once on mount: resumes the audio context on the first interaction so later chimes can play. */
export function unlockAudioOnInteraction(): () => void {
  const unlock = () => {
    if (!chimeEnabled()) return;
    void audio()?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** Plays the chime (if `force`, even when the setting is off: the "Play a test sound" button). */
export function playChime(force = false): void {
  if (!force && !chimeEnabled()) return;
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => {});
  const start = ac.currentTime + 0.02;
  [
    [880, 0],
    [1318.5, 0.13],
  ].forEach(([freq, offset]) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.45);
    osc.connect(gain).connect(ac.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.5);
  });
}
