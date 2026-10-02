# Iteración 5 — Cotizaciones automatizadas (HU14, HU15, HU16)

Material para el capítulo 4.2 de la memoria, con la misma estructura PXP que
usa la Iteración 2 (Inicio de Iteración → Diseño → Implementación → Sistema de
pruebas → Retrospectiva).

> **Nota sobre HU27.** La Tabla 3.3 asigna HU27 (días y horas de trabajo) a
> esta iteración, pero es una historia de agenda y no tiene relación con las
> cotizaciones. Conviene moverla a la Iteración 6 o 7 en la tabla y decirlo en
> la retrospectiva.

---

## Inicio de Iteración

### Tabla 4.x: Tareas asociadas a la Iteración 5

| Historia | Tarea | Descripción |
|---|---|---|
| HU14 | T0001 | Crear diagrama de secuencia |
| HU14 | T0002 | Añadir bases y tasas de consumo al inventario |
| HU14 | T0003 | Calcular la cobertura de tinta del boceto |
| HU14 | T0003b | Extraer la paleta de colores y emparejarla con las tintas |
| HU14 | T0004 | Implementar el motor de cálculo de cotizaciones |
| HU14 | T0005 | Crear ruta de cotización estimada |
| HU14 | T0006 | Crear vista de calculadora de costos |
| HU15 | T0007 | Crear modelo de cotización y detalle de insumos |
| HU15 | T0008 | Crear rutas de guardado y edición de cotizaciones |
| HU15 | T0009 | Crear vista de líneas editables |
| HU16 | T0010 | Implementar descuento de stock transaccional |
| HU16 | T0011 | Enganchar el descuento al cierre de la sesión |
| HU16 | T0012 | Mostrar aviso de nivel crítico tras el descuento |
| HU14, HU15, HU16 | T0013 | Creación y testeo de pruebas unitarias |
| HU14, HU15, HU16 | T0014 | Creación y uso de sistema de pruebas |

---

## Diseño

Los diagramas de secuencia de esta iteración son tres:

1. **HU14 — Cotizar.** Artista → Vista de cotización → API → Motor de cálculo →
   Inventario → Vista. El artista introduce el tamaño y las variables de
   trazado; el servidor consulta los insumos con regla de consumo, calcula y
   devuelve el detalle sin persistir nada.
2. **HU15 — Ajustar el detalle.** El artista quita, agrega o corrige líneas y
   guarda; el servidor recalcula el costo a partir de las líneas recibidas.
3. **HU16 — Cerrar sesión cotizada.** Artista → Agenda → API de sesiones →
   Modelo de cotización → Inventario, en una transacción que marca la
   cotización como consumida y descuenta el stock.

### Extensión del modelo de datos

El diagrama entidad-relación (Figura 4.3) incorpora dos entidades nuevas y tres
atributos:

- **`quotes`** — una cotización: los parámetros con que se calculó (tamaño real
  en cm, cobertura de tinta, trazo, color, número de sesiones), el costo
  resultante, su estado y el sello de consumo.
- **`quote_items`** — el detalle de insumos de una cotización.
- **`materials.consumption_basis`** y **`materials.consumption_rate`** — la
  regla que dice cómo se gasta cada insumo.
- **`sketches.ink_ratio`** y **`sketches.palette`** — la cobertura de tinta y las
  familias de color medidas sobre la imagen.
- **`materials.color_hex`** — el color de cada tinta, para emparejarla con la
  paleta del boceto.

Relaciones: un proyecto tiene N cotizaciones; una cotización pertenece
opcionalmente a un proyecto, a un boceto y a una sesión, y tiene N líneas; cada
línea referencia opcionalmente un insumo del inventario.

---

## Implementación

### El problema del tamaño

La HU14 pide calcular "basándose en el tamaño del boceto". El primer obstáculo
es que el tamaño almacenado del boceto está en **píxeles**, y además el sistema
reescala las imágenes a 1200 px al subirlas. Un PNG de 800×600 px no dice nada
sobre cuántos centímetros medirá el tatuaje sobre la piel, que es lo único que
determina el consumo de tinta y agujas.

