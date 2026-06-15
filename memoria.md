## **UNIVERSIDAD DE TALCA** FACULTAD DE INGENIER[´] IA ESCUELA DE INGENIER[´] IA CIVIL EN COMPUTACION[´] 

## **Plataforma web la para gesti´on integral y asistencia de dise˜no en estudios de tatuaje** 

## **PABLO NICOLAS[´] CORREA MELLA** 

Profesor Gu´ıa: FRANCISCO ARIAS 

Memoria para optar al t´ıtulo de Ingeniero Civil en Computaci´on 

– Curic´o Chile mes: Mayo, a˜no: 2026 

## **UNIVERSIDAD DE TALCA** FACULTAD DE INGENIER[´] IA ESCUELA DE INGENIER[´] IA CIVIL EN COMPUTACION[´] 

## **Plataforma web la para gesti´on integral y asistencia de dise˜no en estudios de tatuaje** 

## **PABLO NICOLAS[´] CORREA MELLA** 

Profesor Gu´ıa: FRANCISCO ARIAS 

Profesor Informante: 

Profesor Informante: 

Memoria para optar al t´ıtulo de Ingeniero Civil en Computaci´on 

El presente documento fue calificado con nota: 

– Curic´o Chile mes: Mayo, a˜no: 2026 

_Dedicado a ..._ 

i 

## **AGRADECIMIENTOS** 

Agradecimientos ... 

ii 

## **TABLA DE CONTENIDOS** 

|p´agina|p´agina|
|---|---|
|**Dedicatoria**|**I**|
|**Agradecimientos**|**II**|
|**Tabla de Contenidos**|**III**|
|**´Indice de Figuras**|**VI**|
|**´Indice de Tablas**|**VII**|
|**Resumen**|**VIII**|
|**1. Introducci´on**|**9**|
|1.1. Contexto . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|9|
|1.1.1.<br>Descripci´on del problema . . . . . . . . . . . . . . . . . . . . .|10|
|1.1.2.<br>Propuesta de soluci´on<br>. . . . . . . . . . . . . . . . . . . . . .|12|
|1.2. Objetivos<br>. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|14|
|1.2.1.<br>Objetivo general: . . . . . . . . . . . . . . . . . . . . . . . . .|14|
|1.2.2.<br>Objetivos espec´ıfcos: . . . . . . . . . . . . . . . . . . . . . . .|14|
|1.3. Alcances . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|15|
|1.4. Plan de trabajo . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|16|
|1.4.1.<br>Descripci´on de etapas del proyecto<br>. . . . . . . . . . . . . . .|16|
|1.4.2.<br>Tareas para objetivos espec´ıfcos . . . . . . . . . . . . . . . . .|17|
|1.5. Resumen del cap´ıtulo . . . . . . . . . . . . . . . . . . . . . . . . . . .|18|
|**2. Marco Te´orico**|**19**|
|2.1. Conceptos b´asicos . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|19|
|2.1.1.<br>Conceptos globales . . . . . . . . . . . . . . . . . . . . . . . .|19|
|2.1.2.<br>Conceptos de software<br>. . . . . . . . . . . . . . . . . . . . . .|20|
|2.2. Tecnolog´ıas<br>. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|20|
|2.2.1.<br>Servidor Web . . . . . . . . . . . . . . . . . . . . . . . . . . .|21|
|2.2.2.<br>Fronted<br>. . . . . . . . . . . . . . . . . . . . . . . . . . . . . .|21|



iii 

iv 

|2.2.3.|Backend . . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|21|
|---|---|---|---|
|2.2.4.|Sistema gestor de base de datos (SGBD) . . . . . . . . . . . .||21|
|2.2.5.|Servicio de correos|. . . . . . . . . . . . . . . . . . . . . . . .|21|
|2.2.6.|Despliegue de aplicaciones . . . . . . . . . . . . . . . . . . . .||21|
|2.2.7.|Herramienta para repositorio GithHub . . . . . . . . . . . . .||21|
|2.2.8.|Sistema gestor de proyectos<br>. . . . . . . . . . . . . . . . . . .||21|
|2.3. Estado|del arte . . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|21|
|2.4. Metodolog´ıas<br>. . . . . .||. . . . . . . . . . . . . . . . . . . . . . . . .|24|
|2.4.1.|Metodolog´ıas de desarrollo . . . . . . . . . . . . . . . . . . . .||24|
|2.4.2.|Metodolog´ıas de evaluaci´on del proyecto<br>. . . . . . . . . . . .||26|
|2.5. Resumen cap´ıtulo . . . .||. . . . . . . . . . . . . . . . . . . . . . . . .|28|
|**3. Metodolog´ıas**|||**30**|
|3.1. Personal Extreme Programming (PXP) . . . . . . . . . . . . . . . . .|||30|
|3.1.1.|requerimientos . .|. . . . . . . . . . . . . . . . . . . . . . . . .|30|
|3.1.2.|Planifcaci´on . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|30|
|3.1.3.|Iteraci´on . . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|35|
|3.2. Evaluaci´on . . . . . . . .||. . . . . . . . . . . . . . . . . . . . . . . . .|36|
|3.2.1.|Prueba de caja negra . . . . . . . . . . . . . . . . . . . . . . .||36|
|3.2.2.|Prueba de usabilidad . . . . . . . . . . . . . . . . . . . . . . .||36|
|3.2.3.|Encuesta . . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|36|
|3.3. Resultados esperados . .||. . . . . . . . . . . . . . . . . . . . . . . . .|36|
|3.4. Resumenn cap´ıtulo . . .||. . . . . . . . . . . . . . . . . . . . . . . . .|36|
|**4. Desarrollo**|||**37**|
|4.1. Dise˜no|de software<br>. . .|. . . . . . . . . . . . . . . . . . . . . . . . .|37|
|4.1.1.|Arquitectura f´ısica|. . . . . . . . . . . . . . . . . . . . . . . .|37|
|4.1.2.|Arquitectura l´ogica . . . . . . . . . . . . . . . . . . . . . . . .||39|
|4.1.3.|Modelo de datos|. . . . . . . . . . . . . . . . . . . . . . . . .|39|
|4.1.4.|Mockups . . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|39|
|4.2. iteraciones . . . . . . . .||. . . . . . . . . . . . . . . . . . . . . . . . .|39|
|4.2.1.|Iteraci´on 1 . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|39|
|4.2.2.|Iteraci´on 2 . . . .|. . . . . . . . . . . . . . . . . . . . . . . . .|39|
|**Glosario**|||**40**|



v 

|**Anexos**|**Anexos**||||**41**|
|---|---|---|---|---|---|
|**A:**|**El **|**Primer Anexo**|||**42**|
||A.1.|La primera|secci´on del primer anexo|. . . . . . . . . . . . . . . . . .|42|
||A.2.|La segunda|secci´on del primer anexo|. . . . . . . . . . . . . . . . . .|42|
|||A.2.1. La primera subsecci´on de la segunda secci´on del primer anexo|||42|
|**B:**|**El **|**segundo Anexo**|||**43**|
||B.1.|La primera|secci´on del segundo anexo . . . . . . . . . . . . . . . . . .||43|
||B.2.|Bibliograf´ıa|. . . . . . . . . . . . . .|. . . . . . . . . . . . . . . . . .|43|
|**Bibliograf´ıa**|||||**44**|



## **´INDICE DE FIGURAS** 

||p´agina|p´agina|
|---|---|---|
|1.1.|Modelo del proceso de negocio de un estudio de tatuajes (BPMN) . .|12|
|2.1.|Fases de metodolog´ıa Personal Extreme Programming (PXP) . . . . .|26|
|2.2.|Proceso de Prueba de Caja Blanca<br>. . . . . . . . . . . . . . . . . . .|27|
|2.3.|Proceso de Prueba de Caja Negra . . . . . . . . . . . . . . . . . . . .|27|
|4.1.|Proceso de Prueba de Caja Negra . . . . . . . . . . . . . . . . . . . .|38|



vi 

## **´INDICE DE TABLAS** 

||p´agina|p´agina|
|---|---|---|
|2.1.|An´alisis comparativo de funcionalidades por software . . . . . . . . .|23|
|3.1.|Historias de Usuario<br>. . . . . . . . . . . . . . . . . . . . . . . . . . .|31|
|3.2.|Priorizaci´on y estimaci´on de esfuerzo para cada historia de usuario . .|34|
|3.3.|Asignaci´on de historias de usuario a iteraciones<br>. . . . . . . . . . . .|35|



vii 

## **RESUMEN** 

En la actualidad, el flujo de trabajo de los tatuadores presenta una alta fragmentaci´on tecnol´ogica, lo que hace hace que los profesionales dividan sus tareas administativas y art´ısticas en m´ultiples sistemas no integados. La falta de herramientas unificadas genera ineficiencias a la hora de trabajar, ya sea adecuando el tatuaje en una zona establecida del cuerpo, en p´erdidas de tiempo en el c´alculo de presupuestos y problemas gestionando las citas con los clientes. 

