// Genera las capturas de la documentación en docs/media/ con Chrome real + WebGPU.
// Levanta su propio servidor de Vite, así que basta con:  npm run screenshots
// Variables: CHROME_PATH para usar otro navegador.  Requiere Python 3 + Pillow para la animación.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const outDir = path.resolve('docs/media');
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-frames-'));
fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const python = (code, ...args) =>
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', '-c', code, ...args], { stdio: 'inherit' });

// Vista previa para redes (Settings → Social preview en GitHub): captura + degradado + título.
const SOCIAL_PY = `
import sys
from PIL import Image, ImageDraw, ImageFont
img = Image.open(sys.argv[1]).convert('RGB').resize((1280, 640), Image.LANCZOS)
shade = Image.new('L', (1280, 640))
d = ImageDraw.Draw(shade)
for x in range(1280):
    d.line([(x, 0), (x, 640)], fill=int(235 * min(1.0, max(0.0, 1.35 - x / 700)) ** 1.2))
img = Image.composite(Image.new('RGB', img.size, (5, 6, 10)), img, shade)
def font(names, size):
    for n in names:
        try: return ImageFont.truetype(n, size)
        except OSError: pass
    return ImageFont.load_default(size)
bold = font(['segoeuib.ttf', 'DejaVuSans-Bold.ttf', 'Arial Bold.ttf'], 96)
reg = font(['segoeui.ttf', 'DejaVuSans.ttf', 'Arial.ttf'], 34)
d = ImageDraw.Draw(img)
d.text((80, 200), 'Particle Life', font=bold, fill=(255, 255, 255))
d.text((84, 330), 'Ecosistema de partículas en tu navegador', font=reg, fill=(225, 228, 240))
d.text((84, 378), 'WebGPU · 1 millón de partículas · O(N)', font=reg, fill=(170, 180, 210))
img.save(sys.argv[2], quality=90)
`;

const server = await createServer({ server: { port: 5199, open: false }, logLevel: 'warn' });
await server.listen();
const base = 'http://localhost:5199/';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--force-high-performance-gpu', '--hide-scrollbars'],
});

async function open(viewport, query = '', extra = {}) {
  const page = await browser.newPage();
  if (extra.userAgent) await page.setUserAgent(extra.userAgent);
  await page.setViewport(viewport);
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('.hud div', { timeout: 20000 });
  const hud = await page.$eval('.hud', (el) => el.innerText);
  if (!query.includes('cpu') && hud.includes('MODO CPU')) throw new Error('Chrome no ofrece WebGPU: las capturas saldrían en modo CPU');
  await wait(1500);
  return page;
}

/** Selecciona un preset por índice desde el desplegable de Tweakpane (sirve también para 10–12). */
async function preset(page, index) {
  await page.$eval(
    '.tp-lstv_s',
    (s, i) => {
      s.selectedIndex = i;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    },
    index,
  );
}

const hudText = (page) => page.$eval('.hud', (el) => el.innerText);

/** Acerca la cámara con la rueda (en el centro) hasta el zoom indicado. Cargar un preset reencuadra el mundo. */
async function zoomTo(page, target) {
  const vp = page.viewport();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let k = 0; k < 60; k++) {
    const z = Number(/zoom ×([\d.]+)/.exec(await hudText(page))?.[1] ?? 1);
    if (z >= target) return;
    await page.mouse.wheel({ deltaY: -100 });
    await wait(60);
  }
}

/** Oculta la interfaz (tecla H) y los botones flotantes, para capturas limpias. */
async function cleanView(page) {
  await page.keyboard.press('h');
  await page.addStyleTag({ content: '#fab, .toast { display: none !important; }' });
}

