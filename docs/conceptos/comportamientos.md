# Comportamientos y conversión

Además de la matriz de atracción, cada especie tiene un **comportamiento propio** que se suma a las
fuerzas. Se ajustan en el panel, *Especies y comportamientos → Especie N*. Rangos y valores por defecto
en la [referencia](../referencia/parametros#especies-y-comportamientos).

| Parámetro | Efecto | Emerge |
| --- | --- | --- |
| [masa](#masa) | Divide la aceleración | Especies ágiles frente a pesadas |
| [rozamiento ×](#rozamiento) | Exponente sobre el rozamiento global | Especies que planean o que se frenan |
| [propulsión](#propulsion) | Empuje en la dirección del movimiento | Materia activa, nadadores |
| [ruido](#ruido) | Empujones aleatorios | Agitación térmica, estructuras que se deshacen |
| [giro](#giro) | Fuerza tangencial con los vecinos | Vórtices, galaxias |
| [alineamiento](#alineamiento) | Copiar la velocidad de los vecinos | Bandadas |
| [pulso](#pulso) | Radio de interacción que oscila | Estructuras que "respiran" |

## Masa

La aceleración se divide por la masa (con un mínimo de 0,05). Una especie pesada reacciona despacio a
las fuerzas y arrastra a las ligeras. En *Depredadores y presas* las masas van de 0,8 a 1,4.

## Rozamiento

El factor de frenado global `k = 0,5^(dt / frictionHalfLife)` se eleva a este valor: con 0 la especie no
pierde velocidad por sí misma, con 2 se frena el doble de rápido. Combinado con propulsión controla la
velocidad de crucero.

## Propulsión

Un empuje constante en la dirección de la propia velocidad (si está quieta, en una dirección aleatoria).
Es el ingrediente de la **materia activa**: partículas que consumen energía para moverse, como bacterias.
Sola produce partículas que corren en línea recta; con atracción entre ellas, grupos que nadan.

## Ruido

Una fuerza aleatoria nueva en cada paso, de intensidad variable: **agitación browniana**. Rompe simetrías
(útil para que nazcan espirales en piedra-papel-tijera) y, en exceso, impide que las estructuras se
mantengan (*Caos browniano*).

## Giro

Por cada vecino se acumula una fuerza **perpendicular** a la línea que los une, ponderada por la
cercanía. Multiplicada por `giro`, hace que los grupos roten; el signo decide el sentido. Especies con
giros opuestos forman remolinos enfrentados (*Vórtices*); un giro común sobre un *big bang* forma brazos
de galaxia (*Galaxia*).

## Alineamiento

La partícula acelera hacia la **velocidad media ponderada de sus vecinos**, como en los *boids* de
Craig Reynolds. Con propulsión aparecen bandadas que viajan juntas (*Bandadas*: propulsión 0,6–1,2 y
alineamiento 2,5).

## Pulso

El radio de interacción de la especie oscila con el tiempo:

```text
pulso(t) = 1 − amplitud · ½ · (1 + sen(2π · frecuencia · t))
```

Como el radio define a qué distancia se está cómodo, las estructuras se contraen y se expanden.
Con frecuencias distintas por especie el latido se desincroniza (*Respiración*).

## Conversión

Con *Conversión / depredación → activa*, las especies pueden **convertir** a otras al tocarlas. La pestaña
*Conversión* del editor define las tasas: la celda (fila *b*, columna *a*) es con qué fuerza *b* convierte
a *a*.

En cada paso, para una partícula de especie *a*:

1. Cada vecino de especie *b* a distancia normalizada `r < conversionRadius` aporta su tasa `conversión[b,a]`.
2. La probabilidad de convertirse en este paso es `1 − exp(−Σ tasas · dt)`.
3. Si ocurre, adopta la especie del vecino con **mayor tasa**.

La gráfica de población del editor muestra cómo evolucionan las proporciones.

| Estructura de la matriz | Resultado |
| --- | --- |
| Una especie convierte a todas | Gana y el resto se extingue |
| Ciclo a→b→c→a | Ondas espirales sin fin: nadie gana (*Piedra, papel, tijera*) |
| Ciclo de 5 con atajos (a→b fuerte, a→c débil) | Ecosistema que oscila con dominancias cambiantes (*Ecosistema cíclico*) |
| Conversión mutua a⇄b | Frentes que avanzan y retroceden |

## Interacción con el ratón

El "pincel" aplica a las partículas dentro de `mouse.radius · rMax` una fuerza hacia el cursor que
decrece linealmente con la distancia. Con <kbd>Shift</kbd> (o fuerza negativa) las repele.