El proyecto propone el dise˜no y construcci´on de una plataforma web integral que unifica el flujo de trabajo del estudio de tatuajes. El sistema incorpora m´odulos de almacenamiento en la nube para bocetos, previsualizaci´on 3D sobre modelos anot´omicos, gesti´on de inventario con cotizaciones automatizadas, y un agendador de citas integrando una API de mensajer´ıa para los recordatorios. 

Desde un an´alisis cr´ıtico, la soluci´on posee factibilidad t´ecnica, operativa y econ´omica. Al utilizar tecnolog´ıas web y librer´ıas de c´odigo abierto, el sistema elimina la dependencia de licencias costosas y no requiere hardware especializado. Tambi´en teniendo en cuenta que se cuenta con la ayuda de un tatuador experto que ayuda en el proceso de captura de requerimientos y pruebas del sistema en cada iteraci´on a trav´es de su retroalimentaci´on. 

Como proyecci´on de impacto, es un producto m´ınimo viable (MVP) que optimiza el modelo de negocio, con un objetivo de disminuci´on de ausentismo de clientes, reducci´on de tiempo administrativo en c´alculos de costos e inventario y una disminuci´on de tiempo invertido en pruebas de dise˜no sobre la piel. 

viii 

## **1. Introducci´on** 

La digitalizaci´on y el desarrollo de software han comenzado a transformar el funcionamiento de las disciplinas creativas, abriendo nuevas oportunidades de optimizaci´on para el rubro del arte corporal. El dise˜no e implementaci´on de plataformas a la medida permite a los artistas modernos modernizar sus flujos de trabajo tradicionales, logrando un equilibrio eficiente entre la gesti´on administrativa del estudio y la ejecuci´on de su obra. 

El presente cap´ıtulo tiene como prop´osito describir las bases que fundamentan que el trabajo realizado en esta memoria de t´ıtulo. Para ello, se expone inicialmente el contexto de crecimiento del rubro del tatuaje, seguido de la descripci´on detallada de la problem´atica detectada a nivel operativo y administrativo. Posteriormente, se define la propuesta de soluci´on tecnol´ogica, sus objetivos, los alcances que delimitan el desarrollo y, finalmente, el plan de trabajo estructurado para su ejecuci´on. 

## **1.1. Contexto** 

El presente marco te´orico establece los fundamentos hist´oricos, comerciales y socioculturales que respaldan el desarrollo de la plataforma. Para comprender la envergadura y necesidad de este proyecto, es necesario analizar la evoluci´on del rubro del tatuaje, partiendo desde sus or´ıgenes hasta consolidarse como una industria global, para luego conectar estas m´etricas en la realidad nacional y local. 

El tatuaje forma parte de la historia del ser humano, siendo la evidencia m´as antigua el hallazgo de los restos momificados del cazador neol´ıtico conocido como “[¨] Otzi”, datados hace m´as de 5.300 a˜nos . En civilizaciones antiguas, como la egipcia, romana y maya, la inserci´on de pigmentos bajo la epidermis cumpl´ıa funciones 

9 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

10 

estrictamente identitarias, indicando estatus o linaje, y en otros casos, marcando a prisioneros y esclavos [1]. Si bien durante gran parte de la historia occidental moderna el tatuaje estuvo estigmatizado y relegado a la criminalidad, a partir del siglo XX y XXI ha experimentado una resignificaci´on profunda. En la actualidad, ha superado el estigma social para consolidarse como una expresi´on art´ıstica leg´ıtima y un medio de afirmaci´on de la identidad y la subjetividad personal [2]. 

En la actualidad, la industria del arte corporal es uno de los mercados de m´as r´apido y constante crecimiento en el mundo. Seg´un estimaciones globales, la industria alcanz´o un valor aproximado de 2.420 millones de d´olares en el a˜no 2025, y se proyecta que ascienda a 6.220 millones de d´olares para el a˜no 2035, exhibiendo una Tasa de Crecimiento Anual Compuesta (CAGR) del 9,9 % [3]. Este crecimiento exponencial est´a directamente impulsado por la creciente aceptaci´on social de las modificaciones corporales, el cambio demogr´afico liderado por las generaciones “Millennials” y “Gen Z”, y un mayor poder adquisitivo destinado a la autoexpresi´on [3]. 

Esta tendencia global tambi´en se encuentra en el panorama chileno. Un estudio estad´ıstico realizado por la consultora GfK Adimark evidenci´o que el 17 % de los chilenos mayores de 15 a˜nos posee al menos un tatuaje. Dicha cifra experimenta un alza dram´atica al observar el segmento de adultos j´ovenes (entre 25 y 34 a˜nos), donde el 38 % de la poblaci´on se encuentra tatuada. En la ´ultima d´ecada, la demanda en el pa´ıs ha crecido de manera exponencial, posicionando el nivel t´ecnico y art´ıstico del tatuaje en Chile a la par de los mercados europeos y norteamericanos[4]. 

En un contexto local, la ciudad de Curic´o no ha quedado ajenas a esta explosi´on de demanda. El aumento sostenido de clientes ha propiciado la apertura de nuevos estudios y el establecimiento de artistas independientes en la zona que buscan ganarse un puesto en el mercado local. Por consiguiente, el desarrollo de este proyecto cobra una relevancia para el apoyo a este dinamismo local. Al dotar a los artistas de Curic´o con herramientas tecnol´ogicas, se busca potenciar su capacidad y facilitar su consolidaci´on en un mercado en plena expansi´on. 

## **1.1.1. Descripci´on del problema** 

Actualmente el trabajo de los tatuadores se encuentra muy fragmentando por las diferentes herramientas tecnol´ogicas que se pueden utilizar al momento de realizar 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

11 

su trabajo, ya sea en el ´ambito operativo como en lo art´ıstico. El hecho de dividir sus labores crea dificultades para optimizar sus tareas de una forma limpia e integra. 

A continuaci´on se detallan las problem´aticas operativas y administrativas, las cuales fueron analizadas y planteadas por H´ector Salazar Moya quien es un tatuador profesional de Curic´o. 

En el ´ambito operativo, uno de los mayores problemas ser´ıa la previsualizaci´on del tatuaje en una zona concreta del cuerpo. Actualmente para visualizar como quedar´ıa un boceto de un tatuaje se ocupa un elemento llamado “stencil”, que es una gu´ıa en papel hectogr´afico que transfiere el dise˜no del papel a la piel del boceto original. El problema surge que este papel es un material que se desecha una vez utilizado, esto quiere decir que si el tatuador se equivoca en la posici´on que coloca el stencil tendr´ıa que repetirse de nuevo el proceso y ocupar material extra. Incluso muchas veces son los mismos clientes que cambian de opini´on con respecto a la posici´on que les gustar´ıa tener su tatuaje, y el hecho de que el tatuador pueda previsualizar el boceto en cualquier parte del cuerpo que considere el lugar m´as apropiado, le facilitar´ıa sus decisiones art´ısticas y no tendr´ıa los problemas antes mencionados. 

Con respecto al ´ambito admnistrativo, es posible mencionar m´as problem´aticas que viven los tatuadores para la gesti´on de su negocio. Para comenzar el agendamiento de las citas es uno de los principales problemas, debido a que no existe una herramienta dedicada para los tatuadores, lo que hace que la gesti´on de citas sea poco personalizable y haya problemas en la estructuraci´on de tiempos del profesional. En relaci´on a las citas, tambi´en hay problemas con los recordatorios hacia los clientes, debido a que muchos de ellos no se presentan a la hora adecuada o simplemente se olvidan de su cita el d´ıa acordado, debido a que es el tatuador el que tiene que recordar a sus clientes de forma manual el d´ıa antes de la sesi´on, por lo que al tener m´ultiples clientes esta acci´on se puede ver afectada por parte del tatuador. 

Otro de los problemas es analizar correctamente el coste los tatuajes, si bien este precio se ve influnciado gran parte por el valor que le quiera dar el artista, analizar su costo real a partir de los materiales utilizados y el tiempo invertido en las sesiones es una labor que es dificil tenerla presente en todo momento. 

Por ´ultimo hay que mencionar tambi´en el problema con respecto a la gesti´on del inventario ya que surgen inconvenientes al momento de gastar insumos y no tener 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

12 

las nociones de cuanto material se va utilizando en cada sesi´on de trabajo y calcular tambi´en su reposici´on. 

Figura 1.1: Modelo del proceso de negocio de un estudio de tatuajes (BPMN)[5]. 

La figura 1.1 representa el flujo del trabajo del tatuador, incluyendo su participaci´on con el cliente, sus labores operativas y admistrativas. Esto describe la complejidad que conlleva desarrollar un proyecto de tatuaje con m´ultiples iteraciones, ya que, adem´as de ser un proceso extenso, puede conllevar m´ultiples retrasos por parte del cliente al no poseer un recordatorio automatizado. Por otro lado los procesos que se llevan en el trabajo son desarrollados en diferentes herramientas tanto admistrativamente como operativamente, lo que retrasa a´un m´as este flujo. 

