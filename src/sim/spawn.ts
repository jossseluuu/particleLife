import { Config } from '../config';
import { gaussian, mulberry32 } from '../rng';

/** Genera posiciones/velocidades iniciales y especies según el modo de aparición. */
export function spawnParticles(cfg: Config, W: number, H: number): { particles: Float32Array; species: Uint32Array } {
  const N = cfg.numParticles;
  const S = cfg.numSpecies;
  const rand = mulberry32(cfg.seed ^ 0x9e3779b9);
  const particles = new Float32Array(N * 4);
  const species = new Uint32Array(N);
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2;

  // centros para el modo cúmulos (varios por especie)
  const clusters = Array.from({ length: S * 3 }, () => [rand() * W, rand() * H]);

  for (let i = 0; i < N; i++) {
    let s = Math.floor(rand() * S);
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    switch (cfg.spawn) {
      case 'disco': {
        const r = Math.sqrt(rand()) * R * 0.7;
        const a = rand() * Math.PI * 2;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        break;
      }
      case 'anillo': {
        const r = R * (0.62 + gaussian(rand) * 0.06);
        const a = rand() * Math.PI * 2;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        break;
      }
      case 'espiral': {
        const t = Math.sqrt(rand());
        const a = t * Math.PI * 5 + (s / S) * Math.PI * 2;
        const r = t * R * 0.9 + gaussian(rand) * R * 0.02;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        break;
      }
      case 'franjas': {
        x = rand() * W;
        y = rand() * H;
        s = Math.min(S - 1, Math.floor((x / W) * S));
        break;
      }
      case 'cúmulos': {
        const c = clusters[s * 3 + Math.floor(rand() * 3)];
        x = c[0] + gaussian(rand) * R * 0.08;
        y = c[1] + gaussian(rand) * R * 0.08;
        break;
      }
      case 'big bang': {
        const r = Math.sqrt(rand()) * R * 0.12;
        const a = rand() * Math.PI * 2;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        const v = cfg.rMax * (2 + rand() * 4);
        vx = Math.cos(a) * v - Math.sin(a) * v * 0.6;
        vy = Math.sin(a) * v + Math.cos(a) * v * 0.6;
        break;
      }
      default:
        x = rand() * W;
        y = rand() * H;
    }
    x = ((x % W) + W) % W;
    y = ((y % H) + H) % H;
    particles.set([x, y, vx, vy], i * 4);
    species[i] = s;
  }
  return { particles, species };
}
