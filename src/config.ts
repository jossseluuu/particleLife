// Configuración serializable de todo el ecosistema.
// Todo lo que el usuario puede ajustar vive aquí, de modo que guardar/cargar/compartir
// un estado es simplemente (de)serializar este objeto.

export const MAX_SPECIES = 16;
export const MAX_CELLS = 256 * 1024; // límite de la rejilla espacial (scan de 2 niveles: 256 bloques × 1024)
export const MAX_PARTICLES = 2_000_000;

export const SHAPES = ['círculo', 'anillo', 'triángulo', 'cuadrado', 'rombo', 'hexágono', 'estrella', 'cruz'] as const;

/** Comportamiento propio de cada especie ("tipo"): cómo se mueve además de las fuerzas de la matriz. */
export interface SpeciesConfig {
  color: string; // #rrggbb
  shape: number; // índice en SHAPES
  size: number; // multiplicador del tamaño visual
  mass: number; // inercia: la aceleración se divide por la masa
  friction: number; // multiplicador del rozamiento base (0 = sin rozamiento propio, 2 = doble)
  propulsion: number; // autopropulsión en la dirección de su velocidad (materia activa)
  noise: number; // agitación browniana
  spin: number; // fuerza tangencial respecto a los vecinos (genera vórtices; signo = sentido)
  alignment: number; // tendencia a igualar la velocidad de sus vecinos (bandadas)
  pulseAmp: number; // amplitud de "respiración" del radio de interacción (0..0.9)
  pulseFreq: number; // frecuencia de la respiración (Hz de simulación)
}

export const SPAWN_MODES = ['aleatorio', 'disco', 'anillo', 'espiral', 'franjas', 'cúmulos', 'big bang'] as const;
export type SpawnMode = (typeof SPAWN_MODES)[number];
export type Algorithm = 'rejilla' | 'fuerza bruta';
export type ColorMode = 0 | 1 | 2 | 3 | 4; // especie, velocidad, especie×velocidad, dirección, densidad aparente
export type BlendMode = 'aditivo' | 'alfa';
export type ToneMap = 0 | 1 | 2; // ACES, Reinhard, lineal

export interface RenderConfig {
  pointSize: number; // tamaño en fracción de rMax
  minPx: number; // tamaño mínimo en píxeles para que nunca desaparezcan
  softness: number; // halo alrededor de cada partícula
  brightness: number;
  colorMode: ColorMode;
  blend: BlendMode;
  orient: boolean; // rotar las formas según la velocidad
  speedRef: number; // velocidad (en rMax/s) que satura la paleta
  trails: boolean;
  trailFade: number; // 0..1 (fracción que se conserva por frame)
  bloom: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomKnee: number;
  bloomRadius: number; // nº de niveles de la pirámide (2..7)
  exposure: number;
  tonemap: ToneMap;
  background: string;
  vignette: number;
}

export interface Config {
  seed: number;
  numParticles: number;
  numSpecies: number;
  density: number; // vecinos medios dentro de rMax (define el tamaño del mundo en el reset)
  spawn: SpawnMode;

  rMax: number; // radio de interacción máximo (unidades de mundo)
  beta: number; // fracción de rMax donde termina la repulsión universal
  repulsion: number; // fuerza del núcleo repulsivo
  forceFactor: number;
  frictionHalfLife: number; // segundos en los que la velocidad se reduce a la mitad
  dt: number;
  maxSpeed: number; // en rMax/s
  stepsPerFrame: number;
  algorithm: Algorithm;

  attraction: number[]; // S×S  [a*S+b]: cómo reacciona `a` ante `b`  (-1..1)
  radius: number[]; // S×S  escala del radio de interacción por pareja (0.1..1)
  conversion: number[]; // S×S  [a*S+b]: tasa a la que `a` convierte a `b` por contacto (0..5)
  conversionEnabled: boolean;
  conversionRadius: number; // fracción del radio de pareja considerada "contacto"

  species: SpeciesConfig[];

  drift: { enabled: boolean; rate: number };
  mouse: { radius: number; strength: number };
  render: RenderConfig;
}

