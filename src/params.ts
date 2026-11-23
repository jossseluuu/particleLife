// =============================================================================
//  Metadatos de todos los parámetros de `Config`: fuente única de verdad.
//
//  - El panel (src/ui/panel.ts) toma de aquí etiquetas, rangos, pasos y opciones.
//  - La documentación (scripts/gen-docs.ts) genera con esto la referencia de parámetros
//    y el JSON Schema; falla si un campo de `Config` no está descrito aquí o sobra alguno.
//
//  Claves: ruta dentro de `Config` ("rMax", "render.bloom", "drift.rate"…);
//  "species.<campo>" describe cada elemento de `species[]`.
// =============================================================================

export type ParamGroup = 'ecosistema' | 'física' | 'conversión' | 'evolución' | 'especie' | 'render' | 'ratón';

export interface ParamMeta {
  /** Etiqueta en el panel. */
  label: string;
  /** Carpeta del panel donde aparece. */
  group: ParamGroup;
  /** Qué hace, en una o dos frases (se muestra en la documentación). */
  doc: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Opciones de un desplegable: etiqueta visible → valor. */
  options?: Record<string, string | number>;
  /** Sólo existe en el render WebGPU (no en modo CPU). */
  gpuOnly?: boolean;
  /** No aparece en el panel (se edita en otro sitio, p. ej. el editor de matrices). */
  hidden?: boolean;
  /** Cambiarlo reinicia las posiciones de las partículas. */
  resets?: boolean;
}

import { MAX_PARTICLES, MAX_SPECIES, SHAPES, SPAWN_MODES } from './config';

