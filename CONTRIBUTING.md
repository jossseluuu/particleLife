# Cómo contribuir

¡Gracias por tu interés en Particle Life! Puedes escribir issues y pull requests en **español o inglés**.

## Formas de ayudar

- **Informar de un fallo** — usa la plantilla *Bug report*. Incluye navegador, GPU y si estabas en modo GPU o CPU
  (se ve en el HUD, arriba a la izquierda). Un enlace compartible del mundo (*Guardar / compartir → Copiar enlace*)
  ayuda muchísimo a reproducirlo.
- **Proponer una idea** — usa la plantilla *Feature request*.
- **Compartir un mundo bonito** — abre una *Discussion* o un issue con el enlace; los mejores pueden acabar como preset.
- **Enviar código** — sigue los pasos de abajo.

## Preparar el entorno

```bash
git clone https://github.com/jossseluuu/particleLife.git
cd particleLife
npm install
npm run dev
```

Necesitas Node.js 20.19+ o 22.12+ (recomendado 22, `nvm use` lee [`.nvmrc`](.nvmrc)) y Chrome o Edge con WebGPU.

## Flujo de trabajo

1. Crea una rama desde `main`: `git checkout -b feat/mi-cambio`.
2. Haz cambios pequeños y enfocados; un PR = un tema.
3. Antes de abrir el PR, ejecuta:

   ```bash
   npm run typecheck
   npm test
   ```

   y, si tocas la simulación, el render o la interfaz, también:

   ```bash
   npm run test:gpu                         # simulación / shaders
   npm run dev   # y en otra terminal:
   npm run test:browser                     # interfaz
   ```

4. Si cambias algo visible, actualiza las capturas con `npm run screenshots` y añádelas al PR.
5. Describe en el PR qué cambia y por qué; añade una línea a la sección *Sin publicar* del [CHANGELOG](CHANGELOG.md).

## Convenciones

- **TypeScript estricto**, sin `any` salvo causa justificada. Formato: 2 espacios, comillas simples, punto y coma
  (lo aplica [`.editorconfig`](.editorconfig)).
- **Comentarios y textos de la interfaz en español.**
- **Paridad GPU/CPU**: cualquier cambio en `src/shaders/sim.wgsl` debe replicarse en `src/sim/cpuSimulation.ts`;
  `npm test` y `npm run test:gpu` comprueban que ambos motores coinciden.
- **Configuración**: los campos nuevos de `Config` necesitan valor por defecto en `src/config.ts` y entrar en
  `normalizeConfig`, para que los enlaces y JSON antiguos sigan funcionando.
- **Rendimiento**: evita lecturas síncronas de la GPU y asignaciones por frame en el bucle principal.
- **Commits** en imperativo y descriptivos (`Añade preset «Cristales»`, `Corrige zoom táctil en Safari`).

## Ideas para empezar

| Tarea | Dónde |
| --- | --- |
| Un preset nuevo | `src/presets.ts` (añádelo también a la galería del README) |
| Un patrón de matriz | `MATRIX_PATTERNS` en `src/presets.ts` |
| Una forma SDF nueva | `SHAPES` en `src/config.ts`, `src/shaders/particles.wgsl` y `src/ui/shapes.ts` |
| Un modo de color | `src/shaders/particles.wgsl` y el panel de render en `src/ui/panel.ts` |

La [guía de arquitectura](docs/ARCHITECTURE.md) explica cómo encajan las piezas.

## Código de conducta

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md).
