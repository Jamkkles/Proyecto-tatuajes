# Calidad de código

Qué se midió, con qué herramienta, qué salió y cómo explicarlo. El informe
visual está en `index.html` (se abre con doble clic) y las imágenes en
`imagenes/`.

Hay además **dos PDF** con las mismas cifras y distinto destinatario:

| Archivo | Para qué | Tono |
|---|---|---|
| `informe-calidad.pdf` (11 pág.) | Estudiar y mostrar en pantalla | Directo, en primera persona. Lleva glosario y las preguntas probables de la defensa con su respuesta |
| `informe-evaluacion.pdf` (16 pág.) | **Entregar al profesor** | Formal e impersonal, con portada de la Universidad. Objetivo, metodología, resultados, discusión, limitaciones y conclusiones, ordenado sobre las características de la norma ISO/IEC 25010 |

Los dos leen los mismos `metricas.json` y `resultados.json` que la página, así
que ninguno puede desfasarse del otro ni de ella. No se solapan: el primero
explica, el segundo acredita.

## La idea de fondo

«Calidad de código» no es que el programa funcione: eso se demuestra usándolo.
Es que el código **se pueda revisar, cambiar y mantener sin romperlo**, y que no
esconda problemas que todavía no se manifiestan.

Como es una afirmación fácil de hacer y difícil de sostener, aquí no se afirma:
se mide. Cada cifra del informe sale de ejecutar una herramienta sobre el código
tal como está en el repositorio, y cualquiera puede volver a correrla.

## Las cinco dimensiones que se midieron

### 1. Pruebas automatizadas — Jest y Supertest

**783 pruebas en 44 archivos, todas aprobadas.** Son programas que usan el
sistema y comprueban que haga lo que debe. Se dividen en dos tipos:

- **Unitarias (672)**: prueban una pieza aislada. Lo que esa pieza necesita de
  sus vecinas se reemplaza por un *doble*, un sustituto que devuelve lo que la
  prueba indique. Corren en segundos y, cuando fallan, señalan exactamente la
  pieza rota.
- **De integración (111)**: prueban varias piezas reales funcionando juntas,
  contra un PostgreSQL de verdad. Son las únicas capaces de demostrar lo que
  depende del motor de base de datos: que diez peticiones simultáneas pidiendo
  la misma hora dejan **una sola** cita, que el stock no queda negativo, que una
  cotización no se descuenta dos veces.

Hay **1,3 líneas de prueba por cada línea de backend**, que es una proporción
alta y deliberada.

### 2. Cobertura de código — Istanbul

**95,53 % de las sentencias y 97,22 % de las líneas.** Mientras las pruebas
corren, la herramienta anota por dónde pasó la ejecución; la cobertura es el
porcentaje del código que llegó a ejecutarse. Las otras dos métricas que informa
son funciones (91,26 %) y ramas (85,68 %), esta última más exigente porque
cuenta cada salida de cada decisión por separado.

Importa saber **qué no mide**: dice qué se ejecutó, no si se comprobó bien. Una
prueba sin verificaciones sube la cobertura igual que una rigurosa. El detalle
completo está en `docs/cobertura/`.

### 3. Análisis estático — ESLint y TypeScript

**0 errores y 0 advertencias** en los 205 archivos revisados. Esta revisión lee
el código sin ejecutarlo y encuentra una familia de problemas distinta a la de
las pruebas: variables que no existen, código inalcanzable, promesas mal usadas,
tipos que no calzan.

- **ESLint** sobre el backend (141 archivos) y el frontend (64).
- **El compilador de TypeScript** sobre todo el frontend, sin un solo error de
  tipos.

La configuración del backend parte de las reglas recomendadas y **deja fuera las
de formato**: dónde van las comillas o los espacios no aporta a la calidad y
solo genera ruido.

### 4. Seguridad de las dependencias — npm audit

Un proyecto moderno es, en buena parte, código de terceros. Esta revisión
compara las versiones instaladas contra la base pública de vulnerabilidades
conocidas.

| | Antes | Después |
|---|---:|---:|
| Backend, dependencias de producción | 8 (1 crítica, 5 altas) | **1** |
| Frontend, todas | 19 | **0** |

