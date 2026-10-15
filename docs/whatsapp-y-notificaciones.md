# Recordatorios por WhatsApp y notificaciones

Cubre las historias **HU22** (recordatorio 24 horas antes), **HU23** (aviso al
cancelar o cambiar la hora) y **HU28** (texto editable para los cuidados), más las
notificaciones push al artista y la campanita.

## Cómo funciona

```
cita agendada ──► programador (cada 10 min) ──► ¿faltan entre 1 y 24 horas?
                                                   │
                  ┌────────────────────────────────┴───────────────────────┐
         con API de WhatsApp                                    sin API de WhatsApp
         el mensaje sale solo                          el artista recibe un aviso (campanita
         (de pago, ver más abajo)                      + push) con el botón «Enviar por WhatsApp»,
                                                       que abre el chat con el texto ya escrito
                                                       (gratis, sin aprobación de Meta)
```

Hay un **tercer camino**, gratis y automático pero **no oficial**: que el artista vincule su
propio WhatsApp (sección 3 bis). Si hay API oficial se usa esa; si no, el WhatsApp
vinculado; y si ninguno está o falla, el enlace manual.

Los mismos caminos valen para los otros mensajes: al **cancelar** o **cambiar la
hora** de una cita se avisa al cliente, y al marcar la sesión como **completada** se
le mandan los cuidados.

**Lo que pasa hoy, sin hacer nada más que desplegar:** funciona el camino manual. Es
gratis, no necesita cuentas nuevas y sirve para cualquier cliente. La API de WhatsApp
es un paso opcional posterior.

Cada mensaje se reclama en la tabla `message_log` **antes** de enviarse, así que no
se repite aunque dos programadores coincidan. Si la API falla, el mensaje no se
pierde: cae al camino manual y le llega al artista.

Un cliente sin teléfono válido no recibe nada, pero el artista sí se entera
(«No pudimos avisar a Luis…») para corregir la ficha. Se aceptan celulares chilenos
(`+56 9 1234 5678`, `9 1234 5678`, `912345678`) y números extranjeros con `+`.

## 1. Notificaciones push (gratis)

1. **Genera las claves una sola vez** (desde la raíz del proyecto, con Docker corriendo):

   ```bash
   docker exec proyecto-tatuajes-backend-1 npm run vapid:generate
   ```

   Imprime `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. La privada es un secreto. **No las
   cambies después:** los dispositivos ya suscritos dejarían de recibir avisos.
2. En Render → tu servicio → *Environment*, agrega:

   | Variable | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | La pública |
   | `VAPID_PRIVATE_KEY` | La privada |

   (`VAPID_SUBJECT` es opcional: si falta se usa `FRONTEND_URL`.) Render redespliega solo.
3. **En el iPhone la app tiene que estar instalada.** Abre la página en **Safari**,
   Compartir → «Añadir a pantalla de inicio», y ábrela desde su ícono. En una pestaña de
   Safari el navegador no ofrece push (iOS 16.4 o más). En Android basta Chrome.
4. Entra a **Configuración** → «Avisos en este dispositivo» → **Activar avisos** y acepta el
   permiso. Pulsa **Enviar aviso de prueba**: debe llegarte una notificación.

Si denegaste el permiso, solo se cambia desde los ajustes del teléfono o del navegador.
La campanita funciona siempre, con o sin push.

## 2. El programador de recordatorios

El servidor revisa solo cada 10 minutos, **pero en el plan gratuito de Render se duerme**
tras 15 minutos sin visitas y mientras duerme no revisa nada. Hace falta un servicio
externo que lo llame (y de paso lo mantenga despierto). Con
[cron-job.org](https://cron-job.org) (gratis):

1. Lee el valor de `CRON_SECRET` en Render → *Environment* (lo genera `render.yaml`).
2. En cron-job.org crea un *cronjob*:
   - **URL:** `https://TU-SERVICIO.onrender.com/api/jobs/reminders`
   - **Intervalo:** cada 10 minutos
   - **Avanzado → Método:** `POST`
   - **Avanzado → Cabeceras:** `X-Cron-Secret` = el valor de `CRON_SECRET`
3. Pulsa *Test run*: debe responder `200` con un resumen como
   `{"checked":0,"whatsapp":0,"manual":0,…}`.

cron-job.org corta a los 30 segundos. Si el servidor estaba dormido, la primera llamada
puede aparecer como fallida mientras él despierta; la siguiente funciona. 750 horas
mensuales de Render alcanzan para un servicio despierto todo el mes.

Sin `CRON_SECRET` el endpoint no existe (404), y con una clave equivocada responde 401.

## 3. Conectar la API de WhatsApp (opcional y de pago)

