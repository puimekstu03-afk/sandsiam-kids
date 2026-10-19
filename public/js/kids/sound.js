'use strict';

/** SANDSIAM · Sound: small synthesised sounds for taps and rewards, with a mute switch. */
const Sound = (() => {
  const KEY = 'sandsiam-sound';
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== 'off';
  } catch {
    on = true;
  }
  let ctx = null;

  function tone(freq, start, length, type = 'sine', gain = 0.08) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
    osc.connect(amp).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + length + 0.05);
  }

  const SOUNDS = {
    tap: () => tone(660, 0, 0.08, 'triangle', 0.05),
    place: () => {
      tone(523, 0, 0.1, 'triangle');
      tone(784, 0.07, 0.14, 'triangle');
    },
    remove: () => tone(330, 0, 0.12, 'sine', 0.06),
    sticker: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, 'triangle')),
    correct: () => [659, 880].forEach((f, i) => tone(f, i * 0.1, 0.2, 'triangle')),
    wrong: () => tone(220, 0, 0.18, 'sine', 0.05),
    celebrate: () => [523, 659, 784, 659, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle')),
    // A tiny sparkle for a firework the child taps into the intro sky.
    pop: () => {
      tone(1175, 0, 0.09, 'sine', 0.04);
      tone(1568, 0.05, 0.16, 'triangle', 0.03);
    },
  };

  /** The one audio context for the page, created on the first tap. Shared with Music. */
  function context() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    return ctx;
  }

  return {
    get on() {
      return on;
    },
    context,
    toggle() {
      on = !on;
      try {
        localStorage.setItem(KEY, on ? 'on' : 'off');
      } catch {
        /* Not remembered. */
      }
      return on;
    },
    /** Plays a named sound. Audio only starts after the child has tapped something. */
    play(name) {
      if (!on || !SOUNDS[name]) return;
      try {
        if (!context()) return;
        if (ctx.state === 'suspended') ctx.resume();
        SOUNDS[name]();
      } catch {
        /* No audio on this device. */
      }
    },
  };
})();