## **1.1.2. Propuesta de soluci´on** 

La soluci´on propuesta consiste en el dise˜no y construcci´on de una plataforma web/m´ovil que unifique el flujo del trabajo de los artistas dedicados al arte del tatuaje, varias de sus funciones fueron creadas a partir de los requisitos de tatuador experto. El sistema considera distintos m´odulos como la importaci´on y almacenamiento en la nube para la gesti´on de bocetos, la previsualizaci´on 3D sobre modelos anat´omicos, el agendamiento de citas con recordatorios para reducir la inasistencia y retrasos de los clientes, un gestor de cotizaciones automatizadas y gesti´on de inventario. 

Con respecto al m´odulo de importaci´on y almacenamiento en la nube, este permite subir im´agenes de los bocetos a la plataforma donde ser´an guardadas y visibles en 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

13 

la galer´ıa de la aplicaci´on. 

En cuanto al m´odulo de previsualizaci´on 3D sobre modelos anat´omicos, este permite visualizar un modelo 3D de un cuerpo humano en la plataforma gracias a un motor de renderizado, en donde los bocetos subidos son transformados para adherirse a la superficie 3D del cuerpo y desplazarse para encontrar la posici´on y el ´angulo que el cliente prefiera. 

Sobre el m´odulo de agendamientos de citas con recordatorios, este permite hacer agendas personalizadas, en donde se puede crear las citas a partir de los nombres de las personas a atender, en las cuales para cada perfil se puede crear una nueva sesi´on de tatuaje o un nuevo proyecto, donde se pueden incluir la hora de la cita, el precio de la sesi´on o proyecto, junto con una foto del proceso del tatuaje. El tema del recordatorio, se hace mediante una API que integra los mensajes de WhatsApp[6], donde se vincula los n´umeros para enviar avisos antes y despues de la sesi´on del tatuaje. 

El m´odulo de gesti´on de cotizaciones automatizadas, permite calcular el precio aproximado del costo del tatuaje a partir del boceto subido a la plataforma, esto se realiza mediante un algoritmo que procesa las dimensiones del boceto, junto con otros par´ametros como el grosor de los trazados y colores, ya que el costo se centra en los gastos de material como agujas, tinta y otros insumos para la elaboraci´on del tatuaje, dejando de lado valor adicional que le quiera dar el artista de acuerdo a la complejidad del dise˜no. 

Por ´ultimo, el m´odulo de gesti´on de inventario se encarga de gestionar los materiales que posea el tatuador, ya sea agujas, tintas, insumos de higiene, entre otros, los que puede a editar a su disposici´on y a la vez se pueden actualizar automaticamente cada vez que se haga una cotizaci´on automatizada. 

En t´erminos de factibilidad, esta soluci´on es viable gracias a varios factores en los que incluye factibilidad t´ecnica, operativa y econ´omica. En el ´ambito t´ecnico, la soluci´on se apoya en las tecnolog´ıas orientadas al desarrollo web, empleando librer´ıas de c´odigo abierto establecidas para el renderizado 3D en el navegador e integraciones mediante protocolos est´andar para las APIs de mensajer´ıa, lo que elimina la necesidad de desarrollar motores gr´aficos desde cero o adquirir licencias de software. Operativamente, se sustenta directamente con las necesidades reales de los tatuadores, en 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

14 

mayor medida dentro de la zona local, debido a que gran parte de los requerimietos son parte de las ideas del tatuador experto, que estuvo dispuesto a buscar mejoras en el flujo de su trabajo con la plataforma gracias a sus requerimientos, y es por ello que estuvo dispuesto a participar y validar prototipos y avances relacionados a la plataforma. Finalmente, la viabilidad econ´omica se garantiza al basar la arquitectura en lenguajes de programaci´on y gestores de bases de datos gratuitos, lo que reduce a cero los costos iniciales por licencias, mientras que los gastos de infraestructura se mantendr´an al m´ınimo aprovechando entornos locales y capas gratuitas de servicios en la nube durante las fases de desarrollo y pruebas de concepto. 

## **1.2. Objetivos** 

En esta secco´on se presentan el objetivo general y especif´ıcos del proyecto. 

## **1.2.1. Objetivo general:** 

Optimizar el flujo del trabajo art´ıstico y administrativo de los tatuadores mediante una plataforma web que integre previsualizaci´on 3D, agendamiento personalizado de citas, cotizaciones automatizadas y gesti´on de inventario. 

## **1.2.2. Objetivos espec´ıficos:** 

- An´alizar los de los procesos actuales de los tatuadores, mediante entrevistas para obtener m´etricas a optimizar. 

- Disminuir en al menos un 50 % el ausentismo [diario/semanal] y retrasos de los clientes a sus sesiones mediante un m´odulo de agendamientos de citas con recordatorios. 

- Reducir en al menos un 40 % el tiempo empleado en el c´alculo manual de costos y revisi´on de stock mediante un m´odulo de cotizaciones automatizadas y gesti´on de inventario. 

- Reducir en al menos un 30 % el tiempo invertido en pruebas de tama˜no y ubicaci´on del dise˜no en el cliente mediante un m´odulo de previsualizaci´on 3D sobre modelos anat´omicos. 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

15 

- Implementar un m´odulo de importaci´on y almacenamiento en la nube para la gesti´on de bocetos. 

- Evaluar la calidad de la soluci´on implementada a trav´es de la ejecuci´on de tests unitarios (integraci´on), caja negra, caja blanca con cobertura de al menos 95 %. 

- Validar el sistema mediante pruebas de aceptaci´on con al menos un 90 % de evaluaci´on positiva con el usuario y una evaluaci´on de usabilidad aplicando un cuestionario SUS con un puntaje de al menos 85 puntos en escala Likert. 

## **1.3. Alcances** 

- En esta secci´on se presentan los alcances del proyecto. 

   - En este trabajo se espera implementar el Producto M´ınimo Viable (MVP) que incluye la web funcional con importaci´on de bocetos, mapeo 3D en navegador, calculadora de costos y gestor de citas con API de mensajer´ıa. 

   - No se considera implementar un m´odulo que permita la creaci´on de bocetos mediante dibujo en la plataforma. 

   - En este trabajo no se incluye la modificaci´on avanzada de bocetos mediante Inteligencia Artificial Generativa. 

   - No se contempla implementar visualizaci´on en Realidad Aumentada (AR) sobre la piel en tiempo real, limitando la visualizaci´on al entorno 3D web. 

   - La plataforma requiere conexi´on a internet para su uso, dado que la arquitectura propuesta es cliente-servidor, con despliegue de servidor web y base de datos en un hosting externo. 

   - El sistema considera la importaci´on en formato imagenes PNG, con un tama˜no limitado para garantizar un rendimiento fluido para el renderizado 3D. 

   - La plataforma considera modelos 3D ya integrados (cuerpo humano, brazo, pierna, torso). No se contempla la funcionalidad de subir modelos 3D por parte del usuario. 

   - El algoritmo de cotizaci´on de tatuaje no incluye un precio que contemple el arte del tatuaje. Solo de insumos u otros gastos objetivos. 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

16 

## **1.4. Plan de trabajo** 

A continuaci´on se presenta el plan de trabajo del proyecto. 

## **1.4.1. Descripci´on de etapas del proyecto** 

En esta secci´on se presentan las etapas que posee el proyecto, tareas m´as importantes y la cantidad de semanas de duraci´on que implicar´a realizar cada etapa. 

1. Requerimientos (2 semanas) 

Capturar requerimientos mediante reuniones con el cliente experto. 

2. Planificaci´on (4 semanas) 

   - Creaci´on y estimaci´on de historias de usuario. 

   - Definici´on de tecnolog´ıas. 

   - Entrevista a cliente sobre m´etricas de objetivos espec´ıficos. 

   - Dise˜no de la arquitectura del sistema y del modelo de la base de datos. 

   - Dise˜no de interfaces (Mockups) centradas en la usabilidad m´ovil y web. Analizar las consideraciones de gu´ıa de desarrollo seguro. 

3. Implementaci´on (18 semanas) 

   - Configuraci´on inicial del proyecto. 

   - Implementar m´odulo de autenticaci´on de usuarios. 

   - Implementar m´odulo de importaci´on y almacennamiento en la nube para la galer´ıa de bocetos. 

   - Implementar m´odulo de gesti´on de inventario. 

   - Implementar m´odulo de cotizaciones automatizadas conectadas al inventario. 

   - Implementar m´odulo de agenda de citas e integraci´on con la API de mensajer´ıa para recordatorios. 

   - Implementar m´odulo de previsualizaci´on 3D sobre modelos anat´omicos. 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

17 

