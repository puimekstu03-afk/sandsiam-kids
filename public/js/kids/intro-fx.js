'use strict';

/**
 * SANDSIAM · Intro sky: candy-coloured fireworks,
 * drawn on their own canvas over the scene and under the intro buttons.
 * Fireworks go off by themselves at the sides of the sky, and a tap on the
 * scene sends one up to that spot. Runs only on the intro, never when the
 * visitor prefers reduced motion, and sleeps while the tab is hidden.
 */
const IntroFx = (() => {
  const canvas = document.getElementById('introFx');
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Colours from tokens.css: sun, pink, sky, mint, grape, orange.
  const COLORS = ['#ffd23f', '#ff6fa5', '#4cc3ff', '#47d18c', '#a77bff', '#ff9a3c'];
  const INK = 'rgba(61, 44, 82, 0.55)';

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let w = 0;
  let h = 0;
  let rockets = [];
  let sparks = [];
  let frame = 0;
  let last = 0;
  let nextLaunch = 0;

  const active = () => document.body.classList.contains('is-intro') && !reduced.matches && !document.hidden;
  const small = () => w <= 760;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Sends a rocket up from the bottom to burst at (x, y). */
  function launch(x, y, quick) {
    const from = x + rand(-40, 40);
    rockets.push({ from, x: from, y: h, tx: x, ty: y, t: 0, dur: quick ? 0.42 : rand(0.9, 1.25), trail: [] });
  }

  /** Fireworks go off at the sides, leaving the title badge in the middle clear. */
  function launchSomewhere() {
    const side = Math.random() < 0.5;
    const x = small() ? rand(0.12, 0.88) * w : (side ? rand(0.05, 0.28) : rand(0.72, 0.95)) * w;
    const y = small() ? rand(0.3, 0.48) * h : rand(0.12, 0.42) * h;
    launch(x, y, false);
  }

  function burst(x, y) {
    const scale = Math.min(w, h) / 800;
    const outer = pick(COLORS);
    const inner = pick(COLORS.filter((c) => c !== outer));
    const count = small() ? 28 : 40;
    const speed = rand(330, 400) * Math.max(scale, 0.55);
    const ring = (n, v, color, size) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.06, 0.06);
        const s = v * rand(0.88, 1.04);
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(1.2, 1.6), color, size });
      }
    };
    ring(count, speed, outer, small() ? 3.6 : 4.6);
    ring(Math.round(count / 2), speed * 0.55, inner, small() ? 3 : 3.8);
    sparks.push({ flash: true, x, y, life: 0, max: 0.22, color: '#fff', size: 34 * Math.max(scale, 0.6) });
  }

  function update(dt) {
    rockets = rockets.filter((r) => {
      r.t += dt;
      const k = Math.min(r.t / r.dur, 1);
      const ease = 1 - (1 - k) ** 3;
      r.trail.push({ x: r.x, y: r.y });
      if (r.trail.length > 8) r.trail.shift();
      r.x = r.from + (r.tx - r.from) * ease + Math.sin(r.t * 18) * 1.2;
      r.y = h + (r.ty - h) * ease;
      if (k < 1) return true;
      burst(r.tx, r.ty);
      return false;
    });

    const gravity = 110 * Math.max(Math.min(w, h) / 800, 0.6);
    const drag = Math.exp(-2.4 * dt);
    sparks = sparks.filter((s) => {
      s.life += dt;
      if (s.flash) return s.life < s.max;
      s.vx *= drag;
      s.vy = s.vy * drag + gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      return s.life < s.max;
    });
  }

  function paint() {
    ctx.clearRect(0, 0, w, h);

    ctx.lineCap = 'round';
    rockets.forEach((r) => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      r.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      dot(r.x, r.y, 3.5, '#fff8d6');
    });

    sparks.forEach((s) => {
      const k = s.life / s.max;
      if (s.flash) {
        ctx.globalAlpha = 1 - k;
        dot(s.x, s.y, s.size * (0.4 + k), s.color);
        ctx.globalAlpha = 1;
        return;
      }
      // Fade out at the end, with a little twinkle.
      ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4 * (0.6 + Math.random() * 0.4);
      // A streak behind each spark, longest while it is still flying fast.
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size * 1.1;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.09, s.y - s.vy * 0.09);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      dot(s.x, s.y, s.size, s.color, true);
    });
    ctx.globalAlpha = 1;
  }

  /** A round spark with a thin cartoon outline and a white shine, so it reads on a bright sky. */
  function dot(x, y, r, color, outline) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  function loop(ms) {
    frame = 0;
    if (!active()) {
      ctx.clearRect(0, 0, w, h);
      rockets = [];
      sparks = [];
      return;
    }
    const t = ms / 1000;
    const dt = Math.min(t - last, 0.05);
    last = t;
    if (t >= nextLaunch) {
      launchSomewhere();
      if (!small() && Math.random() < 0.3) launchSomewhere();
      nextLaunch = t + rand(1.2, 2.4);
    }
    update(dt);
    paint();
    frame = requestAnimationFrame(loop);
  }

  function wake() {
    if (frame || !active()) return;
    resize();
    last = performance.now() / 1000;
    nextLaunch = last + 0.4;
    frame = requestAnimationFrame(loop);
  }

  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', wake);
  wake();

  return {
    /** A firework for a tap on the intro scene, at the tapped spot (page coordinates). */
    tap(clientX, clientY) {
      if (!active()) return false;
      const r = canvas.getBoundingClientRect();
      launch(clientX - r.left, clientY - r.top, true);
      return true;
    },
  };
})();
