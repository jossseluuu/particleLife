# Empezar

Particle Life es una simulación de **vida artificial**: miles de partículas de varios colores (especies)
que se atraen o se repelen según unas reglas que tú controlas. No hay nada programado para formar
"células" o "serpientes"; esas estructuras **emergen** solas.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/" target="_blank" rel="noopener">▶ Abrir la demo</a>

## Requisitos

| | Modo completo (GPU) | Modo compatible (CPU) |
| --- | --- | --- |
| Navegador | Chrome o Edge 113+, Safari 26+, Firefox 141+ en Windows | Cualquier navegador moderno |
| Partículas | 80 000 por defecto (30 000 en móvil), hasta 2 millones | 6 000 por defecto |
| Efectos | Bloom HDR, color por velocidad, tone mapping | Render básico con Canvas 2D |

La app elige el modo sola. Si ves **«MODO CPU»** arriba a la izquierda en un navegador que debería
tener WebGPU, mira [Problemas y preguntas](./problemas#veo-modo-cpu).

## Tus primeros cinco minutos

1. **Observa.** Arranca con el preset *Sopa primordial*. En unos segundos verás aparecer grupos que se mueven.
2. **Cambia de mundo.** Pulsa las teclas <kbd>1</kbd> a <kbd>9</kbd>. Prueba <kbd>5</kbd> (*Piedra, papel, tijera*)
   y <kbd>2</kbd> (*Serpientes*). Todos están en la [galería de presets](./presets).
3. **Remueve la sopa.** Haz clic y arrastra sobre las partículas para atraerlas; con <kbd>Shift</kbd> las repeles.
   En una pantalla táctil, arrastra con un dedo.
4. **Toca las reglas.** Abajo a la izquierda está la **matriz de atracción**. Arrastra una celda hacia arriba
   (rojo, atrae) o hacia abajo (azul, repele) y mira cómo cambia el comportamiento. Pulsa <kbd>R</kbd> para
   una matriz aleatoria: cada vez es un mundo nuevo.
5. **Guarda lo que te guste.** *Guardar / compartir → Copiar enlace compartible* crea un enlace con tu mundo exacto.

::: tip ¿Y ahora qué?

- Aprende qué hace cada parte de la pantalla en [La interfaz](./interfaz).
- Sigue una [receta](./recetas) para conseguir un comportamiento concreto.
- Entiende por qué funciona en [¿Qué es Particle Life?](../conceptos/particle-life).
:::

## Ejecutarlo en tu ordenador

```bash
git clone https://github.com/jossseluuu/particleLife.git
cd particleLife
npm install
npm run dev      # abre http://localhost:5173
```

Necesitas Node.js 20.19+ o 22.12+. Para una versión en un único archivo HTML que funciona sin servidor:
`npm run build:single` → `dist-single/index.html`. Más detalles en [Contribuir](../desarrollo/contribuir).
