# Arquitectura

Visión técnica de Particle Life: cómo está organizado el código, cómo es un paso de simulación en GPU,
y las decisiones de diseño. El modelo físico se explica con más calma en [Modelo físico](../conceptos/modelo-fisico)
y el detalle de cada parámetro en la [referencia de parámetros](./parametros).

## Mapa de módulos

```text
index.html ─▶ src/main.ts  (App: bucle de frames, entrada, cámara, atajos)
                 │
                 ├─▶ src/engine.ts ─── interfaz común Engine
                 │      ├─ GpuEngine ─▶ src/sim/simulation.ts  + src/shaders/sim.wgsl
                 │      │              src/render/renderer.ts  + particles.wgsl + post.wgsl
                 │      └─ CpuEngine ─▶ src/sim/cpuSimulation.ts
                 │                     src/render/canvasRenderer.ts
                 │
                 ├─▶ src/ui/  panel.ts (Tweakpane) · matrixEditor.ts · hud.ts · storage.ts · shapes.ts
                 └─▶ src/config.ts · src/presets.ts · src/camera.ts · src/rng.ts
```

| Archivo | Responsabilidad |
| --- | --- |
| `src/main.ts` | Clase `App`: crea el motor, gestiona el bucle `requestAnimationFrame`, ratón/táctil/teclado y la cámara |
| `src/engine.ts` | Interfaz `Engine` y sus dos implementaciones; el resto de la app no sabe si corre en GPU o CPU |
| `src/gpu/device.ts` | Petición de adaptador/dispositivo WebGPU y diagnóstico de por qué no está disponible |
| `src/sim/simulation.ts` | Buffers, pipelines y bind groups de la simulación; encola el paso de simulación |
| `src/shaders/sim.wgsl` | Conteo por celdas, prefix-sum, scatter, fuerzas e integración |
| `src/sim/cpuSimulation.ts` | Port fiel de `sim.wgsl` a TypeScript (`Float64Array`), para el modo sin WebGPU |
| `src/sim/world.ts` · `spawn.ts` | Tamaño del mundo, dimensiones de la rejilla y modos de aparición (compartidos por ambos motores) |
| `src/render/renderer.ts` | Render WebGPU: quads instanciados sobre un target HDR `rgba16float`, estelas y post-proceso |
| `src/shaders/particles.wgsl` | Vértice/fragmento de las partículas: formas SDF con antialiasing y halo |
| `src/shaders/post.wgsl` | Bloom dual-Kawase, tone mapping ACES, viñeta y dithering |
| `src/render/canvasRenderer.ts` | Render Canvas 2D equivalente para el modo CPU |
| `src/config.ts` | Tipo `Config`, valores por defecto, normalización y redimensionado de matrices |
| `src/presets.ts` | Patrones de matriz y los 12 presets |
| `src/ui/storage.ts` | Enlaces compartibles (JSON → deflate-raw → base64url en el `#hash`), JSON y `localStorage` |

## Paso de simulación en GPU

Todo el paso es **un único compute pass** con seis dispatches, sin lecturas a CPU:

| # | Entrada | Qué hace | Coste |
| --- | --- | --- | --- |
| 1 | `countCells` | Calcula la celda de cada partícula y hace `atomicAdd` en su contador; guarda su rango dentro de la celda | O(N) |
| 2 | `scanBlocks` | Prefix-sum exclusivo por bloques de 1024 celdas (scan en memoria compartida del workgroup) | O(C) |
| 3 | `scanSums` | Prefix-sum de las sumas de bloque en un solo workgroup | O(C/1024) |
| 4 | `addSums` | Suma el offset de cada bloque → `cellStart` definitivo | O(C) |
| 5 | `scatter` | Reordena **físicamente** partículas y especies por celda (buffer A → B) | O(N) |
| 6 | `forces` | Cada partícula recorre sólo las 3×3 celdas vecinas, acumula fuerzas e integra (B → A) | O(N·k) |

`C` es el número de celdas (hasta `MAX_CELLS = 262 144`, el límite del scan de dos niveles: 256 bloques × 1024)
y `k` el número medio de vecinos. Existe también `forcesBrute`, la versión O(N²), usada sólo como referencia
en las pruebas.

**¿Por qué reordenar las partículas y no sólo un índice?** Tras el `scatter`, las partículas de una misma
celda quedan contiguas en memoria, así que los hilos vecinos de un workgroup leen datos contiguos: los
accesos a memoria se agrupan y la caché rinde mucho mejor que con una indirección por índice.

### Buffers

