# Modelo físico

Esta página describe exactamente lo que calcula cada paso de simulación. El código de referencia es
[`src/shaders/sim.wgsl`](https://github.com/jossseluuu/particleLife/blob/main/src/shaders/sim.wgsl)
(GPU) y su réplica en
[`src/sim/cpuSimulation.ts`](https://github.com/jossseluuu/particleLife/blob/main/src/sim/cpuSimulation.ts) (CPU).

## La ley de fuerza

Para una partícula de especie *a* y una vecina de especie *b* a distancia *d*, se calcula primero la
**distancia normalizada**:

```text
r = d / (rMax · radio[a,b] · pulso_a)
```

`radio[a,b]` es la [matriz de radios](../guia/editor-matrices) y `pulso_a` la "respiración" de la especie
(1 si no late). La fuerza sobre *a*, en la dirección de *b*, es:

| Zona | Fuerza | Papel |
| --- | --- | --- |
| `r < β` | `repulsión · (r/β − 1)` | Núcleo repulsivo universal: impide que las partículas se superpongan |
| `β ≤ r < 1` | `atracción[a,b] · (1 − \|2r − 1 − β\| / (1 − β))` | Zona "social": un triángulo con máximo en `r = (1+β)/2` |
| `r ≥ 1` | `0` | Fuera de alcance |

<svg class="diagram" viewBox="0 0 620 300" role="img" aria-label="Gráfica de la fuerza en función de la distancia normalizada">
  <g fill="none" stroke="currentColor" stroke-width="1.2" class="muted">
    <line x1="60" y1="150" x2="590" y2="150" />
    <line x1="60" y1="30" x2="60" y2="270" />
    <line x1="198" y1="145" x2="198" y2="155" />
    <line x1="520" y1="145" x2="520" y2="155" />
    <line x1="359" y1="145" x2="359" y2="155" />
  </g>
  <polyline points="60,250 198,150 359,50 520,150 585,150" fill="none" stroke="#f43f5e" stroke-width="3" stroke-linejoin="round" />
  <polyline points="198,150 359,210 520,150" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="7 5" stroke-linejoin="round" />
  <g font-size="14" fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif">
    <text x="586" y="170" text-anchor="end">r</text>
    <text x="68" y="40">fuerza</text>
    <text x="198" y="172" text-anchor="middle">β</text>
    <text x="359" y="172" text-anchor="middle">(1+β)/2</text>
    <text x="520" y="172" text-anchor="middle">1</text>
    <text x="52" y="54" text-anchor="end">+a</text>
    <text x="52" y="254" text-anchor="end">−1</text>
    <text x="372" y="48" fill="#f43f5e">atracción[a,b] = 1</text>
    <text x="372" y="230" fill="#3b82f6">atracción[a,b] = −0,6</text>
    <text x="80" y="285" class="muted">repulsión universal</text>
    <text x="300" y="285" class="muted">zona social (matriz)</text>
  </g>
</svg>

Con `β = 0,3` (el valor por defecto). La fuerza **siempre** es repulsiva muy cerca, sea cual sea la
matriz; más lejos, el signo y la intensidad los decide la matriz.

::: tip Un resultado exacto
Dos partículas de una especie que se atrae a sí misma se quedan en reposo justo donde la fuerza total es
cero: a distancia `β · rMax`. Las pruebas automáticas comprueban este valor
(ver [Pruebas](../desarrollo/pruebas)).
:::

## De la fuerza al movimiento

Sea `F` la suma de las fuerzas de todos los vecinos (multiplicada por el radio de cada pareja y por
`forceFactor`). En cada paso de duración `dt`:

```text
a   = (F + giro · T) · forceFactor / masa  +  propulsión + ruido + alineamiento + ratón
v  ← v · k^(rozamiento_especie)  +  a · dt          k = 0,5^(dt / frictionHalfLife)
v  ← v · min(1, maxSpeed / |v|)
x  ← x + v · dt   (módulo el tamaño del mundo)
```

- **Euler semi-implícito**: la posición se actualiza con la velocidad *ya actualizada*; es más estable
  que el Euler explícito con el mismo `dt`.
- **Rozamiento exponencial** definido por su semivida: con `frictionHalfLife = 0,04 s`, sin fuerzas, la
  velocidad se reduce a la mitad cada 0,04 s, independientemente de `dt`.
- **Velocidad máxima** (`maxSpeed`, en `rMax` por segundo): un tope que evita explosiones numéricas.
- `T` es la fuerza tangencial (perpendicular a la dirección del vecino) que usa el
  [giro](./comportamientos#giro).

## Mundo toroidal

El mundo no tiene bordes: lo que sale por la derecha entra por la izquierda, y arriba con abajo. Las
distancias usan la **imagen mínima**: entre dos partículas cerca de bordes opuestos se toma el camino
corto a través del borde. Así no hay paredes que distorsionen el comportamiento.

## Tamaño del mundo y densidad

El tamaño del mundo no se elige directamente: se calcula para que cada partícula tenga de media
`density` vecinos dentro de `rMax`:

```text
área = N · π · rMax² / density        (proporción ancho/alto = la de la ventana)
```

Así, con 10 000 o con 1 000 000 de partículas, el comportamiento local es el mismo: más partículas
significan **más mundo**, no más apretado. Cada lado mide al menos `3,05 · rMax`.

## La rejilla espacial

Para no comparar cada partícula con todas, el mundo se divide en celdas de lado ≥ `rMax`. Así, todos los
vecinos posibles de una partícula están en su celda o en las 8 de alrededor (3×3). Si el mundo es muy
pequeño y las celdas no pueden llegar a `rMax`, el alcance efectivo se limita al tamaño de celda.

Cómo se construye esa rejilla en la GPU en cada paso está en la [arquitectura](../referencia/arquitectura#paso-de-simulacion-en-gpu).

## Aleatoriedad reproducible

El ruido, la conversión y la dirección inicial de la propulsión usan un hash **PCG** de
(índice de partícula, nº de paso, semilla), idéntico en GPU y CPU. No hay estado aleatorio que guardar y
ambos motores producen los mismos números.
