# Recetas

Pasos concretos para conseguir cada tipo de comportamiento. Todas las recetas parten de cualquier mundo;
cuando hay un preset equivalente, puedes abrirlo directamente y estudiar sus valores.

::: tip Cómo leer las recetas
Los nombres entre comillas son etiquetas del panel; entre paréntesis va la ruta del parámetro en la
[referencia](../referencia/parametros). Después de cambiar el nº de especies o la aparición, las
partículas se recolocan solas.
:::

## Células y gotas

Grupos compactos que se mueven como organismos.

1. *Ecosistema → especies* = 6.
2. En el editor de matrices, elige el patrón **células** y pulsa **Aplicar**.
3. Si quieres que "respiren": en cada especie sube *pulso amplitud* (`species.pulseAmp`) a 0,5 y pon
   frecuencias distintas en *pulso frec.* (0,15, 0,22, 0,29…).

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=9" target="_blank" rel="noopener">▶ Preset «Respiración»</a>

## Serpientes y cadenas

1. *especies* = 8.
2. Patrón **serpientes**: cada especie se atrae a sí misma (1) y un poco a la siguiente (0,2).
3. Para cadenas que se pliegan sin mezclarse, usa el patrón **cadenas** y baja *β (núcleo)* (`beta`) a 0,25.
4. Formas triangulares (*forma* = triángulo) con *orientar formas* activo dejan ver hacia dónde avanza cada una.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=2" target="_blank" rel="noopener">▶ Preset «Serpientes»</a>
<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=3" target="_blank" rel="noopener">▶ Preset «Cadenas»</a>

## Persecuciones

1. *especies* = 5, patrón **persecución**: cada especie persigue a la siguiente (0,8) y huye de la anterior (−0,8).
2. Activa *estelas* (`render.trails`, tecla <kbd>T</kbd>) con *persistencia* 0,8 para ver las trayectorias.
3. Masas distintas por especie (0,8 … 1,4) hacen que unas sean más ágiles que otras.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=4" target="_blank" rel="noopener">▶ Preset «Depredadores y presas»</a>

## Bandadas

Movimiento colectivo tipo *boids*: hace falta que las partículas se impulsen solas y se alineen.

1. *especies* = 4; diagonal de la matriz ≈ 0,35 y el resto ligeramente negativo.
2. En cada especie: *propulsión* (`species.propulsion`) entre 0,6 y 1,2, *alineamiento* (`species.alignment`) = 2,5
   y *rozamiento ×* = 0,6.
3. Estelas con *persistencia* 0,88 y *color* = especie × velocidad.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=7" target="_blank" rel="noopener">▶ Preset «Bandadas»</a>

## Vórtices

1. *especies* = 4. Diagonal 0,6; parejas pares −0,3 e impares 0,2.
2. *giro* (`species.spin`) = +0,8 en las especies impares y −0,8 en las pares: remolinos en sentidos opuestos.
3. Forma *anillo* y estelas con persistencia 0,9.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=8" target="_blank" rel="noopener">▶ Preset «Vórtices»</a>

## Ondas espirales (piedra, papel, tijera)

1. *especies* = 3.
2. Atracción: diagonal 0,3; cada especie atrae un poco a la siguiente (0,25) y repele levemente al resto (−0,1).
3. Pestaña **Conversión**: cada especie convierte a la siguiente con tasa 2,5 (a→b, b→c, c→a); el resto a 0.
4. Panel: *Conversión / depredación → activa* ✓ y *radio contacto* = 0,5.
5. Algo de *ruido* (0,4) en cada especie rompe la simetría y hace nacer las espirales.

Observa la gráfica de población: las tres especies oscilan sin que ninguna gane.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=5" target="_blank" rel="noopener">▶ Preset «Piedra, papel, tijera»</a>

## Galaxias

1. *aparición* = big bang, *especies* = 5.
2. Atracción débil y global: diagonal 0,25, resto 0,12.
3. *giro* = 0,35 en todas, masas crecientes (1 … 2,2).
4. *semivida rozam.* (`frictionHalfLife`) = 0,12 para que conserven la inercia; estelas con persistencia 0,93.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=10" target="_blank" rel="noopener">▶ Preset «Galaxia»</a>

## Membranas y capas

1. Parte de una matriz aleatoria de 6 especies.
2. Pestaña **Radio**: diagonal 1 y el resto entre 0,35 y 0,95. Las especies con radios cortos entre sí
   quedan separadas por capas.
3. *β (núcleo)* = 0,2.

<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=11" target="_blank" rel="noopener">▶ Preset «Membranas»</a>

## Un mundo que nunca se repite

1. Cualquier mundo con una matriz que te guste.
2. *Evolución de la matriz → deriva continua* ✓ y *velocidad* 0,1–0,3.
3. Déjalo correr: las estructuras nacen, mutan y desaparecen. Si aparece algo bonito, desactiva la deriva y
   [guárdalo](./compartir).

## Capturas bonitas

1. <kbd>H</kbd> oculta la interfaz.
2. Acerca la cámara con la rueda (zoom ×2–3): las estructuras se aprecian mucho mejor que con el mundo entero.
3. *Render*: sube *halo* y *intensidad* del bloom, prueba *color* = especie × velocidad o dirección.
4. <kbd>T</kbd> para estelas, <kbd>P</kbd> para guardar un PNG a la resolución de tu pantalla.

## Si algo sale mal

| Síntoma | Prueba |
| --- | --- |
| Todo colapsa en un punto | Sube *repulsión* o *β*, o baja la diagonal de la matriz |
| Las partículas "explotan" o tiemblan | Baja *dt* o *fuerza*; sube el rozamiento (baja la *semivida*) |
| Nada se mueve | Sube *fuerza*, prueba <kbd>R</kbd> o añade algo de *ruido* |
| Demasiado lento | Menos partículas o *pasos / frame* = 1 |