4. Evaluaci´on y Validaci´on (4 semanas) 

Ejecutar pruebas de caja blanca (unitarias). 

Aplicar pruebas de caja negra. 

   - Realizar marcha blanca de la aplicaci´on con el cliente experto. 

   - Aplicar prueba de usabilidad (SUS) y evaluar la aceptaci´on del usuario (UAT). 

5. Conclusi´on (2 semanas) 

   - Realizar entrevista final y comparar m´etricas para verificar el cumplimiento de los porcentajes de optimizaci´on planteados. 

Realizar conclusiones y completar documento. 

Quedando as´ı un total de 30 semanas para el desarrollo del proyecto. Para mayor detalle de la planificaci´on revisar la Carta Gantt anexo al documento. 

## **1.4.2. Tareas para objetivos espec´ıficos** 

Para asegurar la trazabilidad entre el plan de trabajo y las metas del proyecto, se detallan las acciones que dar´an cumpliento a los objetivos espec´ıficos planteados: 

## **An´alisis de los procesos actuales y obtenci´on de m´etricas a optimizar:** 

-  _Etapa 1:_ Entrevistar al cliente para levantar tiempos actuales de cotizaci´on, tiempos de prueba de dise˜no y tasas de inasistencia. 

## **Reducir tiempos de cotizaci´on e inventario en un 40 %:** 

-  _Etapa 3:_ Implementar iterativamente los m´odulos l´ogicos de inventario y calculadora de costos. 

-  _Etapa 5:_ Comparar tiempos manuales originales versus el uso del sistema automatizado. 

## **Disminuir ausentismo en un 50 %:** 

-  _Etapa 3:_ Desarrollar integraci´on con API de mensajer´ıa para env´ıo de notificaciones 24 horas antes de la cita. 

_CAP[´] ITULO 1. INTRODUCCI ON[´]_ 

18 

-  _Etapa 5:_ Medir la variaci´on en la asistencia registrada tras un mes de marcha blanca. 

## **Reducir tiempos de previsualizaci´on en un 30 %:** 

-  _Etapa 3:_ Desarrollar el m´odulo de previsualizaci´on 3D en la web. 

-  _Etapa 5:_ Cuantificar el ahorro de tiempo al evitar imprimir y posicionar stencils f´ısicos m´ultiples veces. 

## **Validaci´on de Usabilidad (SUS** _≥_ **85):** 

-  _Etapa 4:_ Aplicar cuestionario de Likert a los usuarios de prueba tras la fase de marcha blanca y procesar el puntaje final. 

## **1.5. Resumen del cap´ıtulo** 

En este cap´ıtulo, se di´o a conocer el tema del proyecto, permitiendo comprender el contexto, el cual se centra en la transformaci´on en el mundo del tatuaje, como su popularidad a lo largo de la historia y los m´etodos de trabajo. Tambi´en se presenta la problem´atica que se poseen en el y rubro y la soluci´on propuesta a este problema, el cual es la construcci´on de un sistema de un sistema que permita gestionar la mayor de procesos de un tatuador para la optimizaci´on de su flujo de trabajo. 

A continuaci´on, el Cap´ıtulo 2 detallar´a conceptos b´asicos del proyecto, tecnolog´ıas a utilizarm estado del arte y metodolog´ıas, tanto de desarrollo como de evaluaci´on. 

## **2. Marco Te´orico** 

El presente cap´ıtulo est´a orientado a describir conceptos importantes para comprender el funcionamiento de los procesos de trabajo de un estudio de tatuajes profesional. Adem´as, se dar´an a conocer las tecnolog´ıas que ser´an parte del proyecto y las metodolog´ıas que se usar´an para ejecutar y evaluar los resultados del mismo. 

## **2.1. Conceptos b´asicos** 

A continuaci´on, se presentan algunos conceptos para entender de mejor manera el proyecto. 

## **2.1.1. Conceptos globales** 

A continuaci´on, se presentan algunos conceptos para entender de mejor manera el proyecto. 

- **Estudio de tatuajes:** Espacio f´ısico o establecimiento comercial, regulado por normativas sanitarias, donde operan artistas del tatuaje. Puede funcionar bajo un modelo de artistas residentes (empleados o socios) o recibir a artistas invitados. 

- **Boceto digital:** Dise˜no preliminar o definitivo de un tatuaje creado a trav´es de software de ilustraci´on en dispositivos electr´onicos (como tabletas gr´aficas). Es el archivo base bidimensional (generalmente en formato PNG o JPG) que ser´a transferido a la piel[7]. 

- **Est´encil (Transfer):** T´ecnica anal´ogica utilizada en los estudios para transferir el contorno del boceto a la piel del cliente antes de comenzar a tatuar. 

19 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

20 

Tradicionalmente requiere imprimir el dise˜no en un papel hectogr´afico especial y adherirlo al cuerpo mediante l´ıquidos de transferencia. 

- **Proyecci´on de decal (Calcoman´ıa):** T´ecnica de renderizado tridimensional que permite proyectar una textura bidimensional (el boceto) sobre la superficie curva de una malla tridimensional (el modelo anat´omico), adapt´andose din´amicamente a su geometr´ıa. 

## **2.1.2. Conceptos de software** 

- Backend: Es la parte que no se ve y es esencial en un sitio, encargada de manejar la l´ogica y el procesamiento de datos necesarios para que todo funcione de manera correcta[8]. 

- Fronted: Es la parte de un programa, sitio web o dispositivo en la que un usuario puede acceder e intereactuar directamente. En el contexto de dise˜no web y desarrollo web, se refiere a todas las tecnolog´ıas que corren en el navegador y que se encargan de la interactividad con los usuarios[9]. 

## **2.2. Tecnolog´ıas** 

A continuaci´on se presentan las principales tecnolog´ıas utilizados para el desarrollo del proyecto. 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

21 

## **2.2.1. Servidor Web** 

- **2.2.2. Fronted** 

- **2.2.3. Backend** 

- **2.2.4. Sistema gestor de base de datos (SGBD)** 

- **2.2.5. Servicio de correos** 

- **2.2.6. Despliegue de aplicaciones** 

- **2.2.7. Herramienta para repositorio GithHub** 

- **2.2.8. Sistema gestor de proyectos** 

## **2.3. Estado del arte** 

En cuanto al estado del arte del proyecto, existen distintos tipos de sistemas digitalizados como herramientas para los tatuadores, tanto de c´odigo libre como de pago, a continuaci´on, se mencionan y describen algunos sistemas reconocidos y que est´an en relaci´on con el proyecto a desarrollar: 

- **REV23 Desktop[10]:** Es un software de gesti´on y punto de venta dise˜nado, 

- creado de manera exclusiva para satisfacer las necesidades administrativas de los estudios de tatuajes y perforaciones. Este programa centraliza todas las operaciones del negocio en un solo lugar, permitiendo organizar calendarios de citas, automatizar recordatorios, procesar pagos y calcular las comisiones de los artistas. 

- **Procreate, Clip Studio Paint, Adobe Substance 3D:** Son herramientas de creaci´on visual digital que integran modelos tridimensionales dentro del flujo de trabajo del arte digital, permitiendo a los artistas trascender el lienzo plano tradicional. Todas ofrecen la capacidad de cargar o utilizar mallas 3D (como figuras humanas, objetos o partes espec´ıficas del cuerpo) para facilitar el dise˜no, ya sea interactuando con estos modelos para establecer referencias espaciales y anat´omicas precisas, o pintando directamente sobre su superficie para previsualizar c´omo se comportan los trazos y dise˜nos sobre vol´umenes reales. Las diferencias m´as notables son sus diferentes enfoques, debido a que 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

22 

si bien las tres aplicaciones permiten dibujar en los modelos, la facilidad no es la misma, ya que Procreate[11] es la m´as apta para ello, porque permite importar un modelo 3D anat´omico y poder usar los pinceles 2D para pintar directamente sobre la superficie. Clip Studio Paint[12] se centraliza mucho m´as en las referencias anat´omicas de los modelos, no de texturizado, esto quiere decir que se enfoca principalmente en modificar su complexi´on y articularlos en cualquier pose. Por ´ultimo Adobe Substance 3D[13] se enfoca principalmente en texturizar modelos 3D para videojuegos, cine o animaci´on. A diferencia de Procreate aqu´ı no se “pinta” como en un boceto sino que se ocupan otro tipos de herramientas m´as complejas para el dise˜no. 