La solución aprovecha el módulo de previsualización 3D ya implementado. El
visor normaliza cada modelo anatómico a su altura humana real, de modo que el
tamaño con que se coloca una calca sobre el cuerpo ya está expresado en metros
de piel. Son las medidas que el artista efectivamente probó sobre el cuerpo, no
una estimación.

Al guardar una escena asociada a un proyecto, esas medidas se copian a los
campos `width_cm` y `height_cm` del propio proyecto, en lugar de quedar
únicamente dentro del documento JSON de la escena. La decisión responde a tres
razones: la cotización obtiene la medida sin una consulta adicional ni tener que
cruzar qué calca corresponde al boceto del proyecto; la ficha del proyecto puede
mostrarla; y, sobre todo, la medida sobrevive al borrado de la escena, dado que
la referencia a la previsualización se anula en cascada y se perdería la única
copia. Si no hay escena, las medidas se escriben a mano.

### Cobertura de tinta

El rectángulo que encierra al boceto sobrestima sistemáticamente el consumo: un
lettering fino y un blackwork macizo de 10×10 cm gastan cantidades muy
distintas de material. Para corregirlo se mide, al subir cada boceto, qué
fracción del lienzo lleva tinta realmente:

```
cobertura = Σ ( alpha · (1 − luminancia) ) / total de píxeles
```

Promediar el aporte de cada píxel, en vez de contarlos contra un umbral fijo,
evita que el suavizado de bordes se contabilice como línea llena, lo que
inflaría los diseños de detalle. Los valores medidos van de ~0,08 en un
lettering fino a ~0,70 en un relleno sólido.

### Colores del boceto

La propuesta de solución (capítulo 1.1.2) establece que el algoritmo procesa las
dimensiones del boceto "junto con otros parámetros como el grosor de los
trazados y colores". Resolver el color con un único selector de tres opciones
—negro, grises o color— cumple esa condición solo en parte: la cotización sabría
*cuánta* tinta se gasta, pero no *cuál*.

Por eso, además de la cobertura, al subir el boceto se extraen sus familias de
color dominantes con la parte del área que ocupa cada una. Los píxeles se
agrupan en un cubo RGB de 8×8×8, suficiente para separar familias de tinta sin
fragmentar un mismo rojo en diez tonos. Aquí sí se aplica un umbral, a
diferencia de la cobertura: esta medición responde "qué tintas", y para eso solo
sirven los píxeles que son tinta sin discusión. Con el aporte continuo que usa
la cobertura, el halo claro alrededor de una línea negra entraba como una
familia gris con un tercio del diseño.

La comparación entre los colores del boceto y las tintas del inventario se hace
en el espacio **OKLab** y no en RGB, porque la distancia en RGB no corresponde a
lo que el ojo considera "el mismo color": dos azules claramente distinguibles
pueden quedar más cerca en RGB que un rojo y un naranja. La luminosidad pesa la
mitad que el tono, dado que una misma tinta roja produce rojos claros y oscuros
según cuánto se cargue la aguja.

El umbral de equivalencia se calibró midiendo sobre un inventario típico:

| Caso | Distancia |
|---|---|
| Rojo claro, rojo oscuro, naranja, turquesa (variantes de una tinta existente) | 0,029 – 0,053 |
| Morado, rosa (colores ausentes del inventario) | 0,150 – 0,153 |

El corte quedó en 0,12: deja pasar los matices de una misma tinta y marca como
faltante lo que de verdad obliga a comprar otra.

Dos reglas propias del oficio quedaron codificadas. Primero, los grises se
asignan siempre a la tinta oscura, porque al tatuar se obtienen rebajando el
negro y no mezclando blanco. Segundo, la tinta blanca nunca se asigna de forma
automática: sobre un lienzo blanco es indetectable por definición.