const save = async (page, name, opts = {}) => {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, ...opts });
  console.log(`  ${path.relative(process.cwd(), file)}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
};

try {
  // ------------------------------------------------ vista principal con interfaz
  console.log('Vista principal');
  {
    const page = await open({ width: 1600, height: 900 });
    await preset(page, 1);
    await wait(1000);
    await zoomTo(page, 1.8);
    await wait(6000);
    await save(page, 'hero-ui.webp', { type: 'webp', quality: 88 });
    const panel = await page.$('.matrix-panel');
    await save(panel, 'matrix-editor.webp', { type: 'webp', quality: 92 });
    await page.close();
  }

  // ------------------------------------------------ galería de presets, sin interfaz
  console.log('Presets');
  {
    const page = await open({ width: 1280, height: 720 });
    const names = await page.$eval('.tp-lstv_s', (s) => [...s.options].map((o) => o.text));
    await cleanView(page);
    // zoom por preset: a ×1 con 80 000 partículas las estructuras son diminutas; «Galaxia» ya es un único cúmulo
    const zoom = { 9: 1.3 };
    for (let i = 0; i < names.length; i++) {
      await preset(page, i);
      await wait(1000);
      await zoomTo(page, zoom[i] ?? 2.6);
      await wait(8000);
      await save(page, `preset-${String(i + 1).padStart(2, '0')}.webp`, { type: 'webp', quality: 85 });
    }
    fs.writeFileSync(path.join(outDir, 'presets.json'), JSON.stringify(names, null, 2) + '\n');

    // imagen para redes / social preview de GitHub (1280×640)
    await page.setViewport({ width: 1280, height: 640 });
    await preset(page, 1);
    await wait(1000);
    await zoomTo(page, 2.2);
    await wait(9000);
    const raw = path.join(framesDir, 'social-raw.png');
    await page.screenshot({ path: raw });
    await page.close();
    python(SOCIAL_PY, raw, path.join(outDir, 'social-preview.jpg'));
    console.log('  docs/media/social-preview.jpg (con título)');
  }

  // ------------------------------------------------ animación (WebP animado vía Pillow)
  console.log('Animación');
  {
    const page = await open({ width: 800, height: 450 });
    await cleanView(page);
    await preset(page, 1);
    await wait(1000);
    await zoomTo(page, 2.4);
    await wait(6000);
    // en pausa y avanzando con S: cada fotograma son exactamente 2 pasos de simulación,
    // así la animación es fluida aunque la captura tarde más que un fotograma
    await page.keyboard.press(' ');
    const n = 120;
    const frameMs = 40;
    for (let k = 0; k < n; k++) {
      for (let s = 0; s < 2; s++) {
        await page.keyboard.press('s');
        await wait(25);
      }
      await page.screenshot({ path: path.join(framesDir, `f${String(k).padStart(3, '0')}.png`) });
    }
    await page.close();
    const py = `
import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[1] + '/f*.png'))
frames = [Image.open(f).convert('RGB').resize((640, 360), Image.LANCZOS) for f in files]
frames[0].save(sys.argv[2], save_all=True, append_images=frames[1:], duration=int(sys.argv[3]), loop=0, quality=70, method=6)
`;
    const anim = path.join(outDir, 'demo.webp');
    python(py, framesDir, anim, String(frameMs));
    console.log(`  ${path.relative(process.cwd(), anim)}  (${(fs.statSync(anim).size / 1024).toFixed(0)} KB, ${n} fotogramas a ${frameMs} ms)`);
  }

  // ------------------------------------------------ modo CPU (respaldo)
  console.log('Modo CPU');
  {
    const page = await open({ width: 1280, height: 720 }, '?cpu');
    await page.keyboard.press('5');
    await wait(6000);
    await page.$$eval('.toast', (els) => els.forEach((e) => e.remove()));
    await save(page, 'cpu-mode.webp', { type: 'webp', quality: 85 });
    await page.close();
  }

  // ------------------------------------------------ móvil
  console.log('Móvil');
  {
    const page = await open(
      { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      '',
      { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Mobile Safari/537.36' },
    );
    await preset(page, 4);
    await wait(6000);
    await save(page, 'mobile.webp', { type: 'webp', quality: 85 });
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
  fs.rmSync(framesDir, { recursive: true, force: true });
}