export function defaultSpecies(i: number, n: number): SpeciesConfig {
  return {
    color: hslToHex((i / n + 0.02) % 1, 0.85, 0.6),
    shape: 0,
    size: 1,
    mass: 1,
    friction: 1,
    propulsion: 0,
    noise: 0,
    spin: 0,
    alignment: 0,
    pulseAmp: 0,
    pulseFreq: 0.5,
  };
}

export function defaultRender(): RenderConfig {
  return {
    pointSize: 0.14,
    minPx: 1.4,
    softness: 0.6,
    brightness: 1.0,
    colorMode: 0,
    blend: 'aditivo',
    orient: true,
    speedRef: 4,
    trails: false,
    trailFade: 0.86,
    bloom: true,
    bloomIntensity: 0.9,
    bloomThreshold: 0.35,
    bloomKnee: 0.4,
    bloomRadius: 6,
    exposure: 1.0,
    tonemap: 0,
    background: '#05060a',
    vignette: 0.35,
  };
}

export function defaultConfig(): Config {
  const S = 6;
  return {
    seed: 1234,
    numParticles: 80_000,
    numSpecies: S,
    density: 30,
    spawn: 'aleatorio',
    rMax: 40,
    beta: 0.3,
    repulsion: 1,
    forceFactor: 10,
    frictionHalfLife: 0.04,
    dt: 0.02,
    maxSpeed: 20,
    stepsPerFrame: 1,
    algorithm: 'rejilla',
    attraction: new Array(S * S).fill(0),
    radius: new Array(S * S).fill(1),
    conversion: new Array(S * S).fill(0),
    conversionEnabled: false,
    conversionRadius: 0.35,
    species: Array.from({ length: S }, (_, i) => defaultSpecies(i, S)),
    drift: { enabled: false, rate: 0.15 },
    mouse: { radius: 6, strength: 3 },
    render: defaultRender(),
  };
}

/** Cambia el número de especies conservando la parte común de matrices y especies. */
export function resizeSpecies(cfg: Config, n: number): void {
  const old = cfg.numSpecies;
  const remap = (m: number[], fill: number) => {
    const out = new Array(n * n).fill(fill);
    for (let a = 0; a < Math.min(old, n); a++)
      for (let b = 0; b < Math.min(old, n); b++) out[a * n + b] = m[a * old + b];
    return out;
  };
  cfg.attraction = remap(cfg.attraction, 0);
  cfg.radius = remap(cfg.radius, 1);
  cfg.conversion = remap(cfg.conversion, 0);
  const sp: SpeciesConfig[] = [];
  for (let i = 0; i < n; i++) sp.push(cfg.species[i] ?? defaultSpecies(i, n));
  cfg.species = sp;
  cfg.numSpecies = n;
}

/** Completa una configuración parcial (p. ej. cargada de JSON/URL) con los valores por defecto. */
export function normalizeConfig(partial: Partial<Config>): Config {
  const base = defaultConfig();
  const cfg: Config = {
    ...base,
    ...partial,
    drift: { ...base.drift, ...(partial.drift ?? {}) },
    mouse: { ...base.mouse, ...(partial.mouse ?? {}) },
    render: { ...base.render, ...(partial.render ?? {}) },
  };
  const S = Math.max(1, Math.min(MAX_SPECIES, Math.round(cfg.numSpecies)));
  cfg.numSpecies = S;
  const fix = (m: number[] | undefined, fill: number) => {
    const out = new Array(S * S).fill(fill);
    if (m) for (let i = 0; i < Math.min(m.length, S * S); i++) out[i] = Number(m[i]) || 0;
    return out;
  };
  cfg.attraction = fix(partial.attraction, 0);
  cfg.radius = fix(partial.radius, 1);
  cfg.conversion = fix(partial.conversion, 0);
  cfg.species = Array.from({ length: S }, (_, i) => ({ ...defaultSpecies(i, S), ...(partial.species?.[i] ?? {}) }));
  cfg.numParticles = Math.max(100, Math.min(MAX_PARTICLES, Math.round(cfg.numParticles)));
  return cfg;
}

export function cloneConfig(cfg: Config): Config {
  return JSON.parse(JSON.stringify(cfg));
}

// ---------- utilidades de color ----------

export function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** #rrggbb -> [r,g,b] en espacio lineal (0..1). */
export function hexToLinear(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
}