> **Cuesta dinero.** Desde julio de 2025 Meta cobra por cada mensaje de plantilla
> entregado fuera de la ventana de 24 horas, y un recordatorio un día antes siempre cae
> fuera. Las fuentes que consulté sitúan el costo cerca de **US$0,02 por mensaje en
> Chile**, pero no son de Meta: la tarifa en pesos está en la tabla de precios de Meta
> (developers.facebook.com/docs/whatsapp/pricing) y conviene revisarla antes de
> activarlo. Con pocos clientes son centavos; con muchos, sube.
>
> Para probar sin pagar, Meta da un **número de prueba gratuito** que solo escribe a un
> máximo de **5 números** que verifiques, y las plantillas del número de prueba no sirven
> para el de producción.

1. En developers.facebook.com crea una app de tipo *Business*, agrega el producto
   **WhatsApp** y crea (o elige) un *business portfolio*.
2. Copia el **Phone number ID** del número (de prueba o real).
3. Crea un **token permanente**: Business Settings → *System users* → crea uno, dale
   acceso a la cuenta de WhatsApp con los permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`, y genera el token. El temporal expira en horas.
4. **Crea y envía a aprobar las 4 plantillas** (WhatsApp Manager → *Message templates*;
   categoría **Utility**, idioma **Spanish (es)**). Los nombres y los textos tienen que
   coincidir con estos, porque el sistema rellena las variables en este orden:

   | Nombre | Texto |
   |---|---|
   | `recordatorio_cita` | `Hola {{1}}, te recordamos tu cita con {{2}} el {{3}} a las {{4}}. {{5}} ¡Te esperamos!` |
   | `cita_cancelada` | `Hola {{1}}, {{2}} tuvo que cancelar tu cita del {{3}}. Escríbenos para coordinar una nueva fecha.` |
   | `cita_reagendada` | `Hola {{1}}, {{2}} cambió tu cita. Tu nueva hora es el {{3}} a las {{4}}. Si no te acomoda, responde a este mensaje.` |
   | `cuidados_tatuaje` | `Hola {{1}}, gracias por tu sesión con {{2}}. Cuidados de tu tatuaje: {{3}} Cualquier duda, escríbenos.` |

   Variables: `{{1}}` nombre del cliente · `{{2}}` nombre del artista · `{{3}}` día (o día y
   hora en la cancelación, o el texto de cuidados) · `{{4}}` hora · `{{5}}` nota del
   recordatorio. Meta pide un ejemplo por variable (p. ej. *Ana*, *Pablo*, *viernes 16 de
   octubre*, *15:30*, *Si no puedes asistir, avísanos con anticipación.*). No se puede
   empezar ni terminar una plantilla con una variable, por eso todas cierran con texto fijo.
5. En Render → *Environment* agrega:

   | Variable | Valor |
   |---|---|
   | `WHATSAPP_TOKEN` | El token permanente |
   | `WHATSAPP_PHONE_NUMBER_ID` | El Phone number ID |

   Opcionales: `WHATSAPP_API_VERSION` (por defecto `v25.0`; la versión más reciente en
   octubre de 2026 era `v26.0`), `WHATSAPP_LANG` (`es`) y `WHATSAPP_TEMPLATE_RECORDATORIO`,
   `…_CANCELACION`, `…_REAGENDAMIENTO`, `…_CUIDADOS` si bautizaste distinto las plantillas.
6. En **Configuración** el mensaje del canal pasa de «Modo manual» a «WhatsApp conectado».

Quien reciba un mensaje debe haber aceptado que le escriban: la política de Meta exige
consentimiento del cliente (opt-in) incluso con el número de prueba.

## 3 bis. WhatsApp vinculado: automático y gratis, pero no oficial

Es lo más cercano a «gratis y automático». El artista abre **Configuración → Enviar los
mensajes solos** y vincula su WhatsApp como un dispositivo más, igual que WhatsApp Web. Desde
ese momento el servidor envía los recordatorios, avisos y cuidados desde su número, sin pagar
por mensaje ni pasar por Meta.

**Léelo antes de usarlo con clientes reales:**

- **No es la API oficial y los términos de WhatsApp no lo permiten.** El servidor habla con
  WhatsApp haciéndose pasar por un dispositivo vinculado (librería
  [Baileys](https://github.com/WhiskeySockets/Baileys)). Si WhatsApp lo detecta, **puede
  bloquear el número del artista**, y eso es un riesgo real: es el número con el que habla con
  sus clientes. Por eso la pantalla pide aceptarlo y **el servidor lo exige** (`acceptRisk`).
- Para bajar el riesgo el sistema envía **despacio** (pausa de 4 a 9 s entre mensajes y
  «escribiendo…» antes de cada uno), **con tope por hora** (15 por artista), **solo a números
  que existen en WhatsApp**, y solo mensajes sueltos a clientes (nunca difusión). Aun así no
  elimina el riesgo. Conviene un número del estudio, no el personal, y clientes que ya
  escribieron o aceptaron los avisos.
- Es una librería no oficial: cuando WhatsApp cambia su protocolo puede dejar de funcionar
  hasta que se actualice. Por eso cualquier fallo **cae al camino manual** y el mensaje no se
  pierde.
- La vinculación se hace **con código** (WhatsApp → Dispositivos vinculados → Vincular con el
  número de teléfono), no con QR. La sesión se guarda **cifrada** (AES-256-GCM) en la base de
  datos, porque el disco de Render gratuito se borra en cada despliegue.

### Activarlo en el servidor

Viene **apagado**. Para encenderlo:

1. La librería tiene que estar en `backend/package.json` (`npm install --save-exact
   @whiskeysockets/baileys@7.0.0-rc14`). Se importa solo al usar la función, así que sin ella
   el resto del sistema funciona igual. Se fijó la `7.0.0-rc14`, la última, porque la estable
   6.x no se instala en la imagen Alpine (necesita `git`).
2. Crear las tablas: `npm run db:init` (local) o pegar el final de `schema.sql` en Neon
   (`whatsapp_sessions`, `whatsapp_auth` y el nuevo valor `whatsapp_web` del canal en
   `message_log`).
3. Variables de entorno en Render (**no** van en `render.yaml`, que se sincroniza solo y
   dejaría la función encendida para todos): `WHATSAPP_WEB_ENABLED=true` y `WHATSAPP_AUTH_KEY`
   (32 o más caracteres; `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   Guarda esa clave: sin ella las sesiones ya vinculadas no se pueden leer.
