/**
 * Arma las fichas de historia de usuario del Anexo A.2 de la memoria.
 *
 *   node tesis/fichas.js            # escribe tesis/fichas-hu.tex
 *
 * No inventa datos: lee del propio main.tex las tres tablas del Capítulo 3
 * —historias (HU, actor, descripción), priorización y estimación, y asignación
 * a iteraciones— y las reúne en una tabla por historia. Lo único que vive aquí
 * es el nombre corto de cada historia, que el Capítulo 3 no tiene, y la
 * observación sobre su cobertura o su descarte.
 *
 * Si se corrige una descripción, una prioridad o una iteración en el Capítulo 3,
 * basta volver a correr este guion: las fichas se rehacen con el dato nuevo.
 */
const fs = require('fs');
const path = require('path');

const TEX = path.join(__dirname, 'main.tex');
const SALIDA = path.join(__dirname, 'fichas-hu.tex');

// Nombre corto de cada historia. El Capítulo 3 solo trae la descripción larga.
const NOMBRES = {
  HU01: 'Registro de cuenta en la plataforma',
  HU02: 'Inicio y cierre de sesión',
  HU03: 'Recuperación de contraseña olvidada',
  HU04: 'Importación de bocetos a la nube',
  HU05: 'Galería de diseños',
  HU06: 'Eliminación de un boceto de la galería',
  HU07: 'Etiquetado y filtrado de bocetos',
  HU08: 'Selección del modelo anatómico 3D',
  HU09: 'Proyección del boceto sobre el modelo 3D',
  HU10: 'Escalado, traslado y giro del diseño',
  HU11: 'Registro de insumos del inventario',
  HU12: 'Edición y baja de insumos',
  HU13: 'Alerta de insumo en nivel crítico',
  HU14: 'Cálculo automático del costo de insumos',
  HU15: 'Ajuste manual de la cotización',
  HU16: 'Descuento de stock al cerrar la sesión',
  HU17: 'Agendamiento de una cita',
  HU18: 'Calendario mensual y semanal de citas',
  HU19: 'Creación de proyectos y sesiones por cliente',
  HU20: 'Fotografías de avance por sesión',
  HU21: 'Reagendamiento y cancelación de citas',
  HU22: 'Recordatorio automático por WhatsApp',
  HU23: 'Aviso al cliente por cambio o cancelación',
  HU24: 'Historial de sesiones del cliente',
  HU25: 'Panel de control con citas y alertas de stock',
  HU26: 'Resumen de ingresos del mes',
  HU27: 'Bloqueo del calendario por días y horas de trabajo',
  HU28: 'Edición del texto de los mensajes al cliente',
  HU29: 'Registro de clientes atendidos',
  HU30: 'Puntaje de responsabilidad de los clientes',
  HU31: 'Alta de estudios en la plataforma',
  HU32: 'Activación y desactivación de un estudio',
  HU33: 'Incorporación de tatuadores a un estudio',
  HU34: 'Baja o desactivación de un tatuador',
  HU35: 'Listado de estudios y tatuadores',
  HU36: 'Métricas globales de uso por estudio',
  HU37: 'Gestión del catálogo de modelos 3D',
  HU38: 'Restablecimiento de contraseña de un usuario',
};

// Caso de aceptación que cubre cada historia (Capítulo 5 y Anexo B.1).
const ACEPTACION = {
  'PA-01': ['HU01', 'HU02', 'HU03'],
  'PA-02': ['HU04', 'HU05', 'HU06', 'HU07'],
  'PA-03': ['HU11', 'HU12', 'HU13', 'HU25', 'HU26'],
  'PA-04': ['HU14', 'HU15', 'HU16'],
  'PA-05': ['HU17', 'HU18', 'HU19', 'HU20', 'HU24', 'HU30'],
  'PA-06': ['HU21', 'HU22', 'HU23', 'HU28', 'HU29', 'HU31'],
  'PA-07': ['HU08', 'HU09', 'HU10'],
  'PA-08': ['HU32', 'HU33', 'HU34', 'HU38'],
  'PA-09': ['HU35', 'HU36'],
};

// Lo que hay que decir además de la cobertura, cuando corresponde.
const NOTAS = {
  HU27: 'No implementada. Se descartó durante la Iteración 5 porque describía una forma de '
    + 'trabajar que no era la del estudio: el tatuador no tiene un horario fijo que declarar. '
    + 'La necesidad detrás de ella quedó cubierta por la revisión de solapamientos de la agenda.',
  HU37: 'No implementada. Quedó como trabajo futuro en la Iteración 10 al comprobarse que su '
    + 'costo real —almacenamiento de modelos, validación de formatos y versionado del catálogo '
    + 'compartido— era desproporcionado frente a lo que aportaba.',
  HU29: 'No necesitó desarrollo propio: la ficha de cliente de la agenda ya resolvía el registro.',
  HU30: 'La historia se replanteó durante la Iteración 6. El puntaje no se guarda como un valor '
    + 'fijo del cliente, sino que se calcula como el promedio de las sesiones calificadas, de '
    + 'modo que nunca queda desactualizado.',
  HU22: 'El envío depende de un servicio externo, por lo que la historia contempla además un '
    + 'camino manual cuando la API de WhatsApp no está disponible.',
};

