import { Config, MAX_CELLS } from '../config';

export interface WorldSize {
  worldW: number;
  worldH: number;
}

export interface GridInfo {
  gridW: number;
  gridH: number;
  cellW: number;
  cellH: number;
  effectiveRMax: number;
}

/** Tamaño del mundo para que haya `density` vecinos medios dentro de rMax. */
export function computeWorld(cfg: Config, aspect: number): WorldSize {
  const area = (cfg.numParticles * Math.PI * cfg.rMax * cfg.rMax) / Math.max(1, cfg.density);
  let w = Math.sqrt(area * Math.max(0.2, aspect));
  let h = area / w;
  const minSide = cfg.rMax * 3.05;
  return { worldW: Math.max(w, minSide), worldH: Math.max(h, minSide) };
}

/**
 * Rejilla con celdas >= rMax: así bastan las 3×3 celdas vecinas.
 * Si saldrían demasiadas celdas, se agrandan (sigue siendo correcto, sólo algo más lento).
 */
export function computeGrid(rMax: number, worldW: number, worldH: number, maxCells = MAX_CELLS): GridInfo {
  const r = Math.min(rMax, worldW / 3, worldH / 3);
  let gw = Math.max(3, Math.floor(worldW / r));
  let gh = Math.max(3, Math.floor(worldH / r));
  if (gw * gh > maxCells) {
    const k = Math.sqrt(maxCells / (gw * gh));
    gw = Math.max(3, Math.floor(gw * k));
    gh = Math.max(3, Math.floor(gh * k));
  }
  const cellW = worldW / gw;
  const cellH = worldH / gh;
  return { gridW: gw, gridH: gh, cellW, cellH, effectiveRMax: Math.min(rMax, cellW, cellH) };
}
