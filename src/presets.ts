import { Config, defaultConfig, defaultSpecies, hslToHex, resizeSpecies } from './config';
import { mulberry32 } from './rng';

type Rand = () => number;

// ---------------------------------------------------------------------------
// Generadores de matriz de atracción (S×S, fila = quien reacciona, columna = a quién)
// ---------------------------------------------------------------------------

export const MATRIX_PATTERNS: Record<string, (S: number, r: Rand) => number[]> = {
  aleatoria: (S, r) => fill(S, () => r() * 2 - 1),
  simétrica: (S, r) => {
    const m = fill(S, () => 0);
    for (let a = 0; a < S; a++)
      for (let b = a; b < S; b++) m[a * S + b] = m[b * S + a] = r() * 2 - 1;
    return m;
  },
  serpientes: (S) => fill(S, (a, b) => (a === b ? 1 : b === (a + 1) % S ? 0.2 : 0)),
  cadenas: (S) =>
    fill(S, (a, b) => (a === b ? 1 : b === (a + 1) % S || b === (a + S - 1) % S ? 0.2 : -1)),
  persecución: (S) =>
    fill(S, (a, b) => (a === b ? 0.4 : b === (a + 1) % S ? 0.8 : a === (b + 1) % S ? -0.8 : 0)),
  células: (S, r) => fill(S, (a, b) => (a === b ? 0.9 : (a + b) % 3 === 0 ? 0.35 : -0.15 - 0.2 * r())),
  'solo diagonal': (S) => fill(S, (a, b) => (a === b ? 1 : 0)),
  cero: (S) => fill(S, () => 0),
};

function fill(S: number, f: (a: number, b: number) => number): number[] {
  const m = new Array(S * S);
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) m[a * S + b] = f(a, b);
  return m;
}

/** Perturba suavemente una matriz (modo "mutación"). */
export function mutate(m: number[], amount: number, r: Rand, min = -1, max = 1): number[] {
  return m.map((v) => Math.max(min, Math.min(max, v + (r() * 2 - 1) * amount)));
}

// ---------------------------------------------------------------------------
// Presets completos: cada uno parte de la configuración por defecto
// ---------------------------------------------------------------------------

export interface Preset {
  name: string;
  /** Qué se ve y por qué; se muestra al cargarlo y en la documentación. */
  description: string;
  build: (keep: Pick<Config, 'numParticles'>) => Config;
}

function base(S: number, keep: Pick<Config, 'numParticles'>, seed: number): Config {
  const cfg = defaultConfig();
  cfg.seed = seed;
  cfg.numParticles = keep.numParticles;
  resizeSpecies(cfg, S);
  cfg.species = Array.from({ length: S }, (_, i) => defaultSpecies(i, S));
  return cfg;
}

function palette(cfg: Config, h0: number, span: number, s = 0.85, l = 0.6): void {
  const S = cfg.numSpecies;
  cfg.species.forEach((sp, i) => (sp.color = hslToHex((h0 + (span * i) / S + 1) % 1, s, l)));
}

