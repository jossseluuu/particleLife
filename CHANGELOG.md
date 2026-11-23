# Changelog

Todos los cambios relevantes del proyecto. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.0.0] - 2026-11-23

Primera versión pública.

### Añadido

- Simulación O(N) en GPU con WebGPU: rejilla uniforme, prefix-sum de dos niveles y reordenación de partículas por celda; hasta 2 millones de partículas.
- Matrices de atracción, radio y conversión (depredación) de hasta 16 especies, con editor visual.
- Comportamientos por especie: masa, rozamiento, propulsión, ruido, giro, alineamiento y pulso.
- Render HDR con bloom dual-Kawase, tone mapping ACES, estelas, 8 formas SDF y 5 modos de color.
- 12 presets y patrones de matriz predefinidos; mutar, simetrizar y evolución automática de la matriz.
- Motor CPU de respaldo cuando no hay WebGPU, con las mismas reglas, y diagnóstico de por qué falta WebGPU.
- Soporte móvil: gestos táctiles, pellizcar para zoom, interfaz plegable y menos partículas por defecto.
- Guardar y compartir: enlace comprimido, JSON, `localStorage` y captura PNG.
- Build de un solo archivo HTML (`npm run build:single`) y compatibilidad con el visor de Artifacts.
- Pruebas unitarias (187 comprobaciones), validación en GPU real con Dawn y pruebas E2E en Chrome.
- CI y despliegue automático en GitHub Pages.
- Documentación completa, capturas generadas automáticamente (`npm run screenshots`) y plantillas de GitHub.

### Corregido

- Elegir un preset en el desplegable (o cambiar el nº de especies) destruía el panel dentro de su propio evento
  y lanzaba `TpError: View has been already disposed`.

[Sin publicar]: https://github.com/jossseluuu/particleLife/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jossseluuu/particleLife/releases/tag/v1.0.0
