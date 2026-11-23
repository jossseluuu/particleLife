// Smoke test en un navegador real (Chrome/Edge instalado) — tres escenarios:
//   1. escritorio con WebGPU   2. escritorio forzando el modo CPU (?cpu)   3. móvil táctil (pellizco, botones)
// Uso: npm run dev  (en otra terminal)  y luego  node test/browser.mjs [url] [carpetaCapturas]
// Variables: CHROME_PATH para usar otro navegador.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? 'screenshots';
fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--force-high-performance-gpu'],
});

async function openPage(url, viewport, extra = {}) {
  const page = await browser.newPage();
  if (extra.userAgent) await page.setUserAgent(extra.userAgent);
  await page.setViewport(viewport);
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') problems.push(`[error] ${t}`);
    else if (m.type() === 'warning' && !t.includes('WebGPU no disponible') && !t.includes('requestAdapter')) problems.push(`[warning] ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.hud div', { timeout: 15000 });
  await wait(3000);
  return { page, problems };
}

const hud = (page) => page.$eval('.hud', (el) => el.innerText.replace(/\n+/g, ' | ')).catch(() => '');
const fpsOf = (text) => Number(/^(\d+)\s*fps/.exec(text)?.[1] ?? 0);
const shot = async (page, name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`    captura: ${file}`);
};

// ---------------------------------------------------------------- 1. escritorio WebGPU
console.log('\n[1] Escritorio · WebGPU');
{
  const { page, problems } = await openPage(base, { width: 1600, height: 900 });
  const h = await hud(page);
  console.log(`    HUD: ${h}`);
  check(!h.includes('MODO CPU') && h.includes('sim GPU'), 'arranca con el motor WebGPU');
  check(fpsOf(h) > 20, `rinde (${fpsOf(h)} fps en headless)`);
  await shot(page, 'gpu-1-inicial');

  for (const k of ['2', '5', '7', '8']) {
    await page.keyboard.press(k);
    await wait(2500);
  }
  const presetName = await page.$eval('.tp-lstv_s', (s) => s.options[s.selectedIndex].text).catch(() => '');
  check(presetName === 'Vórtices', `presets por teclado (desplegable: "${presetName}")`);
  await shot(page, 'gpu-2-preset-vortices');

  // desplegable de presets (único acceso a los presets 10–12); antes destruía el panel dentro de su propio evento
  await page.$eval('.tp-lstv_s', (s) => {
    s.selectedIndex = 10;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(1500);
  const fromDropdown = await page.$eval('.tp-lstv_s', (s) => s.options[s.selectedIndex].text).catch(() => '');
  check(fromDropdown === 'Membranas', `preset desde el desplegable ("${fromDropdown}") sin errores de Tweakpane`);

  // editor de matriz: arrastrar una celda cambia su valor
  const box = await (await page.$('.matrix-canvas')).boundingBox();
  await page.mouse.move(box.x + 60, box.y + 60);
  const before = await page.$eval('.matrix-info', (el) => el.innerText);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 20, { steps: 5 });
  await page.mouse.up();
  const after = await page.$eval('.matrix-info', (el) => el.innerText);
  check(before !== after, `arrastrar en la matriz cambia el valor (${before.trim()} → ${after.trim()})`);

  // número de especies: cambiarlo redimensiona la matriz sin errores
  await page.keyboard.press('1');
  await wait(1500);
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await wait(800);
  await page.mouse.up();
  await page.mouse.wheel({ deltaY: -500 });
  await wait(600);
  check((await hud(page)).includes('zoom ×') && !(await hud(page)).includes('zoom ×1.0'), 'rueda = zoom');

  // pausa con el botón flotante
  await page.click('#btn-pause');
  await wait(300);
  check((await hud(page)).includes('EN PAUSA') || (await page.$eval('#btn-pause', (b) => b.textContent)) === '▶', 'botón de pausa');
  await page.click('#btn-pause');

  // ayuda
  await page.click('#btn-help');
  await wait(300);
  check(await page.$eval('#help', (el) => el.classList.contains('visible')), 'el botón ? abre la ayuda');
  check(await page.$eval('.gpu-box', (el) => el.hidden), 'en modo GPU no aparece el aviso de modo CPU');
  await page.click('#help-close');

  // enlace compartible: el estado va a la URL y al recargar se restaura (preset de 3 especies)
  await page.keyboard.press('5');
  await wait(800);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Copiar enlace'))?.click());
  await wait(800);
  const shared = page.url();
  check(shared.includes('#c='), `el botón de compartir pone el estado en la URL (${shared.length} caracteres)`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.pop-legend span', { timeout: 15000 });
  await wait(500);
  const legend = await page.$$eval('.pop-legend span', (els) => els.length);
  check(legend === 3, `al abrir el enlace se restaura el mundo (${legend} especies)`);

  check(problems.length === 0, `sin errores en consola${problems.length ? ':\n      ' + problems.join('\n      ') : ''}`);
  await page.close();
}

// ---------------------------------------------------------------- 2. escritorio CPU
console.log('\n[2] Escritorio · modo CPU forzado (?cpu)');
{
  const { page, problems } = await openPage(base + '?cpu', { width: 1600, height: 900 });
  await wait(2000);
  const h = await hud(page);
  console.log(`    HUD: ${h}`);
  check(h.includes('MODO CPU'), 'arranca en modo CPU');
  check(fpsOf(h) >= 20, `rinde aceptablemente (${fpsOf(h)} fps)`);
  check(await page.$eval('.toast.warn', () => true).catch(() => false), 'muestra el aviso de modo CPU');
  await shot(page, 'cpu-1-inicial');
  await page.keyboard.press('5');
  await wait(3000);
  await shot(page, 'cpu-2-piedra-papel-tijera');
  await page.keyboard.press('?');
  await wait(300);
  check(!(await page.$eval('.gpu-box', (el) => el.hidden)), 'la ayuda explica por qué está en modo CPU');
  await shot(page, 'cpu-3-ayuda');
  check(problems.length === 0, `sin errores en consola${problems.length ? ':\n      ' + problems.join('\n      ') : ''}`);
  await page.close();
}

// ---------------------------------------------------------------- 3. móvil táctil
console.log('\n[3] Móvil (390×844, táctil)');
{
  const { page, problems } = await openPage(
    base,
    { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Mobile Safari/537.36' },
  );
  const h = await hud(page);
  console.log(`    HUD: ${h}`);
  check(h.includes('30.000'), 'en móvil arranca con menos partículas (30.000)');
  check(await page.$eval('.matrix-panel', (el) => el.classList.contains('collapsed')), 'panel de matrices plegado en pantallas pequeñas');
  await shot(page, 'movil-1-inicial');

  // pellizco con dos dedos (CDP: eventos táctiles multi-punto)
  const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[150, 420], [240, 420]]);
  for (let k = 1; k <= 8; k++) await touch('touchMove', [[150 - k * 10, 420], [240 + k * 10, 420]]);
  await touch('touchEnd', []);
  await wait(500);
  const zoom = Number(/zoom ×([\d.]+)/.exec(await hud(page))?.[1] ?? 1);
  check(zoom > 1.3, `pellizcar con dos dedos hace zoom (×${zoom})`);

  // un dedo atrae partículas (no debe dar errores)
  await page.touchscreen.tap(195, 500);

  await page.tap('#btn-ui');
  await wait(400);
  check(await page.$eval('#ui', (el) => el.classList.contains('hidden')), 'el botón ☰ oculta la interfaz');
  await shot(page, 'movil-2-sin-ui');
  await page.tap('#btn-ui');
  await page.tap('.matrix-panel .panel-title');
  await wait(300);
  check(!(await page.$eval('.matrix-panel', (el) => el.classList.contains('collapsed'))), 'tocar el título despliega las matrices');
  await shot(page, 'movil-3-matrices');
  check(problems.length === 0, `sin errores en consola${problems.length ? ':\n      ' + problems.join('\n      ') : ''}`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodo correcto ✔');
process.exit(failures ? 1 : 0);
