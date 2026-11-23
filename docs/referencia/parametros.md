<!-- ARCHIVO GENERADO por scripts/gen-docs.ts a partir de src/params.ts y src/config.ts. No lo edites a mano: ejecuta `npm run docs:gen`. -->

# Referencia de parámetros

Todos los campos de la configuración de un mundo: lo que guarda el JSON, lo que viaja en un enlace
compartible y lo que ajusta el panel. La columna **Ruta** es la clave dentro del objeto `Config`
(ver [formato de guardado](./formato)).

<div class="legend">

**Marcas:** <Badge type="tip" text="GPU" /> sólo en el render WebGPU (no en modo CPU) ·
<Badge type="warning" text="reinicia" /> cambiarlo vuelve a colocar las partículas ·
<Badge type="info" text="editor" /> se edita en el editor de matrices, no en el panel.

</div>

## Ecosistema

Población, tamaño del mundo y cómo empieza.

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `seed` <Badge type="warning" text="reinicia" /> | semilla | 1234 | — | Semilla del generador aleatorio: posiciones iniciales y matrices aleatorias. La misma semilla reproduce el mismo mundo. |
| `numParticles` <Badge type="warning" text="reinicia" /> | partículas | 80.000 | 1000 … 2.000.000 | Número total de partículas. El máximo real depende del motor (menos en modo CPU) y de la memoria de la GPU. |
| `numSpecies` <Badge type="warning" text="reinicia" /> | especies | 6 | 1 … 16 | Número de especies (colores). Al cambiarlo se redimensionan las matrices conservando la parte común. |
| `density` <Badge type="warning" text="reinicia" /> | densidad | 30 | 4 … 120 vecinos | Vecinos medios dentro del radio máximo. Define el tamaño del mundo: más densidad, mundo más pequeño y más apretado. |
| `spawn` <Badge type="warning" text="reinicia" /> | aparición | `aleatorio` | `aleatorio` · `disco` · `anillo` · `espiral` · `franjas` · `cúmulos` · `big bang` | Cómo se colocan las partículas al reiniciar. |

## Física

La ley de fuerza y la integración. Las matrices se editan en el [editor de matrices](../guia/editor-matrices).

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `rMax` | radio máx. | 40 | 8 … 150 unidades | Alcance máximo de la interacción entre dos partículas. También fija el tamaño de las celdas de la rejilla. |
| `beta` | β (núcleo) | 0,3 | 0,05 … 0,9 × rMax | Fracción del radio donde termina la repulsión universal y empieza la zona gobernada por la matriz. |
| `repulsion` | repulsión | 1 | 0 … 5 | Intensidad del núcleo repulsivo que impide que las partículas se superpongan. |
| `forceFactor` | fuerza | 10 | 0,5 … 40 | Multiplicador global de todas las fuerzas. |
| `frictionHalfLife` | semivida rozam. | 0,04 | 0,005 … 1 s | Tiempo en el que la velocidad se reduce a la mitad sin fuerzas. Valores bajos = medio viscoso. |
| `dt` | dt | 0,02 | 0,002 … 0,05 s | Paso de tiempo de la integración. Más grande = más rápido pero menos estable. |
| `maxSpeed` | vel. máx (rMax/s) | 20 | 1 … 80 rMax/s | Límite de velocidad de cada partícula; evita explosiones numéricas. |
| `stepsPerFrame` | pasos / frame | 1 | 1 … 8 | Pasos de simulación por frame dibujado: acelera la evolución a costa de rendimiento. |
| `algorithm` | algoritmo | `rejilla` (rejilla O(N)) | `rejilla O(N)` · `fuerza bruta O(N²)` | Rejilla espacial O(N) (normal) o fuerza bruta O(N²), útil sólo como referencia con pocas partículas. |
| `attraction` <Badge type="info" text="editor" /> | — | S×S de 0 | -1 … 1 | Matriz S×S: `attraction[a·S + b]` es cómo reacciona la especie a ante b (positivo atrae, negativo repele). Se edita en la pestaña «Atracción». |
| `radius` <Badge type="info" text="editor" /> | — | S×S de 1 | 0,1 … 1 | Matriz S×S que escala el radio de interacción de cada pareja. Se edita en la pestaña «Radio». |

## Conversión / depredación

