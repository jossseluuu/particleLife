// Convierte dist-single/index.html en una página para el visor de Artifacts de claude.ai:
// sin <!doctype>/<html>/<head>/<body> (el visor añade su propio esqueleto), con <title> y <style> primero.
// Uso: npm run build:single && node scripts/build-artifact.mjs <salida.html>
import fs from 'node:fs';

const out = process.argv[2] ?? 'dist-single/artifact.html';
const html = fs.readFileSync('dist-single/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0];
const styles = (html.match(/<style>[\s\S]*?<\/style>/g) ?? []).join('\n');
const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? '';
const scripts = (head.match(/<script type="module">[\s\S]*?<\/script>/g) ?? []).join('\n');
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
if (!title || !styles || !scripts || !body) throw new Error('No se encontraron todas las partes del documento');
fs.writeFileSync(out, `${title}\n${styles}\n${body}\n${scripts}\n`);
console.log(`${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
