// Tests unitarios sin GPU (se ejecutan en CI): motor CPU, geometría, configuración, presets,
// serialización y aparición de partículas.
// Uso: npm test
import { defaultConfig, MAX_CELLS, normalizeConfig, resizeSpecies, Config } from '../src/config';
import { PARAMS } from '../src/params';
import { MATRIX_PATTERNS, PRESETS } from '../src/presets';
import { mulberry32 } from '../src/rng';
import { CpuSimulation } from '../src/sim/cpuSimulation';
import { spawnParticles } from '../src/sim/spawn';
import { computeGrid, computeWorld } from '../src/sim/world';
import { decodeConfig, encodeConfig } from '../src/ui/storage';

let failures = 0;
let passed = 0;
function check(ok: boolean, msg: string) {
  if (ok) passed++;
  else {
    failures++;
    console.log(`  ✘ ${msg}`);
  }
}
function section(name: string) {
  console.log(`\n[${name}]`);
}

/** Configuración con todos los comportamientos activos pero sin azar (para comparar exactamente). */
function richConfig(n: number, S = 5, seed = 7): Config {
  const cfg = defaultConfig();
  resizeSpecies(cfg, S);
  const r = mulberry32(seed);
  cfg.numParticles = n;
  cfg.attraction = MATRIX_PATTERNS['aleatoria'](S, r);
  cfg.radius = cfg.radius.map(() => 0.4 + 0.6 * r());
  cfg.conversion = cfg.conversion.map(() => (r() < 0.3 ? 1 + r() * 3 : 0));
  cfg.conversionEnabled = true;
  cfg.species.forEach((s) => {
    s.mass = 0.5 + r();
    s.friction = 0.5 + r();
    s.propulsion = r() * 0.3;
    s.noise = r() * 0.3;
    s.spin = r() - 0.5;
    s.alignment = r();
    s.pulseAmp = r() * 0.5;
  });
  return cfg;
}

