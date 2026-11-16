# Cobertura de código

Qué es, qué se midió en este proyecto, con qué herramienta y para qué sirve.
Las imágenes de esta carpeta son la evidencia de la última medición.

## Qué es la cobertura, en simple

Cuando las pruebas automáticas se ejecutan, recorren el programa: entran a unas
funciones, ejecutan unas líneas y dejan otras sin tocar. La cobertura es
**el porcentaje del código que las pruebas llegaron a ejecutar**.

La imagen mental es la de pintar el piso por donde caminas: al terminar, lo
pintado es lo que probaste y lo que quedó sin pintar es código que nadie puso a
funcionar ni una sola vez.

## Qué mide exactamente

La herramienta informa cuatro cifras, de la más fácil de alcanzar a la más
exigente:

| Métrica | Qué cuenta | Resultado |
|---|---|---|
| **Líneas** | Líneas del archivo que se ejecutaron | **97,22 %** (2.596 de 2.670) |
| **Sentencias** | Instrucciones ejecutadas (una línea puede tener varias) | **95,53 %** (2.866 de 3.000) |
| **Funciones** | Funciones que alguien llegó a llamar | **91,26 %** (460 de 504) |
| **Ramas** | Cada salida de una decisión, por separado | **85,68 %** (1.479 de 1.726) |

Son **cuatro medidas distintas del mismo recorrido**, no cuatro partes de un
promedio: cada una cuenta algo diferente y por eso dan números distintos. Cuando
se dice que el proyecto alcanzó el 95 %, se habla de las sentencias (95,53 %) y
las líneas (97,22 %), que son las que se informan habitualmente. Las de
funciones y ramas se publican igual, aunque una de ellas no llegue a la meta.

La de **ramas** es la más dura y conviene entender por qué. Un `if` tiene dos
salidas: la que se cumple y la que no. Si la prueba solo recorre una, la línea
queda cubierta pero la rama no. Una condición con tres causas posibles necesita
tres pruebas distintas aunque sea una sola línea de código. Por eso esa cifra
siempre va por detrás de las otras.

## Lo que la cobertura NO mide

Esto es lo más importante y lo que más se malentiende: **la cobertura dice qué
se ejecutó, no si se comprobó que estuviera bien**. Una prueba que llama a una
función y no verifica nada sube la cobertura igual que una que revisa el
resultado con cuidado.

Dicho de otra forma: una cobertura alta no demuestra que el sistema funcione,
demuestra que no hay código que nadie haya probado nunca. Lo otro —que las
pruebas comprueben lo correcto— lo sostienen los 35 casos funcionales y las
decisiones que documenta cada iteración de la memoria.

## Dónde se mide: solo el backend

Conviene dejarlo claro porque es una limitación real: **la cobertura es del
backend** (`backend/src`), que es donde están las reglas del sistema —quién ve
qué datos, cuándo una hora está ocupada, cuánto cuesta un tatuaje, cuándo sale
un recordatorio—. Son 3.000 sentencias repartidas en controladores, modelos,
servicios, rutas, middleware y utilidades.

**El frontend no tiene pruebas automatizadas** y por lo tanto no tiene
cobertura. Lo que sí se le pasa antes de cada entrega son dos revisiones que no
ejecutan el código: el compilador de TypeScript, que comprueba los tipos de todo
el proyecto, y ESLint. Las dos salen limpias, pero no sustituyen a una prueba:
dicen que el código está bien escrito, no que la pantalla haga lo que debe.

## Con qué se mide

- **Jest** ejecuta las pruebas; **Istanbul**, que viene incorporado, es quien va
  anotando por dónde pasó la ejecución y arma el informe.
- Se corre **dentro del contenedor de Docker**, porque en el host la carpeta
  sincronizada con iCloud deja colgado el proceso.
- Quedan **fuera del cálculo los scripts de consola** de `src/db` (`db:init`,
  `admin:create` y los de mantenimiento): se ejecutan a mano cuando hace falta y
  no forman parte del servicio en marcha. La exclusión está declarada en
  `backend/jest.config.js`, no es un descuento improvisado.

```bash
docker exec proyecto-tatuajes-backend-1 npx jest --runInBand --coverage
```

El informe navegable queda en `backend/coverage/index.html`.

## Qué se hizo en este proyecto

Las 783 pruebas están repartidas en dos baterías que corren juntas:

- **Unitarias** (672, en 39 archivos): prueban una pieza **aislada del resto**.
  Lo que esa pieza necesita de sus vecinas se reemplaza por un *doble*: un
  sustituto que devuelve lo que la prueba le indique. Así se puede comprobar,
  por ejemplo, que una ruta responde 409 cuando el modelo avisa que la hora
  choca, sin que exista ninguna base de datos. Corren en segundos y no dependen
  de nada levantado.
- **De integración** (111, en 5 archivos): prueban **varias piezas reales
  trabajando juntas**. Aquí los modelos corren contra un **PostgreSQL de
  verdad**, en una base aparte que la propia corrida crea, llena y vacía entre
  pruebas. Son las únicas que pueden demostrar lo que depende del motor de base
  de datos: que diez peticiones simultáneas pidiendo la misma hora dejan una
  sola cita, que el stock nunca queda negativo o que una cotización no se
  descuenta dos veces.

La diferencia, en una frase: las unitarias prueban cada pieza del motor en el
banco; las de integración arman el motor y lo encienden. Las primeras dicen con
precisión dónde está la falla; las segundas son las que descubren los problemas
que solo aparecen cuando todo funciona junto.

La medición pasó por tres etapas, y el recorrido explica mejor el número final
que el número solo:

| Momento | Sentencias | Qué cambió |
|---|---:|---|
| Primera medición | 67,2 % | Las consultas SQL estaban sustituidas por dobles: esa capa nunca se ejecutaba y quedaba en 22 % |
| Tras la batería de integración | 90,6 % | Las 111 pruebas contra la base real llevaron la capa de modelos a 96,7 % |
| Estado actual | **95,5 %** | Se cubrieron los caminos de error de los controladores, el programador de recordatorios y el envío de correo por SMTP |

Por capa, hoy: rutas y datos al 100 %, almacenamiento 97,0 %, modelos 96,7 %,
servicios 96,0 %, utilidades 96,0 %, controladores 95,9 %, configuración y
middleware 95,2 %. La única bajo 95 % es la del WhatsApp vinculado (89,6 %),
porque lo que ahí no se ejecuta son los caminos que solo ocurren contra un
socket real de WhatsApp, y simularlos con un doble no probaría gran cosa.

## Para qué sirve

1. **Encuentra código que nadie probó.** Es su uso más honesto: en este proyecto
   destapó que toda la capa de consultas SQL —la que decide quién ve qué datos—
   no se ejecutaba en ninguna prueba.
2. **Permite cambiar cosas sin miedo.** Con 783 pruebas corriendo en menos de un
   minuto, quien toque el código después sabe en el acto si rompió otra cosa.
3. **Era un objetivo comprometido.** El Capítulo 1 de la memoria se fijó una
   cobertura de al menos 95 %, y el Capítulo 5 reporta las cuatro métricas, no
   solo la que conviene.

## Las imágenes de esta carpeta

| Archivo | Qué muestra |
|---|---|
| `informe-cobertura.png` | El informe por capa que genera la herramienta, con los totales y la fecha de la medición |
| `resumen-cobertura.png` | Las cuatro métricas tal como salen en la consola |
| `ejecucion-pruebas.png` | La corrida completa: 44 archivos y 783 pruebas, todas aprobadas |

Para rehacerlas basta volver a correr la cobertura y capturar
`backend/coverage/index.html`.
