# Particle Life · ecosistema 2D en GPU

Miles (o millones) de partículas de varias especies que se atraen o repelen según una matriz
de interacción. Con reglas físicas muy simples aparecen estructuras complejas: células,
serpientes, bandadas, vórtices, ondas espirales…
La simulación y el render corren por completo en la GPU con **WebGPU**.

## Uso

```bash
npm install
npm run dev        # abre http://localhost:5173 en Chrome o Edge
```

Requiere un navegador con WebGPU **y aceleración por hardware activada**
(Chrome/Edge → Configuración → Sistema → «Usar aceleración gráfica cuando esté disponible»).
En portátiles con dos GPUs, asigna el navegador a la GPU dedicada en
Windows → Configuración → Pantalla → Gráficos.

Pulsa `?` dentro de la app para ver todos los controles.

## Arquitectura

| Archivo | Qué hace |
|---|---|
| `src/shaders/sim.wgsl` | Simulación: rejilla uniforme + counting sort (O(N)), fuerzas, comportamientos, conversión |
| `src/sim/simulation.ts` | Buffers, rejilla, pipelines de compute y paso de simulación |
| `src/shaders/particles.wgsl` | Quads instanciados leídos directamente del buffer de la simulación; formas SDF |
| `src/shaders/post.wgsl` | Bloom dual-Kawase, tone mapping ACES, viñeta, dithering |
| `src/render/renderer.ts` | Escena HDR, estelas, bloom y composición |
| `src/ui/*` | Editor de matrices, panel (Tweakpane), HUD, población, guardado/URL |
| `src/presets.ts` | Patrones de matriz y presets completos |

### Paso de simulación (un compute pass)

1. `countCells`: celda de cada partícula + `atomicAdd` en su contador
2. `scanBlocks` → `scanSums` → `addSums`: prefix-sum en 2 niveles (hasta 262 144 celdas)
3. `scatter`: reordena físicamente las partículas por celda (coherencia de caché)
4. `forces`: cada partícula recorre sólo las 3×3 celdas vecinas → coste O(N·k)

### Modelo físico

Fuerza por pareja con distancia normalizada `r = d / (rMax·radio_ab)`:

- `r < β`: repulsión universal `r/β − 1` (× repulsión)
- `β ≤ r < 1`: `a_ab · (1 − |2r − 1 − β| / (1 − β))`

Integración semi-implícita con rozamiento exponencial y mundo toroidal.
Cada especie tiene además **masa, rozamiento, propulsión, ruido, giro, alineamiento y pulso**,
y la matriz de **conversión** permite depredación (piedra-papel-tijera, ecosistemas cíclicos).

## Pruebas

```bash
npm run validate   # headless con Dawn: rejilla vs fuerza bruta, estabilidad, render, rendimiento
npm run smoke      # con `npm run dev` arrancado: abre Chrome real, recorre presets, captura pantallas
```
