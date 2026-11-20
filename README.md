# Particle Life · ecosistema 2D en GPU

Miles (o millones) de partículas de varias especies que se atraen o repelen según una matriz
de interacción. Con reglas físicas muy simples aparecen estructuras complejas: células,
serpientes, bandadas, vórtices, ondas espirales…

- **Simulación O(N) en GPU** con WebGPU (rejilla uniforme + counting sort en compute shaders):
  1 millón de partículas en ~2 ms por paso en una RTX 5050 Laptop, ~9 ms en una Radeon 780M integrada.
- **Funciona en cualquier navegador**: si no hay WebGPU, cambia solo a un motor por CPU
  (mismas reglas, validado contra el de GPU) con menos partículas.
- **Totalmente ajustable en tiempo real**: matrices de atracción, radio y conversión;
  comportamientos por especie (masa, propulsión, ruido, giro, alineamiento, pulso);
  render HDR con bloom, estelas, formas SDF y 5 modos de color.
- **Escritorio y móvil**: ratón, teclado y gestos táctiles (pellizcar para zoom).
- **Compartible**: cada mundo se puede guardar como enlace, JSON o captura PNG.

## Probarlo

Ábrelo en Chrome o Edge (WebGPU). En Firefox/Safari antiguos funciona en modo CPU.

> Si ves «MODO CPU» en Chrome/Edge, revisa que la **aceleración por hardware** esté activada
> (Configuración → Sistema → «Usar aceleración gráfica cuando esté disponible») y reinicia el navegador.
> En portátiles con dos GPUs, asigna el navegador a la dedicada en
> Windows → Configuración → Pantalla → Gráficos → Alto rendimiento.

Pulsa `?` dentro de la app para ver todos los controles.

| Acción | Ratón / teclado | Táctil |
|---|---|---|
| Atraer / repeler partículas | clic / Shift+clic | 1 dedo |
| Desplazar · zoom | clic derecho · rueda | 2 dedos · pellizcar |
| Presets | teclas 1–9 | desplegable |
| Pausa · paso a paso | Espacio · S | botón ⏸ |
| Matriz aleatoria · mutar | R · M | botones del editor |
| Ocultar interfaz | H | botón ☰ |

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # versión de producción en dist/
npm run build:single   # todo en un único HTML: dist-single/index.html (se abre sin servidor)
```

URL con `?cpu` fuerza el modo CPU (útil para probarlo).

## Publicarlo en internet (GitHub Pages)

El repositorio incluye `.github/workflows/deploy.yml`: en cada push a `main` comprueba tipos,
ejecuta los tests, compila y publica en GitHub Pages.

1. Crea un repositorio vacío en GitHub (p. ej. `particle-life`).
2. `git remote add origin https://github.com/<usuario>/particle-life.git && git push -u origin main`
3. En GitHub: **Settings → Pages → Source: GitHub Actions**.
4. A los ~2 minutos estará en `https://<usuario>.github.io/particle-life/`.

`vite.config.ts` usa `base: './'`, así que funciona en cualquier subruta o hosting estático
(Netlify, Vercel, Cloudflare Pages, un servidor propio…) subiendo la carpeta `dist/`.

## Pruebas

```bash
npm test               # unitarios sin GPU (también en CI): 187 comprobaciones
npm run test:gpu       # en tu GPU real con Dawn: rejilla vs fuerza bruta, CPU vs GPU, estabilidad, render, rendimiento
npm run test:browser   # con `npm run dev` arrancado: Chrome real, escritorio GPU + modo CPU + móvil táctil
```

Qué se comprueba:

- **Corrección del algoritmo O(N)**: la rejilla da el mismo resultado que la fuerza bruta O(N²),
  en GPU y en CPU (incluidas conversiones de especie).
- **Equivalencia de motores**: un paso en CPU y en GPU desde el mismo estado coincide (error ~1e-5, float32 vs float64).
- **Física**: dos partículas que se atraen se estabilizan a exactamente β·rMax; las que se repelen se separan;
  interacción a través del borde toroidal; conservación del centro de masas.
- **Estabilidad** de los 12 presets (sin NaN, dentro del mundo, población conservada, velocidad acotada).
- **Configuración**: redimensionado de matrices, normalización, presets válidos, enlace comprimido de ida y vuelta.
- **Navegador**: arranque, presets, editor de matrices, zoom, pausa, ayuda, enlace compartible que restaura el mundo,
  modo CPU con su aviso, móvil con pellizco de dos dedos y paneles plegables, sin errores en consola.

## Arquitectura

| Archivo | Qué hace |
|---|---|
| `src/shaders/sim.wgsl` | Simulación GPU: conteo por celdas, prefix-sum de 2 niveles, scatter, fuerzas y comportamientos |
| `src/sim/simulation.ts` | Buffers, pipelines y paso de simulación en GPU |
| `src/sim/cpuSimulation.ts` | Motor de respaldo en CPU (port fiel de `sim.wgsl`) |
| `src/sim/world.ts` · `spawn.ts` | Tamaño del mundo, rejilla y modos de aparición (compartidos) |
| `src/shaders/particles.wgsl` | Quads instanciados que leen el buffer de la simulación; formas SDF con halo |
| `src/shaders/post.wgsl` | Bloom dual-Kawase, tone mapping ACES, viñeta, dithering |
| `src/render/renderer.ts` · `canvasRenderer.ts` | Render WebGPU (HDR) y Canvas 2D (modo CPU) |
| `src/engine.ts` | Interfaz común de motores (GPU / CPU) |
| `src/ui/*` | Editor de matrices, panel (Tweakpane), HUD, población, guardado y enlaces |
| `src/presets.ts` | Patrones de matriz y presets completos |

### Paso de simulación (un compute pass en GPU)

1. `countCells`: celda de cada partícula + `atomicAdd` en su contador
2. `scanBlocks` → `scanSums` → `addSums`: prefix-sum en 2 niveles (hasta 262 144 celdas)
3. `scatter`: reordena físicamente las partículas por celda (coherencia de caché)
4. `forces`: cada partícula recorre sólo las 3×3 celdas vecinas → coste O(N·k)

### Modelo físico

Fuerza por pareja con distancia normalizada `r = d / (rMax·radio_ab)`:

- `r < β`: repulsión universal `r/β − 1` (× repulsión)
- `β ≤ r < 1`: `a_ab · (1 − |2r − 1 − β| / (1 − β))`

Integración semi-implícita con rozamiento exponencial y mundo toroidal.
La matriz es **asimétrica** (`a_ab ≠ a_ba`), lo que rompe acción-reacción y genera persecuciones y estructuras "vivas".
Cada especie tiene además masa, rozamiento, propulsión, ruido, giro, alineamiento y pulso,
y la matriz de **conversión** permite depredación (piedra-papel-tijera, ecosistemas cíclicos).

## Licencia

MIT
