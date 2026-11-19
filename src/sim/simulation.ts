import simCode from '../shaders/sim.wgsl?raw';
import { Config, MAX_CELLS, MAX_SPECIES } from '../config';
import { spawnParticles } from './spawn';

const WG = 256;
const PARAMS_SIZE = 112; // 28 × 4 bytes (ver struct Params en sim.wgsl)
const SPECIES_FLOATS = 256 * 3 + MAX_SPECIES * 2 * 4;

type PipelineName = 'countCells' | 'scanBlocks' | 'scanSums' | 'addSums' | 'scatter' | 'forces' | 'forcesBrute';

// Bindings que usa cada entry point (los layouts 'auto' sólo incluyen los usados).
const BINDINGS: Record<PipelineName, number[]> = {
  countCells: [0, 2, 6, 10, 11],
  scanBlocks: [0, 7, 8, 9],
  scanSums: [0, 9],
  addSums: [0, 8, 9],
  scatter: [0, 2, 3, 4, 5, 8, 10, 11],
  forces: [0, 1, 2, 3, 4, 5, 7, 8, 12],
  forcesBrute: [0, 1, 2, 3, 4, 5, 12],
};

export interface MouseState {
  x: number;
  y: number;
  strength: number; // 0 = inactivo
}

export class Simulation {
  readonly device: GPUDevice;
  cfg: Config;

  // geometría del mundo y de la rejilla
  worldW = 1;
  worldH = 1;
  gridW = 3;
  gridH = 3;
  cellW = 1;
  cellH = 1;
  effectiveRMax = 1;

  capacity = 0; // nº de partículas para el que hay buffers
  numParticles = 0;
  frame = 0;
  time = 0;
  mouse: MouseState = { x: 0, y: 0, strength: 0 };

  /** Población por especie (se actualiza de forma asíncrona). */
  populations = new Uint32Array(MAX_SPECIES);

  // buffers
  particlesA!: GPUBuffer;
  speciesA!: GPUBuffer;
  private particlesB!: GPUBuffer;
  private speciesB!: GPUBuffer;
  private cellIndex!: GPUBuffer;
  private rankInCell!: GPUBuffer;
  private readonly cellCount: GPUBuffer;
  private readonly cellStart: GPUBuffer;
  private readonly blockSums: GPUBuffer;
  private readonly popCount: GPUBuffer;
  private readonly popStaging: GPUBuffer;
  private popPending = false;
  private readonly paramsBuf: GPUBuffer;
  private readonly speciesBuf: GPUBuffer;
  private readonly paramsData = new ArrayBuffer(PARAMS_SIZE);
  private readonly paramsF = new Float32Array(this.paramsData);
  private readonly paramsU = new Uint32Array(this.paramsData);
  private readonly speciesData = new Float32Array(SPECIES_FLOATS);

  private readonly pipelines = {} as Record<PipelineName, GPUComputePipeline>;
  private bindGroups = {} as Record<PipelineName, GPUBindGroup>;

