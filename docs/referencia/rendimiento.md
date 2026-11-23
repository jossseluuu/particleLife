# Rendimiento

## Cifras medidas

Tiempo de un paso de simulación (todos los compute shaders), medido con `npm run test:gpu`:

| Partículas | NVIDIA RTX 5050 Laptop | AMD Radeon 780M (integrada) |
| ---: | ---: | ---: |
| 50 000 | 0,24 ms | — |
| 200 000 | 0,45 ms | — |
| 500 000 | 1,06 ms | — |
| 1 000 000 | 2,15 ms | ~9 ms |

Con la densidad por defecto (~30 vecinos por partícula). Para medir tu GPU:

```bash
npm run test:gpu
```

::: info ¿Tienes otra GPU?
Abre un issue o un PR con la salida de `npm run test:gpu` y la añadimos a la tabla.
:::

## Por qué escala de forma lineal

Un enfoque ingenuo compara cada partícula con todas las demás: N·(N−1) parejas. Con un millón son
10¹² comparaciones por paso, imposible a tiempo real. Aquí:

1. El mundo se divide en celdas de lado ≥ `rMax`.
2. Las partículas se ordenan por celda (counting sort en la GPU: conteo, prefix-sum y scatter).
3. Cada partícula sólo mira las 3×3 celdas de su alrededor.

El coste pasa a ser **O(N·k)**, con k ≈ los vecinos medios: duplicar las partículas duplica el tiempo.
Detalle de cada fase en la [arquitectura](./arquitectura#paso-de-simulacion-en-gpu).

## Qué afecta al rendimiento

| Factor | Efecto | Parámetro |
| --- | --- | --- |
| Nº de partículas | Lineal | `numParticles` |
| Vecinos por partícula | Lineal; la densidad define cuántos hay | `density` |
| Pasos por frame | Multiplica el coste de simulación | `stepsPerFrame` |
| Algoritmo | La fuerza bruta es O(N²): sólo para comparar con pocas partículas | `algorithm` |
| Agrupamiento | Estructuras muy densas concentran muchos vecinos en pocas celdas | matriz, `repulsion`, `beta` |
| Bloom y halo | Coste de render proporcional a la resolución | `render.bloom`, `render.softness` |
| Resolución | El render se hace a la resolución del dispositivo (hasta 2× en pantallas HiDPI) | — |

El HUD muestra por separado `sim` y `render` (medidos en la GPU con *timestamp queries* cuando el
navegador lo permite), así que puedes ver cuál es el cuello de botella.

## Consejos

- **Portátiles:** asegúrate de que el navegador usa la GPU dedicada (ver [problemas](../guia/problemas#veo-modo-cpu)).
- **Más estructuras, no más partículas:** con zoom ×2–3 sobre 80 000 partículas se ve más detalle que con
  un millón sin zoom.
- **Móvil:** arranca con 30 000 partículas; súbelas poco a poco vigilando los fps del HUD.
- **Modo CPU:** arranca con 6 000 partículas. Es un motor de respaldo, no está pensado para escalas grandes.

## Límites

| Límite | Valor | Origen |
| --- | --- | --- |
| Partículas | 2 000 000 | Tamaño de los buffers (y la memoria de la GPU) |
| Especies | 16 | Matrices 16×16 fijas en el buffer de especies |
| Celdas de la rejilla | 262 144 | Prefix-sum de dos niveles (256 × 1024); con mundos enormes las celdas crecen |
