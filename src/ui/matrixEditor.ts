import { Config } from '../config';
import { drawShape } from './shapes';
import { MATRIX_PATTERNS, mutate } from '../presets';
import { mulberry32, randomSeed } from '../rng';

type MatrixKey = 'attraction' | 'radius' | 'conversion';

interface MatrixSpec {
  key: MatrixKey;
  title: string;
  min: number;
  max: number;
  neutral: number; // valor del clic derecho
  hint: string;
}

const SPECS: MatrixSpec[] = [
  { key: 'attraction', title: 'Atracción', min: -1, max: 1, neutral: 0, hint: 'Fila reacciona ante columna · rojo atrae, azul repele' },
  { key: 'radius', title: 'Radio', min: 0.1, max: 1, neutral: 1, hint: 'Alcance de la interacción (fracción de rMax)' },
  { key: 'conversion', title: 'Conversión', min: 0, max: 5, neutral: 0, hint: 'Fila convierte a columna al tocarla (activar en el panel)' },
];

/**
 * Editor visual de matrices S×S:
 *  arrastrar en vertical = ajustar · rueda = paso fino · clic derecho = neutro
 *  doble clic = aleatorio · Shift = edición simétrica (a,b) y (b,a)
 */
export class MatrixEditor {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly info: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private spec = SPECS[0];
  private hover: [number, number] | null = null;
  private drag: { a: number; b: number; y: number; v0: number; sym: boolean } | null = null;
  private readonly size = 300;
  private readonly header = 22;