La que queda es de severidad alta en la biblioteca de correo y exige un cambio
de versión mayor. Vale decir que **en la nube esa biblioteca no se usa**: el
correo sale por la interfaz HTTPS del proveedor, porque el alojamiento gratuito
bloquea los puertos de correo.

Después de aplicar las correcciones se volvió a ejecutar todo: las 783 pruebas
siguen pasando, los tipos siguen limpios y la aplicación sigue compilando. Esa
comprobación es justamente para lo que sirve tener pruebas.

### 5. Tamaño, documentación y deuda — recuento sobre el código

**24.114 líneas de código en 192 archivos, con 3.540 líneas de comentario** (uno
de cada ocho renglones). La proporción no es casual: los comentarios de este
proyecto no repiten lo que el código ya dice, explican **por qué** está hecho
así y qué se intentó antes.

Y **0 marcas de trabajo pendiente** (`TODO`, `FIXME`) en todo el código fuente.
Lo que quedó sin hacer está documentado en la memoria con su razón, no
abandonado como un comentario suelto.

## Qué se encontró y se corrigió al medir

Medir sirve cuando cambia algo. En esta pasada:

1. **8 vulnerabilidades en dependencias de producción del backend**, una de
   ellas crítica. Se corrigieron todas menos una.
2. **19 vulnerabilidades en el frontend.** Se corrigieron todas.
3. **El backend no tenía análisis estático.** Se agregó ESLint con su
   configuración, y las tres observaciones que levantó se arreglaron.

## Lo que queda pendiente, dicho de frente

- La **cobertura de ramas** (85,68 %) es la que va más atrás. Cerrarla exige
  recorrer bifurcaciones del canal de WhatsApp vinculado que solo ocurren contra
  un socket real.
- **El frontend no tiene pruebas automatizadas.** Se verifica con el compilador
  de tipos, con ESLint y con los 35 casos funcionales que lo recorren de punta a
  punta, pero no tiene una batería propia.
- **Una vulnerabilidad** de la biblioteca de correo, que necesita un cambio de
  versión mayor.

## Cómo repetir las medidas

```bash
node backend/calidad/medir.js     # llama a cada herramienta y deja metricas.json
node backend/calidad/informe.js   # arma index.html y las imágenes
node backend/calidad/pdf.js       # arma informe-calidad.pdf (para estudiar)
node backend/calidad/evaluacion.js  # arma informe-evaluacion.pdf (para el profesor)
```

La primera llama a Jest, ESLint, TypeScript y npm audit **dentro de los
contenedores** —en el host se cuelgan leyendo `node_modules` desde la carpeta
sincronizada— y escribe los datos crudos en `metricas.json`. La segunda arma la
página y los gráficos a partir de ese archivo. Las dos últimas arman cada PDF:
imprimen su propio HTML con Chrome en modo headless (`imprimir.js`, compartido;
sin dependencias nuevas, usa el `ws` que ya está en el backend) y necesitan
además `docs/pruebas-estres/resultados.json` para el capítulo de carga. Si el
PDF está abierto en un visor, Windows impide sobrescribirlo y el script falla
con `EBUSY`: hay que cerrarlo antes.

## Para explicarlo en un minuto

> La calidad del código la medí con herramientas, no con opiniones. Hay 783
> pruebas automatizadas que cubren el 95,5 % del código del backend, y 111 de
> ellas corren contra una base de datos real para comprobar lo que solo se
> rompe bajo concurrencia, como que dos personas no puedan agendar la misma
> hora. El análisis estático —ESLint y el compilador de TypeScript— no reporta
> un solo problema en 205 archivos. Revisé las dependencias contra la base de
> vulnerabilidades conocidas: encontré 27 y corregí 26; la que queda no se usa
> en la nube. Y después de cada corrección volví a correr las 783 pruebas para
> comprobar que no se rompiera nada, que es exactamente para lo que sirve
> tenerlas.

## Las imágenes de esta carpeta

| Archivo | Qué muestra |
|---|---|
| `informe-completo.png` | El informe entero, de principio a fin |
| `informe-resumen.png` | El encabezado con las seis cifras principales |
| `cobertura-por-capa.png` | Cobertura de cada capa, con la línea del 95 % |
| `tamano-del-codigo.png` | Líneas de código y de comentario por parte del proyecto |
