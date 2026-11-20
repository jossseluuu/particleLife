// Genera dist-single/index.html: la app entera (JS + CSS) en un único archivo HTML autocontenido.
// Útil para abrirla sin servidor, enviarla por correo o publicarla en cualquier hosting estático.
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, file) => {
  const js = fs.readFileSync(path.join(dist, file), 'utf8').replace(/<\/script/gi, '<\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, file) => {
  return `<style>${fs.readFileSync(path.join(dist, file), 'utf8')}</style>`;
});
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Quedan referencias a assets sin incrustar');

fs.mkdirSync('dist-single', { recursive: true });
fs.writeFileSync('dist-single/index.html', html);
console.log(`dist-single/index.html (${(html.length / 1024).toFixed(0)} KB)`);
