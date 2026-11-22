# Medición de los objetivos de reducción

Tres objetivos específicos de la memoria se miden como un antes y un después:

| Objetivo | Indicador | Meta |
|---|---|---|
| Disminuir la inasistencia de los clientes | Tasa de inasistencia | −50 % |
| Reducir el tiempo de cálculo de costos y revisión de stock | Minutos por cotización | −40 % |
| Reducir el tiempo de pruebas de tamaño y ubicación | Minutos por prueba | −30 % |

Se registran en **`planilla-medicion.xlsx`**. Las celdas amarillas se llenan
con lo medido y todo lo demás son fórmulas: promedios, tasas, la reducción y si
alcanza la meta. La hoja **Resumen** se llena sola, y lo que diga va a la
memoria tal cual, se cumpla la meta o no.

La planilla se genera con `node backend/medicion/planilla.js`. Volver a
generarla la deja **vacía**: después de la sesión, la planilla con datos se
guarda aparte y no se regenera encima.

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
