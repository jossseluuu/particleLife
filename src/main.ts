import './style.css';
import { Camera } from './camera';
import { Config, cloneConfig, resizeSpecies } from './config';
import { CpuEngine, Engine, GpuEngine } from './engine';
import { GpuContext, initGpu } from './gpu/device';
import { PRESETS } from './presets';
import { randomSeed } from './rng';
import { Hud, PopulationChart } from './ui/hud';
import { MatrixEditor } from './ui/matrixEditor';
import { Panel, PanelHost } from './ui/panel';
import { configFromHash, downloadBlob } from './ui/storage';

const isSmallScreen = () => window.matchMedia('(max-width: 760px)').matches;

class App implements PanelHost {
  cfg: Config;
  paused = false;
  presetIndex = 0;

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

  // entrada: punteros activos (ratón o dedos)
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pointer = { x: 0, y: 0, force: false, pan: false, invert: false };
  private gesture: { midX: number; midY: number; dist: number } | null = null;

  // ajuste automático de rendimiento
  private perf = { frames: 0, time: 0, adjustments: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: Engine,
    cfg: Config,
  ) {
    this.cfg = cfg;
    this.ui = document.querySelector<HTMLElement>('#ui')!;
    this.matrix = new MatrixEditor(cfg, () => this.engine.sim.updateSpecies());
    this.population = new PopulationChart(cfg);
    this.matrix.body.appendChild(this.population.element);
    this.panel = new Panel(this);
    this.ui.append(this.hud.element, this.matrix.element, this.panel.element);
    if (isSmallScreen()) this.matrix.setCollapsed(true);

    this.bindInput();
    this.bindButtons();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.reset();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ PanelHost

  get engineKind(): 'webgpu' | 'cpu' {
    return this.engine.kind;
  }

  get maxParticles(): number {
    return this.engine.maxParticles;
  }

  reset(): void {
    if (this.cfg.numParticles > this.engine.maxParticles) {
      this.cfg.numParticles = this.engine.maxParticles;
      this.toast(`Modo CPU: limitado a ${this.engine.maxParticles.toLocaleString('es')} partículas`);
      this.panel?.refresh();
    }
    this.engine.sim.reset(this.canvas.width / Math.max(1, this.canvas.height));
    this.engine.speciesChanged();
    this.fitCamera();
    this.population.setConfig(this.cfg);
    this.matrix.setConfig(this.cfg);
    this.perf.frames = 0;
    this.perf.time = 0;
  }

  speciesChanged(): void {
    this.engine.speciesChanged();
    this.matrix.draw();
  }

  gridChanged(): void {
    this.engine.sim.updateGrid();
  }

  renderChanged(): void {
    /* ambos renderers leen cfg.render en cada frame */
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
    document.querySelector('#btn-pause')!.textContent = this.paused ? '▶' : '⏸';
  }

  stepOnce(): void {
    if (!this.paused) this.togglePause();
    this.pendingStep = true;
  }

  fitCamera(): void {
    this.camera.fit(this.engine.sim.worldW, this.engine.sim.worldH, this.canvas.width, this.canvas.height);
  }

  screenshot(): void {
    this.wantScreenshot = true;
  }

  toast(msg: string, ms = 2200): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  // ------------------------------------------------------------------ bucle

  private loop = (now: number) => {
    const elapsed = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.fps = this.fps * 0.95 + (1 / Math.max(1e-3, elapsed)) * 0.05;
    this.frameCount++;

    this.applyDrift(elapsed);
    this.updateMouse();

    const readPop = this.frameCount % 8 === 0;
    const steps = this.paused ? (this.pendingStep ? 1 : 0) : this.cfg.stepsPerFrame;
    this.pendingStep = false;
    this.engine.frame(steps, readPop, this.camera, now / 1000);

    if (this.wantScreenshot) {
      this.wantScreenshot = false;
      this.canvas.toBlob((b) => b && downloadBlob(b, `particle-life-${Date.now()}.png`), 'image/png');
    }
    if (readPop) this.population.push(this.engine.sim.populations);
    if (this.frameCount % 10 === 0) this.updateHud();
    this.autoTune(elapsed);
    requestAnimationFrame(this.loop);
  };

  /** Si tras arrancar va claramente lento, reduce partículas automáticamente (máx. 3 veces). */
  private autoTune(elapsed: number): void {
    if (this.paused || document.visibilityState !== 'visible' || this.perf.adjustments >= 3) return;
    const p = this.perf;
    p.frames++;
    if (p.frames <= 45) return; // ignorar el arranque
    p.time += elapsed;
    if (p.frames < 45 + 150) return;
    const fps = 150 / p.time;
    const minN = this.engine.kind === 'cpu' ? 2000 : 10000;
    p.frames = -1e9; // sólo una medición por reinicio
    if (fps < 26 && this.cfg.numParticles > minN) {
      const before = this.cfg.numParticles;
      this.cfg.numParticles = Math.max(minN, Math.round((before * 0.55) / 1000) * 1000);
      p.adjustments++;
      this.toast(`Rendimiento bajo (${fps.toFixed(0)} fps): ${before.toLocaleString('es')} → ${this.cfg.numParticles.toLocaleString('es')} partículas`, 3500);
      this.reset();
      this.panel.refresh();
    }
  }

  private updateHud(): void {
    const s = this.engine.sim;
    const neighbors = (s.numParticles * Math.PI * s.effectiveRMax ** 2) / (s.worldW * s.worldH);
    this.hud.update({
      fps: this.fps,
      simMs: this.engine.simMs,
      renderMs: this.engine.renderMs,
      particles: s.numParticles,
      grid: `${s.gridW}×${s.gridH}`,
      neighbors,
      zoom: this.camera.zoom,
      paused: this.paused,
      gpu: this.engine.label,
      algorithm: this.cfg.algorithm,
      cpu: this.engine.kind === 'cpu',
    });
  }

  /** Deriva: paseo aleatorio lento de la matriz de atracción → el ecosistema evoluciona solo. */
  private driftVel: number[] = [];
  private applyDrift(dt: number): void {
    const d = this.cfg.drift;
    if (!d.enabled || this.paused) return;
    const m = this.cfg.attraction;
    if (this.driftVel.length !== m.length) this.driftVel = m.map(() => Math.random() * 2 - 1);
    for (let i = 0; i < m.length; i++) {
      // velocidad con inercia (ruido suavizado) para cambios orgánicos
      this.driftVel[i] = this.driftVel[i] * 0.98 + (Math.random() * 2 - 1) * 0.2;
      m[i] = Math.max(-1, Math.min(1, m[i] + this.driftVel[i] * d.rate * dt * 0.5));
    }
    this.engine.sim.updateSpecies();
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
    this.engine.resize(w, h);
    if (firstFit && this.engine.sim.numParticles) this.fitCamera();
  }

  private toCanvas(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }

  private updateMouse(): void {
    const p = this.pointer;
    const sim = this.engine.sim;
    if (!p.force) {
      sim.mouse.strength = 0;
      return;
    }
    const [wx, wy] = this.camera.screenToWorld(p.x, p.y, this.canvas.width, this.canvas.height, sim.worldW, sim.worldH);
    sim.mouse.x = wx;
    sim.mouse.y = wy;
    sim.mouse.strength = this.cfg.mouse.strength * (p.invert ? -1 : 1);
  }

  private gestureFrom(): { midX: number; midY: number; dist: number } {
    const [a, b] = [...this.pointers.values()];
    return { midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private bindInput(): void {
    const c = this.canvas;
    const sim = () => this.engine.sim;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = this.toCanvas(e);
      this.pointers.set(e.pointerId, { x, y });
      if (this.pointers.size === 2) {
        // dos dedos: desplazar + pellizcar para zoom
        this.pointer.force = false;
        this.pointer.pan = false;
        this.gesture = this.gestureFrom();
        return;
      }
      if (this.pointers.size > 2) return;
      this.pointer.x = x;
      this.pointer.y = y;
      if (e.button === 0 && !e.altKey) {
        this.pointer.force = true;
        this.pointer.invert = e.shiftKey;
      } else this.pointer.pan = true;
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = this.toCanvas(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x, y });
      if (this.gesture && this.pointers.size >= 2) {
        const g = this.gestureFrom();
        this.camera.pan(g.midX - this.gesture.midX, g.midY - this.gesture.midY, sim().worldW, sim().worldH);
        if (this.gesture.dist > 10) this.camera.zoomAt(g.dist / this.gesture.dist, g.midX, g.midY, c.width, c.height);
        this.gesture = g;
        return;
      }
      if (this.pointer.pan) this.camera.pan(x - this.pointer.x, y - this.pointer.y, sim().worldW, sim().worldH);
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.invert = e.shiftKey;
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.gesture = null;
      if (this.pointers.size === 0) {
        this.pointer.force = false;
        this.pointer.pan = false;
      }
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
          this.toggleUi();
          break;
        case 'f':
          this.toggleFullscreen();
          break;
        case 'p':
          this.screenshot();
          break;
        case '?':
          toggleHelp();
          break;
        case 'escape':
          toggleHelp(false);
          break;
        default:
          if (/^[1-9]$/.test(e.key)) this.loadPreset(Number(e.key) - 1);
      }
    });
  }

  private loadPreset(i: number): void {
    const p = PRESETS[i];
    if (!p) return;
    this.presetIndex = i;
    this.applyConfig(p.build({ numParticles: this.cfg.numParticles }));
    this.toast(`Preset: ${p.name}`);
  }

  private toggleUi(): void {
    this.ui.classList.toggle('hidden');
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  /** Botones flotantes (imprescindibles en móvil, donde no hay teclado). */
  private bindButtons(): void {
    const on = (id: string, f: () => void) => document.querySelector(`#${id}`)!.addEventListener('click', f);
    on('btn-ui', () => this.toggleUi());
    on('btn-pause', () => this.togglePause());
    on('btn-help', () => toggleHelp());
    on('btn-full', () => this.toggleFullscreen());
    on('help-close', () => toggleHelp(false));
  }
}

