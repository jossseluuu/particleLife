import './style.css';
import { Camera } from './camera';
import { Config, cloneConfig, resizeSpecies } from './config';
import { initGpu } from './gpu/device';
import { PRESETS } from './presets';
import { Renderer } from './render/renderer';
import { randomSeed } from './rng';
import { Simulation } from './sim/simulation';
import { Hud, PopulationChart } from './ui/hud';
import { MatrixEditor } from './ui/matrixEditor';
import { Panel, PanelHost } from './ui/panel';
import { configFromHash, downloadBlob } from './ui/storage';

class App implements PanelHost {
  cfg: Config;
  paused = false;
  presetIndex = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly sim: Simulation;
  private readonly renderer: Renderer;
  private readonly camera = new Camera();
  private readonly hud = new Hud();
  private readonly matrix: MatrixEditor;
  private readonly population: PopulationChart;
  private readonly panel: Panel;
  private readonly ui: HTMLElement;

  private pendingStep = false;
  private wantScreenshot = false;
  private frameCount = 0;
  private fps = 60;
  private lastTime = performance.now();

  // ratón
  private pointer = { x: 0, y: 0, force: false, pan: false, invert: false };

  // timestamps de GPU
  private readonly querySet?: GPUQuerySet;
  private readonly queryResolve?: GPUBuffer;
  private readonly queryRead?: GPUBuffer;
  private queryPending = false;
  private simMs: number | null = null;
  private renderMs: number | null = null;

