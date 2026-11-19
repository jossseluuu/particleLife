/** Cámara 2D sobre un mundo toroidal. Las coordenadas de pantalla están en píxeles físicos. */
export class Camera {
  x = 0; // centro en coordenadas de mundo
  y = 0;
  pxPerUnit = 1;
  private fitPx = 1;

  fit(worldW: number, worldH: number, viewW: number, viewH: number): void {
    this.x = worldW / 2;
    this.y = worldH / 2;
    this.pxPerUnit = this.fitPx = Math.min(viewW / worldW, viewH / worldH);
  }

  get zoom(): number {
    return this.pxPerUnit / this.fitPx;
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number, worldW: number, worldH: number): [number, number] {
    let wx = this.x + (sx - viewW / 2) / this.pxPerUnit;
    let wy = this.y + (sy - viewH / 2) / this.pxPerUnit;
    wx = ((wx % worldW) + worldW) % worldW;
    wy = ((wy % worldH) + worldH) % worldH;
    return [wx, wy];
  }

  pan(dxPx: number, dyPx: number, worldW: number, worldH: number): void {
    this.x = (((this.x - dxPx / this.pxPerUnit) % worldW) + worldW) % worldW;
    this.y = (((this.y - dyPx / this.pxPerUnit) % worldH) + worldH) % worldH;
  }

  /** Zoom manteniendo fijo el punto bajo el cursor. */
  zoomAt(factor: number, sx: number, sy: number, viewW: number, viewH: number): void {
    const next = Math.max(this.fitPx * 0.5, Math.min(this.fitPx * 200, this.pxPerUnit * factor));
    const ox = (sx - viewW / 2) * (1 / this.pxPerUnit - 1 / next);
    const oy = (sy - viewH / 2) * (1 / this.pxPerUnit - 1 / next);
    this.x += ox;
    this.y += oy;
    this.pxPerUnit = next;
  }
}
