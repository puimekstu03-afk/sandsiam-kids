'use strict';

/**
 * SANDSIAM · Music: soft background music from assets/music/songkran.m4a (3½ minutes,
 * mono AAC, about 1.7 MB), looping for as long as the page is open, across every screen.
 * Made by tools/make-music-loop.py from the full 43-minute recording, which is too big
 * to send to every child.
 *
 * It tries to start by itself as soon as the page opens. Most browsers block
 * sound until the visitor has tapped the page, so if that happens it starts on
 * the first tap or key press anywhere instead. The music button turns it off
 * and on, and the choice is remembered.
 */
const Music = (() => {
  const KEY = 'sandsiam-music';
  const SRC = 'assets/music/songkran.m4a';
  const VOLUME = 0.25; // quiet, under the tap sounds
  const FADE_IN = 2.5; // seconds

  let on = true;
  try {
    on = localStorage.getItem(KEY) !== 'off';
  } catch {
    on = true;
  }

  const audio = new Audio();
  audio.src = SRC;
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  /** Lets the page know, so the music button can show whether the music is playing. */
  const announce = () => window.dispatchEvent(new Event('musicchange'));
  ['playing', 'pause', 'ended'].forEach((type) => audio.addEventListener(type, announce));

  let fade = 0;
  function fadeTo(target, seconds, then) {
    clearInterval(fade);
    const from = audio.volume;
    const started = performance.now();
    fade = setInterval(() => {
      const k = Math.min((performance.now() - started) / (seconds * 1000), 1);
      audio.volume = from + (target - from) * k;
      if (k < 1) return;
      clearInterval(fade);
      if (then) then();
    }, 50);
  }

  /** Plays if allowed; resolves false when the browser is still waiting for a tap. */
  function start() {
    if (!audio.paused) return Promise.resolve(true);
    audio.volume = 0;
    return audio.play().then(
      () => {
        fadeTo(VOLUME, FADE_IN);
        return true;
      },
      () => false,
    );
  }

  function stop() {
    fadeTo(0, 0.4, () => audio.pause());
  }

  // Every kind of tap tries again until the music is really playing
  // (Safari on iPad only allows sound once the finger lifts).
  function unlock(e) {
    if (!on || !audio.paused) return;
    if (e.target.closest && e.target.closest('#music')) return; // the button handles itself
    start();
  }
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) => window.addEventListener(type, unlock, true));

  // Try straight away: browsers that allow it (or remember this site) start at once.
  if (on) start();

  return {
    get on() {
      return on;
    },
    get playing() {
      return !audio.paused;
    },
    /** Turns the music on or off. If it is on but still waiting for a tap, the tap starts it. */
    toggle() {
      if (on && audio.paused) {
        start();
        return on;
      }
      on = !on;
      try {
        localStorage.setItem(KEY, on ? 'on' : 'off');
      } catch {
        /* Not remembered. */
      }
      if (on) start();
      else stop();
      announce();
      return on;
    },
  };
})();
