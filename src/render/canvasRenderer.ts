import { Config } from '../config';
import { Camera } from '../camera';
import { CpuSimulation } from '../sim/cpuSimulation';
import { drawShape } from '../ui/shapes';

const SPRITE = 64;

/**
 * Render del modo CPU con Canvas 2D: sprites pre-renderizados por especie (forma + halo)
 * dibujados con mezcla aditiva, estelas por desvanecimiento y viñeta.
 */
export class CanvasRenderer {
  private width = 1;
  private height = 1;
  private sprites: HTMLCanvasElement[] = [];
  private spriteKey = '';

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly cfg: Config,
  ) {}

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  updateSpecies(): void {
    this.spriteKey = '';
  }

  private ensureSprites(): void {
    const rc = this.cfg.render;
    const key = JSON.stringify([this.cfg.species.map((s) => [s.color, s.shape]), rc.softness]);
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    const pad = 1 + rc.softness * 1.5;
    this.sprites = this.cfg.species.map((sp) => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE;
      const g = c.getContext('2d')!;
      const mid = SPRITE / 2;
      const core = mid / pad;
      if (rc.softness > 0) {
        const grad = g.createRadialGradient(mid, mid, core * 0.6, mid, mid, mid);
        grad.addColorStop(0, sp.color + '88');
        grad.addColorStop(1, sp.color + '00');
        g.fillStyle = grad;
        g.fillRect(0, 0, SPRITE, SPRITE);
      }
      g.fillStyle = sp.color;
      drawShape(g, sp.shape, mid, mid, core);
      return c;
    });
  }

  render(sim: CpuSimulation, cam: Camera): void {
    const ctx = this.ctx;
    const rc = this.cfg.render;
    const W = this.width;
    const H = this.height;
    this.ensureSprites();

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rc.background;
    ctx.globalAlpha = rc.trails ? 1 - Math.min(0.99, rc.trailFade) : 1;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = rc.blend === 'aditivo' ? 'lighter' : 'source-over';
    const trailGain = rc.trails ? Math.min(1, (1 - rc.trailFade) * 2.5 + 0.3) : 1;
    ctx.globalAlpha = Math.min(1, rc.brightness * trailGain);

    const P = sim.particles;
    const Sp = sim.species;
    const N = sim.numParticles;
    const ww = sim.worldW;
    const wh = sim.worldH;
    const ppu = cam.pxPerUnit;
    const pad = 1 + rc.softness * 1.5;
    const cx = W / 2;
    const cy = H / 2;

    for (let s = 0; s < this.cfg.numSpecies; s++) {
      const sp = this.cfg.species[s];
      const px = Math.max(rc.pointSize * sim.effectiveRMax * sp.size * ppu, rc.minPx);
      const size = px * pad;
      const half = size / 2;
      const small = size < 3;
      if (small) ctx.fillStyle = sp.color;
      const sprite = this.sprites[s];
      for (let i = 0; i < N; i++) {
        if (Sp[i] !== s) continue;
        let dx = P[i * 4] - cam.x;
        let dy = P[i * 4 + 1] - cam.y;
        dx -= ww * Math.round(dx / ww);
        dy -= wh * Math.round(dy / wh);
        const x = cx + dx * ppu;
        const y = cy + dy * ppu;
        if (x < -half || y < -half || x > W + half || y > H + half) continue;
        if (small) ctx.fillRect(x - px / 2, y - px / 2, px, px);
        else ctx.drawImage(sprite, x - half, y - half, size, size);
      }
    }

    // con estelas el lienzo se reutiliza: la viñeta se acumularía frame a frame
    if (rc.vignette > 0 && !rc.trails) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const r = Math.hypot(W, H) / 2;
      const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, rc.vignette * 0.9)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }
}