export const PRESETS: Preset[] = [
  {
    name: 'Sopa primordial',
    description: 'Seis especies con una matriz aleatoria: el punto de partida clásico, donde cada semilla da un mundo distinto.',
    build: (k) => {
      const c = base(6, k, 1234);
      c.attraction = MATRIX_PATTERNS['aleatoria'](6, mulberry32(c.seed));
      return c;
    },
  },
  {
    name: 'Serpientes',
    description: 'Cada especie se atrae a sí misma y un poco a la siguiente: se forman cadenas que reptan persiguiendo su propia cola.',
    build: (k) => {
      const c = base(8, k, 77);
      c.attraction = MATRIX_PATTERNS['serpientes'](8, mulberry32(c.seed));
      c.species.forEach((s) => (s.shape = 2));
      c.render.pointSize = 0.2;
      palette(c, 0.45, 0.6);
      return c;
    },
  },
  {
    name: 'Cadenas',
    description: 'Atracción con los vecinos de la cadena y repulsión con el resto: polímeros que se pliegan sin llegar a mezclarse.',
    build: (k) => {
      const c = base(6, k, 99);
      c.attraction = MATRIX_PATTERNS['cadenas'](6, mulberry32(c.seed));
      c.beta = 0.25;
      palette(c, 0.9, 0.35, 0.8, 0.62);
      return c;
    },
  },
  {
    name: 'Depredadores y presas',
    description: 'Cada especie persigue a la siguiente y huye de la anterior; las estelas dejan ver las persecuciones.',
    build: (k) => {
      const c = base(5, k, 4242);
      c.attraction = MATRIX_PATTERNS['persecución'](5, mulberry32(c.seed));
      c.species.forEach((s, i) => {
        s.shape = 2;
        s.mass = 0.8 + 0.15 * i;
      });
      c.render.trails = true;
      c.render.trailFade = 0.8;
      return c;
    },
  },
  {
    name: 'Piedra, papel, tijera',
    description: 'Tres especies que se convierten en ciclo al tocarse: aparecen frentes y ondas espirales que nunca se detienen.',
    build: (k) => {
      const S = 3;
      const c = base(S, k, 3);
      c.attraction = fill(S, (a, b) => (a === b ? 0.3 : b === (a + 1) % S ? 0.25 : -0.1));
      // la especie a convierte a la especie siguiente al tocarla -> ondas espirales
      c.conversion = fill(S, (a, b) => (b === (a + 1) % S ? 2.5 : 0));
      c.conversionEnabled = true;
      c.conversionRadius = 0.5;
      c.species.forEach((s) => (s.noise = 0.4));
      c.species[0].color = '#ff3b5c';
      c.species[1].color = '#ffd23b';
      c.species[2].color = '#3bb4ff';
      return c;
    },
  },
  {
    name: 'Ecosistema cíclico (5)',
    description: 'Cinco especies con conversión cíclica, propulsión creciente y formas distintas: un ecosistema que oscila sin fin.',
    build: (k) => {
      const S = 5;
      const c = base(S, k, 555);
      const r = mulberry32(c.seed);
      c.attraction = fill(S, (a, b) => (a === b ? 0.5 : b === (a + 1) % S ? 0.6 : a === (b + 1) % S ? -0.5 : r() * 0.4 - 0.2));
      c.conversion = fill(S, (a, b) => (b === (a + 1) % S ? 1.6 : b === (a + 2) % S ? 0.6 : 0));
      c.conversionEnabled = true;
      c.species.forEach((s, i) => {
        s.shape = [0, 2, 3, 5, 6][i];
        s.propulsion = 0.15 * i;
      });
      return c;
    },
  },
  {
    name: 'Bandadas',
    description: 'Propulsión y alineamiento por especie, como los boids: grupos que viajan juntos, se cruzan y se dispersan.',
    build: (k) => {
      const c = base(4, k, 2024);
      const r = mulberry32(c.seed);
      c.attraction = fill(4, (a, b) => (a === b ? 0.35 : r() * 0.6 - 0.4));
      c.species.forEach((s, i) => {
        s.shape = 2;
        s.size = 1.3;
        s.propulsion = 0.6 + 0.2 * i;
        s.alignment = 2.5;
        s.friction = 0.6;
      });
      c.render.trails = true;
      c.render.trailFade = 0.88;
      c.render.colorMode = 2;
      palette(c, 0.5, 0.5);
      return c;
    },
  },
  {
    name: 'Vórtices',
    description: 'Especies con giro de signo alterno: remolinos que rotan en sentidos opuestos y se repelen.',
    build: (k) => {
      const c = base(4, k, 31415);
      c.attraction = fill(4, (a, b) => (a === b ? 0.6 : (a + b) % 2 ? 0.2 : -0.3));
      c.species.forEach((s, i) => {
        s.spin = i % 2 ? 0.8 : -0.8;
        s.shape = 1;
      });
      c.render.trails = true;
      c.render.trailFade = 0.9;
      palette(c, 0.55, 0.4);
      return c;
    },
  },
  {
    name: 'Respiración',
    description: 'Células cuyo radio de interacción late con frecuencias distintas por especie: estructuras que se expanden y contraen.',
    build: (k) => {
      const c = base(6, k, 808);
      c.attraction = MATRIX_PATTERNS['células'](6, mulberry32(c.seed));
      c.species.forEach((s, i) => {
        s.pulseAmp = 0.5;
        s.pulseFreq = 0.15 + 0.07 * i;
        s.shape = 5;
      });
      palette(c, 0.75, 0.45);
      return c;
    },
  },
  {
    name: 'Galaxia',
    description: 'Un big bang con atracción global débil y giro: el cúmulo central desarrolla brazos y filamentos.',
    build: (k) => {
      const c = base(5, k, 1977);
      c.spawn = 'big bang';
      c.attraction = fill(5, (a, b) => (a === b ? 0.25 : 0.12));
      c.species.forEach((s, i) => {
        s.spin = 0.35;
        s.mass = 1 + i * 0.3;
        s.shape = i === 0 ? 6 : 0;
      });
      c.frictionHalfLife = 0.12;
      c.render.trails = true;
      c.render.trailFade = 0.93;
      c.render.colorMode = 2;
      palette(c, 0.58, 0.35, 0.7, 0.65);
      return c;
    },
  },
  {
    name: 'Membranas',
    description: 'Radios de interacción distintos para cada pareja: capas y membranas que separan regiones.',
    build: (k) => {
      const S = 6;
      const c = base(S, k, 6061);
      const r = mulberry32(c.seed);
      c.attraction = MATRIX_PATTERNS['aleatoria'](S, r);
      c.radius = fill(S, (a, b) => (a === b ? 1 : 0.35 + 0.6 * r()));
      c.beta = 0.2;
      return c;
    },
  },
  {
    name: 'Caos browniano',
    description: 'Matriz simétrica con mucho ruido por especie: agregados que se forman y se deshacen constantemente.',
    build: (k) => {
      const c = base(7, k, 12);
      c.attraction = MATRIX_PATTERNS['simétrica'](7, mulberry32(c.seed));
      c.species.forEach((s, i) => {
        s.noise = 0.3 + 0.25 * (i % 3);
        s.shape = i % 8;
      });
      return c;
    },
  },
];
