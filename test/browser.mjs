// Smoke test en un navegador real (Chrome instalado) con WebGPU.
// Uso: npm run dev   (en otra terminal)  y luego
//      node test/browser.mjs [url] [carpetaCapturas]
// Variables: CHROME_PATH para otra ruta de Chrome/Edge.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? 'screenshots';
fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--force-high-performance-gpu'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
};
const hud = () => page.$eval('.hud', (el) => el.innerText.replace(/\n+/g, ' | ')).catch(() => '(sin HUD)');

await page.goto(url, { waitUntil: 'networkidle0' });
await wait(4000);
const err = await page.$eval('#error', (el) => el.textContent).catch(() => '');
if (err) console.log('ERROR EN PÁGINA:', err);
console.log('HUD inicial:', await hud());
console.log('captura:', await shot('01-inicial'));

// presets con las teclas 2..9
for (const k of ['2', '5', '7', '8', '0']) {
  if (k === '0') break;
  await page.keyboard.press(k);
  await wait(3500);
  console.log(`preset ${k}:`, await hud());
  console.log('captura:', await shot(`02-preset-${k}`));
}

// interacción: arrastrar una celda de la matriz y usar el ratón sobre el canvas
const canvas = await page.$('.matrix-canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 60, box.y + 60);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y + 10, { steps: 5 });
await page.mouse.up();
const info = await page.$eval('.matrix-info', (el) => el.innerText);
console.log('editor de matriz tras arrastrar:', info);

await page.mouse.move(800, 450);
await page.mouse.down();
await wait(1500);
await page.mouse.up();
await page.mouse.wheel({ deltaY: -600 });
await wait(800);
console.log('tras zoom:', await hud());
console.log('captura:', await shot('03-zoom-raton'));

// pausa + ayuda
await page.keyboard.press('Space');
await page.keyboard.press('?');
await wait(500);
console.log('captura:', await shot('04-ayuda'));

console.log(problems.length ? `\nPROBLEMAS (${problems.length}):\n${problems.join('\n')}` : '\nSin errores ni avisos en consola ✔');
await browser.close();
process.exit(problems.some((p) => !p.startsWith('[warning]')) || err ? 1 : 0);