La regla que gobierna todo el reparto es que **las partes suman uno**: el área
entintada se distribuye entre las tintas y nunca se multiplica por cuántas haya
registradas. Una primera versión cobraba cada tinta por el área completa cuando
no había paleta medida, de modo que un tatuaje en blanco y negro cotizaba
también tinta roja y amarilla, y el costo crecía con el tamaño del inventario en
lugar de con el del tatuaje. El defecto lo detectó la contraparte al revisar una
cotización real.

Cuando el boceto no tiene paleta medida, el reparto se apoya en el modo de color
que indicó el artista, que es la única información de color disponible:
en negro o grises, todo corresponde a la tinta oscura; a color, la mitad al
negro —donde van la línea y la sombra— y la otra mitad repartida entre las
tintas cromáticas. Una tinta sin color declarado se considera candidata a ser el
negro, mientras que una declarada como roja evidentemente no lo es.

Cuando un color del diseño no tiene tinta equivalente, su parte del área no se
reparte entre las demás ni se incluye en el costo. Se informa como faltante, que
es información operativa más útil que un precio inventado: ese trozo del tatuaje
no se puede ejecutar con el inventario actual.

El efecto sobre el cálculo es considerable. Medido sobre un diseño de 20×20 cm
con 40% de cobertura, en un inventario con tres tintas:

| | Sin paleta | Con paleta |
|---|---|---|
| Diseño con 45% negro, 30% rojo, 25% amarillo | $45.488 | $18.736 |
| Diseño íntegramente en negro | $45.488 | $17.328 |

Sin el reparto, las tres tintas se cobraban por el área completa aunque el
diseño no usara ninguna de ellas.

### Algoritmo de cálculo

El cálculo se apoya en tres ideas:

**1. Área efectiva.** Es el área que de verdad se entinta:

```
área efectiva = ancho_cm × alto_cm × cobertura
```

**2. Base de consumo.** Cada insumo declara cómo escala su gasto:

| Base | Escala con | Ejemplos |
|---|---|---|
| `area` | el cm² efectivo | tintas, cartuchos |
| `sesion` | cada sesión | guantes, film, papel transfer |
| `hora` | la duración | gasas, alcohol, toalla |
| `ninguno` | no escala | máquina, fuente, pedal |

**3. Reparto por color.** Las tintas con color declarado no se cotizan por el
área completa, sino cada una por la parte del diseño que lleva su color. Los
demás insumos (cartuchos, guantes) sí usan el área completa: una aguja no
distingue de qué color es el trazo que está haciendo.

**4. Variables de trazado.** El grosor del trazo y el modo de color son las
"variables de trazado" que menciona la HU14, y multiplican tanto el material
como el tiempo:

| Grosor | Material | Tiempo | | Color | Material | Tiempo |
|---|---|---|---|---|---|---|
| Fino | 0,80 | 1,25 | | Solo negro | 1,00 | 1,00 |
| Medio | 1,00 | 1,00 | | Negro y grises | 1,15 | 1,20 |
| Grueso | 1,30 | 0,85 | | Color | 1,60 | 1,50 |

El material sube con el grosor (un trazo grueso come más tinta), pero el tiempo
baja: rellenar grueso avanza más rápido por cm² que hacer línea fina de
detalle. El color sube las dos cosas.

De ahí salen la cantidad de cada insumo y el costo total:

```
cantidad_i = tasa_i × área_efectiva × f_trazado × f_color     [base area]
cantidad_i = tasa_i × n_sesiones                              [base sesión]
cantidad_i = tasa_i × horas                                   [base hora]
costo      = Σ ( cantidad_i × costo_unitario_i )
```

### Tiempo y número de sesiones

El tiempo de trabajo se obtiene de un rendimiento base de 30 cm² efectivos por
hora, corregido por los factores de trazo y color. Ese valor se contrastó con
los tiempos que maneja el oficio, convertidos a la misma unidad:

| Pieza | Horas de referencia | Área estimada | Cobertura | cm² efectivos/hora |
|---|---|---|---|---|
| Media manga en negro y gris | ~15 h | ~900 cm² | ~50 % | 30 |
| Manga completa | 30–40 h | ~1.900 cm² | ~60 % | 28–38 |
| Espalda completa | 30–50 h | ~2.475 cm² | ~60 % | 30–50 |
| Pieza de antebrazo | ~4 h | ~150 cm² | ~40 % | 15 |