function toggleHelp(force?: boolean): void {
  document.querySelector('#help')!.classList.toggle('visible', force);
}

// ---------------------------------------------------------------------- arranque

async function start() {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const errorEl = document.querySelector<HTMLElement>('#error')!;
  const params = new URLSearchParams(location.search);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  let gpu: GpuContext | null = null;
  let gpuProblem: string | null = null;
  try {
    if (params.has('cpu')) throw new Error('Modo CPU forzado con ?cpu en la URL.');
    gpu = await initGpu();
    gpu.device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        errorEl.textContent = `Se perdió el dispositivo GPU: ${info.message}\nRecarga la página.`;
        errorEl.classList.add('visible');
      }
    });
    gpu.device.addEventListener('uncapturederror', (e) => console.error((e as GPUUncapturedErrorEvent).error.message));
  } catch (e) {
    gpuProblem = (e as Error).message;
    console.warn('WebGPU no disponible, usando modo CPU:', gpuProblem);
  }

  const fromUrl = await configFromHash();
  const defaultN = gpu ? (mobile ? 30_000 : 80_000) : 6000;
  const cfg = fromUrl ?? PRESETS[0].build({ numParticles: defaultN });

  try {
    const engine: Engine = gpu
      ? new GpuEngine(gpu.device, canvas, cfg, gpu.adapterName, gpu.timestamps)
      : new CpuEngine(canvas, cfg);
    new App(canvas, engine, cfg);
  } catch (e) {
    errorEl.textContent = (e as Error).message;
    errorEl.classList.add('visible');
    console.error(e);
    return;
  }

  if (gpuProblem) {
    const note = document.querySelector<HTMLElement>('#gpu-note')!;
    note.textContent = gpuProblem;
    note.parentElement!.hidden = false;
    const t = document.createElement('div');
    t.className = 'toast warn';
    t.innerHTML = 'Sin WebGPU: funcionando en <b>modo CPU</b> (menos partículas). Pulsa <b>?</b> para ver cómo activarlo.';
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 7000);
    setTimeout(() => t.remove(), 7600);
  }
}

start();
