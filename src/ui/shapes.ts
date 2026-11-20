import { SHAPES } from '../config';

/** Dibuja (relleno) la forma de una especie en un canvas 2D. Compartido por el editor y el modo CPU. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: number, x: number, y: number, r: number): void {
  ctx.beginPath();
  const poly = (n: number, rot: number, rr = r) => {
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  switch (SHAPES[shape]) {
    case 'anillo':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.5, y);
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2, true); // sentido inverso => agujero con 'nonzero'
      break;
    case 'triángulo':
      poly(3, -Math.PI / 2);
      break;
    case 'cuadrado':
      poly(4, Math.PI / 4, r * 1.15);
      break;
    case 'rombo':
      poly(4, 0);
      break;
    case 'hexágono':
      poly(6, 0);
      break;
    case 'estrella':
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'cruz':
      ctx.rect(x - r, y - r * 0.3, 2 * r, r * 0.6);
      ctx.rect(x - r * 0.3, y - r, r * 0.6, 2 * r);
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}
