import { Config, MAX_SPECIES } from '../config';
import { spawnParticles } from './spawn';
import { computeGrid, computeWorld } from './world';
import type { MouseState } from './simulation';

/**
 * Motor de respaldo en CPU: port fiel de `sim.wgsl` (mismo counting sort por celdas,
 * misma fuerza, comportamientos, conversión e incluso el mismo hash PCG para el azar).
 * Se usa cuando el navegador no ofrece WebGPU. Sin dependencias del DOM: se puede probar en Node.
 */

function pcg(v: number): number {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

export class CpuSimulation {
  cfg: Config;
  worldW = 1;
  worldH = 1;
  gridW = 3;
  gridH = 3;
  cellW = 1;
  cellH = 1;
  effectiveRMax = 1;
  numParticles = 0;
  frame = 0;
  time = 0;
  mouse: MouseState = { x: 0, y: 0, strength: 0 };
  populations = new Uint32Array(MAX_SPECIES);

  /** Estado actual: [x, y, vx, vy] por partícula (mismo formato que el buffer de GPU). */
  particles = new Float32Array(0);
  species = new Uint32Array(0);

  private sortedP = new Float32Array(0);
  private sortedS = new Uint32Array(0);
  private cellIndex = new Uint32Array(0);
  private rank = new Uint32Array(0);
  private cellCount = new Uint32Array(0);
  private cellStart = new Uint32Array(0);
  private readonly ranges = new Uint32Array(18);

  // copias "planas" de los parámetros por especie (más rápidas que leer cfg en el bucle interno)
  private attraction = new Float64Array(MAX_SPECIES * MAX_SPECIES);
  private radius = new Float64Array(MAX_SPECIES * MAX_SPECIES);
  private conversion = new Float64Array(MAX_SPECIES * MAX_SPECIES);
  private behavior = new Float64Array(MAX_SPECIES * 8);

  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  get numCells(): number {
    return this.gridW * this.gridH;
  }

  reset(aspect: number): void {
    const { worldW, worldH } = computeWorld(this.cfg, aspect);
    this.worldW = worldW;
    this.worldH = worldH;
    this.updateGrid();
    const { particles, species } = spawnParticles(this.cfg, worldW, worldH);
    this.setState(particles, species);
    this.frame = 0;
    this.time = 0;
    this.updateSpecies();
  }

  updateGrid(): void {
    Object.assign(this, computeGrid(this.cfg.rMax, this.worldW, this.worldH));
    if (this.cellCount.length < this.numCells) {
      this.cellCount = new Uint32Array(this.numCells);
      this.cellStart = new Uint32Array(this.numCells);
    }
  }

  updateSpecies(): void {
    const cfg = this.cfg;
    const S = cfg.numSpecies;
    for (let i = 0; i < S * S; i++) {
      this.attraction[i] = cfg.attraction[i];
      this.radius[i] = Math.max(0.05, Math.min(1, cfg.radius[i]));
      this.conversion[i] = Math.max(0, cfg.conversion[i]);
    }
    for (let s = 0; s < S; s++) {
      const sp = cfg.species[s];
      this.behavior.set([sp.mass, sp.friction, sp.propulsion, sp.noise, sp.spin, sp.alignment, Math.min(0.95, sp.pulseAmp), sp.pulseFreq], s * 8);
    }
  }

  setState(particles: Float32Array, species: Uint32Array): void {
    const n = species.length;
    this.numParticles = n;
    if (this.particles.length !== n * 4) {
      this.particles = new Float32Array(n * 4);
      this.species = new Uint32Array(n);
      this.sortedP = new Float32Array(n * 4);
      this.sortedS = new Uint32Array(n);
      this.cellIndex = new Uint32Array(n);
      this.rank = new Uint32Array(n);
    }
    this.particles.set(particles.subarray(0, n * 4));
    this.species.set(species.subarray(0, n));
  }

  private rand01(i: number, salt: number): number {
    const h = pcg((i ^ pcg((Math.imul(this.frame, 9781) + Math.imul(this.cfg.seed, 6271) + Math.imul(salt, 1013904223)) >>> 0)) >>> 0);
    return (h >>> 8) / 16777216;
  }

  step(): void {
    const cfg = this.cfg;
    const N = this.numParticles;
    const W = this.worldW;
    const H = this.worldH;
    const gw = this.gridW;
    const gh = this.gridH;
    const cw = this.cellW;
    const ch = this.cellH;
    const nc = this.numCells;
    const P = this.particles;
    const Sp = this.species;
    const SP = this.sortedP;
    const SS = this.sortedS;
    const cellCount = this.cellCount;
    const cellStart = this.cellStart;
    const S = cfg.numSpecies;

    // ---- 1-3: counting sort por celdas
    cellCount.fill(0, 0, nc);
    for (let i = 0; i < N; i++) {
      const cx = Math.min(Math.floor(Math.max(P[i * 4], 0) / cw), gw - 1);
      const cy = Math.min(Math.floor(Math.max(P[i * 4 + 1], 0) / ch), gh - 1);
      const cell = cy * gw + cx;
      this.cellIndex[i] = cell;
      this.rank[i] = cellCount[cell]++;
    }
    let acc = 0;
    for (let c = 0; c < nc; c++) {
      cellStart[c] = acc;
      acc += cellCount[c];
    }
    for (let i = 0; i < N; i++) {
      const dst = cellStart[this.cellIndex[i]] + this.rank[i];
      SP[dst * 4] = P[i * 4];
      SP[dst * 4 + 1] = P[i * 4 + 1];
      SP[dst * 4 + 2] = P[i * 4 + 2];
      SP[dst * 4 + 3] = P[i * 4 + 3];
      SS[dst] = Sp[i];
    }

    // ---- 4: fuerzas + integración (de sorted -> estado)
    const rMax = this.effectiveRMax;
    const beta = Math.max(0.01, Math.min(0.99, cfg.beta));
    const repulsion = cfg.repulsion;
    const ff = cfg.forceFactor;
    const dt = cfg.dt;
    const friction = Math.pow(0.5, dt / Math.max(1e-4, cfg.frictionHalfLife));
    const maxSpeed = cfg.maxSpeed * rMax;
    const unit = rMax * ff;
    const convOn = cfg.conversionEnabled;
    const convR = cfg.conversionRadius;
    const mouse = this.mouse;
    const mouseR = cfg.mouse.radius * rMax;
    const brute = cfg.algorithm === 'fuerza bruta';
    const A = this.attraction;
    const R = this.radius;
    const C = this.conversion;
    const B = this.behavior;
    const pop = this.populations;
    pop.fill(0);
    const halfW = W / 2;
    const halfH = H / 2;

    for (let i = 0; i < N; i++) {
      const px = SP[i * 4];
      const py = SP[i * 4 + 1];
      let vx = SP[i * 4 + 2];
      let vy = SP[i * 4 + 3];
      const sa = SS[i];
      const pulse = 1 - B[sa * 8 + 6] * 0.5 * (1 + Math.sin(6.28318530718 * B[sa * 8 + 7] * this.time));
      let fx = 0, fy = 0, tx = 0, ty = 0, vsx = 0, vsy = 0, wSum = 0;
      let convTotal = 0, convBest = 0, convBestS = sa;

      // Rangos de índices a visitar: las 9 celdas vecinas (rejilla) o todo (fuerza bruta).
      // El bucle interno va en línea (sin clausuras): es la parte caliente del motor CPU.
      const ranges = this.ranges;
      let nr = 0;
      if (brute) {
        ranges[0] = 0;
        ranges[1] = N;
        nr = 1;
      } else {
        const cx = Math.min(Math.floor(Math.max(px, 0) / cw), gw - 1);
        const cy = Math.min(Math.floor(Math.max(py, 0) / ch), gh - 1);
        for (let dyc = 0; dyc < 3; dyc++) {
          const ny = (cy + gh + dyc - 1) % gh;
          for (let dxc = 0; dxc < 3; dxc++) {
            const cell = ny * gw + ((cx + gw + dxc - 1) % gw);
            ranges[nr * 2] = cellStart[cell];
            ranges[nr * 2 + 1] = cellStart[cell] + cellCount[cell];
            nr++;
          }
        }
      }
      const rowA = sa * S;
      for (let q = 0; q < nr; q++) {
        const jEnd = ranges[q * 2 + 1];
        for (let j = ranges[q * 2]; j < jEnd; j++) {
          if (j === i) continue;
          let dx = SP[j * 4] - px;
          let dy = SP[j * 4 + 1] - py;
          if (dx > halfW) dx -= W;
          else if (dx < -halfW) dx += W;
          if (dy > halfH) dy -= H;
          else if (dy < -halfH) dy += H;
          const d2 = dx * dx + dy * dy;
          const sb = SS[j];
          const rij = rMax * R[rowA + sb] * pulse;
          if (d2 >= rij * rij || d2 < 1e-10) continue;
          const dist = Math.sqrt(d2);
          const r = dist / rij;
          const ux = dx / dist;
          const uy = dy / dist;
          const f = r < beta ? repulsion * (r / beta - 1) : A[rowA + sb] * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta));
          fx += ux * f * rij;
          fy += uy * f * rij;
          const w = 1 - r;
          tx -= uy * w * rij;
          ty += ux * w * rij;
          vsx += SP[j * 4 + 2] * w;
          vsy += SP[j * 4 + 3] * w;
          wSum += w;
          if (convOn && r < convR) {
            const rate = C[sb * S + sa];
            if (rate > 0) {
              convTotal += rate;
              if (rate > convBest) {
                convBest = rate;
                convBestS = sb;
              }
            }
          }
        }
      }

      // ---- integración (idéntica a `integrate` en sim.wgsl)
      const invMass = 1 / Math.max(B[sa * 8], 0.05);
      const spin = B[sa * 8 + 4];
      let ax = (fx + tx * spin) * ff * invMass;
      let ay = (fy + ty * spin) * ff * invMass;
      const prop = B[sa * 8 + 2];
      if (prop !== 0) {
        const sp = Math.hypot(vx, vy);
        let hx: number, hy: number;
        if (sp > 1e-5) {
          hx = vx / sp;
          hy = vy / sp;
        } else {
          const a = this.rand01(i, 1) * 6.28318530718;
          hx = Math.cos(a);
          hy = Math.sin(a);
        }
        ax += hx * prop * unit * invMass;
        ay += hy * prop * unit * invMass;
      }
      const noise = B[sa * 8 + 3];
      if (noise !== 0) {
        const a = this.rand01(i, 2) * 6.28318530718;
        const k = noise * unit * invMass * this.rand01(i, 3) * 2;
        ax += Math.cos(a) * k;
        ay += Math.sin(a) * k;
      }
      const align = B[sa * 8 + 5];
      if (align !== 0 && wSum > 0) {
        ax += (vsx / wSum - vx) * align;
        ay += (vsy / wSum - vy) * align;
      }
      if (mouse.strength !== 0) {
        let mx = mouse.x - px;
        let my = mouse.y - py;
        mx -= W * Math.round(mx / W);
        my -= H * Math.round(my / H);
        const dist = Math.hypot(mx, my);
        if (dist < mouseR && dist > 1e-5) {
          const k = (mouse.strength * (1 - dist / mouseR) * unit) / dist;
          ax += mx * k;
          ay += my * k;
        }
      }
      const fr = Math.pow(friction, Math.max(B[sa * 8 + 1], 0));
      vx = vx * fr + ax * dt;
      vy = vy * fr + ay * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > maxSpeed) {
        vx *= maxSpeed / sp;
        vy *= maxSpeed / sp;
      }
      let nx = px + vx * dt;
      let ny = py + vy * dt;
      nx -= W * Math.floor(nx / W);
      ny -= H * Math.floor(ny / H);

      let newS = sa;
      if (convTotal > 0 && this.rand01(i, 4) < 1 - Math.exp(-convTotal * dt)) newS = convBestS;

      P[i * 4] = nx;
      P[i * 4 + 1] = ny;
      P[i * 4 + 2] = vx;
      P[i * 4 + 3] = vy;
      Sp[i] = newS;
      pop[newS]++;
    }
    this.frame++;
    this.time += dt;
  }
}
