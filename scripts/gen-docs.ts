// =============================================================================
//  Genera las partes de la documentación que se derivan del código, para que nunca
//  se queden desfasadas:
//
//    docs/referencia/parametros.md   ← src/params.ts + valores por defecto de src/config.ts
//    docs/guia/presets.md            ← src/presets.ts (descripción, diferencias, matrices)
//    docs/public/config.schema.json  ← JSON Schema del formato de guardado/compartir
//
//  Uso:  npm run docs:gen            (escribe los archivos)
//        npm run docs:gen -- --check (CI: falla si algún archivo no está al día)
//
//  También falla si un campo de `Config` no tiene metadatos en src/params.ts o si sobran.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { Config, MAX_SPECIES, SHAPES, defaultConfig, defaultSpecies } from '../src/config';
import { PARAMS, ParamGroup, ParamMeta } from '../src/params';
import { MATRIX_PATTERNS, PRESETS } from '../src/presets';
import { mulberry32 } from '../src/rng';

const check = process.argv.includes('--check');
const DEMO = 'https://jossseluuu.github.io/particleLife/';
const HEADER = (src: string) =>
  `<!-- ARCHIVO GENERADO por scripts/gen-docs.ts a partir de ${src}. No lo edites a mano: ejecuta \`npm run docs:gen\`. -->\n\n`;

// ----------------------------------------------------------------------------- cobertura
/** Rutas de todos los campos de Config ("render.bloom", "species.mass"…). */
function configKeys(cfg: Config): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'species') for (const sk of Object.keys(defaultSpecies(0, 1))) keys.push(`species.${sk}`);
    else if (v && typeof v === 'object' && !Array.isArray(v)) for (const sk of Object.keys(v)) keys.push(`${k}.${sk}`);
    else keys.push(k);
  }
  return keys;
}

const defaults = defaultConfig();
const keys = configKeys(defaults);
const missing = keys.filter((k) => !PARAMS[k]);
const stale = Object.keys(PARAMS).filter((k) => !keys.includes(k));
if (missing.length || stale.length) {
  if (missing.length) console.error(`✘ Campos de Config sin metadatos en src/params.ts: ${missing.join(', ')}`);
  if (stale.length) console.error(`✘ Metadatos en src/params.ts que ya no existen en Config: ${stale.join(', ')}`);
  process.exit(1);
}

// ----------------------------------------------------------------------------- utilidades
const get = (cfg: Config, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], cfg);

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('es-ES') : String(Math.round(v * 1e4) / 1e4).replace('.', ','));

function fmt(v: unknown, meta?: ParamMeta): string {
  if (meta?.options && (typeof v === 'string' || typeof v === 'number')) {
    const label = Object.entries(meta.options).find(([, ov]) => ov === v)?.[0];
    return label !== undefined && String(label) !== String(v) ? `\`${v}\` (${label})` : `\`${v}\``;
  }
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return `\`${String(v)}\``;
}

const esc = (s: string) => s.replace(/\|/g, '\\|');

// ----------------------------------------------------------------------------- parámetros
const GROUPS: { id: ParamGroup; title: string; intro: string }[] = [
  { id: 'ecosistema', title: 'Ecosistema', intro: 'Población, tamaño del mundo y cómo empieza.' },
  { id: 'física', title: 'Física', intro: 'La ley de fuerza y la integración. Las matrices se editan en el [editor de matrices](../guia/editor-matrices).' },
  { id: 'conversión', title: 'Conversión / depredación', intro: 'Cambio de especie por contacto. Ver [comportamientos y conversión](../conceptos/comportamientos#conversion).' },
  { id: 'evolución', title: 'Evolución de la matriz', intro: 'Cambios automáticos de la matriz de atracción con el tiempo.' },
  { id: 'especie', title: 'Especies y comportamientos', intro: 'Cada elemento de `species[]` tiene estos campos. En el panel: *Especies y comportamientos → Especie N*.' },
  { id: 'render', title: 'Render', intro: 'Sólo afectan al aspecto, nunca a la simulación.' },
  { id: 'ratón', title: 'Ratón y táctil', intro: 'El «pincel» con el que se empujan las partículas.' },
];

function defaultOf(key: string): string {
  const meta = PARAMS[key];
  if (key === 'species.color') return 'paleta según el índice';
  if (key.startsWith('species.')) return fmt((defaultSpecies(0, 1) as unknown as Record<string, unknown>)[key.slice(8)], meta);
  const v = get(defaults, key);
  if (Array.isArray(v)) {
    const uniq = [...new Set(v)];
    return uniq.length === 1 ? `S×S de ${num(uniq[0] as number)}` : 'S×S';
  }
  return fmt(v, meta);
}

function rangeOf(m: ParamMeta): string {
  if (m.options) return Object.keys(m.options).map((o) => `\`${o}\``).join(' · ');
  if (m.min === undefined && m.max === undefined) return '—';
  const r = `${m.min !== undefined ? num(m.min) : '−∞'} … ${m.max !== undefined ? num(m.max) : '∞'}`;
  return m.unit ? `${r} ${m.unit}` : r;
}