  constructor(private cfg: Config, private readonly onChange: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'matrix-panel panel';
    this.element.innerHTML = `
      <div class="panel-title" title="Plegar / desplegar">Matrices de interacción <span class="chev">▾</span></div>
      <div class="panel-body">
      <div class="tabs"></div>
      <canvas class="matrix-canvas"></canvas>
      <div class="matrix-info">&nbsp;</div>
      <div class="matrix-hint"></div>
      <div class="matrix-actions">
        <select class="pattern"></select>
        <button data-act="apply" title="Aplicar el patrón elegido">Aplicar</button>
        <button data-act="random" title="Matriz aleatoria (R)">🎲</button>
        <button data-act="mutate" title="Mutar un poco (M)">Mutar</button>
        <button data-act="sym" title="Hacer simétrica">Simetrizar</button>
        <button data-act="neg" title="Invertir signo">±</button>
        <button data-act="zero" title="Restablecer">Limpiar</button>
      </div>
      </div>`;
    const tabsEl = this.element.querySelector('.tabs')!;
    for (const s of SPECS) {
      const b = document.createElement('button');
      b.textContent = s.title;
      b.onclick = () => this.select(s);
      tabsEl.appendChild(b);
      this.tabs.push(b);
    }
    const sel = this.element.querySelector<HTMLSelectElement>('.pattern')!;
    for (const name of Object.keys(MATRIX_PATTERNS)) sel.add(new Option(name, name));
    this.canvas = this.element.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.info = this.element.querySelector('.matrix-info')!;
    this.hint = this.element.querySelector('.matrix-hint')!;

    this.element.querySelector('.matrix-actions')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (!act) return;
      if (act === 'apply') this.applyPattern(sel.value);
      else if (act === 'random') this.randomize();
      else if (act === 'mutate') this.mutate(0.15);
      else if (act === 'sym') this.symmetrize();
      else if (act === 'neg') this.transform((v) => (this.spec.key === 'attraction' ? -v : this.spec.max + this.spec.min - v));
      else if (act === 'zero') this.transform(() => this.spec.neutral);
    });
    this.element.querySelector(".panel-title")!.addEventListener("click", () => this.setCollapsed(!this.element.classList.contains("collapsed")));
    this.bindPointer();
    this.select(SPECS[0]);
  }

  setCollapsed(collapsed: boolean): void {
    this.element.classList.toggle("collapsed", collapsed);
  }

  /** El contenedor donde otros componentes (p. ej. la gráfica de población) pueden añadirse. */
  get body(): HTMLElement {
    return this.element.querySelector(".panel-body")!;
  }

  setConfig(cfg: Config): void {
    this.cfg = cfg;
    this.draw();
  }

  private get matrix(): number[] {
    return this.cfg[this.spec.key];
  }

  private select(s: MatrixSpec): void {
    this.spec = s;
    this.tabs.forEach((t, i) => t.classList.toggle('active', SPECS[i] === s));
    this.hint.textContent = s.hint;
    this.draw();
  }

  // ------------------------------------------------------------------ acciones

  applyPattern(name: string): void {
    const S = this.cfg.numSpecies;
    const m = MATRIX_PATTERNS[name](S, mulberry32(randomSeed()));
    if (this.spec.key === 'attraction') this.cfg.attraction = m;
    else this.cfg[this.spec.key] = m.map((v) => this.fromUnit((v + 1) / 2));
    this.commit();
  }

  randomize(): void {
    const r = mulberry32(randomSeed());
    if (this.spec.key === 'conversion') {
      this.cfg.conversion = this.matrix.map(() => (r() < 0.35 ? r() * 3 : 0));
    } else this.transform(() => this.fromUnit(r()));
    this.commit();
  }

  mutate(amount: number): void {
    const range = this.spec.max - this.spec.min;
    this.cfg[this.spec.key] = mutate(this.matrix, (amount * range) / 2, mulberry32(randomSeed()), this.spec.min, this.spec.max);
    this.commit();
  }

  private symmetrize(): void {
    const S = this.cfg.numSpecies;
    const m = this.matrix;
    for (let a = 0; a < S; a++)
      for (let b = a + 1; b < S; b++) m[a * S + b] = m[b * S + a] = (m[a * S + b] + m[b * S + a]) / 2;
    this.commit();
  }

  private transform(f: (v: number) => number): void {
    const m = this.matrix;
    for (let i = 0; i < m.length; i++) m[i] = this.clamp(f(m[i]));
    this.commit();
  }

  private commit(): void {
    this.draw();
    this.onChange();
  }

  private fromUnit(u: number): number {
    return this.spec.min + u * (this.spec.max - this.spec.min);
  }

  private clamp(v: number): number {
    return Math.max(this.spec.min, Math.min(this.spec.max, v));
  }

  // ------------------------------------------------------------------ interacción

  private cellAt(e: PointerEvent | MouseEvent): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect();
    const S = this.cfg.numSpecies;
    const cs = (this.size - this.header) / S;
    const x = e.clientX - rect.left - this.header;
    const y = e.clientY - rect.top - this.header;
    if (x < 0 || y < 0) return null;
    const b = Math.floor(x / cs);
    const a = Math.floor(y / cs);
    return a < S && b < S ? [a, b] : null;
  }

  private set(a: number, b: number, v: number, sym: boolean): void {
    const S = this.cfg.numSpecies;
    v = this.clamp(Math.round(v * 1000) / 1000);
    this.matrix[a * S + b] = v;
    if (sym) this.matrix[b * S + a] = v;
    this.commit();
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const cell = this.cellAt(e);
      if (!cell) return;
      c.setPointerCapture(e.pointerId);
      const S = this.cfg.numSpecies;
      this.drag = { a: cell[0], b: cell[1], y: e.clientY, v0: this.matrix[cell[0] * S + cell[1]], sym: e.shiftKey };
    });
    c.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const range = this.spec.max - this.spec.min;
        const v = this.drag.v0 - ((e.clientY - this.drag.y) * range) / 160;
        this.set(this.drag.a, this.drag.b, v, this.drag.sym);
        this.hover = [this.drag.a, this.drag.b];
      } else {
        this.hover = this.cellAt(e);
        this.draw();
      }
      this.updateInfo();
    });
    c.addEventListener('pointerup', () => (this.drag = null));
    c.addEventListener('pointerleave', () => {
      if (!this.drag) {
        this.hover = null;
        this.draw();
        this.updateInfo();
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        const cell = this.cellAt(e);
        if (!cell) return;
        e.preventDefault();
        const S = this.cfg.numSpecies;
        const step = ((this.spec.max - this.spec.min) / 40) * (e.deltaY < 0 ? 1 : -1);
        this.set(cell[0], cell[1], this.matrix[cell[0] * S + cell[1]] + step, e.shiftKey);
        this.updateInfo();
      },
      { passive: false },
    );
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const cell = this.cellAt(e);
      if (cell) this.set(cell[0], cell[1], this.spec.neutral, e.shiftKey);
    });
    c.addEventListener('dblclick', (e) => {
      const cell = this.cellAt(e);
      if (cell) this.set(cell[0], cell[1], this.fromUnit(Math.random()), e.shiftKey);
    });
  }

  private updateInfo(): void {
    if (!this.hover) {
      this.info.innerHTML = '&nbsp;';
      return;
    }
    const [a, b] = this.hover;
    const S = this.cfg.numSpecies;
    const v = this.matrix[a * S + b];
    const sw = (i: number) => `<span class="swatch" style="background:${this.cfg.species[i].color}"></span>`;
    const verb = this.spec.key === 'attraction' ? (v >= 0 ? 'atrae hacia' : 'huye de') : this.spec.key === 'radius' ? 'alcance ante' : 'convierte a';
    this.info.innerHTML = `${sw(a)} especie ${a + 1} ${verb} ${sw(b)} especie ${b + 1}: <b>${v.toFixed(3)}</b>`;
  }

  // ------------------------------------------------------------------ dibujo

  private colorFor(v: number): string {
    const s = this.spec;
    if (s.key === 'attraction') {
      const t = Math.max(-1, Math.min(1, v));
      const k = Math.abs(t);
      return t >= 0
        ? `rgb(${40 + 215 * k},${40 + 50 * k},${50 + 20 * k})`
        : `rgb(${40 + 20 * k},${70 + 90 * k},${50 + 205 * k})`;
    }
    const u = (v - s.min) / (s.max - s.min);
    return s.key === 'radius'
      ? `rgb(${30 + 60 * u},${40 + 180 * u},${50 + 150 * u})`
      : `rgb(${40 + 215 * u},${40 + 140 * u},${40 + 20 * u})`;
  }

  draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = this.size;
    if (this.canvas.width !== px * dpr || this.canvas.height !== px * dpr) {
      this.canvas.width = this.canvas.height = px * dpr;
      this.canvas.style.width = this.canvas.style.height = `${px}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const S = this.cfg.numSpecies;
    const h = this.header;
    const cs = (px - h) / S;
    const m = this.matrix;

    for (let i = 0; i < S; i++) {
      this.drawShape(h + cs * (i + 0.5), h / 2, Math.min(7, cs * 0.35), i);
      this.drawShape(h / 2, h + cs * (i + 0.5), Math.min(7, cs * 0.35), i);
    }
    ctx.font = `${Math.max(8, Math.min(12, cs * 0.3))}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let a = 0; a < S; a++)
      for (let b = 0; b < S; b++) {
        const v = m[a * S + b];
        const x = h + b * cs;
        const y = h + a * cs;
        ctx.fillStyle = this.colorFor(v);
        ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
        if (cs > 26) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(v.toFixed(2), x + cs / 2, y + cs / 2);
        }
      }
    if (this.hover) {
      const [a, b] = this.hover;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(h + b * cs + 1, h + a * cs + 1, cs - 2, cs - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h, h + a * cs, px - h, cs);
      ctx.strokeRect(h + b * cs, h, cs, px - h);
    }
  }

  private drawShape(x: number, y: number, r: number, i: number): void {
    const sp = this.cfg.species[i];
    this.ctx.fillStyle = sp.color;
    drawShape(this.ctx, sp.shape, x, y, r);
  }
}
