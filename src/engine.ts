import { Camera } from './camera';
import { Config, MAX_PARTICLES } from './config';
import { CanvasRenderer } from './render/canvasRenderer';
import { Renderer } from './render/renderer';
import { CpuSimulation } from './sim/cpuSimulation';
import { MouseState, Simulation } from './sim/simulation';

/** Lo que la app necesita de cualquier simulación (GPU o CPU). */
export interface SimView {
  worldW: number;
  worldH: number;
  gridW: number;
  gridH: number;
  effectiveRMax: number;
  numParticles: number;
  populations: Uint32Array;
  mouse: MouseState;
  reset(aspect: number): void;
  updateGrid(): void;
  updateSpecies(): void;
}

export interface Engine {
  readonly kind: 'webgpu' | 'cpu';
  readonly label: string;
  readonly maxParticles: number;
  readonly sim: SimView;
  simMs: number | null;
  renderMs: number | null;
  resize(w: number, h: number): void;
  speciesChanged(): void;
  /** Avanza `steps` pasos y dibuja un frame. */
  frame(steps: number, readPopulation: boolean, cam: Camera, time: number): void;
}

// ---------------------------------------------------------------------------- WebGPU

export class GpuEngine implements Engine {
  readonly kind = 'webgpu';
  readonly maxParticles = MAX_PARTICLES;
  readonly sim: Simulation;
  simMs: number | null = null;
  renderMs: number | null = null;
  private readonly renderer: Renderer;
  private readonly context: GPUCanvasContext;
  private readonly querySet?: GPUQuerySet;
  private readonly queryResolve?: GPUBuffer;
  private readonly queryRead?: GPUBuffer;
  private queryPending = false;

  constructor(
    private readonly device: GPUDevice,
    canvas: HTMLCanvasElement,
    cfg: Config,
    readonly label: string,
    timestamps: boolean,
  ) {
    this.context = canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format, alphaMode: 'opaque' });
    this.sim = new Simulation(device, cfg);
    this.renderer = new Renderer(device, format, cfg);
    if (timestamps) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 4 });
      this.queryResolve = device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.queryRead = device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
  }

  resize(w: number, h: number): void {
    this.renderer.resize(w, h);
  }

  speciesChanged(): void {
    this.sim.updateSpecies();
    this.renderer.updateSpecies();
  }

  frame(steps: number, readPopulation: boolean, cam: Camera, time: number): void {
    const ts = this.querySet && !this.queryPending;
    for (let k = 0; k < steps; k++) {
      const tsw = ts && k === 0 ? { querySet: this.querySet!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
      this.sim.step(tsw, readPopulation && k === steps - 1);
    }
    this.renderer.render(
      this.sim,
      cam,
      this.context.getCurrentTexture().createView(),
      ts ? { querySet: this.querySet!, beginIndex: 2, endIndex: 3 } : undefined,
      time,
    );
    if (ts) this.readTimestamps(steps);
  }

  private readTimestamps(steps: number): void {
    const enc = this.device.createCommandEncoder();
    enc.resolveQuerySet(this.querySet!, 0, 4, this.queryResolve!, 0);
    enc.copyBufferToBuffer(this.queryResolve!, 0, this.queryRead!, 0, 32);
    this.device.queue.submit([enc.finish()]);
    this.queryPending = true;
    this.queryRead!.mapAsync(GPUMapMode.READ).then(
      () => {
        const t = new BigInt64Array(this.queryRead!.getMappedRange());
        const ms = (a: bigint, b: bigint) => Number(b - a) / 1e6;
        const smooth = (prev: number | null, v: number) => (v < 0 || v > 1000 ? prev : prev === null ? v : prev * 0.9 + v * 0.1);
        if (steps > 0) this.simMs = smooth(this.simMs, ms(t[0], t[1]) * steps);
        this.renderMs = smooth(this.renderMs, ms(t[2], t[3]));
        this.queryRead!.unmap();
        this.queryPending = false;
      },
      () => (this.queryPending = false),
    );
  }
}

// ---------------------------------------------------------------------------- CPU (respaldo)

export class CpuEngine implements Engine {
  readonly kind = 'cpu';
  readonly label = 'CPU · modo compatibilidad (sin WebGPU)';
  readonly maxParticles = 30_000;
  readonly sim: CpuSimulation;
  simMs: number | null = null;
  renderMs: number | null = null;
  private readonly renderer: CanvasRenderer;

  constructor(canvas: HTMLCanvasElement, cfg: Config) {
    const ctx = canvas.getContext('2d', { alpha: false })!;
    this.sim = new CpuSimulation(cfg);
    this.renderer = new CanvasRenderer(ctx, cfg);
  }

  resize(w: number, h: number): void {
    this.renderer.resize(w, h);
  }

  speciesChanged(): void {
    this.sim.updateSpecies();
    this.renderer.updateSpecies();
  }

  frame(steps: number, _readPopulation: boolean, cam: Camera): void {
    const smooth = (prev: number | null, v: number) => (prev === null ? v : prev * 0.9 + v * 0.1);
    const t0 = performance.now();
    for (let k = 0; k < steps; k++) this.sim.step();
    const t1 = performance.now();
    this.renderer.render(this.sim, cam);
    const t2 = performance.now();
    if (steps > 0) this.simMs = smooth(this.simMs, t1 - t0);
    this.renderMs = smooth(this.renderMs, t2 - t1);
  }
}