- **Fresha, Calendly, Calendario iOS:** Son softwares enfocados en la gesti´on del tiempo y organizaci´on de la agenda. Cumplen con el prop´osito de registrar fechas, eventos, reuniones o servicios, y ayudar a sus usuarios a visualizar su disponibilidad en sus horarios. Dentro de las diferencias que poseen es que Fresha[14] es una plataforma de gesti´on empresarial y punto de venta dise˜nada espec´ıficamente para la industria de la belleza y el bienestar, permite reservas de citas online, gesti´on de inventario y proceso de pagos. Calendly[15] por su parte es una herramienta de automatizaci´on de agendamiento enfocada en profesionales, aut´onomos y equipos corporativos. Es calendario que funciona como un intermediario inteligente que se configura con reglas de disponibilidad y se comparte un enlace p´ublico donde las dem´as personas visualizan tus horarios libres. Por ´ultimo el calendarios de iOS[16] es una aplici´on de uso estrictamente personal, est´a dise˜nada para que el usuario organice su propia vida, anotando eventos, recordatorios o citas. 

- **Tatto Studio Pro, Ink Studio AI:** Son herramientas digitales creadas exclusivamente para modernizar y optimizar la industria del tatuaje, las dos plataformas poseen la funcionalidad de la cotizaci´on de los tatuajes, pero tienen ciertas diferencias en el proceso de hacerlo. Tatto Studio Pro[17] realiza un c´alculo administrativo cerrado utilizado por el estudio o el artista. lo que hace es multiplicar la tarifa por las horas de la sesi´on y por el costo de los insumos en donde ambas variables son ingresadas manualmente. Ink Studio AI[18] realiza una estimaci´on algor´ıtmica, su c´alculo de precio eval´ua las caracter´ısticas visuales del dise˜no como “estilo full a color” o “tama˜no de antebrazo” y con 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

23 

ello da una estimaci´on final del tatuaje. 

**Instagram, Google Photos, Behance:** Las tres aplicaciones son repositorios visuales en la nube donde un artista puede alojar, organizar y acceder a sus galer´ıas de bocetos desde cualquier dispositivo. Instagram[19] es una galer´ıa p´ublica en donde el objetivo es generar la mayor interacci´on en likes y compartidos en tus publicaciones, donde en este caso los bocetos publicados servirian como publicidad para que el usuario envie un mensaje directo y reserve una cita. Google Photos[20] es una galer´ıa utilitaria y personal, su objetivo solo es ser un respaldo en la nube y la organizaci´on admnistrativa de los bocetos. Behance[21] es una galar´ıa de exhibici´on est´atica y de alto perfil. Los bocetos se presentan como “proyectos” y permite mostrar flujos de trabajo completos. 

Tabla 2.1: An´alisis comparativo de funcionalidades por software 

|**Herramienta / Software**|**Previsualizaci´on 3D**|**Galer´ıa**|**Gestor de Inventario**|**Gesti´on de Citas**|**Cotizaci´on**|**Recordatorios**|
|---|---|---|---|---|---|---|
|**REV23 Desktop**|_×_|_×_|✓|✓|✓(Comisiones)|✓|
|**Procreate / HiPasint / Afnity**|✓|✓|_×_|_×_|_×_|_×_|
|**Fresha**|_×_|_×_|✓|✓|_×_|_×_|
|**Calendly / Calendario iOS**|_×_|_×_|_×_|✓|_×_|✓|
|**Tattoo Studio Pro**|_×_|_×_|✓|_×_|✓(Manual)|_×_|
|**Ink Studio AI**|_×_|_×_|_×_|_×_|✓(Algor´ıtmica)|_×_|
|**Instagram / Google Photos / Behance**|_×_|✓|_×_|_×_|_×_|_×_|
|**Mi Sistema**|✓|✓|✓|✓|✓(Automatizada)|✓|



El trabajo relacionado demuestra que existen m´ultiples herramientas que cumplen con los m´odulos propuestos para el sistema. Sin embargo se deja en evidencia el problema fundamental, que es la divisi´on de trabajo del tatuador ya que no hay una herramienta o un sistema que poseea una mayor integraci´on de m´odulos en un s´olo lugar. El ´unico de los softwares que se acerca a ser un espacio completo para el flujo del tatuador ser´ıa Rev23 Desktop que tiene como m´odulos el gestor de inventario, gesti´on de citas, cotizaciones y recordatorios. A´un as´ı le faltar´ıa la previsualizaci´on 3D y galer´ıa como m´odulos para ser un sistema completo seg´un lo propuesto. 

Las dem´as herramientas mencionadas en el Cuadro 2.1 estar´ıan lejos de cumplir con un ser un software integral para el trabajo de un tatuador, ya que se limitar´ıan a tener uno o dos m´odulos como funciones en su programa. 

En resumen, no existe actualmente un software o herramienta unificado que 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

24 

considere todas las funcionalidades propuestas para ser considerado un sistema que optimice el flujo del trabajo del tatuador. 

## **2.4. Metodolog´ıas** 

En este cap´ıtulo se presentan las metodolog´ıas de desarrollo y de evaluaci´on para el proyecto. 

## **2.4.1. Metodolog´ıas de desarrollo** 

El proceso de implementaci´on de la plataforma web involucra s´olo un desarrollador, por lo que se analizan las metodolog´ıas de desarrollo de software m´as adecuadas para este contexto, destacando dos opciones principales: Personal Software Process (PSP)[22] y Personal Extreme Programming (PXP)[23]. Ambas metodolog´ıas comparten fases clave como la planificaci´on, dise˜no, implementaci´on y pruebas. Sin embargo, PSP se enfoca en una planificaci´on estricta y alta documentaci´on, lo cual le resta agilidad al proyecto. 

Por el contrario, PXP reduce la sobrecarga de documentaci´on y adopta un subconjunto de pr´acticas ´agiles de Extreme Programming (XP)[24] adaptadas para un solo desarrollador. Para este proyecto en particular, el desarrollo del m´odulo de previsualizaci´on 3D y el algoritmo de cotizaci´on requiere de retroalimentaci´on temprana para asegurar su usabilidad pr´actica. Al basarse en iteraciones cortas, PXP proporciona la flexibilidad necesaria para construir el software de forma incremental, permitiendo que los usuarios finales (los artistas del tatuaje) interact´uen con prototipos funcionales y validen que el sistema realmente se adapta a su flujo de trabajo antes de avanzar a la siguiente fase. Por lo tanto, se ha optado por PXP como la metodolog´ıa m´as adecuada, garantizando agilidad, calidad de c´odigo y satisfacci´on del cliente. 

Para el desarrollo de la propuesta, se siguen las distintas fases que contempla esta metodolog´ıa, adaptadas a las necesidades del proyecto: 

**Requerimientos:** En esta etapa se capturan los requisitos del proyecto mediante reuniones e interacci´on directa con un artista del tatuaje que asume el rol de cliente experto, traduciendo sus necesidades operativas en historias de usuario. 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

25 

- **Planificaci´on:** Esta fase comprende la estimaci´on de las historias de usuario, la elecci´on de las tecnolog´ıas a utilizar (como librer´ıas gr´aficas para el motor 3D y gestores de bases de datos relacionales), el dise˜no de interfaces y la definici´on de la arquitectura web. 

- **Iteraci´on:** Se define el inicio de cada ciclo de desarrollo, el cual establece una duraci´on estimada de entre 1 y 3 semanas, enfoc´andose en entregar un m´odulo funcional (ej. Gestor de inventario o Integraci´on de mensajer´ıa). 

- **Dise˜no:** Comprende el dise˜no l´ogico de la base de datos, los m´odulos del backend y las funciones del frontend correspondientes a las historias de la iteraci´on en curso. 

- **Implementaci´on:** Es la fase de codificaci´on pura de las tareas. Para dar por finalizada esta etapa, el c´odigo debe compilar sin errores y superar las pruebas unitarias; de lo contrario, se debe refactorizar aplicando los principios de simplicidad de PXP. 

- **Sistema de Pruebas y Validaci´on:** Comprende el testeo integral para asegurar que las funcionalidades cumplen con los requisitos iniciales. Es en este punto donde el incremento del software es presentado al cliente (tatuador) para validar emp´ıricamente que la soluci´on tecnol´ogica resuelve el problema planteado. 

- **Retrospectiva:** Marca el final de cada iteraci´on. Se realiza un an´alisis del desempe˜no del desarrollo, se integran las recomendaciones o ajustes detectados por los usuarios, y se planifica el inicio de la siguiente iteraci´on o el cierre definitivo del proyecto. 

La Figura 2.1 muestra una representaci´on de las fases que posee la metodolog´ıa de desarrollo Personal Extreme Programming (PXP): 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

26 

Figura 2.1: Fases de metodolog´ıa Personal Extreme Programming (PXP). 

## **2.4.2. Metodolog´ıas de evaluaci´on del proyecto** 

## **Evaluaci´on de Calidad** 

Para asegurar que la plataforma est´e libre de fallos cr´ıticos antes de su despliegue, se implementa una estrategia de pruebas a nivel de c´odigo y de sistema: 

- **Pruebas de Caja Blanca (Pruebas Unitarias y de Integraci´on):** Estas pruebas se enfocan en verificar la l´ogica interna del c´odigo fuente, evaluando que los algoritmos cr´ıticos (como el motor de c´alculo de cotizaciones y la l´ogica de proyecci´on 3D) funcionen correctamente desde su interior. Se definen tests con el objetivo de alcanzar una cobertura de c´odigo de al menos un 95 %. 