// ---------------------------------------------------------------- lectura ---
const tex = fs.readFileSync(TEX, 'utf8');

function filasDe(etiqueta, columnas) {
  const bloque = tex.slice(tex.indexOf('\\label{' + etiqueta + '}'));
  const fin = bloque.indexOf('\\end{longtable}');
  const cuerpo = bloque.slice(0, fin === -1 ? bloque.indexOf('\\end{table}') : fin);
  const filas = {};
  for (const linea of cuerpo.split('\n')) {
    const m = linea.match(/^\s*(HU\d{2})\s*&\s*(.*?)\s*\\\\/);
    if (!m) continue;
    const partes = m[2].split('&').map((s) => s.trim().replace(/\s*\\hline\s*$/, ''));
    if (partes.length < columnas - 1) continue;
    filas[m[1]] = partes;
  }
  return filas;
}

const historias = filasDe('tab:hu', 3);          // actor, descripción
const prioridades = filasDe('tab:prioridad', 3); // prioridad, estimación

const iteraciones = {};
{
  const bloque = tex.slice(tex.indexOf('\\label{tab:iteraciones}'));
  const cuerpo = bloque.slice(0, bloque.indexOf('\\end{table}'));
  for (const linea of cuerpo.split('\n')) {
    const m = linea.match(/^\s*(\d+)\s*&\s*(HU[\d,\s HU]*)\s*\\\\/);
    if (!m) continue;
    for (const hu of m[2].match(/HU\d{2}/g) || []) iteraciones[hu] = m[1];
  }
}

const casoDe = {};
for (const [pa, hus] of Object.entries(ACEPTACION)) for (const hu of hus) casoDe[hu] = pa;

// --------------------------------------------------------------- dibujado ---
const codigos = Object.keys(NOMBRES).sort();
const faltan = codigos.filter((c) => !historias[c] || !prioridades[c] || !iteraciones[c]);
if (faltan.length) { console.error('ERROR: sin datos completos para ' + faltan.join(', ')); process.exit(1); }

let salida = `% Generado por tesis/fichas.js a partir de las tablas del Capítulo 3.
% No editar a mano: los cambios se pierden al volver a generar.

\\section{Fichas de historias de usuario}
\\label{anx:fichas}

A continuación se presenta el detalle de cada una de las 38 historias de usuario resumidas en la Tabla \\ref{tab:hu} (Sección \\ref{sec:requisitos}), en el formato de ficha que utiliza la metodología PXP. Cada ficha reúne el actor que pide la historia, la prioridad de negocio y la estimación de esfuerzo asignadas en la planificación (Tabla \\ref{tab:prioridad}), la iteración en que se abordó (Tabla \\ref{tab:iteraciones}), la descripción y una observación sobre su cobertura en el plan de pruebas o sobre el motivo de su descarte cuando corresponde.
`;

for (const cod of codigos) {
  const [actor, descripcion] = historias[cod];
  const [prioridad, estimacion] = prioridades[cod];
  const nombre = NOMBRES[cod];
  const pa = casoDe[cod];
  const partes = [];
  if (pa) partes.push(`Cubierta por el caso de aceptación ${pa} (Anexo \\ref{anx:aceptacion})`);
  if (NOTAS[cod]) partes.push(NOTAS[cod]);
  const observaciones = partes.length
    ? partes.map((p, i) => (i === 0 && pa ? p + '.' : p)).join(' ')
    : 'Sin observaciones adicionales.';

  const comoActor = 'Como ' + actor.toLowerCase() + ', ' + descripcion;

  salida += `
\\begin{table}[H]
  \\centering
  \\caption{Historia de usuario ${cod}}
  \\label{tab:ficha${cod.toLowerCase()}}
  \\renewcommand{\\arraystretch}{1.3}
  \\small
  \\begin{tabular}{|>{\\raggedright\\arraybackslash}p{6.5cm}|>{\\raggedright\\arraybackslash}p{6.5cm}|}
    \\hline
    \\multicolumn{2}{|c|}{\\textbf{Historia de usuario}} \\\\ \\hline
    \\textbf{Número:} ${cod} & \\textbf{Actor:} ${actor} \\\\ \\hline
    \\multicolumn{2}{|>{\\raggedright\\arraybackslash}p{13.4cm}|}{\\textbf{Nombre:} ${nombre}} \\\\ \\hline
    \\textbf{Prioridad de negocio:} ${prioridad} & \\textbf{Estimación de esfuerzo:} ${estimacion} \\\\ \\hline
    \\multicolumn{2}{|>{\\raggedright\\arraybackslash}p{13.4cm}|}{\\textbf{Iteración asignada:} ${iteraciones[cod]}} \\\\ \\hline
    \\multicolumn{2}{|>{\\raggedright\\arraybackslash}p{13.4cm}|}{\\textbf{Descripción:} ${comoActor}} \\\\ \\hline
    \\multicolumn{2}{|>{\\raggedright\\arraybackslash}p{13.4cm}|}{\\textbf{Observaciones:} ${observaciones}} \\\\ \\hline
  \\end{tabular}
\\end{table}
`;
}

fs.writeFileSync(SALIDA, salida, 'utf8');
console.log(codigos.length + ' fichas escritas en ' + path.basename(SALIDA));
console.log('sin caso de aceptación: ' + codigos.filter((c) => !casoDe[c]).join(', '));