export const PARAMS: Record<string, ParamMeta> = {
  // ------------------------------------------------------------------ Ecosistema
  seed: { label: 'semilla', group: 'ecosistema', step: 1, resets: true, doc: 'Semilla del generador aleatorio: posiciones iniciales y matrices aleatorias. La misma semilla reproduce el mismo mundo.' },
  numParticles: { label: 'partículas', group: 'ecosistema', min: 1000, max: MAX_PARTICLES, step: 1000, resets: true, doc: 'Número total de partículas. El máximo real depende del motor (menos en modo CPU) y de la memoria de la GPU.' },
  numSpecies: { label: 'especies', group: 'ecosistema', min: 1, max: MAX_SPECIES, step: 1, resets: true, doc: 'Número de especies (colores). Al cambiarlo se redimensionan las matrices conservando la parte común.' },
  density: { label: 'densidad', group: 'ecosistema', min: 4, max: 120, step: 1, unit: 'vecinos', resets: true, doc: 'Vecinos medios dentro del radio máximo. Define el tamaño del mundo: más densidad, mundo más pequeño y más apretado.' },
  spawn: { label: 'aparición', group: 'ecosistema', options: Object.fromEntries(SPAWN_MODES.map((s) => [s, s])), resets: true, doc: 'Cómo se colocan las partículas al reiniciar.' },

  // ------------------------------------------------------------------ Física
  rMax: { label: 'radio máx.', group: 'física', min: 8, max: 150, step: 1, unit: 'unidades', doc: 'Alcance máximo de la interacción entre dos partículas. También fija el tamaño de las celdas de la rejilla.' },
  beta: { label: 'β (núcleo)', group: 'física', min: 0.05, max: 0.9, step: 0.01, unit: '× rMax', doc: 'Fracción del radio donde termina la repulsión universal y empieza la zona gobernada por la matriz.' },
  repulsion: { label: 'repulsión', group: 'física', min: 0, max: 5, step: 0.05, doc: 'Intensidad del núcleo repulsivo que impide que las partículas se superpongan.' },
  forceFactor: { label: 'fuerza', group: 'física', min: 0.5, max: 40, step: 0.5, doc: 'Multiplicador global de todas las fuerzas.' },
  frictionHalfLife: { label: 'semivida rozam.', group: 'física', min: 0.005, max: 1, step: 0.005, unit: 's', doc: 'Tiempo en el que la velocidad se reduce a la mitad sin fuerzas. Valores bajos = medio viscoso.' },
  dt: { label: 'dt', group: 'física', min: 0.002, max: 0.05, step: 0.001, unit: 's', doc: 'Paso de tiempo de la integración. Más grande = más rápido pero menos estable.' },
  maxSpeed: { label: 'vel. máx (rMax/s)', group: 'física', min: 1, max: 80, step: 1, unit: 'rMax/s', doc: 'Límite de velocidad de cada partícula; evita explosiones numéricas.' },
  stepsPerFrame: { label: 'pasos / frame', group: 'física', min: 1, max: 8, step: 1, doc: 'Pasos de simulación por frame dibujado: acelera la evolución a costa de rendimiento.' },
  algorithm: { label: 'algoritmo', group: 'física', options: { 'rejilla O(N)': 'rejilla', 'fuerza bruta O(N²)': 'fuerza bruta' }, doc: 'Rejilla espacial O(N) (normal) o fuerza bruta O(N²), útil sólo como referencia con pocas partículas.' },
  attraction: { label: 'atracción', group: 'física', hidden: true, min: -1, max: 1, doc: 'Matriz S×S: `attraction[a·S + b]` es cómo reacciona la especie a ante b (positivo atrae, negativo repele). Se edita en la pestaña «Atracción».' },
  radius: { label: 'radio', group: 'física', hidden: true, min: 0.1, max: 1, doc: 'Matriz S×S que escala el radio de interacción de cada pareja. Se edita en la pestaña «Radio».' },

  // ------------------------------------------------------------------ Conversión
  conversion: { label: 'conversión', group: 'conversión', hidden: true, min: 0, max: 5, doc: 'Matriz S×S: `conversion[a·S + b]` es la tasa a la que a convierte a b por contacto. Se edita en la pestaña «Conversión».' },
  conversionEnabled: { label: 'activa', group: 'conversión', doc: 'Activa la conversión de especies (depredación, piedra-papel-tijera).' },
  conversionRadius: { label: 'radio contacto', group: 'conversión', min: 0.05, max: 1, step: 0.01, unit: '× radio', doc: 'Distancia normalizada por debajo de la cual dos partículas se consideran en contacto.' },

  // ------------------------------------------------------------------ Evolución
  'drift.enabled': { label: 'deriva continua', group: 'evolución', doc: 'La matriz de atracción cambia sola poco a poco con un paseo aleatorio suave: el mundo nunca se estanca.' },
  'drift.rate': { label: 'velocidad', group: 'evolución', min: 0.01, max: 1, step: 0.01, doc: 'Velocidad de la deriva de la matriz.' },

  // ------------------------------------------------------------------ Especie (cada elemento de species[])
  'species.color': { label: 'color', group: 'especie', doc: 'Color de la especie en formato `#rrggbb`.' },
  'species.shape': { label: 'forma', group: 'especie', options: Object.fromEntries(SHAPES.map((s, i) => [s, i])), doc: 'Forma dibujada (SDF).' },
  'species.size': { label: 'tamaño', group: 'especie', min: 0.2, max: 4, step: 0.05, doc: 'Multiplicador del tamaño visual (no afecta a la física).' },
  'species.mass': { label: 'masa', group: 'especie', min: 0.1, max: 5, step: 0.05, doc: 'Inercia: la aceleración se divide por la masa.' },
  'species.friction': { label: 'rozamiento ×', group: 'especie', min: 0, max: 3, step: 0.05, doc: 'Multiplicador del rozamiento global para esta especie (0 = sin rozamiento propio).' },
  'species.propulsion': { label: 'propulsión', group: 'especie', min: 0, max: 2, step: 0.01, doc: 'Empuje constante en la dirección de su velocidad (materia activa).' },
  'species.noise': { label: 'ruido', group: 'especie', min: 0, max: 2, step: 0.01, doc: 'Agitación browniana aleatoria en cada paso.' },
  'species.spin': { label: 'giro', group: 'especie', min: -2, max: 2, step: 0.01, doc: 'Fuerza tangencial respecto a sus vecinos; genera vórtices. El signo indica el sentido.' },
  'species.alignment': { label: 'alineamiento', group: 'especie', min: 0, max: 8, step: 0.05, doc: 'Tendencia a igualar su velocidad con la media de sus vecinos (bandadas).' },
  'species.pulseAmp': { label: 'pulso amplitud', group: 'especie', min: 0, max: 0.9, step: 0.01, doc: 'Amplitud de la oscilación del radio de interacción («respiración»).' },
  'species.pulseFreq': { label: 'pulso frec.', group: 'especie', min: 0.02, max: 3, step: 0.01, unit: 'Hz', doc: 'Frecuencia de la respiración, en hercios de tiempo simulado.' },

  // ------------------------------------------------------------------ Render
  'render.colorMode': { label: 'color', group: 'render', gpuOnly: true, options: { especie: 0, velocidad: 1, 'especie × velocidad': 2, dirección: 3, 'degradado especies': 4 }, doc: 'Cómo se colorea cada partícula.' },
  'render.blend': { label: 'mezcla', group: 'render', options: { aditiva: 'aditivo', alfa: 'alfa' }, doc: 'Mezcla aditiva (las zonas densas brillan) o alfa (opaca).' },
  'render.pointSize': { label: 'tamaño', group: 'render', min: 0.02, max: 0.8, step: 0.01, unit: '× rMax', doc: 'Tamaño base de las partículas.' },
  'render.minPx': { label: 'tamaño mín. px', group: 'render', min: 0.5, max: 6, step: 0.1, unit: 'px', doc: 'Tamaño mínimo en pantalla, para que no desaparezcan al alejar la cámara.' },
  'render.softness': { label: 'halo', group: 'render', min: 0, max: 2, step: 0.05, doc: 'Halo difuso alrededor de cada partícula.' },
  'render.brightness': { label: 'brillo', group: 'render', min: 0.05, max: 4, step: 0.05, doc: 'Brillo de cada partícula.' },
  'render.orient': { label: 'orientar formas', group: 'render', gpuOnly: true, doc: 'Gira las formas según la dirección de su velocidad.' },
  'render.speedRef': { label: 'vel. de saturación', group: 'render', gpuOnly: true, min: 0.2, max: 20, step: 0.1, unit: 'rMax/s', doc: 'Velocidad que satura la paleta en los modos de color por velocidad.' },
  'render.trails': { label: 'estelas', group: 'render', doc: 'En vez de borrar cada frame, atenúa el anterior: deja rastro.' },
  'render.trailFade': { label: 'persistencia', group: 'render', min: 0.5, max: 0.99, step: 0.005, doc: 'Fracción de la imagen que se conserva por frame con estelas activas.' },
  'render.bloom': { label: 'bloom', group: 'render', gpuOnly: true, doc: 'Resplandor alrededor de las zonas brillantes.' },
  'render.bloomIntensity': { label: 'intensidad', group: 'render', gpuOnly: true, min: 0, max: 4, step: 0.05, doc: 'Intensidad del bloom.' },
  'render.bloomThreshold': { label: 'umbral', group: 'render', gpuOnly: true, min: 0, max: 3, step: 0.01, doc: 'Brillo a partir del cual una zona genera bloom.' },
  'render.bloomKnee': { label: 'suavidad', group: 'render', gpuOnly: true, min: 0, max: 1, step: 0.01, doc: 'Suavidad de la transición en el umbral del bloom.' },
  'render.bloomRadius': { label: 'radio bloom', group: 'render', gpuOnly: true, min: 2, max: 7, step: 1, unit: 'niveles', doc: 'Niveles de la pirámide de bloom: más niveles, resplandor más amplio.' },
  'render.exposure': { label: 'exposición', group: 'render', gpuOnly: true, min: 0.1, max: 4, step: 0.05, doc: 'Exposición antes del tone mapping.' },
  'render.tonemap': { label: 'tone mapping', group: 'render', gpuOnly: true, options: { ACES: 0, Reinhard: 1, lineal: 2 }, doc: 'Curva que comprime el HDR a la pantalla.' },
  'render.vignette': { label: 'viñeta', group: 'render', min: 0, max: 1, step: 0.01, doc: 'Oscurecimiento de los bordes de la imagen.' },
  'render.background': { label: 'fondo', group: 'render', doc: 'Color de fondo (`#rrggbb`).' },

  // ------------------------------------------------------------------ Ratón
  'mouse.radius': { label: 'radio (×rMax)', group: 'ratón', min: 1, max: 40, step: 0.5, unit: '× rMax', doc: 'Alcance del pincel del ratón o del dedo.' },
  'mouse.strength': { label: 'fuerza', group: 'ratón', min: -20, max: 20, step: 0.1, doc: 'Fuerza del pincel: positiva atrae, negativa repele (Shift invierte el signo).' },
};

/** Opciones para `addBinding` de Tweakpane a partir de los metadatos de un parámetro. */
export function bindOpts(key: string): { label: string; min?: number; max?: number; step?: number; options?: Record<string, string | number> } {
  const m = PARAMS[key];
  if (!m) throw new Error(`Parámetro sin metadatos: ${key}`);
  if (m.options) return { label: m.label, options: m.options };
  const o: { label: string; min?: number; max?: number; step?: number } = { label: m.label };
  if (m.min !== undefined) o.min = m.min;
  if (m.max !== undefined) o.max = m.max;
  if (m.step !== undefined) o.step = m.step;
  return o;
}