El rendimiento de 30 cm²/h queda dentro del rango de las piezas medianas y
grandes. Las piezas pequeñas aparentan un rendimiento mucho menor, pero no
porque se tatúe más despacio: es el tiempo fijo de calcar, montar la estación y
limpiar, que no escala con el tamaño. Modelarlo como parte del rendimiento
habría distorsionado las piezas grandes, de modo que se trata aparte, como un
costo fijo por sesión de media hora. Sin él, un diseño de 5×5 cm se estimaba en
dieciocho minutos, cuando solo la preparación toma más que eso.

El número de sesiones se **deduce** en lugar de pedirse. La cotización cubre el
proyecto completo, así que repartir la misma pieza en más citas no la agranda:
preguntar cuántas sesiones habrá invitaba a interpretar que el cálculo se
multiplica por ellas. Se obtiene dividiendo las horas de trabajo por un máximo
práctico de cinco horas de aguja por cita —más allá de eso la piel se irrita y
el rendimiento cae— y el artista puede fijarlo si ya lo acordó con el cliente.
Con ese criterio, una media manga resulta en tres citas y una manga completa en
ocho, que es lo que se observa en la práctica.

Lo único que crece con el número de sesiones son los insumos que se montan en
cada cita y el piso de esterilidad de lo que se desecha al terminar. La tinta
que pide el dibujo es la misma se haga en una sesión o en seis.

**Piso de esterilidad.** Los insumos que escalan con el área (cartuchos, tinta
servida en la copita) son estériles y se desechan al cerrar la sesión: no se
guardan para el cliente siguiente. Por eso nunca se cotiza menos de una unidad
por sesión de esos insumos. Sin ese piso, un lettering pequeño saldría cotizado
en centésimas de cartucho, que no es una cantidad que nadie pueda comprar.

**Calibración.** Todas las constantes anteriores —las tasas de cada insumo, los
factores de trazado y color, y el rendimiento base— son el punto de calibración
con el tatuador experto. Los valores actuales son los de partida; el sistema
los expone como campos editables del inventario precisamente para ajustarlos
con su experiencia, dado que el consumo varía mucho entre estilos.

### Ajuste manual del detalle (HU15)

El resultado del algoritmo es una sugerencia, no una imposición. La vista
permite corregir la cantidad de cualquier línea, eliminarla o agregar un insumo
que el algoritmo no consideró; las líneas tocadas a mano quedan marcadas como
tales y el costo se recalcula en el servidor. Siempre es posible volver a la
sugerencia original.

Las líneas guardan una copia congelada del nombre, la unidad y el costo del
insumo al momento de cotizar: si más adelante sube el precio de la tinta o se
elimina un insumo del inventario, la cotización que ya se le entregó al cliente
no cambia sola.

### Descuento automático de stock (HU16)

Al marcar una sesión como completada, si tiene una cotización asociada el
sistema descuenta del inventario los insumos que esa cotización calculó. Toda
la operación ocurre dentro de una transacción, y la idempotencia se garantiza
sellando la cotización con un `UPDATE` condicionado a que el sello siga vacío:
si la sesión se cierra dos veces —dos clics, dos pestañas—, la segunda
actualización no afecta ninguna fila, la transacción se corta y el stock no se
descuenta de nuevo. El descuento usa `GREATEST(0, …)`, igual que el ajuste
manual, de modo que el inventario nunca queda en negativo.

Como el stock se lleva en unidades enteras, se descuenta la cantidad redondeada
de cada insumo. Los que rinden muchas sesiones —medio rollo de film, un décimo
de pomada— quedan por debajo de media unidad y no se tocan automáticamente: se
ajustan a mano desde el inventario cuando de verdad se acaban, que es como el
artista los controla de todas formas.

Tras el descuento, el sistema informa qué insumos quedaron en nivel crítico, lo
que enlaza directamente con la HU13.

### Aislamiento entre artistas