Para dar un ejemplo de las pruebas unitarias se considera realizar pruebas para funciones del c´odigo del programa, por ejemplo en el ´area de cotizaciones se 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

27 

ingresan valores a los insumos para verificar que los datos finales concuerden con los c´alculos esperados en todo momento. A continuaci´on, la Figura 2.2 ilustra el proceso de la prueba. 

Figura 2.2: Proceso de Prueba de Caja Blanca. 

- **Pruebas de Caja Negra:** Corresponden a una forma de evaluar y validar el funcionamiento de los m´odulos del sistema sin necesidad de conocer su proceso interno. En estas pruebas, se definen entradas espec´ıficas (por ejemplo, subir un boceto y asignar horas) y se comparan con las salidas esperadas en la interfaz de usuario, garantizando que los m´odulos operen correctamente de extremo a extremo. A continuaci´on, la Figura 2.3 ilustra el proceso de la prueba. 

Figura 2.3: Proceso de Prueba de Caja Negra. 

## **Evaluaci´on de Usabilidad y Aceptaci´on** 

Dado que el sistema est´a enfocado en usuarios finales (tatuadores y clientes del estudio), es fundamental validar que la interfaz sea intuitiva y el flujo de trabajo sea el adecuado. 

- **System Usability Scale (SUS)[25]:** Para evaluar la usabilidad emp´ırica del sistema se considera aplicar el cuestionario est´andar SUS. Este instrumento consiste en 10 afirmaciones evaluadas mediante una escala de Likert (desde “Totalmente en desacuerdo” hasta “Totalmente de acuerdo”). A partir de las respuestas, se calcula un puntaje global. Para este proyecto, se ha establecido como m´etrica de ´exito alcanzar un puntaje m´ınimo de 85 puntos, lo que 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

28 

clasificar´ıa a la plataforma dentro de un rango de excelencia en t´erminos de usabilidad. 

- **Pruebas de Aceptaci´on del Usuario (UAT)[26]:** Se llevar´an a cabo sesiones de prueba controladas donde el cliente experto y otros tatuadores invitados interactuan libremente con la versi´on final del sistema. Al finalizar, se registra su nivel de satisfacci´on, teniendo como meta alcanzar al menos un 90 % de evaluaci´on positiva respecto a la funcionalidad de la plataforma. 

## **Evaluaci´on de Validaci´on** 

Para complementar las m´etricas de software y validar el impacto del sistema en el negocio, se considera un enfoque comparativo (Pre-test y Post-test) mediante entrevistas y an´alisis de registros: 

- **Entrevistas:** Se realiza entrevistas al inicio del proyecto para cuantificar las bases actuales del artista experto respecto a el tiempo que invierten en ajustar bocetos en papel, el tiempo que dedican a calcular costos manualmente, y su tasa de inasistencia semanal promedio. 

- **Contraste de Resultados:** Una vez implementado el MVP y tras un periodo de prueba real, se vuelven a medir estos par´ametros operando con el sistema. El objetivo es validar estad´ısticamente el logro en la reducci´on de los tiempos de previsualizaci´on en un 30 % los tiempos de previsualizaci´on (m´odulo 3D), en un 40 % los tiempos de cotizaci´on (m´odulo de inventario) y en un 50 % el ausentismo (m´odulo de agendamiento con WhatsApp). 

## **2.5. Resumen cap´ıtulo** 

En este cap´ıtulo se explicaron los conceptos b´asicos necesarios para entender el proyecto, se describieron las tecnolog´ıas a utilizar, evaluando alternativas y justificando la elecci´on de cada una. Tambi´en se revis´o el estado del arte, presentando aplicaciones que ofrecen funcionalidades similares a la soluci´on propuesta. Finalmente, detallaron las metodolog´ıas de desarrollo y evaluaci´on, justificando la elecci´on de cada una. 

_CAP[´] ITULO 2. MARCO TE ORICO[´]_ 

29 

En el siguiente cap´ıtulo se abordar´a la aplicaci´on de estas metodolog´ıas, junto con las adaptiones necesarias para el proyecto y los resultados esperados de los objetivos espec´ıficos. 

## **3. Metodolog´ıas** 

El presente cap´ıtulo est´a orientado a describir la manera en que se aplicar´a las metodolog´ıas propuestas en el cap´ıtulo anterior y los resultados esperados de los objeticos espec´ıficos. 

## **3.1. Personal Extreme Programming (PXP)** 

Como se mencion´o en el Cap´ıtulo 2.4.1, la metodolog´ıa PXP adopta las mejores pr´acticas de las metodolog´ıas Personal Software Process (PSP) y Extreme Programming (XP). Se basa en un desarrollo personal pero a la vez sigue manteniendo las fases claves como Requerimientos, Planififcaci´on e Iteraci´on. 

## **3.1.1. requerimientos** 

Durante esta fase, se realiza una entrevista entre el desarrollador y el cliente para capturar los requerimientos iniciales del sistema. Estos requerimientos se transforman en la fase siguiente en historias de usuario, lo que permite enfocar el desarrollo en la experiencia del usuario. 

## **3.1.2. Planificaci´on** 

Durante esta fase, la actividad central consiste en la creaci´on, priorizaci´on y organizaci´on de las historias de usuario (HU), las cuales se dividir´an y asignar´an a iteraciones espec´ıficas. En esta fase tambi´en se toman las decisiones de dise˜no de la aplicaci´on, tales como las configuraciones base de las tecnolog´ıas a utilizar, arquitecturas de software y mockups, que permitir´an el flujo de las distitnas vistas que tendr´a la aplicaci´on y su interacci´on con los usuarios. 

30 

_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

31 

## **Historias de usuario** 

A continuaci´on, la Tabla 3.1 ilustra las historias de usuario obtenidas a partir de la entrevista inicial con el cliente. 

Tabla 3.1: Historias de Usuario 

|**HU**|**Actor(es)**|**Descripci´on**|
|---|---|---|
|HU01|Tatuador|quiero registrarme en la plataforma ingresando mis<br>datos, para tener un espacio de trabajo seguro.|
|HU02|Tatuador|quiero iniciar y cerrar sesi´on mediante mis credencia-<br>les, para proteger la privacidad de mi negocio.|
|HU03|Tatuador|quiero recuperar mi contrase˜na en caso de olvido, pa-<br>ra no perder el acceso a mi agenda e inventario.|
|HU04|Tatuador|quiero importar im´agenes a la plataforma, para alma-<br>cenarlas en la nube.|
|HU05|Tatuador|quiero ver todos mis dise˜nos en una galer´ıa, para ac-<br>ceder a ellas r´apidamente.|
|HU06|Tatuador|quiero eliminar un boceto antiguo de la galer´ıa, para<br>liberar espacio.|
|HU07|Tatuador|quiero a˜nadir etiquetas a mis bocetos, para fltrarlos<br>y encontrarlos ´agilmente frente al cliente.|
|HU08|Tatuador|quiero elegir entre distintos modelos anat´omicos 3D<br>ya integrados, para utilizarlos como lienzo de previ-<br>sualizaci´on.|
|HU09|Tatuador|quiero proyectar un boceto 2D (PNG) sobre el modelo<br>3D, para evaluar c´omo se adapta a la curvatura de la<br>piel.|
|HU10|Tatuador|quiero escalar, mover y rotar el dise˜no sobre el modelo<br>3D, para defnir la posici´on exacta.|
|HU11|Tatuador|quiero registrar un material con su cantidad y costo<br>unitario, para mantener un control inicial de mi stock.|
|Contin´ua en la siguiente p´agina...|||



_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

32 

**– Tabla 3.1 Continuaci´on de la p´agina anterior** 

|**HU**|**Actor(es)**|**Descripci´on**|
|---|---|---|
|HU12|Tatuador|quiero modifcar el stock manual o borrar insumos<br>descontinuados, para mantener la realidad operativa<br>de mi estudio.|
|HU13|Tatuador|quiero visualizar una advertencia cuando un insumo<br>llegue a un nivel cr´ıtico, para comprar reposiciones a<br>tiempo.|
|HU14|Tatuador|quiero que el sistema calcule el costo de los insumos<br>bas´andose en el tama˜no del boceto y variables de tra-<br>zado, para obtener un presupuesto automatizado.|
|HU15|Tatuador|quiero agregar o quitar materiales espec´ıfcos sugeri-<br>dos por el algoritmo, para refnar el c´alculo fnal de<br>la cotizaci´on.|
|HU16|Tatuador|quiero que al dar por fnalizada una sesi´on cotizada<br>los materiales se descuenten solos, para automatizar<br>el control de stock.|
|HU17|Tatuador|quiero agendar a un cliente especifcando fecha, ho-<br>ra, n´umero de contacto y precio del proyecto, para<br>organizar mis tiempos.|
|HU18|Tatuador|quiero ver mis citas en un formato de calendario men-<br>sual y semanal, para organizar visualmente mi jorna-<br>da.|
|HU19|Tatuador|quiero poder crear distintos proyectos para clientes<br>espec´ıfcos junto con sus sesiones.|
|HU21|Tatuador|quiero poder subir una foto de cada sesi´on para ver<br>los progresos del proyecto.|
|HU21|Tatuador|quiero cambiar la fecha de una cita o cancelarla, para<br>mantener la agenda actualizada frente a imprevistos.|
|HU22|Tatuador|quiero que el sistema env´ıe autom´aticamente un men-<br>saje de WhatsApp 24 horas antes de la sesi´on, para<br>evitar olvidos o retrasos.|
|Contin´ua en la siguiente p´agina...|||



