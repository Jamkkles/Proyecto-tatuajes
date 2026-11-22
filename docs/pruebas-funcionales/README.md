# Pruebas funcionales (caja negra)

Los 35 casos CP-01 a CP-35 del capítulo 5 de la memoria. Cada uno entra por la
API, igual que lo hace la aplicación, y compara la respuesta con lo esperado,
sin mirar cómo está escrito el sistema por dentro.

Once de los 35 esperan un **rechazo** (registro con correo repetido, boceto sin
título, cita que se solapa, cotización descontada dos veces…) y cuatro
comprueban que un artista **no alcanza los datos de otro**: para eso la corrida
crea dos cuentas distintas.

## Cómo se corren

```bash
ADMIN_EMAIL=… ADMIN_PASSWORD=… node backend/funcional/correr.js
node backend/funcional/tablas.js
```

- Van contra el backend **local** (`docker compose up`); el guión se niega a
  correr si `BASE` apunta a otro lado, porque crea cuentas y un estudio.
- CP-34 y CP-35 necesitan una cuenta de administrador. Sin `ADMIN_EMAIL` y
  `ADMIN_PASSWORD` esos dos fallan por falta de credenciales y los otros 33
  corren igual; el guión lo avisa antes de llegar a ellos.
- La primera escribe `casos.json` en esta carpeta; la segunda arma con él
  `tablas-casos.tex`, las cuatro tablas de la memoria (5.2 a 5.5), listas para
  pegar en `tesis/main.tex`. Las cifras salen de la corrida, nunca a mano.
- Las cuentas que crea (`cp-…@pruebas.local`) quedan en la base. Al terminar
  imprime el `DELETE` que las borra.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `tablas-casos.tex` | Las tablas de la corrida que reporta la memoria: 35 de 35 conformes |

El `casos.json` de esa corrida no se conservó; las tablas sí, y son las mismas
que están en el capítulo 5. Volver a correr el guión regenera los dos.
