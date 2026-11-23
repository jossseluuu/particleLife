import { defineConfig } from 'vitepress';

const REPO = 'https://github.com/jossseluuu/particleLife';
const DEMO = 'https://jossseluuu.github.io/particleLife/';

// La documentación se publica junto a la demo: la app en /particleLife/ y esto en /particleLife/docs/.
export default defineConfig({
  lang: 'es-ES',
  title: 'Particle Life',
  titleTemplate: ':title · Particle Life',
  description: 'Documentación de Particle Life: ecosistema de partículas en GPU con WebGPU.',
  base: '/particleLife/docs/',
  outDir: '../dist/docs',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  srcExclude: ['media/**'],
  head: [
    ['link', { rel: 'icon', href: '/particleLife/docs/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#7c3aed' }],
    ['meta', { property: 'og:image', content: `https://raw.githubusercontent.com/jossseluuu/particleLife/main/docs/media/social-preview.jpg` }],
  ],
  markdown: {
    math: false,
    lineNumbers: false,
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guía', link: '/guia/empezar', activeMatch: '/guia/' },
      { text: 'Conceptos', link: '/conceptos/particle-life', activeMatch: '/conceptos/' },
      { text: 'Referencia', link: '/referencia/parametros', activeMatch: '/referencia/' },
      { text: 'Desarrollo', link: '/desarrollo/contribuir', activeMatch: '/desarrollo/' },
      { text: '▶ Demo', link: DEMO },
    ],
    sidebar: {
      '/guia/': [
        {
          text: 'Primeros pasos',
          items: [
            { text: 'Empezar', link: '/guia/empezar' },
            { text: 'La interfaz', link: '/guia/interfaz' },
            { text: 'Controles y atajos', link: '/guia/controles' },
          ],
        },
        {
          text: 'Explorar',
          items: [
            { text: 'Galería de presets', link: '/guia/presets' },
            { text: 'Editor de matrices', link: '/guia/editor-matrices' },
            { text: 'Recetas', link: '/guia/recetas' },
            { text: 'Guardar y compartir', link: '/guia/compartir' },
          ],
        },
        { text: 'Ayuda', items: [{ text: 'Problemas y preguntas', link: '/guia/problemas' }] },
      ],
      '/conceptos/': [
        {
          text: 'Conceptos',
          items: [
            { text: '¿Qué es Particle Life?', link: '/conceptos/particle-life' },
            { text: 'Modelo físico', link: '/conceptos/modelo-fisico' },
            { text: 'Comportamientos y conversión', link: '/conceptos/comportamientos' },
          ],
        },
      ],
      '/referencia/': [
        {
          text: 'Referencia',
          items: [
            { text: 'Parámetros', link: '/referencia/parametros' },
            { text: 'Formato de guardado', link: '/referencia/formato' },
            { text: 'Arquitectura', link: '/referencia/arquitectura' },
            { text: 'Rendimiento', link: '/referencia/rendimiento' },
          ],
        },
      ],
      '/desarrollo/': [
        {
          text: 'Desarrollo',
          items: [
            { text: 'Contribuir', link: '/desarrollo/contribuir' },
            { text: 'Pruebas', link: '/desarrollo/pruebas' },
            { text: 'Sistema de documentación', link: '/desarrollo/documentacion' },
            { text: 'Changelog', link: '/desarrollo/changelog' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPO }],
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Editar esta página en GitHub' },
    lastUpdated: { text: 'Actualizado', formatOptions: { dateStyle: 'medium' } },
    footer: { message: 'Publicado bajo licencia MIT.', copyright: '© 2026 Jose Luis' },
    outline: { level: [2, 3], label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    darkModeSwitchLabel: 'Apariencia',
    lightModeSwitchTitle: 'Cambiar a tema claro',
    darkModeSwitchTitle: 'Cambiar a tema oscuro',
    sidebarMenuLabel: 'Menú',
    returnToTopLabel: 'Volver arriba',
    externalLinkIcon: true,
    notFound: { title: 'Página no encontrada', quote: 'Esta partícula se ha salido del mundo toroidal.', linkText: 'Volver al inicio' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
          modal: {
            displayDetails: 'Mostrar detalles',
            resetButtonTitle: 'Borrar búsqueda',
            backButtonTitle: 'Cerrar búsqueda',
            noResultsText: 'Sin resultados para',
            footer: { selectText: 'abrir', navigateText: 'navegar', closeText: 'cerrar' },
          },
        },
      },
    },
  },
});