_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

33 

**– Tabla 3.1 Continuaci´on de la p´agina anterior** 

|**HU**|**Actor(es)**|**Descripci´on**|
|---|---|---|
|HU23|Tatuador|quiero que al cancelar o cambiar una hora el sistema<br>avise al cliente por WhatsApp, para mantener una<br>comunicaci´on profesional.|
|HU24|Tatuador|quiero ver el historial de todas las sesiones pasadas y<br>futuras asociadas a un cliente, para hacer seguimiento<br>de piezas grandes.|
|HU25|Tatuador|quiero ver un panel de control al iniciar sesi´on con<br>las citas programadas y alertas de stock bajo, para<br>organizar mi jornada de un vistazo.|
|HU26|Tatuador|quiero visualizar una suma b´asica de los ingresos ge-<br>nerados en el mes actual, para evaluar la rentabilidad<br>del estudio.|
|HU27|Tatuador|quiero defnir mis d´ıas y horas de trabajo, para que el<br>calendario bloquee autom´aticamente mis d´ıas libres.|
|HU28|Tatuador|quiero poder editar el texto base del mensaje que se<br>env´ıa por WhatsApp, para darle recomendaciones del<br>trato del tatuajes posteriormente al trabajo realizado.|
|HU29|Tatuador|quiero poder editar el texto base del mensaje que se<br>env´ıa por WhatsApp, para darle recomendaciones del<br>trato del tatuajes posteriormente al trabajo realizado.|
|HU30|Tatuador|quiero tener el resgistro de todos mis clientes atendi-<br>dos con su informaci´on.|
|HU31|Tatuador|quiero poder visualizar un marcardor de todos mis<br>cliente y asignarles puntaje para saber su responsa-<br>bilidad de llegada y poder fltrarlo de acuerdo a ello.|



## **Priorizaci´on y estimaci´on de historias de usuario** 

En PXP, luego de realizar la creaci´on de historias de usuario, se deben priorizar y estimar en base al esfuerzo que toma implementar cada una. Para priorizar se utiliza una escala que va desde el valor m´as bajo correspondiente a “Baja” hasta “Cr´ıtica” siendo el valor m´as alto, categoriz´andolas en base a su impacto sobre los objetivos espec´ıficos del proyecto. 

_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

34 

Por el lado de la estimaci´on, si bien existen distintos m´etodos, se utilizar´a Planning Poker[27], el cual se elige debido a que emplea la escala de la serie de Fibonacci[28] para estimar cada historia, en el que entre m´as bajo sea el n´umero otorgado, representar´a un menor esfuerzo t´ecnico y cognitivo. A continuaci´on, la Tabla 3.2 ilustra el resultado de los m´etodos mencionados aplicados al cat´alogo del sistema. 

Tabla 3.2: Priorizaci´on y estimaci´on de esfuerzo para cada historia de usuario 

|**HU**|**Priorizaci´on**|**Estimaci´on de esfuerzo**|
|---|---|---|
|HU01|Cr´ıtica|3|
|HU02|Cr´ıtica|2|
|HU03|Media|3|
|HU04|Cr´ıtica|3|
|HU05|Alta|3|
|HU06|Baja|2|
|HU07|Media|3|
|HU08|Cr´ıtica|5|
|HU09|Cr´ıtica|8|
|HU10|Cr´ıtica|8|
|HU11|Alta|3|
|HU12|Media|2|
|HU13|Baja|2|
|HU14|Cr´ıtica|5|
|HU15|Media|3|
|HU16|Alta|5|
|HU17|Cr´ıtica|5|
|HU18|Alta|3|
|HU19|Media|3|
|HU20|Alta|3|
|HU21|Alta|5|
|HU22|Cr´ıtica|5|
|HU23|Alta|3|
|HU24|Media|3|
|Contin´ua en la siguiente p´agina...|||



_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

35 

**– Tabla 3.2 Continuaci´on de la p´agina anterior** 

|**HU**|**Priorizaci´on**|**Estimaci´on de esfuerzo**|
|---|---|---|
|HU25|Media|3|
|HU26|Baja|2|
|HU27|Media|2|
|HU28|Baja|2|
|HU29|Media|3|
|HU30|Media|3|
|HU31|Baja|5|



## **Planificaci´on de historias de usuario** 

A continuaci´on, la Tabla 3.3 ilustra las iteraciones y las historias de usuario asociadas a cada una de ellas, distribuidas estrat´egicamente a lo largo de la fase de implementaci´on del proyecto. 

Tabla 3.3: Asignaci´on de historias de usuario a iteraciones 

|**Iteraci´on**|**Historias de usuario**|
|---|---|
|2|HU01, HU02, HU03|
|3|HU04, HU05, HU06, HU07|
|4|HU11, HU12, HU13, HU25, HU26|
|5|HU14, HU15, HU16, HU27|
|6|HU17, HU18, HU19, HU20, HU24, HU30|
|7|HU21, HU22, HU23, HU28, HU29, HU31|
|8|HU08, HU09, HU10|



## **3.1.3. Iteraci´on** 

La fase de iteraci´on es la de mayor duraci´on en la metodolog´ıa, y est´a dividida en varias etapas: Inicio de Iteraci´on, Dise˜no, Implementaci´on, Sistema de Pruebas y Retrospectiva. A continuaci´on, se describe la implementaci´on de cada una de estas etapas. 

## **Inicio de iteraci´on** 

## **Dise˜no** 

_CAP[´] ITULO 3. METODOLOG[´] IAS_ 

36 

## **Implementaci´on** 

**Sistema de pruebas** 

## **Retrospectiva** 

## **3.2. Evaluaci´on** 

- **3.2.1. Prueba de caja negra** 

- **3.2.2. Prueba de usabilidad** 

- **3.2.3. Encuesta** 

## **3.3. Resultados esperados** 

## **3.4. Resumenn cap´ıtulo** 

En este cap´ıtulo se present´o detallademente la forma en que se aplicar´a la metodolog´ıa PXP en el proyecto. Tambi´en, se explican las metodolog´ıas de evaluaci´on, mediante pruebas de software y, pruebas cualititativas y cuantitativas, en donde se agregan ejemplos de estas. Finalmente, se mencionan los resultados esperados, los cuales responden a los objetivos espec´ıficos planteados en el Cap´ıtulo 1.2.2. 

En el siguiente cap´ıtulo se detallar´a la implementaci´on de la metodolog´ıa de desarrollo, en donde se explicar´a el trabajo realizado en las iteraciones, siguiendo las etapas de inicio de iteraci´on, dise˜no, implementaci´on, sistema de pruebas y retrospectiva. 

## **4. Desarrollo** 

El presente cap´ıtulo est´a orientado a presentar la implementaci´on de la metodolog´ıa de desarrollo. 

## **4.1. Dise˜no de software** 

A continuaci´on, se presentan elementos claves en el dise˜no de software, tales como arquitecturas, modelos de datos y mockups. 

## **4.1.1. Arquitectura f´ısica** 

La arquitectura f´ısica implementada para la plataforma corresponde a un modelo de cliente-servidor distribuido, utilizando servicios en la nube para garantizar alta disponibilidad. En la Figura 4.1 se ilustra la topolog´ıa de la red y la comunicaci´on entre los distintos nodos de infraestructura. 

El flujo de comunicaci´on comienza cuando el dispositivo cliente (computador o m´ovil) realiza una petici´on al dominio del sistema a trav´es de un servidor DNS. Esta solicitud es dirigida hacia la capa de presentaci´on ( _Frontend_ ), la cual se encuentra desplegada en los servidores de **Vercel** . Vercel act´ua como una red de entrega de contenido (CDN) global que distribuye de manera eficiente los archivos est´aticos de React y los recursos gr´aficos pesados requeridos por el motor 3D ( _Three.js_ ) directamente al navegador del cliente. 

Una vez que la interfaz es cargada, las interacciones din´amicas del usuario generan peticiones as´ıncronas v´ıa HTTP/HTTPS (arquitectura REST) hacia el servidor de aplicaciones ( _Backend_ ). Este n´ucleo l´ogico, desarrollado en Node.js, se encuentra alojado en **Railway** , una plataforma de integraci´on y despliegue continuo (PaaS) 

