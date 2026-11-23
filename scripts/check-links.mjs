// Comprueba los enlaces que VitePress no verifica:
//   1. Anclas (#seccion) de la web compilada: cada enlace interno con fragmento debe apuntar a un id que exista.
//      (VitePress sólo comprueba que la página exista, no la sección.)
//   2. Enlaces e imágenes relativos de los .md que se leen en GitHub (README, CONTRIBUTING…).
// Uso: npm run docs:build && node scripts/check-links.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/particleLife/docs/';
const OUT = 'dist/docs';
let errors = 0;
const fail = (msg) => {
  console.error(`  ✘ ${msg}`);
  errors++;
};

// ------------------------------------------------------------------ 1. web compilada
if (!fs.existsSync(OUT)) {
  console.error(`No existe ${OUT}: ejecuta antes npm run docs:build`);
  process.exit(1);
}
const pages = fs.readdirSync(OUT, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\\/g, '/'));
const ids = new Map();
const html = new Map();
for (const p of pages) {
  const src = fs.readFileSync(path.join(OUT, p), 'utf8');
  html.set(p, src);
  ids.set(p, new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]))));
}

/** "/particleLife/docs/guia/recetas" → "guia/recetas.html" */
function pageFor(urlPath) {
  let rel = urlPath.slice(BASE.length).replace(/\/$/, '/index');
  if (rel === '') rel = 'index';
  if (!rel.endsWith('.html')) rel += '.html';
  return rel;
}

let checked = 0;
for (const [p, src] of html) {
  if (p === '404.html') continue;
  // sólo el contenido de la página, no la barra lateral ni la navegación repetidas
  const main = src.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '';
  for (const [, href] of main.matchAll(/href="([^"]+)"/g)) {
    if (!href.includes('#') || /^[a-z]+:/i.test(href)) continue;
    const [target, frag] = href.split('#');
    if (!frag) continue;
    const page = target === '' ? p : target.startsWith(BASE) ? pageFor(target) : null;
    if (!page) continue;
    checked++;
    if (!ids.has(page)) fail(`${p}: enlace a una página inexistente ${href}`);
    else if (!ids.get(page).has(decodeURIComponent(frag))) fail(`${p}: el ancla #${frag} no existe en ${page}`);
  }
}
console.log(`Anclas: ${checked} enlaces con fragmento comprobados en ${pages.length} páginas`);

// ------------------------------------------------------------------ 2. Markdown que se lee en GitHub
const rootDocs = ['README.md', 'README.en.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'CHANGELOG.md', '.github/pull_request_template.md'];
let rel = 0;
for (const f of rootDocs) {
  const src = fs.readFileSync(f, 'utf8');
  for (const [, link] of src.matchAll(/(?:\]\(|src=")([^)"#\s]+)/g)) {
    if (/^[a-z]+:/i.test(link)) continue;
    rel++;
    const target = path.normalize(path.join(path.dirname(f), link));
    if (!fs.existsSync(target)) fail(`${f}: enlace relativo roto → ${link}`);
  }
}
console.log(`Markdown de GitHub: ${rel} enlaces relativos comprobados`);

if (errors) {
  console.error(`\n${errors} enlace(s) roto(s)`);
  process.exit(1);
}
console.log('Todos los enlaces correctos ✔');