4. Opcionales: `WHATSAPP_WEB_MAX_PER_HOUR` (15), `WHATSAPP_WEB_MAX_SESSIONS` (3),
   `WHATSAPP_WEB_IDLE_MINUTES` (5).

### Cómo se usa

1. **Configuración → Enviar los mensajes solos**, leer el aviso, marcar que lo acepta y
   escribir su número de WhatsApp.
2. «Obtener código de vinculación» muestra un código de 8 caracteres. En el teléfono:
   *Ajustes → Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de
   teléfono* y escribirlo. La pantalla se actualiza sola.
3. «Enviarme un mensaje de prueba» manda un mensaje al propio número del artista
   («Mensajes contigo») para comprobar que funciona.
4. «Desvincular» cierra la sesión también en WhatsApp y borra lo guardado.

### Cómo se comporta

- Se conecta **al enviar** y se cierra a los 5 minutos sin uso, así que no hay una conexión
  abierta por artista todo el día (el plan gratuito de Render tiene 512 MB) y sobrevive a que
  el servidor se duerma.
- Si el artista cierra la sesión desde su teléfono, el servidor lo detecta y olvida la
  vinculación; los mensajes vuelven al camino manual.
- Una corrida de recordatorios con varios clientes tarda: cada mensaje lleva su pausa. Si
  pasa de 20 s, el endpoint del programador responde `202 {status:"en_curso"}` y el trabajo
  sigue en el servidor (el programador externo corta a los 30 s). Dos corridas simultáneas se
  unen en una.
- Es **un servidor con estado**: la conexión vive en memoria. Funciona con una sola instancia,
  como el plan gratuito.

## 4. Textos editables (HU28)

En **Configuración → Mensajes a tus clientes**: el *texto del recordatorio* (va dentro del
recordatorio, en `{{5}}`) y los *cuidados después del tatuaje* (el mensaje de cuidados).
Van en una sola línea (los saltos de línea se juntan) porque la API de WhatsApp no los
admite dentro de una plantilla. Cada mensaje se puede apagar por separado.

## 5. Probarlo

1. Agenda una cita con un cliente que tenga teléfono, para dentro de unas 10 horas, y
   **espera una hora** (no se escribe a los clientes en la hora siguiente a agendar).
2. Espera a la siguiente llamada del programador, o fuerza una:

   ```bash
   curl -X POST https://TU-SERVICIO.onrender.com/api/jobs/reminders -H "X-Cron-Secret: TU_CLAVE"
   ```
3. Debe aparecer en la campanita «Recuerda a … su cita» con el botón de WhatsApp (modo
   manual), o llegar el mensaje al cliente (con la API). En la **agenda** cada cita
   pendiente muestra el estado de su recordatorio.
4. En la ficha del proyecto, cambia el estado de la sesión a *Cancelada*: aparece
   «Avisar la cancelación por WhatsApp».

## Qué no cubre

- **Respuestas del cliente.** Que el cliente cancele respondiendo el mensaje exige un
  webhook entrante de WhatsApp; el marco teórico lo menciona como ejemplo de aviso
  push, pero no está construido.
- **Recordatorios fuera de la ventana de 1 a 24 horas.** Una cita agendada con menos de
  1 hora de anticipación no recibe recordatorio.