async function main() {
  // ------------------------------------------------------------------ geometría
  section('Geometría del mundo y la rejilla');
  for (const [n, density, rMax] of [[1000, 30, 40], [80_000, 30, 40], [2_000_000, 4, 40], [500, 120, 150], [100, 4, 8]]) {
    const cfg = defaultConfig();
    Object.assign(cfg, { numParticles: n, density, rMax });
    for (const aspect of [0.5, 1, 1.78, 3]) {
      const w = computeWorld(cfg, aspect);
      const g = computeGrid(rMax, w.worldW, w.worldH);
      check(w.worldW >= rMax * 3 && w.worldH >= rMax * 3, `mundo >= 3·rMax (n=${n}, aspect=${aspect})`);
      check(g.gridW >= 3 && g.gridH >= 3, `rejilla >= 3×3 (n=${n})`);
      check(g.gridW * g.gridH <= MAX_CELLS, `rejilla <= MAX_CELLS (n=${n}: ${g.gridW}×${g.gridH})`);
      check(g.cellW >= g.effectiveRMax - 1e-9 && g.cellH >= g.effectiveRMax - 1e-9, `celda >= radio efectivo (n=${n})`);
      const area = (n * Math.PI * rMax * rMax) / density;
      const ok = Math.abs(w.worldW * w.worldH - area) / area < 1e-9 || w.worldW === rMax * 3.05 || w.worldH === rMax * 3.05;
      check(ok, `área del mundo según la densidad (n=${n})`);
    }
  }
  // cambio de rMax a algo mayor que el mundo / 3: el radio efectivo se limita
  const g2 = computeGrid(10_000, 900, 600);
  check(g2.effectiveRMax <= 200 + 1e-9 && g2.gridW === 4 && g2.gridH === 3, 'rMax enorme se limita a mundo/3');
  console.log('  ok');

  // ------------------------------------------------------------------ CPU: rejilla vs fuerza bruta
  section('Motor CPU: rejilla O(N) vs fuerza bruta O(N²)');
  {
    const cfg = richConfig(3000);
    const sim = new CpuSimulation(cfg);
    sim.reset(1.6);
    for (let k = 0; k < 10; k++) sim.step();
    const p0 = sim.particles.slice();
    const s0 = sim.species.slice();
    const f0 = sim.frame;
    const t0 = sim.time;
    const run = (algo: Config['algorithm']) => {
      cfg.algorithm = algo;
      sim.setState(p0, s0);
      sim.frame = f0;
      sim.time = t0;
      for (let k = 0; k < 3; k++) sim.step();
      return { p: sim.particles.slice(), s: sim.species.slice() };
    };
    const g = run('rejilla');
    const b = run('fuerza bruta');
    let maxErr = 0;
    let sdiff = 0;
    for (let i = 0; i < cfg.numParticles; i++) {
      for (let k = 0; k < 2; k++) {
        let d = Math.abs(g.p[i * 4 + k] - b.p[i * 4 + k]);
        const w = k ? sim.worldH : sim.worldW;
        d = Math.min(d, w - d);
        maxErr = Math.max(maxErr, d);
      }
      if (g.s[i] !== b.s[i]) sdiff++;
    }
    // En CPU el orden es determinista, así que incluso el ruido y la conversión deben coincidir.
    console.log(`  error máx. ${maxErr.toExponential(2)} · diferencias de especie ${sdiff}`);
    check(maxErr < 1e-3, 'rejilla y fuerza bruta dan el mismo resultado (3 pasos, con ruido y conversión)');
    check(sdiff === 0, 'mismas conversiones de especie');
  }

  // ------------------------------------------------------------------ CPU: determinismo
  section('Motor CPU: determinismo');
  {
    const runSeed = () => {
      const cfg = richConfig(1500, 4, 3);
      const sim = new CpuSimulation(cfg);
      sim.reset(1.3);
      for (let k = 0; k < 40; k++) sim.step();
      return sim.particles.slice();
    };
    const a = runSeed();
    const b = runSeed();
    check(a.every((v, i) => v === b[i]), 'misma semilla => mismo resultado bit a bit');
    console.log('  ok');
  }

  // ------------------------------------------------------------------ CPU: estabilidad en todos los presets
  section('Motor CPU: estabilidad de todos los presets (200 pasos)');
  for (const preset of PRESETS) {
    const cfg = preset.build({ numParticles: 2500 });
    const sim = new CpuSimulation(cfg);
    sim.reset(1.6);
    sim.mouse = { x: sim.worldW / 2, y: sim.worldH / 2, strength: 3 };
    for (let k = 0; k < 200; k++) sim.step();
    let bad = 0;
    for (let i = 0; i < cfg.numParticles; i++) {
      const x = sim.particles[i * 4];
      const y = sim.particles[i * 4 + 1];
      const vx = sim.particles[i * 4 + 2];
      if (!(x >= 0 && x <= sim.worldW && y >= 0 && y <= sim.worldH && Number.isFinite(vx))) bad++;
      if (sim.species[i] >= cfg.numSpecies) bad++;
    }
    const pop = Array.from(sim.populations).reduce((a, v) => a + v, 0);
    const maxV = cfg.maxSpeed * sim.effectiveRMax * 1.0001;
    let fast = 0;
    for (let i = 0; i < cfg.numParticles; i++) if (Math.hypot(sim.particles[i * 4 + 2], sim.particles[i * 4 + 3]) > maxV) fast++;
    check(bad === 0, `${preset.name}: posiciones finitas dentro del mundo y especies válidas`);
    check(pop === cfg.numParticles, `${preset.name}: población conservada (${pop})`);
    check(fast === 0, `${preset.name}: velocidad limitada a maxSpeed`);
    console.log(`  ${preset.name.padEnd(24)} ok`);
  }

  // ------------------------------------------------------------------ física básica
  section('Física: casos analíticos');
  {
    // Dos partículas de la misma especie que se atraen: deben acercarse hasta la zona de equilibrio (~β·rMax).
    const cfg = defaultConfig();
    resizeSpecies(cfg, 1);
    cfg.numParticles = 2;
    cfg.attraction = [1];
    const sim = new CpuSimulation(cfg);
    sim.reset(1);
    const cx = sim.worldW / 2;
    const cy = sim.worldH / 2;
    sim.setState(new Float32Array([cx - 15, cy, 0, 0, cx + 15, cy, 0, 0]), new Uint32Array([0, 0]));
    for (let k = 0; k < 400; k++) sim.step();
    const d = Math.hypot(sim.particles[0] - sim.particles[4], sim.particles[1] - sim.particles[5]);
    console.log(`  par atractivo: distancia final ${d.toFixed(2)} (rMax=${sim.effectiveRMax}, β=${cfg.beta})`);
    check(d < 30 && d > 1, 'dos partículas que se atraen se acercan y no colapsan');
    const mx = (sim.particles[0] + sim.particles[4]) / 2;
    check(Math.abs(mx - cx) < 1e-3, 'el centro de masas se conserva con interacción simétrica');

    // Repulsión: con matriz negativa se separan.
    cfg.attraction = [-1];
    sim.updateSpecies();
    sim.setState(new Float32Array([cx - 15, cy, 0, 0, cx + 15, cy, 0, 0]), new Uint32Array([0, 0]));
    for (let k = 0; k < 400; k++) sim.step();
    const d2 = Math.hypot(sim.particles[0] - sim.particles[4], sim.particles[1] - sim.particles[5]);
    check(d2 >= sim.effectiveRMax * 0.99, `dos partículas que se repelen acaban fuera de alcance (${d2.toFixed(1)})`);

    // Interacción a través del borde toroidal.
    cfg.attraction = [1];
    sim.updateSpecies();
    sim.setState(new Float32Array([2, cy, 0, 0, sim.worldW - 2 - 20, cy, 0, 0]), new Uint32Array([0, 0]));
    for (let k = 0; k < 400; k++) sim.step();
    let dx = Math.abs(sim.particles[0] - sim.particles[4]);
    dx = Math.min(dx, sim.worldW - dx);
    check(dx < 22, `las partículas interactúan a través del borde del mundo (dist ${dx.toFixed(1)})`);

    // Conversión: una especie rodeada por otra que la convierte acaba convertida.
    const c2 = defaultConfig();
    resizeSpecies(c2, 2);
    c2.numParticles = 2000;
    c2.conversion = [0, 50, 0, 0]; // la especie 0 convierte a la 1
    c2.conversionEnabled = true;
    c2.conversionRadius = 1;
    const s2 = new CpuSimulation(c2);
    s2.reset(1);
    const before = s2.species.reduce((a, v) => a + (v === 0 ? 1 : 0), 0);
    for (let k = 0; k < 30; k++) s2.step();
    const after = s2.populations[0];
    check(after > before && s2.populations[1] < c2.numParticles - before, `la conversión hace crecer a la especie conversora (${before} → ${after})`);
    console.log('  ok');
  }

  // ------------------------------------------------------------------ configuración
  section('Configuración, presets y serialización');
  {
    const cfg = defaultConfig();
    resizeSpecies(cfg, 3);
    cfg.attraction = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => v / 10);
    resizeSpecies(cfg, 5);
    check(cfg.attraction.length === 25 && cfg.species.length === 5, 'resizeSpecies amplía matrices y especies');
    check(cfg.attraction[0] === 0.1 && cfg.attraction[1 * 5 + 2] === 0.6 && cfg.attraction[4 * 5 + 4] === 0, 'resizeSpecies conserva la parte común');
    resizeSpecies(cfg, 2);
    check(cfg.attraction.join() === [0.1, 0.2, 0.4, 0.5].join(), 'resizeSpecies recorta correctamente');

    const n = normalizeConfig({ numSpecies: 99, numParticles: 1e9, attraction: [1, 2] } as Partial<Config>);
    check(n.numSpecies === 16 && n.attraction.length === 256 && n.numParticles === 2_000_000, 'normalizeConfig acota valores fuera de rango');
    const n2 = normalizeConfig({ render: { trails: true } } as unknown as Partial<Config>);
    check(n2.render.trails === true && n2.render.bloom === true, 'normalizeConfig fusiona objetos anidados parciales');

    for (const p of PRESETS) {
      const c = p.build({ numParticles: 1234 });
      const S = c.numSpecies;
      const valid =
        c.numParticles === 1234 &&
        c.attraction.length === S * S &&
        c.radius.length === S * S &&
        c.conversion.length === S * S &&
        c.species.length === S &&
        c.attraction.every((v) => v >= -1 && v <= 1) &&
        c.species.every((s) => /^#[0-9a-f]{6}$/i.test(s.color));
      check(valid, `preset "${p.name}" genera una configuración válida`);
    }
    for (const [name, gen] of Object.entries(MATRIX_PATTERNS)) {
      const m = gen(7, mulberry32(1));
      check(m.length === 49 && m.every((v) => v >= -1 && v <= 1), `patrón "${name}" válido`);
    }

    const original = PRESETS[6].build({ numParticles: 50_000 });
    const code = await encodeConfig(original);
    const back = await decodeConfig(code);
    const same =
      back.numSpecies === original.numSpecies &&
      back.species[2].propulsion === Math.round(original.species[2].propulsion * 1e4) / 1e4 &&
      back.render.trails === original.render.trails &&
      back.attraction.every((v, i) => Math.abs(v - original.attraction[i]) < 1e-4);
    check(same, `ida y vuelta por URL comprimida (${code.length} caracteres)`);
    check(/^[A-Za-z0-9_-]+$/.test(code), 'el código de URL es base64url');
    let threw = false;
    try {
      await decodeConfig('basura!!');
    } catch {
      threw = true;
    }
    check(threw, 'una URL corrupta se rechaza');
    console.log('  ok');
  }

  // ------------------------------------------------------------------ aparición
  section('Modos de aparición');
  {
    const modes: Config['spawn'][] = ['aleatorio', 'disco', 'anillo', 'espiral', 'franjas', 'cúmulos', 'big bang'];
    for (const spawn of modes) {
      const cfg = defaultConfig();
      cfg.spawn = spawn;
      cfg.numParticles = 5000;
      const W = 3000;
      const H = 2000;
      const { particles, species } = spawnParticles(cfg, W, H);
      let bad = 0;
      const counts = new Array(cfg.numSpecies).fill(0);
      for (let i = 0; i < 5000; i++) {
        const x = particles[i * 4];
        const y = particles[i * 4 + 1];
        if (!(x >= 0 && x < W && y >= 0 && y < H)) bad++;
        counts[species[i]]++;
      }
      check(bad === 0, `"${spawn}": todas las partículas dentro del mundo`);
      check(counts.every((c) => c > 0), `"${spawn}": aparecen todas las especies`);
    }
    console.log('  ok');
  }

  {
    section('Metadatos de parámetros (src/params.ts)');
    // los valores por defecto y los de cada preset deben caber en el rango que muestra el panel
    const inRange = (cfg: Config, where: string) => {
      let bad = 0;
      const report = (msg: string) => {
        bad++;
        console.log(`    ${where}: ${msg}`);
      };
      for (const [key, m] of Object.entries(PARAMS)) {
        const [head, tail] = key.split('.');
        const c = cfg as unknown as Record<string, unknown>;
        const values: unknown[] =
          head === 'species'
            ? cfg.species.map((sp) => (sp as unknown as Record<string, unknown>)[tail])
            : tail
              ? [(c[head] as Record<string, unknown>)[tail]]
              : [c[key]].flat();
        for (const v of values) {
          if (m.options && !Object.values(m.options).includes(v as string | number)) report(`${key}=${v} no es una opción`);
          if (typeof v === 'number' && ((m.min !== undefined && v < m.min - 1e-9) || (m.max !== undefined && v > m.max + 1e-9)))
            report(`${key}=${v} fuera de [${m.min}, ${m.max}]`);
        }
      }
      return bad;
    };
    check(inRange(defaultConfig(), 'por defecto') === 0, 'los valores por defecto están dentro de su rango');
    for (const p of PRESETS) check(inRange(p.build({ numParticles: 80_000 }), p.name) === 0, `preset «${p.name}»: valores dentro de rango`);
    check(PRESETS.every((p) => p.description.length > 20), 'todos los presets tienen descripción');
    console.log('  ok');
  }

  console.log(`\n${passed} comprobaciones correctas, ${failures} fallidas`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
