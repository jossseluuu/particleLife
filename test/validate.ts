// Validación headless con Dawn (paquete `webgpu`):
//  1. compila todos los shaders y pipelines (sim + render)
//  2. compara la rejilla O(N) con la fuerza bruta O(N²) partiendo del mismo estado
//  3. comprueba estabilidad (sin NaN, dentro del mundo, población conservada)
//  4. mide el rendimiento del paso de simulación
//
// Uso: npm run validate
import { create, globals } from 'webgpu';
import { defaultConfig, resizeSpecies } from '../src/config';
import { MATRIX_PATTERNS } from '../src/presets';
import { mulberry32 } from '../src/rng';
import { Simulation } from '../src/sim/simulation';
import { Renderer } from '../src/render/renderer';
import { Camera } from '../src/camera';
import { CpuSimulation } from '../src/sim/cpuSimulation';

Object.assign(globalThis, globals);

let failures = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
}

// Cada sección se ejecuta en un subproceso propio: el binding Dawn-node es inestable cuando un mismo
// proceso encadena muchas operaciones (segfaults nativos no reproducibles en el navegador).
const SECTIONS = ['compare', 'cpu-vs-gpu', 'stability', 'render', 'perf'] as const;
type Section = (typeof SECTIONS)[number];

async function orchestrate() {
  const { spawnSync } = await import('node:child_process');
  let failed = 0;
  for (const s of SECTIONS) {
    const res = spawnSync('npx vite-node test/validate.ts', {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, VALIDATE_SECTION: s },
    });
    if (res.status !== 0) {
      failed++;
      if (res.status !== 1) console.log(`  ✘ la sección "${s}" terminó de forma anómala (código ${res.status ?? res.signal})`);
    }
  }
  console.log(failed ? `\n${failed} sección(es) con fallos` : '\nTodo correcto ✔');
  process.exit(failed ? 1 : 0);
}

