import { Config } from '../config';

export interface HudStats {
  fps: number;
  simMs: number | null;
  renderMs: number | null;
  particles: number;
  grid: string;
  neighbors: number;
  zoom: number;
  paused: boolean;
  gpu: string;
  algorithm: string;
  cpu: boolean;
}

export class Hud {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hud';
  }

  update(s: HudStats): void {
    const ms = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)} ms`);
    this.element.innerHTML = `
      <div><b>${s.fps.toFixed(0)}</b> fps${s.paused ? ' · <span class="paused">EN PAUSA</span>' : ''}${s.cpu ? ' · <span class="cpu-badge">MODO CPU</span>' : ''}</div>
      <div>sim ${s.cpu ? 'CPU' : 'GPU'} ${ms(s.simMs)} · render ${ms(s.renderMs)}</div>
      <div>${s.particles.toLocaleString('es')} partículas · ${s.algorithm}</div>
      <div>rejilla ${s.grid} · ~${s.neighbors.toFixed(0)} vecinos · zoom ×${s.zoom.toFixed(1)}</div>
      <div class="gpu">${s.gpu}</div>
      <div class="keys">H ocultar UI · Espacio pausa · ? ayuda</div>`;
  }
}

/** Gráfica de población por especie (área apilada), útil con la conversión activada. */
export class PopulationChart {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly legend: HTMLElement;
  private history: number[][] = [];
  private readonly maxSamples = 240;
  private readonly w = 300;
  private readonly h = 70;

  constructor(private cfg: Config) {
    this.element = document.createElement('div');
    this.element.className = 'population';
    this.element.innerHTML = `<div class="panel-subtitle">Población por especie</div><canvas></canvas><div class="pop-legend"></div>`;
    this.canvas = this.element.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.legend = this.element.querySelector('.pop-legend')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.scale(dpr, dpr);
  }

  setConfig(cfg: Config): void {
    this.cfg = cfg;
    this.history = [];
  }

  push(pop: Uint32Array): void {
    const S = this.cfg.numSpecies;
    let total = 0;
    for (let i = 0; i < S; i++) total += pop[i];
    if (total === 0) return;
    this.history.push(Array.from(pop.subarray(0, S), (v) => v / total));
    if (this.history.length > this.maxSamples) this.history.shift();
    this.draw();
    this.legend.innerHTML = Array.from(pop.subarray(0, S))
      .map((v, i) => `<span><i class="swatch" style="background:${this.cfg.species[i].color}"></i>${((v / total) * 100).toFixed(0)}%</span>`)
      .join('');
  }

  private draw(): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const n = this.history.length;
    if (n < 2) return;
    const S = this.cfg.numSpecies;
    const dx = w / (this.maxSamples - 1);
    const x0 = w - (n - 1) * dx;
    const base = new Array(n).fill(0);
    for (let s = 0; s < S; s++) {
      ctx.beginPath();
      for (let k = 0; k < n; k++) ctx.lineTo(x0 + k * dx, h - (base[k] + this.history[k][s]) * h);
      for (let k = n - 1; k >= 0; k--) ctx.lineTo(x0 + k * dx, h - base[k] * h);
      ctx.closePath();
      ctx.fillStyle = this.cfg.species[s].color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      for (let k = 0; k < n; k++) base[k] += this.history[k][s];
    }
    ctx.globalAlpha = 1;
  }
}