function genParams(): string {
  let md = HEADER('src/params.ts y src/config.ts');
  md += `# Referencia de parámetros

Todos los campos de la configuración de un mundo: lo que guarda el JSON, lo que viaja en un enlace
compartible y lo que ajusta el panel. La columna **Ruta** es la clave dentro del objeto \`Config\`
(ver [formato de guardado](./formato)).

<div class="legend">

**Marcas:** <Badge type="tip" text="GPU" /> sólo en el render WebGPU (no en modo CPU) ·
<Badge type="warning" text="reinicia" /> cambiarlo vuelve a colocar las partículas ·
<Badge type="info" text="editor" /> se edita en el editor de matrices, no en el panel.

</div>

`;
  for (const g of GROUPS) {
    const entries = Object.entries(PARAMS).filter(([, m]) => m.group === g.id);
    md += `## ${g.title}\n\n${g.intro}\n\n| Ruta | Panel | Por defecto | Rango | Descripción |\n| --- | --- | --- | --- | --- |\n`;
    for (const [key, m] of entries) {
      const badges = [
        m.gpuOnly ? '<Badge type="tip" text="GPU" />' : '',
        m.resets ? '<Badge type="warning" text="reinicia" />' : '',
        m.hidden ? '<Badge type="info" text="editor" />' : '',
      ].filter(Boolean).map((b) => ' ' + b).join('');
      md += `| \`${key}\`${badges} | ${m.hidden ? '—' : esc(m.label)} | ${esc(defaultOf(key))} | ${esc(rangeOf(m))} | ${esc(m.doc)} |\n`;
    }
    md += '\n';
  }
  md += `## Límites internos

| Constante | Valor | Motivo |
| --- | --- | --- |
| \`MAX_SPECIES\` | ${MAX_SPECIES} | Tamaño fijo de las matrices en el buffer de la GPU (16×16) |
| \`MAX_PARTICLES\` | ${num(2_000_000)} | Memoria de los buffers de partículas |
| \`MAX_CELLS\` | ${num(256 * 1024)} | Prefix-sum de dos niveles: 256 bloques × 1024 celdas |
`;
  return md;
}

// ----------------------------------------------------------------------------- presets
function cellStyle(v: number, max = 1): string {
  const a = Math.min(1, Math.abs(v) / max) * 0.85;
  const c = v > 0 ? `rgba(244, 63, 94, ${a.toFixed(2)})` : v < 0 ? `rgba(59, 130, 246, ${a.toFixed(2)})` : 'transparent';
  return `background:${c}`;
}

function matrixTable(cfg: Config, m: number[], max = 1): string {
  const S = cfg.numSpecies;
  const dot = (i: number) => `<span class="sp" style="background:${cfg.species[i].color}"></span>`;
  let h = '<table class="matrix"><thead><tr><th></th>';
  for (let b = 0; b < S; b++) h += `<th>${dot(b)}</th>`;
  h += '</tr></thead><tbody>';
  for (let a = 0; a < S; a++) {
    h += `<tr><th>${dot(a)}</th>`;
    for (let b = 0; b < S; b++) {
      const v = m[a * S + b];
      h += `<td style="${cellStyle(v, max)}">${v.toFixed(2)}</td>`;
    }
    h += '</tr>';
  }
  return h + '</tbody></table>';
}

/** Parámetros que difieren de la configuración por defecto (sin contar matrices, colores ni especies). */
function differences(cfg: Config): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const m = PARAMS[key];
    if (m.hidden || ['seed', 'numParticles', 'numSpecies', 'spawn'].includes(key)) continue;
    if (key.startsWith('species.')) {
      const f = key.slice(8) as keyof ReturnType<typeof defaultSpecies>;
      if (f === 'color') continue;
      const vals = cfg.species.map((s) => s[f]);
      const def = defaultSpecies(0, 1)[f];
      if (vals.every((v) => v === def)) continue;
      const shown = f === 'shape' ? vals.map((v) => SHAPES[v as number]) : vals.map((v) => num(v as number));
      const uniq = [...new Set(shown)];
      out.push(`\`${key}\` = ${uniq.length === 1 ? uniq[0] : shown.join(' · ')}`);
      continue;
    }
    const v = get(cfg, key);
    if (v !== get(defaults, key)) out.push(`\`${key}\` = ${fmt(v, m)}`);
  }
  return out;
}