async function main(section: Section) {
  const gpu = create([]);
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Sin adaptador WebGPU');
  const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (e) => errors.push((e as GPUUncapturedErrorEvent).error.message));
  if (section === 'compare') console.log(`GPU: ${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.description}`);

  const cfg = defaultConfig();
  resizeSpecies(cfg, 5);
  const r = mulberry32(7);
  cfg.numParticles = 6000;
  cfg.attraction = MATRIX_PATTERNS['aleatoria'](5, r);
  cfg.radius = cfg.radius.map(() => 0.4 + 0.6 * r());
  // El orden tras el counting sort depende de atomicAdd (no determinista), así que el azar por índice
  // también. Para comparar exactamente: sin ruido y con tasas de conversión enormes (probabilidad ≈ 1).
  cfg.conversion = cfg.conversion.map(() => (r() < 0.3 ? 1000 + r() * 1000 : 0));
  cfg.conversionEnabled = true;
  cfg.species.forEach((s) => {
    s.mass = 0.5 + r();
    s.friction = 0.5 + r();
    s.propulsion = r() * 0.3;
    s.noise = 0;
    s.spin = r() - 0.5;
    s.alignment = r();
    s.pulseAmp = r() * 0.5;
  });

  const sim = new Simulation(device, cfg);
  sim.reset(1.6);
  // unos pasos para tener velocidades no nulas
  for (let k = 0; k < 20; k++) sim.step();

  if (section === 'compare') {
  // ---------------------------------------------------------------- 1: rejilla vs fuerza bruta
  console.log('\n[1] Rejilla O(N) vs fuerza bruta O(N²)');
  const s0 = await sim.readState();
  const frame0 = sim.frame;
  const time0 = sim.time;

  const runOnce = async (algo: 'rejilla' | 'fuerza bruta') => {
    cfg.algorithm = algo;
    sim.setState(s0.particles, s0.species);
    sim.frame = frame0;
    sim.time = time0;
    sim.step();
    return sim.readState();
  };
  const g = await runOnce('rejilla');
  const b = await runOnce('fuerza bruta');

  // Emparejamos cada partícula de la rejilla con la más cercana de la fuerza bruta (mismo conjunto, otro orden).
  const N = cfg.numParticles;
  const order = (s: { particles: Float32Array }) =>
    Array.from({ length: N }, (_, i) => i).sort((a, c) => s.particles[a * 4] - s.particles[c * 4]);
  const og = order(g);
  const ob = order(b);
  let maxErr = 0;
  let speciesDiff = 0;
  let nan = 0;
  for (let k = 0; k < N; k++) {
    const i = og[k];
    if (!Number.isFinite(g.particles[i * 4]) || !Number.isFinite(g.particles[i * 4 + 1])) nan++;
    let best = Infinity;
    let bestJ = -1;
    for (let w = Math.max(0, k - 12); w < Math.min(N, k + 13); w++) {
      const j = ob[w];
      const d = Math.hypot(g.particles[i * 4] - b.particles[j * 4], g.particles[i * 4 + 1] - b.particles[j * 4 + 1]);
      if (d < best) { best = d; bestJ = j; }
    }
    maxErr = Math.max(maxErr, best);
    if (bestJ < 0 || g.species[i] !== b.species[bestJ]) speciesDiff++;
  }
  console.log(`  mundo ${sim.worldW.toFixed(0)}×${sim.worldH.toFixed(0)}, rejilla ${sim.gridW}×${sim.gridH}, error máx. posición ${maxErr.toExponential(2)}`);
  check(nan === 0, 'sin NaN');
  check(maxErr < 1e-3 * cfg.rMax, 'posiciones idénticas (salvo redondeo) entre rejilla y fuerza bruta');
  check(speciesDiff === 0, `conversiones de especie idénticas (${speciesDiff} diferencias)`);
  }

  if (section === 'cpu-vs-gpu') {
  // ---------------------------------------------------------------- 1b: motor CPU vs motor GPU
  console.log('\n[1b] Motor CPU (respaldo) vs motor GPU: mismo estado, un paso');
  const s0 = await sim.readState();
  const cpu = new CpuSimulation(cfg);
  cpu.worldW = sim.worldW;
  cpu.worldH = sim.worldH;
  cpu.updateGrid();
  cpu.updateSpecies();
  cpu.setState(s0.particles, s0.species);
  cpu.frame = sim.frame;
  cpu.time = sim.time;
  cpu.step();
  sim.setState(s0.particles, s0.species);
  sim.step();
  const g = await sim.readState();
  const N = cfg.numParticles;
  const order = (p: Float32Array) => Array.from({ length: N }, (_, i) => i).sort((a, c) => p[a * 4] - p[c * 4]);
  const og = order(g.particles);
  const oc = order(cpu.particles);
  let maxErr = 0;
  let maxVErr = 0;
  let speciesDiff = 0;
  for (let k = 0; k < N; k++) {
    const i = og[k];
    let best = Infinity;
    let bestJ = -1;
    for (let w = Math.max(0, k - 12); w < Math.min(N, k + 13); w++) {
      const j = oc[w];
      const d = Math.hypot(g.particles[i * 4] - cpu.particles[j * 4], g.particles[i * 4 + 1] - cpu.particles[j * 4 + 1]);
      if (d < best) { best = d; bestJ = j; }
    }
    maxErr = Math.max(maxErr, best);
    if (bestJ >= 0) {
      maxVErr = Math.max(maxVErr, Math.hypot(g.particles[i * 4 + 2] - cpu.particles[bestJ * 4 + 2], g.particles[i * 4 + 3] - cpu.particles[bestJ * 4 + 3]));
      if (g.species[i] !== cpu.species[bestJ]) speciesDiff++;
    } else speciesDiff++;
  }
  console.log(`  error máx. posición ${maxErr.toExponential(2)} · velocidad ${maxVErr.toExponential(2)} (f32 GPU vs f64 CPU)`);
  check(maxErr < 1e-3 * cfg.rMax, 'posiciones CPU = GPU (salvo precisión float32)');
  check(maxVErr < 1e-2 * cfg.rMax, 'velocidades CPU = GPU');
  check(speciesDiff === 0, `conversiones CPU = GPU (${speciesDiff} diferencias)`);
  }

  if (section === 'stability') {
  // ---------------------------------------------------------------- 2: estabilidad
  console.log('\n[2] Estabilidad (300 pasos)');
  cfg.algorithm = 'rejilla';
  for (let k = 0; k < 300; k++) sim.step(undefined, k === 299);
  const s1 = await sim.readState();
  await device.queue.onSubmittedWorkDone();
  await new Promise((res) => setTimeout(res, 50));
  let bad = 0;
  for (let i = 0; i < cfg.numParticles; i++) {
    const x = s1.particles[i * 4];
    const y = s1.particles[i * 4 + 1];
    if (!(x >= 0 && x <= sim.worldW && y >= 0 && y <= sim.worldH)) bad++;
    if (s1.species[i] >= cfg.numSpecies) bad++;
  }
  check(bad === 0, 'todas las partículas dentro del mundo y con especie válida');
  const popSum = Array.from(sim.populations).reduce((a, v) => a + v, 0);
  check(popSum === cfg.numParticles, `población conservada (${popSum})`);
  }

  if (section === 'render') {
  // ---------------------------------------------------------------- 3: render (compila pipelines y dibuja a textura)
  console.log('\n[3] Render (pipelines + un frame a textura)');
  const renderer = new Renderer(device, 'bgra8unorm', cfg);
  renderer.resize(1280, 720);
  const target = device.createTexture({ size: [1280, 720], format: 'bgra8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  const cam = new Camera();
  cam.fit(sim.worldW, sim.worldH, 1280, 720);
  for (const blend of ['aditivo', 'alfa'] as const) {
    cfg.render.blend = blend;
    cfg.render.trails = blend === 'alfa';
    renderer.render(sim, cam, target.createView());
  }
  await device.queue.onSubmittedWorkDone();
  check(errors.length === 0, `sin errores de validación WebGPU${errors.length ? ': ' + errors.join(' | ') : ''}`);
  }

  if (section === 'perf') {
  // ---------------------------------------------------------------- 4: rendimiento
  console.log('\n[4] Rendimiento del paso de simulación (rejilla)');
  for (const n of [50_000, 200_000, 500_000, 1_000_000]) {
    cfg.numParticles = n;
    cfg.attraction = MATRIX_PATTERNS['aleatoria'](5, mulberry32(1));
    sim.reset(1.6);
    for (let k = 0; k < 30; k++) sim.step(); // calentamiento + estructura
    await device.queue.onSubmittedWorkDone();
    const steps = 60;
    const t0 = performance.now();
    for (let k = 0; k < steps; k++) sim.step();
    await device.queue.onSubmittedWorkDone();
    const ms = (performance.now() - t0) / steps;
    console.log(`  N=${n.toLocaleString('es')}: ${ms.toFixed(2)} ms/paso (rejilla ${sim.gridW}×${sim.gridH})`);
  }
  check(errors.length === 0, 'sin errores tras las pruebas de rendimiento');
  }

  process.exit(failures ? 1 : 0);
}

const arg = process.env.VALIDATE_SECTION as Section | undefined;
(arg && SECTIONS.includes(arg) ? main(arg) : orchestrate()).catch((e) => {
  console.error(e);
  process.exit(1);
});