Cambio de especie por contacto. Ver [comportamientos y conversión](../conceptos/comportamientos#conversion).

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `conversion` <Badge type="info" text="editor" /> | — | S×S de 0 | 0 … 5 | Matriz S×S: `conversion[a·S + b]` es la tasa a la que a convierte a b por contacto. Se edita en la pestaña «Conversión». |
| `conversionEnabled` | activa | no | — | Activa la conversión de especies (depredación, piedra-papel-tijera). |
| `conversionRadius` | radio contacto | 0,35 | 0,05 … 1 × radio | Distancia normalizada por debajo de la cual dos partículas se consideran en contacto. |

## Evolución de la matriz

Cambios automáticos de la matriz de atracción con el tiempo.

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `drift.enabled` | deriva continua | no | — | La matriz de atracción cambia sola poco a poco con un paseo aleatorio suave: el mundo nunca se estanca. |
| `drift.rate` | velocidad | 0,15 | 0,01 … 1 | Velocidad de la deriva de la matriz. |

## Especies y comportamientos

Cada elemento de `species[]` tiene estos campos. En el panel: *Especies y comportamientos → Especie N*.

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `species.color` | color | paleta según el índice | — | Color de la especie en formato `#rrggbb`. |
| `species.shape` | forma | `0` (círculo) | `círculo` · `anillo` · `triángulo` · `cuadrado` · `rombo` · `hexágono` · `estrella` · `cruz` | Forma dibujada (SDF). |
| `species.size` | tamaño | 1 | 0,2 … 4 | Multiplicador del tamaño visual (no afecta a la física). |
| `species.mass` | masa | 1 | 0,1 … 5 | Inercia: la aceleración se divide por la masa. |
| `species.friction` | rozamiento × | 1 | 0 … 3 | Multiplicador del rozamiento global para esta especie (0 = sin rozamiento propio). |
| `species.propulsion` | propulsión | 0 | 0 … 2 | Empuje constante en la dirección de su velocidad (materia activa). |
| `species.noise` | ruido | 0 | 0 … 2 | Agitación browniana aleatoria en cada paso. |
| `species.spin` | giro | 0 | -2 … 2 | Fuerza tangencial respecto a sus vecinos; genera vórtices. El signo indica el sentido. |
| `species.alignment` | alineamiento | 0 | 0 … 8 | Tendencia a igualar su velocidad con la media de sus vecinos (bandadas). |
| `species.pulseAmp` | pulso amplitud | 0 | 0 … 0,9 | Amplitud de la oscilación del radio de interacción («respiración»). |
| `species.pulseFreq` | pulso frec. | 0,5 | 0,02 … 3 Hz | Frecuencia de la respiración, en hercios de tiempo simulado. |

## Render

Sólo afectan al aspecto, nunca a la simulación.

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `render.colorMode` <Badge type="tip" text="GPU" /> | color | `0` (especie) | `especie` · `velocidad` · `especie × velocidad` · `dirección` · `degradado especies` | Cómo se colorea cada partícula. |
| `render.blend` | mezcla | `aditivo` (aditiva) | `aditiva` · `alfa` | Mezcla aditiva (las zonas densas brillan) o alfa (opaca). |
| `render.pointSize` | tamaño | 0,14 | 0,02 … 0,8 × rMax | Tamaño base de las partículas. |
| `render.minPx` | tamaño mín. px | 1,4 | 0,5 … 6 px | Tamaño mínimo en pantalla, para que no desaparezcan al alejar la cámara. |
| `render.softness` | halo | 0,6 | 0 … 2 | Halo difuso alrededor de cada partícula. |
| `render.brightness` | brillo | 1 | 0,05 … 4 | Brillo de cada partícula. |
| `render.orient` <Badge type="tip" text="GPU" /> | orientar formas | sí | — | Gira las formas según la dirección de su velocidad. |
| `render.speedRef` <Badge type="tip" text="GPU" /> | vel. de saturación | 4 | 0,2 … 20 rMax/s | Velocidad que satura la paleta en los modos de color por velocidad. |
| `render.trails` | estelas | no | — | En vez de borrar cada frame, atenúa el anterior: deja rastro. |
| `render.trailFade` | persistencia | 0,86 | 0,5 … 0,99 | Fracción de la imagen que se conserva por frame con estelas activas. |
| `render.bloom` <Badge type="tip" text="GPU" /> | bloom | sí | — | Resplandor alrededor de las zonas brillantes. |
| `render.bloomIntensity` <Badge type="tip" text="GPU" /> | intensidad | 0,9 | 0 … 4 | Intensidad del bloom. |
| `render.bloomThreshold` <Badge type="tip" text="GPU" /> | umbral | 0,35 | 0 … 3 | Brillo a partir del cual una zona genera bloom. |
| `render.bloomKnee` <Badge type="tip" text="GPU" /> | suavidad | 0,4 | 0 … 1 | Suavidad de la transición en el umbral del bloom. |
| `render.bloomRadius` <Badge type="tip" text="GPU" /> | radio bloom | 6 | 2 … 7 niveles | Niveles de la pirámide de bloom: más niveles, resplandor más amplio. |
| `render.exposure` <Badge type="tip" text="GPU" /> | exposición | 1 | 0,1 … 4 | Exposición antes del tone mapping. |
| `render.tonemap` <Badge type="tip" text="GPU" /> | tone mapping | `0` (ACES) | `ACES` · `Reinhard` · `lineal` | Curva que comprime el HDR a la pantalla. |
| `render.vignette` | viñeta | 0,35 | 0 … 1 | Oscurecimiento de los bordes de la imagen. |
| `render.background` | fondo | `#05060a` | — | Color de fondo (`#rrggbb`). |

## Ratón y táctil

El «pincel» con el que se empujan las partículas.

| Ruta | Panel | Por defecto | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `mouse.radius` | radio (×rMax) | 6 | 1 … 40 × rMax | Alcance del pincel del ratón o del dedo. |
| `mouse.strength` | fuerza | 3 | -20 … 20 | Fuerza del pincel: positiva atrae, negativa repele (Shift invierte el signo). |

## Límites internos

| Constante | Valor | Motivo |
| --- | --- | --- |
| `MAX_SPECIES` | 16 | Tamaño fijo de las matrices en el buffer de la GPU (16×16) |
| `MAX_PARTICLES` | 2.000.000 | Memoria de los buffers de partículas |
| `MAX_CELLS` | 262.144 | Prefix-sum de dos niveles: 256 bloques × 1024 celdas |
