# ¿Qué es Particle Life?

*Particle Life* es un modelo de **vida artificial** basado en partículas: un puñado de reglas locales de
atracción y repulsión entre "especies" que, a gran escala, produce comportamientos que parecen
biológicos (células que se dividen, organismos que nadan, depredadores que persiguen a sus presas…).

## Reglas simples, comportamiento complejo

Cada partícula sólo sabe tres cosas:

1. **De qué especie es** (su color).
2. **Quién tiene cerca**, hasta una distancia máxima `rMax`.
3. **Cómo reacciona su especie ante cada otra especie**: un número entre −1 (huir) y 1 (acercarse).

Nadie le dice que forme parte de una célula. Pero cuando hay miles, los grupos que se estabilizan
mutuamente sobreviven y los inestables se deshacen: el resultado se parece mucho a una selección natural
de formas. Eso es la **emergencia**: propiedades del conjunto que no están en ninguna de sus partes.

## La clave: la asimetría

En la física real las fuerzas son recíprocas: si la Tierra atrae a la Luna, la Luna atrae a la Tierra
con la misma fuerza (tercera ley de Newton). Un sistema así con rozamiento acaba siempre **quieto**,
en un estado de mínima energía, como un cristal.

En Particle Life la matriz puede ser **asimétrica**: la especie roja puede sentirse atraída por la azul
mientras la azul huye de la roja. Ese desequilibrio inyecta energía continuamente:

- El rojo persigue al azul, el azul huye… y la pareja **se desplaza** por el mundo.
- Una cadena rojo→azul→verde→rojo **gira** sin parar.
- Grupos enteros adquieren "motores" y se convierten en organismos que nadan.

Puedes comprobarlo: carga *Sopa primordial* o *Serpientes* y pulsa **Simetrizar** en el editor de
matrices. El movimiento se apaga y las estructuras se congelan. (En los presets con propulsión, ruido o
giro el movimiento sigue, porque esos comportamientos aportan su propia energía.)

## Más allá de la atracción

Este proyecto añade ingredientes que amplían mucho lo que puede emerger
(detalles en [Comportamientos y conversión](./comportamientos)):

| Ingrediente | Qué permite |
| --- | --- |
| Radio por pareja | Capas, membranas y estructuras anidadas |
| Conversión de especies | Depredación, ciclos piedra-papel-tijera, ondas espirales, extinciones |
| Propulsión y alineamiento | Materia activa y bandadas |
| Giro | Vórtices y galaxias |
| Pulso | Estructuras que laten |
| Deriva de la matriz | Mundos que evolucionan solos sin estancarse |

## Un poco de historia

- **Jeffrey Ventrella** exploró a principios de los 2000 sistemas de partículas con reglas de afinidad
  entre especies en su proyecto *Clusters*.
- **Tom Mohr** popularizó el nombre *Particle Life* y la ley de fuerza "triangular" con núcleo repulsivo
  que usa este proyecto.
- Modelos relacionados: los *boids* de Craig Reynolds (bandadas, 1986), los autómatas celulares como el
  *Juego de la Vida* de Conway y los sistemas de reacción-difusión, que también producen ondas espirales.

## Lo que aporta esta implementación

La mayoría de versiones calculan todas las parejas (O(N²)), lo que limita a unos pocos miles de
partículas. Aquí la simulación usa una **rejilla espacial con counting sort en la GPU**: cada partícula
sólo examina sus vecinas cercanas, el coste crece de forma lineal y caben **un millón de partículas a
tiempo real**. Con tantas partículas aparecen estructuras a varias escalas a la vez, algo imposible con
unos pocos miles.

Sigue con el [modelo físico](./modelo-fisico) para ver las ecuaciones.
