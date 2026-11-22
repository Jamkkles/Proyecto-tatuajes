# Medición de los objetivos de reducción

Tres objetivos específicos de la memoria se miden como un antes y un después.
**La medición ya se hizo**: `planilla-medicion.xlsx` está llena y sus cifras son
las que aparecen en la Sección 5.2.3 de la tesis.

| Objetivo | Indicador | Antes | Después | Reducción | Meta | Estado |
|---|---|---|---|---|---|---|
| Disminuir la inasistencia de los clientes | Tasa de inasistencia | 19,7 % | 7,7 % | −60,9 % | −50 % | Cumple |
| Reducir el tiempo de cálculo de costos y revisión de stock | Minutos por cotización | 11,06 | 6,52 | −41,1 % | −40 % | Cumple |
| Reducir el tiempo de pruebas de tamaño y ubicación | Minutos por prueba | 14,81 | 5,94 | −59,9 % | −30 % | Cumple |

Los tiempos se cronometraron en una sesión con Héctor en noviembre de 2026
(cuatro pares por indicador) y la inasistencia se contó sobre cinco meses de la
agenda anterior (127 citas con resultado) y dos meses de citas en la plataforma
(39 citas). El procedimiento con el que se tomaron es el que sigue.

Se registran en **`planilla-medicion.xlsx`**. Las celdas amarillas se llenan
con lo medido y todo lo demás son fórmulas: promedios, tasas, la reducción y si
alcanza la meta. La hoja **Resumen** se llena sola, y lo que diga va a la
memoria tal cual, se cumpla la meta o no.

La planilla se genera con `node backend/medicion/planilla.js`. Volver a
generarla la deja **vacía**, y la que está en esta carpeta ya tiene los datos
de la medición: **no regenerarla encima**.

Las Figuras 5.4 a 5.7 de la memoria son estas mismas hojas: se dibujan desde el
.xlsx y se capturan con `node backend/medicion/capturas.js`, que deja los PNG en
`tesis/imagenes/`. Si se corrige un dato de la planilla hay que volver a
correrlo y recompilar la memoria.

### Planilla de ejemplo

**`planilla-ejemplo.xlsx`** es la misma planilla llena con **datos inventados**,
para ver cómo queda completa y cómo se llena antes de la sesión real. Cada hoja
lo dice en su título («EJEMPLO CON DATOS INVENTADOS»). **No es una medición y
sus cifras no van a la memoria**: las de la memoria salen solo de
`planilla-medicion.xlsx`, que es la que se llenó con Héctor. Se genera con
`node backend/medicion/planilla.js --ejemplo`.

## Tiempos: sesión cronometrada con el cliente experto

Una sesión de una a dos horas con Héctor, sobre la plataforma desplegada.

**Antes de la sesión**
- Elegir 8 diseños para cotizar y 8 para previsualizar, en **4 pares** de
  diseños parecidos (tamaño, negro o color, zona del cuerpo). Anotarlos en la
  planilla.
- Para la cotización con la plataforma, dejar creado el proyecto de cada diseño
  con su boceto y su medida; para la manual, tener a mano lo que Héctor usa hoy
  (calculadora, lista de precios de insumos, el inventario físico).
- Para el stencil: impresora, papel transfer y alguien sobre quien probar.

**Durante la sesión**
- Cada par se hace **una vez con cada método, sobre diseños distintos pero
  comparables**. Si se cotizara dos veces el mismo diseño, la segunda vez saldría
  más rápida solo porque ya se pensó: se estaría midiendo la memoria, no la
  herramienta.
- El orden ya viene **alternado** en la planilla (columna «Orden»): en los pares
  1 y 3 va primero el método de antes, en los 2 y 4 la plataforma. Así el
  cansancio o el calentamiento no favorecen siempre al mismo método.
- Se cronometra con el teléfono y se anotan minutos y segundos. Quien
  cronometra **no ayuda ni comenta**.
- Si algo ajeno interrumpe una tarea, se anota en Observaciones y se repite.

**Qué se cronometra**
- *Cotización*: desde que Héctor tiene el diseño y su tamaño hasta que tiene el
  costo de los insumos y sabe si le alcanza el stock.
- *Previsualización*: desde que se decide probar el diseño en una zona hasta que
  Héctor da por buenos el tamaño y la ubicación. Con stencil incluye imprimir,
  recortar, colocar y reimprimir si el tamaño no sirve.

## Inasistencia: agenda anterior y plataforma

La inasistencia no se mide en una sesión: se cuenta en el tiempo.

- **Inasistencia** = cita a la que el cliente no llegó sin avisar. Una
  cancelación avisada no cuenta.
- **Citas con resultado** = atendidas + inasistencias (sin las canceladas).
- **Antes**: mes a mes, en el cuaderno, la agenda o los mensajes de Instagram de
  Héctor, al menos los **3 meses** previos a usar la plataforma.
- **Después**: las citas registradas en la plataforma, al menos **1 mes** de uso.
  Cada cita pasada tiene que quedar marcada como «completada» o «no asistió»: las
  que siguen en «agendada» no tienen resultado y no se pueden contar.

Consulta de solo lectura que da el «después» mes a mes (cambiar el correo por el
de la cuenta de Héctor):

```sql
SELECT to_char(ps.starts_at AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS mes,
       count(*) FILTER (WHERE ps.status IN ('completada', 'no_asistio')) AS citas_con_resultado,
       count(*) FILTER (WHERE ps.status = 'no_asistio')                  AS inasistencias,
       count(*) FILTER (WHERE ps.status = 'agendada')                    AS sin_marcar
FROM project_sessions ps
JOIN users u ON u.id = ps.user_id
WHERE u.email = 'correo-de-hector@ejemplo.cl'
  AND ps.starts_at < now()
GROUP BY 1
ORDER BY 1;
```

Si `sin_marcar` no es cero, esas citas se marcan en la plataforma antes de
contar.

## Por qué así y no con una encuesta

La encuesta original preguntaba a Héctor sus tiempos promedio. Eso es un dato
**declarado**: depende de cómo los recuerde. Cronometrar las dos formas de
trabajar en la misma sesión, y contar las citas en registros, da un dato
**medido**, que es lo que una comisión puede revisar.

Hay que decirlo también: es la medición de **un solo tatuador** y de pocas
tareas. Muestra el efecto en el estudio para el que se construyó la plataforma,
no un promedio de la industria.