| Buffer | Contenido |
| --- | --- |
| `particlesA` / `particlesB` | `vec4f` por partícula: `xy` = posición, `zw` = velocidad (ping-pong) |
| `speciesA` / `speciesB` | `u32` con la especie de cada partícula |
| `cellCount` · `cellStart` · `blockSums` | Histograma por celda, offsets y sumas de bloque del scan |
| `cellIndex` · `rankInCell` | Celda de cada partícula y su posición dentro de ella |
| `popCount` | Población por especie (para la gráfica), copiada a un buffer de staging con lectura asíncrona |
| `simParams` (uniform) | Tamaño del mundo, rejilla, rMax, β, rozamiento, dt, ratón, tiempo, semilla… |
| `speciesData` | Matrices de 16×16 (atracción, radio, conversión) y 2 `vec4f` de comportamiento por especie |

El render lee **directamente** `particlesA` y `speciesA` como instancias: las partículas nunca pasan por la CPU.

## Modelo físico

Para cada pareja (a, b) con distancia `d`, la distancia normalizada es `r = d / (rMax · radio_ab)`:

- `r < β` → repulsión universal `(r/β − 1) · repulsión` (evita que las partículas se superpongan)
- `β ≤ r < 1` → `a_ab · (1 − |2r − 1 − β| / (1 − β))` — un "triángulo" con máximo `a_ab` en `r = (1 + β)/2`
- `r ≥ 1` → sin interacción

La matriz `a` es **asimétrica** (`a_ab ≠ a_ba`), lo que rompe acción-reacción: es el origen de las
persecuciones y de las estructuras que se desplazan solas.

**Integración** semi-implícita (Euler simpléctico) con rozamiento exponencial definido por su semivida
(`frictionHalfLife`), velocidad máxima acotada y mundo **toroidal** (las distancias usan la imagen mínima).

**Comportamientos por especie**, aplicados tras las fuerzas de la matriz:

| Parámetro | Efecto |
| --- | --- |
| masa | Divide la aceleración |
| rozamiento | Exponente sobre el rozamiento global (más o menos "viscosa") |
| propulsión | Empuje constante en la dirección de la velocidad (materia activa) |
| ruido | Fuerza aleatoria por paso (agitación browniana) |
| giro | Fuerza tangencial respecto a los vecinos, perpendicular a la radial (vórtices) |
| alineamiento | Acerca su velocidad a la media ponderada de sus vecinos (bandadas, tipo *boids*) |
| pulso | Hace oscilar el radio de interacción con amplitud y frecuencia propias ("respiración") |

**Conversión**: con la matriz de conversión activada, cada vecino de especie `b` a distancia normalizada
`r < convRadius` aporta su tasa `conv_ba` (con qué fuerza `b` convierte a `a`). La partícula cambia de especie
con probabilidad `1 − exp(−Σ tasas · dt)` y adopta la especie del vecino con mayor tasa. Con conversión
cíclica (a→b→c→a) aparecen las ondas espirales de *piedra, papel, tijera*.

## Motor CPU

`cpuSimulation.ts` reproduce los mismos pasos en TypeScript con `Float64Array` (rejilla, counting sort,
fuerzas, comportamientos y conversión) y usa el mismo generador aleatorio por partícula. `test/validate.ts`
comprueba que un paso en CPU y en GPU desde el mismo estado coincide con un error del orden de 1e-4
(diferencia entre float64 y float32).

Se elige automáticamente si `navigator.gpu` no existe o el adaptador falla, o a la fuerza con `?cpu`.

## Render

1. Las partículas se dibujan como quads instanciados en un target HDR `rgba16float`, con blending aditivo o alfa.
   La forma (círculo, anillo, triángulo, cuadrado, rombo, hexágono, estrella, cruz) se evalúa como SDF en el fragment shader.
2. **Estelas**: en lugar de borrar el target, se atenúa multiplicándolo por `trailFade`.
3. **Bloom**: umbral suave → pirámide de *downsample/upsample* dual-Kawase.
4. **Composición**: exposición, tone mapping ACES, viñeta y dithering para evitar bandas en los degradados oscuros.

## Decisiones de diseño

- **Sin frameworks de UI**: DOM y Canvas directos más [Tweakpane](https://tweakpane.github.io/docs/) para el panel. La única dependencia de ejecución es Tweakpane.
- **`Config` como única fuente de verdad**: simulación, render y UI comparten la misma referencia; los presets, el enlace compartible y el JSON son simples serializaciones de `Config`.
- **Normalización estricta** de cualquier `Config` entrante (enlace, JSON o `localStorage`): límites, tamaño de matrices y campos que falten.
- **`base: './'` en Vite** para que la build funcione en cualquier subruta, y `build:single` para un único HTML autocontenido.

## Pruebas

| Suite | Dónde corre | Qué cubre |
| --- | --- | --- |
| `test/unit.ts` | Node (CI) | Motor CPU vs fuerza bruta, física, presets, configuración, enlaces |
| `test/validate.ts` | Node + Dawn (paquete `webgpu`), GPU real | Rejilla GPU vs fuerza bruta, CPU vs GPU, estabilidad, render, rendimiento |
| `test/browser.mjs` | Chrome real vía Puppeteer | Flujo completo de usuario en escritorio GPU, modo CPU y móvil táctil |