function genPresets(): string {
  let md = HEADER('src/presets.ts');
  md += `# Galería de presets

Doce mundos listos para explorar. Se cargan con las teclas <kbd>1</kbd>–<kbd>9</kbd>, con el desplegable
*preset* del panel o con un enlace \`#preset=N\` como los de esta página.

Cada preset parte de la [configuración por defecto](../referencia/parametros) y cambia sólo lo que se
indica. En las matrices, la **fila** es la especie que reacciona y la **columna** aquélla ante la que
reacciona: <span class="pos">rojo atrae</span>, <span class="neg">azul repele</span>.

::: tip Experimenta
Carga un preset y pulsa <kbd>M</kbd> para mutar ligeramente su matriz, o <kbd>B</kbd> para cambiar la
semilla: verás variaciones del mismo comportamiento.
:::

`;
  PRESETS.forEach((p, i) => {
    const cfg = p.build({ numParticles: defaults.numParticles });
    const n = String(i + 1).padStart(2, '0');
    const diff = differences(cfg);
    md += `## ${i + 1} · ${p.name}\n\n`;
    md += `<img class="preset-shot" src="../media/preset-${n}.webp" alt="${p.name}" loading="lazy">\n\n`;
    md += `${p.description}\n\n`;
    md += `<a class="demo-link" href="${DEMO}#preset=${i + 1}" target="_blank" rel="noopener">▶ Abrir en la demo</a>`;
    md += i < 9 ? ` · tecla <kbd>${i + 1}</kbd>\n\n` : ' · desplegable *preset*\n\n';
    md += `| Especies | Aparición | Semilla | Conversión |\n| --- | --- | --- | --- |\n`;
    md += `| ${cfg.numSpecies} | \`${cfg.spawn}\` | ${cfg.seed} | ${cfg.conversionEnabled ? 'sí' : 'no'} |\n\n`;
    if (diff.length) md += `**Cambia respecto a lo normal:** ${diff.join(' · ')}\n\n`;
    md += `<details><summary>Matriz de atracción${cfg.conversionEnabled ? ' y de conversión' : ''}</summary>\n\n`;
    md += `${matrixTable(cfg, cfg.attraction)}\n\n`;
    if (cfg.conversionEnabled) md += `**Conversión** (fila convierte a columna):\n\n${matrixTable(cfg, cfg.conversion, 2.5)}\n\n`;
    if (cfg.radius.some((r) => r !== 1)) md += `**Radio por pareja:**\n\n${matrixTable(cfg, cfg.radius)}\n\n`;
    md += `</details>\n\n`;
  });

  md += `## Patrones de matriz

El desplegable del editor de matrices aplica estos patrones a la matriz de atracción (aquí con 6 especies):

`;
  const demo = defaultConfig();
  for (const [name, gen] of Object.entries(MATRIX_PATTERNS)) {
    md += `### ${name}\n\n${matrixTable(demo, gen(6, mulberry32(1)))}\n\n`;
  }
  return md.trimEnd() + '\n';
}

// ----------------------------------------------------------------------------- JSON Schema
function schemaFor(m: ParamMeta, sample: unknown): Record<string, unknown> {
  const s: Record<string, unknown> = { description: m.doc };
  if (Array.isArray(sample)) {
    Object.assign(s, { type: 'array', items: { type: 'number', minimum: m.min, maximum: m.max }, maxItems: MAX_SPECIES * MAX_SPECIES });
  } else if (m.options) {
    s.enum = Object.values(m.options);
  } else if (typeof sample === 'number') {
    s.type = 'number';
    if (m.min !== undefined) s.minimum = m.min;
    if (m.max !== undefined) s.maximum = m.max;
  } else if (typeof sample === 'boolean') s.type = 'boolean';
  else if (typeof sample === 'string') Object.assign(s, { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' });
  return s;
}

function genSchema(): string {
  const props: Record<string, Record<string, unknown>> = {};
  const nested: Record<string, Record<string, unknown>> = {};
  const species: Record<string, unknown> = {};
  const sp0 = defaultSpecies(0, 1) as unknown as Record<string, unknown>;
  for (const key of keys) {
    const m = PARAMS[key];
    const [head, tail] = key.split('.');
    if (head === 'species') species[tail] = schemaFor(m, sp0[tail]);
    else if (tail) (nested[head] ??= {})[tail] = schemaFor(m, get(defaults, key));
    else props[key] = schemaFor(m, get(defaults, key));
  }
  for (const [k, p] of Object.entries(nested)) props[k] = { type: 'object', properties: p };
  props.species = { type: 'array', maxItems: MAX_SPECIES, items: { type: 'object', properties: species } };
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${DEMO}docs/config.schema.json`,
    title: 'Particle Life · configuración de un mundo',
    description: 'Formato de «Exportar JSON» y del enlace compartible. Todos los campos son opcionales: los que faltan toman su valor por defecto. Generado por scripts/gen-docs.ts.',
    type: 'object',
    properties: props,
  };
  return JSON.stringify(schema, null, 2) + '\n';
}

// ----------------------------------------------------------------------------- escribir / comprobar
const outputs: [string, string][] = [
  ['docs/referencia/parametros.md', genParams()],
  ['docs/guia/presets.md', genPresets()],
  ['docs/public/config.schema.json', genSchema()],
];

let outdated = 0;
for (const [file, content] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) {
    console.log(`  = ${file}`);
    continue;
  }
  if (check) {
    console.error(`  ✘ ${file} no está al día`);
    outdated++;
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`  ✎ ${file}`);
  }
}
console.log(`Cobertura de parámetros: ${keys.length}/${keys.length} campos de Config documentados`);
if (outdated) {
  console.error('\nEjecuta `npm run docs:gen` y añade los cambios al commit.');
  process.exit(1);
}