37 

_CAP[´] ITULO 4. DESARROLLO_ 

38 

que gestiona el entorno de ejecuci´on, balanceo de carga interno y la disponibilidad del servidor de la API. 

A su vez, el servidor _Backend_ en Railway establece conexiones seguras hacia tres nodos externos fundamentales para la persistencia y comunicaci´on del sistema: 

- **Servidor de Base de Datos (Supabase):** Provee la infraestructura para el motor relacional PostgreSQL, encargado de almacenar de forma transaccional los registros de usuarios, control de inventario y agendamiento de citas. 

- **Almacenamiento Multimedia (AWS S3 / Supabase Storage):** Un servicio de almacenamiento de objetos ( _Object Storage_ ) dedicado exclusivamente a resguardar los archivos binarios, tales como los bocetos en formato PNG y los modelos anat´omicos en formato GLTF. 

- **API de Mensajer´ıa Externa (Meta):** Un nodo de integraci´on mediante el cual el servidor backend emite las cargas ´utiles ( _payloads_ ) hacia la _WhatsApp Cloud API_ de Meta para concretar el env´ıo de recordatorios autom´aticos a los clientes. 

Figura 4.1: Proceso de Prueba de Caja Negra. 

_CAP[´] ITULO 4. DESARROLLO_ 

39 

- **4.1.2. Arquitectura l´ogica** 

- **4.1.3. Modelo de datos** 

- **4.1.4. Mockups** 

## **4.2. iteraciones** 

- **4.2.1. Iteraci´on 1** 

- **4.2.2. Iteraci´on 2** 

## **Glosario** 

**El primer t´ermino:** Este es el significado del primer t´ermino, realmente no se bien lo que significa pero podr´ıa haberlo averiguado si hubiese tenido un poco mas de tiempo. 

**El segundo t´ermino:** Este si se lo que significa pero me da lata escribirlo... 

40 

# **ANEXOS** 

## **A. El Primer Anexo** 

Aqu´ı va el texto del primer anexo... 

## **A.1. La primera secci´on del primer anexo** 

Aqu´ı va el texto de la primera secci´on del primer anexo... 

## **A.2. La segunda secci´on del primer anexo** 

Aqu´ı va el texto de la segunda secci´on del primer anexo... 

## **A.2.1. La primera subsecci´on de la segunda secci´on del primer anexo** 

42 

## **B. El segundo Anexo** 

Aqu´ı va el texto del segundo anexo... 

## **B.1. La primera secci´on del segundo anexo** 

Aqu´ı va el texto de la primera secci´on del segundo anexo... 

## **B.2. Bibliograf´ıa** 

43 

## **Bibliograf´ıa** 

- [1] Juli´an Esteban Ball´en Valderrama y Javier Antonio Castillo L´opez. _((_ La pr´actica del tatuaje y la imagen corporal _))_ . En: _Revista Iberoamericana de psicolog´ıa_ 8.1 (2015), p´ags. 103-109. 

- [2] F. Poulsen Valenzuela. _((_ El tatuaje: m´as all´a de la tinta _))_ . Memoria de T´ıtulo, Escuela de Dise˜no. Pontificia Universidad Cat´olica de Chile, 2021. 

- [3] Informes de Expertos (IDE). _Mercado de Tatuajes: Tama˜no, An´alisis, Pron´ostico 2026-2035_ . 2026. url: `https://www.informesdeexpertos.com/informes/ mercado-de-tatuajes` . 

- [4] P. Sep´ulveda. _((_ El 17 % de los chilenos mayores de 15 a˜nos tiene un tatuaje _))_ . En: _La Tercera_ (oct. de 2017). url: `https://www.latercera.com/noticia/ 17-los-chilenos-mayores-15-anos-tatuaje/` . 

- [5] Stephen A White. _((_ Introduction to BPMN _))_ . En: _Ibm Cooperation_ (2004). 

- [6] WhatsApp LLC. _WhatsApp Messenger_ . Aplicaci´on de mensajer´ıa multiplataforma y servicio de voz sobre IP. Consultado el 05 de abril de 2026. 2026. url: `https://www.whatsapp.com/` . 

- [7] Mariano B´aguena Bueso. _((_ El boceto digital. De la idea a la creaci´on _))_ . En: _Di´alogos urbanos: Confluencias entre arte y ciudad_ . Centro de Investigaci´on Arte y Entorno. 2008, p´ags. 101-110. 

- [8] Rudd H Canaday et al. _((_ A back-end computer for data base management _))_ . En: _Communications of the ACM_ 17.10 (1974), p´ags. 575-582. 

- [9] Susana Graciela P´erez Ibarra et al. _((_ Herramientas y tecnolog´ıas para el desarrollo web desde el FrontEnd al BackEnd _))_ . En: _Xxiii workshop de investigadores en ciencias de la computaci´on (wicc 2021, chilecito, la rioja)_ . 2021. 

44 

_BIBLIOGRAF[´] IA_ 

45 

- [10] REV23 Development. _REV23 Desktop_ . Software de computadora. Consultado el 05 de abril de 2026. 2024. url: `https://www.rev23.com/` . 

- [11] Savage Interactive. _Procreate_ . Aplicaci´on m´ovil. Consultado el 05 de abril de 2026. 2024. url: `https://procreate.com/` . 

- [12] Celsys, Inc. _Clip Studio Paint_ . Software de ilustraci´on, c´omic y animaci´on digital. Consultado el 05 de abril de 2026. 2026. url: `https://www.clipstudio. net/` . 

- [13] Adobe Inc. _Adobe Substance 3D Painter_ . Software de texturizado de modelos 3D. Consultado el 05 de abril de 2026. 2026. url: `https://www.adobe.com/ products/substance3d-painter.html` . 

- [14] Fresha.com SV Ltd. _Fresha_ . Plataforma web de agendamiento para salones y bienestar. Consultado el 05 de abril de 2026. 2026. url: `https://www.fresha. com/` . 

- [15] Calendly LLC. _Calendly_ . Software de automatizaci´on de programaci´on de citas. Consultado el 05 de abril de 2026. 2026. url: `https://calendly.com/` . 

- [16] Apple Inc. _Calendario de iOS_ . Aplicaci´on m´ovil de organizaci´on personal. Consultado el 05 de abril de 2026. 2026. url: `https://www.apple.com/ios/` . 

- [17] Tattoo Studio Pro. _Tattoo Studio Pro_ . Software de gesti´on administrativa de estudios de tatuaje. Consultado el 05 de abril de 2026. 2026. url: `https: //www.tattoostudiopro.com/` . 

- [18] Ink Studio AI. _Ink Studio AI_ . Generador de dise˜nos de tatuajes basado en inteligencia artificial. Consultado el 05 de abril de 2026. 2026. url: `https: //inkstudioai.com/` . 

- [19] Meta Platforms, Inc. _Instagram_ . Red social y repositorio visual en l´ınea. Consultado el 05 de abril de 2026. 2026. url: `https://www.instagram.com/` . 

- [20] Google LLC. _Google Photos_ . Servicio de almacenamiento y organizaci´on de fotograf´ıas. Consultado el 05 de abril de 2026. 2026. url: `https://photos. google.com/` . 

- [21] Adobe Inc. _Behance_ . Plataforma de portafolios creativos en l´ınea. Consultado el 05 de abril de 2026. 2026. url: `https://www.behance.net/` . 

_BIBLIOGRAF[´] IA_ 

46 

- [22] Watts S Humphrey. _((_ The personal software process _))_ . En: _CMU/SEI: Addison Wesley_ (2000). 

- [23] Yani Dzhurov, Iva Krasteva y Sylvia Ilieva. _((_ Personal Extreme Programming– An Agile Process for Autonomous Developers _))_ . En: (2009). 

- [24] Jos´e Joskowicz. _((_ Reglas y pr´acticas en eXtreme Programming _))_ . En: _Universidad de Vigo_ 22 (2008). 

- [25] Mandy R Drew, Brooke Falcone y Wendy L Baccus. _((_ What does the system usability scale (SUS) measure? validation using think aloud verbalization and behavioral metrics _))_ . En: _International conference of design, user experience, and usability_ . Springer. 2018, p´ags. 356-366. 

- [26] Jos´e PONCE GONZALEZ et al.[´] _((_ Pruebas de aceptaci´on orientadas al usuario. _))_ En: (). 

- [27] Planning Poker. _((_ Planning poker _))_ . En: _l´ınea]. Disponible: www. planningpoker. com [Accedido: 15 abril 2016]_ (2016). 

- [28] Mar´ıa Isabel Viggiani Rocha. _((_ La sucesi´on de Fibonacci _))_ . En: _Revista de Educaci´on Matem´atica (RevEM)_ 21.3 (2006), p´ag. 3. 