Las cotizaciones siguen las mismas reglas de propiedad que el resto del
sistema: todas las consultas filtran por el usuario del token, un identificador
ajeno en la URL responde 404 (y no 403, para no revelar que existe) y una
referencia ajena en el cuerpo de la petición responde 400. La clave foránea
solo garantiza que la fila referenciada exista, no que pertenezca al artista,
por lo que la pertenencia de proyecto, boceto y sesión se comprueba
explícitamente antes de guardar.

---

## Sistema de pruebas

Casos evaluados en esta iteración:

**Color (HU14)**
- Verificar que los tonos de una misma tinta se resuelven con esa tinta.
- Verificar que los grises se asignan a la tinta negra.
- Verificar que la tinta blanca nunca se asigna automáticamente.
- Verificar que un color ausente del inventario se reporta y no se cobra.
- Verificar que una tinta que el diseño no usa no recibe área.
- Verificar que los cartuchos no se reparten por color.
- Verificar que una tinta con color pero sin regla de consumo no se reporta
  como faltante.
- Verificar que sin tintas con color declarado el cálculo no cambia.

**Cálculo (HU14)**
- Cotizar un diseño indicando tamaño, trazo y color.
- Verificar que el área efectiva pondera por la cobertura de tinta.
- Verificar que un insumo sin regla de consumo no entra en la cotización.
- Verificar que un diseño pequeño cuesta menos que uno grande.
- Verificar el piso de una unidad por sesión en los insumos estériles.
- Cotizar con medidas fuera de rango.
- Cotizar sin indicar medidas.

**Ajuste del detalle (HU15)**
- Guardar una cotización con su detalle.
- Eliminar una línea y comprobar que el costo se recalcula.
- Modificar la cantidad de una línea y comprobar que queda marcada como ajustada.
- Agregar un insumo que el algoritmo no sugirió.
- Enviar un costo manipulado desde el cliente y comprobar que se ignora.

**Descuento de stock (HU16)**
- Cerrar una sesión cotizada y verificar el descuento en el inventario.
- Cerrar la misma sesión dos veces y verificar que no se descuenta dos veces.
- Verificar que los insumos que no se consumen no se descuentan.
- Verificar el aviso de nivel crítico tras el descuento.
- Intentar modificar una cotización ya consumida.

**Propiedad y acceso**
- Cotizar contra un proyecto de otro artista.
- Consultar una cotización inexistente.
- Acceder a las rutas de cotización sin sesión iniciada.

---

## Retrospectiva

La iteración incorporó una tarea no prevista en la planificación: extender el
inventario con las reglas de consumo (T0002). Al estimar la HU14 se había
supuesto que el costo unitario ya registrado bastaba para calcular, pero el
costo por sí solo no dice cuánto se gasta de cada insumo, que es la mitad del
problema. La estimación de 5 puntos para HU14 resultó, por eso, algo optimista.

La conexión con el módulo de previsualización 3D, que no estaba contemplada,
resolvió el problema de obtener el tamaño real del tatuaje sin pedirle al
artista una medición aparte. Esto fue posible porque el módulo 3D se adelantó a
esta iteración respecto de lo planificado en la Tabla 3.3.

La extracción de color reveló además un defecto en la medición de cobertura: al
basarse solo en la luminancia, un relleno amarillo macizo —que es piel
completamente tatuada, pero clara— se medía con un 22% de cobertura. Se corrigió
incorporando la saturación, de modo que el mismo dibujo relleno en negro o en
amarillo cuesta lo que debe costar.

Conviene dejar constancia de una limitación del análisis de imagen: funciona
sobre bocetos digitales con fondo limpio. Sobre una fotografía de un tatuaje ya
realizado o de un dibujo en papel, el tono de piel y el papel se contabilizan
como si fueran tinta. Por eso tanto la cobertura como el reparto son
sugerencias editables y no valores impuestos.

Queda pendiente calibrar con el tatuador experto las tasas de consumo, los
factores de trazado y color, y los colores de referencia de cada tinta del
inventario, tarea que corresponde a la etapa de evaluación.
