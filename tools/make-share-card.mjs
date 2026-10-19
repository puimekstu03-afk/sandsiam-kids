// Makes public/assets/share/card.jpg: the 1200×630 preview picture that Facebook, X and LINE
// show under a shared link (og:image in index.html). It is drawn by the game itself, so it
// always matches the game's look.
//
//   python3 -m http.server 8767 --directory public     (in another terminal)
//   node tools/make-share-card.mjs
//
// Needs Node 22+ and Google Chrome (CHROME=/path/to/chrome to use another one).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'share', 'card.jpg');
const PAGE = 'http://localhost:8767/';
const PORT = 9339;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sandsiam-card-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let pages = null;
  for (let i = 0; i < 40 && !pages; i++) {
    await wait(250);
    pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json(), () => null);
  }
  const socket = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let id = 0;
  const waiting = new Map();
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  const send = (method, params = {}) => new Promise((resolve) => (waiting.set(++id, resolve), socket.send(JSON.stringify({ id, method, params }))));
  const run = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'page error');
    return result.result.value;
  };

  await send('Page.navigate', { url: PAGE });
  await wait(4000); // the scene's pictures arrive

  const jpeg = await run(`(async () => {
    const zh = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'css/base/fonts-zh.css' });
    document.head.append(zh);
    await new Promise((resolve) => (zh.onload = resolve));
    await Promise.all([
      document.fonts.load('700 80px Mali', 'SANDSIAM สงกรานต์'),
      document.fonts.load('600 30px Mali', 'ตกแต่ง'),
      document.fonts.load('600 28px "Noto Sans SC"', '中文'),
    ]);
    const W = 1200, H = 630;
    const tiers = pagodaSnapTiers({ shape: 1, base: 0, height: 1 });
    const s = validate({ v: 1, place: 1, shape: 1, base: 0, height: 1, sand: 0, objects: [
      { type: RING_TYPES[0], color: PALETTE[4], x: 0, y: tiers[1], size: 1 },
      { type: RING_TYPES[2], color: PALETTE[5], x: 0, y: tiers[3], size: 1 },
      { type: 1, color: PALETTE[1], x: -112, y: -22, size: 0.72, back: true },
      { type: 1, color: PALETTE[3], x: 100, y: -22, size: 0.72, back: true },
      { type: INCENSE, color: PALETTE[0], x: 62, y: 76, size: 0.85 },
    ] });
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const c = out.getContext('2d');
    renderScene(c, W, H, { state: s, image: await placeBackdropReady(s.place), exporting: true, insets: { top: 40, right: 620, bottom: 20, left: 30 } });

    cartoonCard(c, 590, 110, 580, 400, 44);
    const font = (weight, size, family = '"Mali"') => weight + ' ' + size + 'px ' + family + ', sans-serif';
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.font = font(700, 88);
    c.lineWidth = 14;
    c.strokeStyle = INK;
    c.strokeText('SANDSIAM', 880, 220);
    c.fillStyle = '#ffc93c';
    c.fillText('SANDSIAM', 880, 220);
    c.fillStyle = INK;
    c.font = font(700, 40);
    c.fillText('ก่อเจดีย์ทรายวันสงกรานต์', 880, 305);
    c.font = font(600, 27);
    c.fillStyle = '#5b4a6e';
    c.fillText('ตกแต่ง อวยพร แล้วตั้งที่ลานกับเพื่อน ๆ', 880, 370);
    c.font = font(700, 30, '"Mali", "Noto Sans SC"');
    c.fillStyle = '#e0447e';
    c.fillText('ไทย · English · 中文', 880, 455);
    return out.toDataURL('image/jpeg', 0.88);
  })()`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(jpeg.split(',')[1], 'base64'));
  console.log('wrote', OUT);
  socket.close();
} finally {
  chrome.kill();
}
