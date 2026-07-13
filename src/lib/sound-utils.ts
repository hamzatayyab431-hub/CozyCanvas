"use client";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.warn("Web Audio API is not supported or was blocked:", e);
  }
  
  return audioCtx;
}

let soundEnabled = true;
let soundVolume = 0.5;

// Load initial sound state from localStorage on client side
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('drawing_duel_sound_enabled');
    if (saved !== null) {
      soundEnabled = saved === 'true';
    }
    const savedVol = localStorage.getItem('drawing_duel_sound_volume');
    if (savedVol !== null) {
      soundVolume = Number(savedVol);
    }
  } catch (e) {
    console.warn("localStorage not accessible:", e);
  }
}

/**
 * Toggles the sound enabled state.
 * @returns The new enabled state.
 */
export function toggleSound(): boolean {
  soundEnabled = !soundEnabled;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('drawing_duel_sound_enabled', String(soundEnabled));
    } catch (e) {
      console.warn("Failed to save sound state to localStorage:", e);
    }
  }
  return soundEnabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('drawing_duel_sound_enabled', String(enabled));
    } catch (e) {
      console.warn("Failed to save sound state to localStorage:", e);
    }
  }
}

export function getSoundVolume(): number {
  return soundVolume;
}

export function setSoundVolume(volume: number) {
  soundVolume = Math.max(0, Math.min(1, volume));
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('drawing_duel_sound_volume', String(soundVolume));
    } catch (e) {
      console.warn("Failed to save volume to localStorage:", e);
    }
  }
}

/**
 * Soft cozy pop sound for button clicks, tool changes, or submitting drawing
 */
export function playPop() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(450, now);
  // Pitch slide down for a bubbly pop
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);

  // Volume envelope
  gain.gain.setValueAtTime(0.2 * soundVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.start(now);
  osc.stop(now + 0.12);
}

/**
 * Gentle melodic chime for round/game starts
 */
export function playChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const playTone = (freq: number, delay: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);
    
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.12 * soundVolume, now + delay + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
    
    osc.start(now + delay);
    osc.stop(now + delay + duration + 0.05);
  };

  // Nice cozy major-seventh chord arpeggio chime (C5 -> E5 -> G5 -> B5)
  playTone(523.25, 0.0, 0.7);    // C5
  playTone(659.25, 0.08, 0.8);   // E5
  playTone(783.99, 0.16, 0.9);   // G5
  playTone(987.77, 0.24, 1.1);   // B5
}

/**
 * Brassy cozy fanfare progression for round reveals or wins
 */
export function playFanfare() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const playBrass = (freq: number, start: number, duration: number, volume = 0.08) => {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Detuned sawtooth/triangle mix for sweet cozy synth brass
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + start);
    
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.006, now + start);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now + start);
    filter.frequency.exponentialRampToValueAtTime(1300, now + start + 0.12);
    filter.frequency.exponentialRampToValueAtTime(450, now + start + duration);

    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(volume * soundVolume, now + start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

    osc.start(now + start);
    osc2.start(now + start);
    osc.stop(now + start + duration + 0.05);
    osc2.stop(now + start + duration + 0.05);
  };

  // Joyful ascending arpeggio chord progression
  playBrass(392.00, 0.0, 0.35, 0.06);  // G4
  playBrass(523.25, 0.1, 0.35, 0.06);  // C5
  playBrass(659.25, 0.2, 0.35, 0.06);  // E5
  playBrass(783.99, 0.3, 0.8, 0.08);   // G5
  playBrass(1046.50, 0.4, 0.8, 0.06);  // C6
}

/**
 * Cozy warning beep when the timer is low (subtle mellow tone)
 */
export function playWarning() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(523.25, now); // C5

  gain.gain.setValueAtTime(0.08 * soundVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.start(now);
  osc.stop(now + 0.18);
}

/**
 * Bright two-note ascending ding for successful actions
 * (e.g., submitting a drawing, saving a gallery card, completing a milestone)
 */
export function playSuccess() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const playDing = (freq: number, delay: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);

    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.15 * soundVolume, now + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);

    osc.start(now + delay);
    osc.stop(now + delay + duration + 0.05);
  };

  // Two bright ascending notes: E5 -> G5
  playDing(659.25, 0.0, 0.35);   // E5
  playDing(783.99, 0.15, 0.55);  // G5
}