  constructor(device: GPUDevice, cfg: Config) {
    this.device = device;
    this.cfg = cfg;
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.cellCount = device.createBuffer({ label: 'cellCount', size: MAX_CELLS * 4, usage: S });
    this.cellStart = device.createBuffer({ label: 'cellStart', size: MAX_CELLS * 4, usage: S });
    this.blockSums = device.createBuffer({ label: 'blockSums', size: 256 * 4, usage: S });
    this.popCount = device.createBuffer({ label: 'popCount', size: MAX_SPECIES * 4, usage: S });
    this.popStaging = device.createBuffer({
      label: 'popStaging',
      size: MAX_SPECIES * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.paramsBuf = device.createBuffer({
      label: 'simParams',
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.speciesBuf = device.createBuffer({
      label: 'speciesData',
      size: SPECIES_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ label: 'sim.wgsl', code: simCode });
    for (const name of Object.keys(BINDINGS) as PipelineName[]) {
      this.pipelines[name] = device.createComputePipeline({
        label: name,
        layout: 'auto',
        compute: { module, entryPoint: name },
      });
    }
  }

  /** Reinicia el mundo: (re)dimensiona buffers, calcula el tamaño del mundo y genera partículas. */
  reset(aspect: number): void {
    const cfg = this.cfg;
    const N = cfg.numParticles;
    if (N > this.capacity) this.allocate(N);
    this.numParticles = N;

    // El mundo se dimensiona para que haya `density` vecinos medios dentro de rMax.
    const area = (N * Math.PI * cfg.rMax * cfg.rMax) / Math.max(1, cfg.density);
    let w = Math.sqrt(area * Math.max(0.2, aspect));
    let h = area / w;
    const minSide = cfg.rMax * 3.05;
    w = Math.max(w, minSide);
    h = Math.max(h, minSide);
    this.worldW = w;
    this.worldH = h;
    this.updateGrid();

    const { particles, species } = spawnParticles(cfg, w, h);
    this.setState(particles, species);
    this.frame = 0;
    this.time = 0;
    this.updateSpecies();
  }

  /** Recalcula la rejilla (llamar cuando cambie rMax). Celda >= rMax garantiza que bastan 3×3 celdas. */
  updateGrid(): void {
    const r = Math.min(this.cfg.rMax, this.worldW / 3, this.worldH / 3);
    let gw = Math.max(3, Math.floor(this.worldW / r));
    let gh = Math.max(3, Math.floor(this.worldH / r));
    if (gw * gh > MAX_CELLS) {
      const k = Math.sqrt(MAX_CELLS / (gw * gh));
      gw = Math.max(3, Math.floor(gw * k));
      gh = Math.max(3, Math.floor(gh * k));
    }
    this.gridW = gw;
    this.gridH = gh;
    this.cellW = this.worldW / gw;
    this.cellH = this.worldH / gh;
    this.effectiveRMax = Math.min(this.cfg.rMax, this.cellW, this.cellH);
  }

  get numCells(): number {
    return this.gridW * this.gridH;
  }

  /** Sube matrices y comportamientos de especies a la GPU (barato: ~3.5 KB). */
  updateSpecies(): void {
    const cfg = this.cfg;
    const S = cfg.numSpecies;
    const d = this.speciesData;
    d.fill(0);
    for (let i = 0; i < S * S; i++) {
      d[i] = cfg.attraction[i];
      d[256 + i] = Math.max(0.05, Math.min(1, cfg.radius[i]));
      d[512 + i] = Math.max(0, cfg.conversion[i]);
    }
    for (let s = 0; s < S; s++) {
      const sp = cfg.species[s];
      const o = 768 + s * 8;
      d.set([sp.mass, sp.friction, sp.propulsion, sp.noise, sp.spin, sp.alignment, Math.min(0.95, sp.pulseAmp), sp.pulseFreq], o);
    }
    this.device.queue.writeBuffer(this.speciesBuf, 0, d);
  }

  setState(particles: Float32Array, species: Uint32Array): void {
    this.device.queue.writeBuffer(this.particlesA, 0, particles);
    this.device.queue.writeBuffer(this.speciesA, 0, species);
  }

  private writeParams(): void {
    const cfg = this.cfg;
    const f = this.paramsF;
    const u = this.paramsU;
    f[0] = this.worldW;
    f[1] = this.worldH;
    f[2] = this.cellW;
    f[3] = this.cellH;
    u[4] = this.gridW;
    u[5] = this.gridH;
    u[6] = this.numCells;
    u[7] = this.numParticles;
    u[8] = cfg.numSpecies;
    f[9] = this.effectiveRMax;
    f[10] = Math.max(0.01, Math.min(0.99, cfg.beta));
    f[11] = cfg.repulsion;
    f[12] = cfg.forceFactor;
    f[13] = Math.pow(0.5, cfg.dt / Math.max(1e-4, cfg.frictionHalfLife));
    f[14] = cfg.dt;
    f[15] = cfg.maxSpeed * this.effectiveRMax;
    f[16] = this.mouse.x;
    f[17] = this.mouse.y;
    f[18] = cfg.mouse.radius * this.effectiveRMax;
    f[19] = this.mouse.strength;
    f[20] = this.time;
    u[21] = this.frame;
    u[22] = cfg.seed;
    u[23] = cfg.conversionEnabled ? 1 : 0;
    f[24] = cfg.conversionRadius;
    this.device.queue.writeBuffer(this.paramsBuf, 0, this.paramsData);
  }

  /**
   * Ejecuta un paso de simulación (un submit). `timestampWrites` permite medir el coste en GPU.
   * `readPopulation` copia los contadores de población para leerlos de forma asíncrona.
   */
  step(timestampWrites?: GPUComputePassTimestampWrites, readPopulation = false): void {
    this.writeParams();
    const enc = this.device.createCommandEncoder({ label: 'sim step' });
    enc.clearBuffer(this.cellCount, 0, this.numCells * 4);
    enc.clearBuffer(this.popCount);
    const pass = enc.beginComputePass({ label: 'sim', timestampWrites });
    const nGroups = Math.ceil(this.numParticles / WG);
    const cGroups = Math.ceil(this.numCells / WG);
    const blocks = Math.ceil(this.numCells / 1024);
    const run = (name: PipelineName, groups: number) => {
      pass.setPipeline(this.pipelines[name]);
      pass.setBindGroup(0, this.bindGroups[name]);
      pass.dispatchWorkgroups(groups);
    };
    run('countCells', nGroups);
    run('scanBlocks', blocks);
    run('scanSums', 1);
    run('addSums', cGroups);
    run('scatter', nGroups);
    run(this.cfg.algorithm === 'fuerza bruta' ? 'forcesBrute' : 'forces', nGroups);
    pass.end();

    const doPop = readPopulation && !this.popPending;
    if (doPop) enc.copyBufferToBuffer(this.popCount, 0, this.popStaging, 0, MAX_SPECIES * 4);
    this.device.queue.submit([enc.finish()]);
    if (doPop) {
      this.popPending = true;
      this.popStaging.mapAsync(GPUMapMode.READ).then(
        () => {
          this.populations.set(new Uint32Array(this.popStaging.getMappedRange()));
          this.popStaging.unmap();
          this.popPending = false;
        },
        () => (this.popPending = false),
      );
    }
    this.frame++;
    this.time += this.cfg.dt;
  }

  /** Lee el estado actual (para pruebas / exportación). */
  async readState(): Promise<{ particles: Float32Array; species: Uint32Array }> {
    const n = this.numParticles;
    const mk = (size: number) =>
      this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const pb = mk(n * 16);
    const sb = mk(n * 4);
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.particlesA, 0, pb, 0, n * 16);
    enc.copyBufferToBuffer(this.speciesA, 0, sb, 0, n * 4);
    this.device.queue.submit([enc.finish()]);
    await Promise.all([pb.mapAsync(GPUMapMode.READ), sb.mapAsync(GPUMapMode.READ)]);
    const particles = new Float32Array(pb.getMappedRange().slice(0));
    const species = new Uint32Array(sb.getMappedRange().slice(0));
    // desmapear antes de destruir: el ArrayBuffer mapeado no debe sobrevivir a su buffer
    pb.unmap();
    sb.unmap();
    pb.destroy();
    sb.destroy();
    return { particles, species };
  }

  private allocate(n: number): void {
    // margen para no reasignar con cada pequeño aumento
    const cap = Math.ceil(n * 1.25);
    for (const b of [this.particlesA, this.speciesA, this.particlesB, this.speciesB, this.cellIndex, this.rankInCell])
      b?.destroy();
    const U = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const mk = (label: string, size: number) => this.device.createBuffer({ label, size, usage: U });
    this.particlesA = mk('particlesA', cap * 16);
    this.speciesA = mk('speciesA', cap * 4);
    this.particlesB = mk('particlesB', cap * 16);
    this.speciesB = mk('speciesB', cap * 4);
    this.cellIndex = mk('cellIndex', cap * 4);
    this.rankInCell = mk('rankInCell', cap * 4);
    this.capacity = cap;

    const resources: Record<number, GPUBuffer> = {
      0: this.paramsBuf,
      1: this.speciesBuf,
      2: this.particlesA,
      3: this.speciesA,
      4: this.particlesB,
      5: this.speciesB,
      6: this.cellCount,
      7: this.cellCount,
      8: this.cellStart,
      9: this.blockSums,
      10: this.cellIndex,
      11: this.rankInCell,
      12: this.popCount,
    };
    for (const name of Object.keys(BINDINGS) as PipelineName[]) {
      this.bindGroups[name] = this.device.createBindGroup({
        label: `bg ${name}`,
        layout: this.pipelines[name].getBindGroupLayout(0),
        entries: BINDINGS[name].map((binding) => ({ binding, resource: { buffer: resources[binding] } })),
      });
    }
  }

  destroy(): void {
    for (const b of [
      this.particlesA, this.speciesA, this.particlesB, this.speciesB, this.cellIndex, this.rankInCell,
      this.cellCount, this.cellStart, this.blockSums, this.popCount, this.popStaging, this.paramsBuf, this.speciesBuf,
    ])
      b?.destroy();
  }
}