  constructor(
    private readonly device: GPUDevice,
    private readonly gpuName: string,
    timestamps: boolean,
    cfg: Config,
  ) {
    this.cfg = cfg;
    this.canvas = document.querySelector<HTMLCanvasElement>('#view')!;
    this.context = this.canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format, alphaMode: 'opaque' });

    this.sim = new Simulation(device, cfg);
    this.renderer = new Renderer(device, format, cfg);

    if (timestamps) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 4 });
      this.queryResolve = device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.queryRead = device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }

    // ---- UI
    this.ui = document.querySelector<HTMLElement>('#ui')!;
    this.matrix = new MatrixEditor(cfg, () => this.sim.updateSpecies());
    this.population = new PopulationChart(cfg);
    this.matrix.element.appendChild(this.population.element);
    this.panel = new Panel(this);
    this.ui.append(this.hud.element, this.matrix.element, this.panel.element);

    this.bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.reset();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ PanelHost

  reset(): void {
    this.sim.reset(this.canvas.width / Math.max(1, this.canvas.height));
    this.renderer.updateSpecies();
    this.camera.fit(this.sim.worldW, this.sim.worldH, this.canvas.width, this.canvas.height);
    this.population.setConfig(this.cfg);
    this.matrix.setConfig(this.cfg);
  }

  speciesChanged(): void {
    this.sim.updateSpecies();
    this.renderer.updateSpecies();
    this.matrix.draw();
  }

  gridChanged(): void {
    this.sim.updateGrid();
  }

  renderChanged(): void {
    /* el render lee cfg.render cada frame */
  }

  setNumSpecies(n: number): void {
    resizeSpecies(this.cfg, n);
    this.reset();
    this.panel.rebuild();
  }

  applyConfig(next: Config): void {
    // Mantener la identidad del objeto: simulación y render guardan una referencia a cfg.
    Object.assign(this.cfg, cloneConfig(next));
    this.reset();
    this.panel.rebuild();
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  stepOnce(): void {
    this.paused = true;
    this.pendingStep = true;
  }

  fitCamera(): void {
    this.camera.fit(this.sim.worldW, this.sim.worldH, this.canvas.width, this.canvas.height);
  }

  screenshot(): void {
    this.wantScreenshot = true;
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1800);
    setTimeout(() => el.remove(), 2400);
  }

  // ------------------------------------------------------------------ bucle

  private loop = (now: number) => {
    const elapsed = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.fps = this.fps * 0.95 + (1 / Math.max(1e-3, elapsed)) * 0.05;
    this.frameCount++;

    this.applyDrift(elapsed);
    this.updateMouse();

    const ts = this.querySet && !this.queryPending;
    const readPop = this.frameCount % 8 === 0;
    const steps = this.paused ? (this.pendingStep ? 1 : 0) : this.cfg.stepsPerFrame;
    this.pendingStep = false;
    for (let k = 0; k < steps; k++) {
      const tsw = ts && k === 0 ? { querySet: this.querySet!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
      this.sim.step(tsw, readPop && k === steps - 1);
    }

    this.renderer.render(
      this.sim,
      this.camera,
      this.context.getCurrentTexture().createView(),
      ts ? { querySet: this.querySet!, beginIndex: 2, endIndex: 3 } : undefined,
      now / 1000,
    );
    if (ts) this.readTimestamps(steps > 0);

    if (this.wantScreenshot) {
      this.wantScreenshot = false;
      this.canvas.toBlob((b) => b && downloadBlob(b, `particle-life-${Date.now()}.png`), 'image/png');
    }

    if (readPop) this.population.push(this.sim.populations);
    if (this.frameCount % 10 === 0) this.updateHud();
    requestAnimationFrame(this.loop);
  };

  private readTimestamps(simWritten: boolean): void {
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
        if (simWritten) this.simMs = smooth(this.simMs, ms(t[0], t[1]));
        this.renderMs = smooth(this.renderMs, ms(t[2], t[3]));
        this.queryRead!.unmap();
        this.queryPending = false;
      },
      () => (this.queryPending = false),
    );
  }

  private updateHud(): void {
    const s = this.sim;
    const neighbors = (s.numParticles * Math.PI * s.effectiveRMax ** 2) / (s.worldW * s.worldH);
    this.hud.update({
      fps: this.fps,
      simMs: this.simMs === null ? null : this.simMs * Math.max(1, this.cfg.stepsPerFrame),
      renderMs: this.renderMs,
      particles: s.numParticles,
      grid: `${s.gridW}×${s.gridH}`,
      neighbors,
      zoom: this.camera.zoom,
      paused: this.paused,
      gpu: this.gpuName,
      algorithm: this.cfg.algorithm,
    });
  }

  /** Deriva: paseo aleatorio lento de la matriz de atracción → el ecosistema evoluciona solo. */
  private driftPhase: number[] = [];
  private applyDrift(dt: number): void {
    const d = this.cfg.drift;
    if (!d.enabled || this.paused) return;
    const m = this.cfg.attraction;
    if (this.driftPhase.length !== m.length) this.driftPhase = m.map(() => Math.random() * 2 - 1);
    for (let i = 0; i < m.length; i++) {
      // velocidad con inercia (ruido suavizado) para cambios orgánicos
      this.driftPhase[i] = this.driftPhase[i] * 0.98 + (Math.random() * 2 - 1) * 0.2;
      m[i] = Math.max(-1, Math.min(1, m[i] + this.driftPhase[i] * d.rate * dt * 0.5));
    }
    this.sim.updateSpecies();
    if (this.frameCount % 3 === 0) this.matrix.draw();
  }

  // ------------------------------------------------------------------ entrada

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    const firstFit = this.canvas.width <= 300;
    this.canvas.width = w;
    this.canvas.height = h;
    this.renderer.resize(w, h);
    if (firstFit && this.sim.numParticles) this.fitCamera();
  }

  private toCanvas(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }

  private updateMouse(): void {
    const p = this.pointer;
    if (!p.force) {
      this.sim.mouse.strength = 0;
      return;
    }
    const [wx, wy] = this.camera.screenToWorld(p.x, p.y, this.canvas.width, this.canvas.height, this.sim.worldW, this.sim.worldH);
    this.sim.mouse.x = wx;
    this.sim.mouse.y = wy;
    this.sim.mouse.strength = this.cfg.mouse.strength * (p.invert ? -1 : 1);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      [this.pointer.x, this.pointer.y] = this.toCanvas(e);
      if (e.button === 0 && !e.altKey) {
        this.pointer.force = true;
        this.pointer.invert = e.shiftKey;
      } else this.pointer.pan = true;
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = this.toCanvas(e);
      if (this.pointer.pan) this.camera.pan(x - this.pointer.x, y - this.pointer.y, this.sim.worldW, this.sim.worldH);
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.invert = e.shiftKey;
    });
    const end = () => {
      this.pointer.force = false;
      this.pointer.pan = false;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [x, y] = this.toCanvas(e);
        this.camera.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y, c.width, c.height);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', () => this.fitCamera());

    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          this.togglePause();
          break;
        case 's':
          this.stepOnce();
          break;
        case 'n':
          this.reset();
          break;
        case 'r':
          this.matrix.randomize();
          break;
        case 'm':
          this.matrix.mutate(0.15);
          break;
        case 'b':
          this.cfg.seed = randomSeed();
          this.reset();
          this.panel.refresh();
          break;
        case 't':
          this.cfg.render.trails = !this.cfg.render.trails;
          this.panel.refresh();
          break;
        case 'h':
          this.ui.classList.toggle('hidden');
          break;
        case 'f':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().catch(() => {});
          break;
        case 'p':
          this.screenshot();
          break;
        case '?':
          document.querySelector('#help')!.classList.toggle('visible');
          break;
        case 'escape':
          document.querySelector('#help')!.classList.remove('visible');
          break;
        default:
          if (/^[1-9]$/.test(e.key)) {
            const p = PRESETS[Number(e.key) - 1];
            if (p) {
              this.presetIndex = Number(e.key) - 1;
              this.applyConfig(p.build({ numParticles: this.cfg.numParticles }));
              this.toast(`Preset: ${p.name}`);
            }
          }
      }
    });
  }
}

// ---------------------------------------------------------------------- arranque

async function start() {
  const errorEl = document.querySelector<HTMLElement>('#error')!;
  try {
    const { device, adapterName, timestamps } = await initGpu();
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        errorEl.textContent = `Se perdió el dispositivo GPU: ${info.message}. Recarga la página.`;
        errorEl.classList.add('visible');
      }
    });
    device.addEventListener('uncapturederror', (e) => console.error((e as GPUUncapturedErrorEvent).error.message));
    const fromUrl = await configFromHash();
    const cfg = fromUrl ?? PRESETS[0].build({ numParticles: 80_000 });
    new App(device, adapterName, timestamps, cfg);
  } catch (e) {
    errorEl.textContent = (e as Error).message;
    errorEl.classList.add('visible');
    console.error(e);
  }
}

start();
