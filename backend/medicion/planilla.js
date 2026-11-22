/**
 * Arma la planilla Excel con que se miden los tres objetivos de reducción de
 * la memoria: inasistencia (−50 %), tiempo de cotización (−40 %) y tiempo de
 * previsualización (−30 %).
 *
 *   node backend/medicion/planilla.js
 *
 * Deja docs/medicion/planilla-medicion.xlsx. Las celdas amarillas se llenan con
 * lo que se mide en la sesión con el cliente experto y con lo que se cuenta en
 * las agendas; todo lo demás son fórmulas: promedios, tasas, reducción y si se
 * alcanza la meta. Ninguna cifra del resultado se escribe a mano.
 *
 * No usa dependencias: un .xlsx es un ZIP de archivos XML, y aquí se arma con
 * zlib, igual que los informes en PDF se imprimen sin Puppeteer. Excel
 * recalcula todas las fórmulas al abrirlo (fullCalcOnLoad).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Con --ejemplo arma una copia llena con datos INVENTADOS, para ver cómo queda
// la planilla completa y cómo se llena. Cada hoja lo dice en su título: ese
// archivo no es una medición y sus cifras no van a la memoria.
const EJEMPLO = process.argv.includes('--ejemplo');
const SALIDA = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'medicion',
  EJEMPLO ? 'planilla-ejemplo.xlsx' : 'planilla-medicion.xlsx'
);
const marca = (titulo) => (EJEMPLO ? `EJEMPLO CON DATOS INVENTADOS · ${titulo}` : titulo);
const AVISO_EJEMPLO =
  'EJEMPLO: datos inventados para mostrar cómo se llena la planilla. No son mediciones y no van a la memoria.';

// ------------------------------------------------------------------ ZIP mínimo
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(archivos) {
  const locales = [];
  const central = [];
  let offset = 0;
  for (const { nombre, datos } of archivos) {
    const crudo = Buffer.from(datos, 'utf8');
    const comprimido = zlib.deflateRawSync(crudo);
    const n = Buffer.from(nombre, 'utf8');
    const crc = crc32(crudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // hora y fecha
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(n.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, n, comprimido);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(0, 12);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comprimido.length, 20);
    cd.writeUInt32LE(crudo.length, 24);
    cd.writeUInt16LE(n.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, n);
    offset += 30 + n.length + comprimido.length;
  }
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// --------------------------------------------------------------------- estilos
// Índices de cellXfs, en el orden en que se declaran en styles.xml.
const E = {
  normal: 0,
  titulo: 1,
  encabezado: 2,
  dato: 3, // amarillo: aquí se escribe lo medido
  calculo: 4, // fórmula, con borde
  porcentaje: 5,
  minutos: 6,
  nota: 7,
  datoPct: 8,
  negrita: 9,
  datoTexto: 10,
};
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFA6A6A6"/></left><right style="thin"><color rgb="FFA6A6A6"/></right><top style="thin"><color rgb="FFA6A6A6"/></top><bottom style="thin"><color rgb="FFA6A6A6"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="49" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="3">
<dxf><font><b/><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>
<dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>
<dxf><font><color rgb="FF7F6000"/></font></dxf>
</dxfs>
</styleSheet>`;

// ------------------------------------------------------------------- celdas
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (v, s = E.normal) => ({ t: 'texto', v, s });
const num = (v, s = E.normal) => ({ t: 'numero', v, s });
const fx = (f, s = E.calculo) => ({ t: 'formula', f, s });
const vacio = (s = E.dato) => ({ t: 'vacio', s });

function celdaXml(ref, c) {
  if (!c) return '';
  switch (c.t) {
    case 'texto':
      return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    case 'numero':
      return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
    case 'formula':
      return `<c r="${ref}" s="${c.s}"><f>${esc(c.f)}</f></c>`;
    default:
      return `<c r="${ref}" s="${c.s}"/>`;
  }
}
const COL = (i) => String.fromCharCode(65 + i);

/**
 * filas: arreglo de filas; cada fila, arreglo de celdas (null = sin celda).
 * extra: anchos, validaciones de lista y formato condicional.
 */
function hoja(filas, { anchos = [], listas = [], condicional = [], combinar = [], alto = {} } = {}) {
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = filas
    .map((fila, i) => {
      const r = i + 1;
      const h = alto[r] ? ` ht="${alto[r]}" customHeight="1"` : '';
      return `<row r="${r}"${h}>${fila.map((c, j) => celdaXml(`${COL(j)}${r}`, c)).join('')}</row>`;
    })
    .join('');
  const merge = combinar.length
    ? `<mergeCells count="${combinar.length}">${combinar.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  const cf = condicional
    .map(
      (rango, i) =>
        `<conditionalFormatting sqref="${rango}">` +
        `<cfRule type="cellIs" dxfId="0" priority="${i * 3 + 1}" operator="equal"><formula>"Cumple"</formula></cfRule>` +
        `<cfRule type="cellIs" dxfId="1" priority="${i * 3 + 2}" operator="equal"><formula>"No cumple"</formula></cfRule>` +
        `<cfRule type="cellIs" dxfId="2" priority="${i * 3 + 3}" operator="equal"><formula>"Falta medir"</formula></cfRule>` +
        `</conditionalFormatting>`
    )
    .join('');
  const dv = listas.length
    ? `<dataValidations count="${listas.length}">${listas
        .map(
          ({ rango, valores }) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${rango}"><formula1>"${valores.join(',')}"</formula1></dataValidation>`
        )
        .join('')}</dataValidations>`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}` +
    `<sheetData>${rows}</sheetData>${merge}${cf}${dv}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

// ----------------------------------------------------- hojas de tiempos (A/B)
const PARES = 4;

/**
 * Cotización y previsualización comparten forma: pares de diseños parecidos,
 * uno se hace con el método de antes y el otro con la plataforma, alternando
 * cuál va primero para que el aprendizaje no favorezca a ninguno.
 */
function hojaTiempos({ titulo, explica, columnaExtra, valoresExtra, antes, despues, ejemplo }) {
  const PRIMERA = 6; // primera fila de datos
  const filas = [
    [txt(marca(titulo), E.titulo)],
    [txt(explica, E.nota)],
    [
      txt(
        EJEMPLO ? AVISO_EJEMPLO : 'Las celdas amarillas se llenan durante la sesión. Las blancas son fórmulas: no se tocan.',
        E.nota
      ),
    ],
    [],
    ['Par', 'Diseño (nombre o referencia)', 'Tamaño (cm)', columnaExtra, 'Método', 'Orden', 'Minutos', 'Segundos', 'Tiempo (min)', 'Observaciones'].map(
      (h) => txt(h, E.encabezado)
    ),
  ];
  let r = PRIMERA;
  for (let par = 1; par <= PARES; par++) {
    // En los pares impares va primero el método de antes; en los pares, la plataforma.
    const orden = par % 2 === 1 ? [antes, despues] : [despues, antes];
    for (let k = 0; k < 2; k++) {
      const e = EJEMPLO ? ejemplo[(par - 1) * 2 + k] : null;
      const texto = (v) => (v ? txt(v, E.datoTexto) : vacio(E.datoTexto));
      const numero = (v) => (v === undefined || v === null ? vacio() : num(v, E.dato));
      filas.push([
        num(par, E.calculo),
        texto(e?.diseno),
        texto(e?.tamano),
        texto(e?.extra),
        txt(orden[k], E.calculo),
        num((par - 1) * 2 + k + 1, E.calculo),
        numero(e?.min),
        numero(e?.seg),
        fx(`IF(COUNT(G${r}:H${r})=0,"",N(G${r})+N(H${r})/60)`, E.minutos),
        texto(e?.obs),
      ]);
      r++;
    }
  }
  const ULT = r - 1;
  const rango = (c) => `$${c}$${PRIMERA}:$${c}$${ULT}`;
  const promedio = (m) => `IFERROR(AVERAGEIFS(${rango('I')},${rango('E')},"${m}"),"")`;
  const cuenta = (m) => `COUNTIFS(${rango('E')},"${m}",${rango('I')},">0")`;
  filas.push([]);
  // El bloque de resultado parte en la columna B, que es ancha: la A solo
  // tiene el número del par.
  const R1 = filas.length + 1;
  filas.push([null, txt('Resultado', E.encabezado), txt('Mediciones', E.encabezado), txt('Promedio (min)', E.encabezado)]);
  filas.push([null, txt(antes, E.calculo), fx(cuenta(antes)), fx(promedio(antes), E.minutos)]);
  filas.push([null, txt(despues, E.calculo), fx(cuenta(despues)), fx(promedio(despues), E.minutos)]);
  filas.push([
    null,
    txt('Reducción del tiempo', E.negrita),
    null,
    fx(`IF(OR(D${R1 + 1}="",D${R1 + 2}=""),"",(D${R1 + 1}-D${R1 + 2})/D${R1 + 1})`, E.porcentaje),
  ]);
  return {
    filas,
    reduccion: `D${R1 + 3}`,
    promAntes: `D${R1 + 1}`,
    promDespues: `D${R1 + 2}`,
    extra: {
      anchos: [7, 30, 12, 16, 14, 8, 10, 10, 13, 40],
      listas: [{ rango: `D${PRIMERA}:D${ULT}`, valores: valoresExtra }],
      combinar: ['A2:J2', 'A3:J3'],
      alto: { 2: 45 },
    },
  };
}

const cotizacion = hojaTiempos({
  titulo: 'Tiempo de cotización: a mano frente a la plataforma (meta: −40 %)',
  explica:
    'Se cronometra desde que el tatuador tiene el diseño y su tamaño hasta que tiene el costo de los insumos y sabe si le alcanza el stock. A mano: con calculadora, sus listas de precios y revisando el inventario físico. Con la plataforma: abriendo la cotización del proyecto.',
  columnaExtra: 'Negro o color',
  valoresExtra: ['Negro', 'Color'],
  antes: 'Manual',
  despues: 'Plataforma',
  // Solo para --ejemplo. Mismo orden que las filas: Manual, Plataforma,
  // Plataforma, Manual, Manual, Plataforma, Plataforma, Manual.
  ejemplo: [
    { diseno: 'Rosa tradicional', tamano: '10 x 12', extra: 'Color', min: 14, seg: 20 },
    { diseno: 'Clavel tradicional', tamano: '10 x 11', extra: 'Color', min: 4, seg: 5 },
    { diseno: 'Golondrina', tamano: '8 x 8', extra: 'Color', min: 3, seg: 10 },
    { diseno: 'Gorrión', tamano: '8 x 9', extra: 'Color', min: 11, seg: 45 },
    { diseno: 'Calavera', tamano: '12 x 15', extra: 'Negro', min: 16, seg: 30, obs: 'Revisó dos veces el stock de agujas' },
    { diseno: 'Lobo realista', tamano: '12 x 14', extra: 'Negro', min: 4, seg: 40 },
    { diseno: 'Lettering «Familia»', tamano: '15 x 4', extra: 'Negro', min: 2, seg: 50 },
    { diseno: 'Frase en cursiva', tamano: '14 x 4', extra: 'Negro', min: 9, seg: 55 },
  ],
});

const previsualizacion = hojaTiempos({
  titulo: 'Tiempo de previsualización: stencil en papel frente al visor 3D (meta: −30 %)',
  explica:
    'Se cronometra desde que se decide probar el diseño en una zona hasta que el tatuador da por buenos el tamaño y la ubicación. Con stencil: imprimir, recortar, colocar sobre la piel y repetir si el tamaño no sirve. Con el visor: elegir el modelo, colocar el boceto y ajustarlo.',
  columnaExtra: 'Zona del cuerpo',
  valoresExtra: ['Antebrazo', 'Brazo', 'Pierna', 'Espalda', 'Pecho', 'Otra'],
  antes: 'Stencil',
  despues: 'Visor 3D',
  // Solo para --ejemplo. Orden: Stencil, Visor, Visor, Stencil, Stencil,
  // Visor, Visor, Stencil.
  ejemplo: [
    { diseno: 'Mandala', tamano: '14 x 14', extra: 'Antebrazo', min: 17, seg: 40 },
    { diseno: 'Rosetón geométrico', tamano: '13 x 13', extra: 'Antebrazo', min: 7, seg: 15 },
    { diseno: 'Pez koi', tamano: '20 x 12', extra: 'Brazo', min: 8, seg: 30 },
    { diseno: 'Dragón oriental', tamano: '20 x 13', extra: 'Brazo', min: 21, seg: 10, obs: 'Se reimprimió el stencil una vez' },
    { diseno: 'Línea floral', tamano: '10 x 6', extra: 'Antebrazo', min: 12, seg: 5 },
    { diseno: 'Rama con hojas', tamano: '10 x 5', extra: 'Antebrazo', min: 6, seg: 20 },
    { diseno: 'Brújula', tamano: '9 x 9', extra: 'Pierna', min: 5, seg: 50 },
    { diseno: 'Reloj de bolsillo', tamano: '9 x 10', extra: 'Pierna', min: 13, seg: 30 },
  ],
});

// --------------------------------------------------------------- inasistencia
const MESES = 6;
const formatoInas = { anchos: [38, 20, 15, 14], combinar: ['A2:D2'], alto: { 2: 48 } };
function bloqueInasistencia(filas, titulo, fuente, ejemplo = []) {
  filas.push([txt(titulo, E.negrita)]);
  const rFuente = filas.length + 1;
  filas.push([txt(fuente, E.nota)]);
  formatoInas.combinar.push(`A${rFuente}:D${rFuente}`);
  formatoInas.alto[rFuente] = 32;
  filas.push(['Mes (aaaa-mm)', 'Citas con resultado', 'Inasistencias', 'Tasa del mes'].map((h) => txt(h, E.encabezado)));
  const desde = filas.length + 1;
  for (let i = 0; i < MESES; i++) {
    const r = filas.length + 1;
    const e = EJEMPLO ? ejemplo[i] : null;
    filas.push([
      e ? txt(e.mes, E.datoTexto) : vacio(E.datoTexto),
      e ? num(e.citas, E.dato) : vacio(),
      e ? num(e.faltas, E.dato) : vacio(),
      fx(`IF(N(B${r})=0,"",C${r}/B${r})`, E.porcentaje),
    ]);
  }
  const hasta = filas.length;
  const t = filas.length + 1;
  filas.push([
    txt('Total del periodo', E.negrita),
    fx(`SUM(B${desde}:B${hasta})`),
    fx(`SUM(C${desde}:C${hasta})`),
    fx(`IF(B${t}=0,"",C${t}/B${t})`, E.porcentaje),
  ]);
  filas.push([]);
  return `D${t}`;
}

const inas = [
  [txt(marca('Inasistencia de clientes: antes y después de la plataforma (meta: −50 %)'), E.titulo)],
  [
    txt(
      'Una inasistencia es una cita a la que el cliente no llegó sin avisar. Una cancelación avisada no cuenta como inasistencia. «Citas con resultado» = citas atendidas + inasistencias, sin contar las canceladas.',
      E.nota
    ),
  ],
  EJEMPLO ? [txt(AVISO_EJEMPLO, E.nota)] : [],
];
if (EJEMPLO) formatoInas.combinar.push('A3:D3');
const tasaAntes = bloqueInasistencia(
  inas,
  'Antes: agenda anterior a la plataforma',
  'Se cuentan en el cuaderno, la agenda o los mensajes de Instagram los meses previos a usar la plataforma.',
  // Solo para --ejemplo.
  [
    { mes: '2026-05', citas: 22, faltas: 4 },
    { mes: '2026-06', citas: 19, faltas: 3 },
    { mes: '2026-07', citas: 24, faltas: 5 },
  ]
);
const tasaDespues = bloqueInasistencia(
  inas,
  'Después: citas registradas en la plataforma',
  'Se cuentan en la plataforma (estado «completada» y «no asistió»); la consulta está en docs/medicion/README.md. Cada cita pasada debe quedar marcada con su resultado.',
  // Solo para --ejemplo.
  [
    { mes: '2026-10', citas: 21, faltas: 1 },
    { mes: '2026-11', citas: 18, faltas: 1 },
  ]
);
const rRed = inas.length + 1;
inas.push([
  txt('Reducción de la tasa de inasistencia', E.negrita),
  null,
  null,
  fx(`IF(OR(${tasaAntes}="",${tasaDespues}="",N(${tasaAntes})=0),"",(${tasaAntes}-${tasaDespues})/${tasaAntes})`, E.porcentaje),
]);

// -------------------------------------------------------------------- resumen
const cumple = (red, meta) => `IF(${red}="","Falta medir",IF(${red}>=${meta},"Cumple","No cumple"))`;
const resumen = [
  [txt(marca('Medición de los objetivos de reducción'), E.titulo)],
  [
    txt(
      EJEMPLO
        ? AVISO_EJEMPLO
        : 'Esta hoja no se llena: toma sus valores de las otras tres. Una meta se cumple cuando la reducción medida es igual o mayor que la comprometida en la memoria.',
      E.nota
    ),
  ],
  [],
  ['Objetivo específico', 'Indicador', 'Antes', 'Después', 'Reducción', 'Meta', 'Estado'].map((h) => txt(h, E.encabezado)),
  [
    txt('Disminuir la inasistencia de los clientes', E.calculo),
    txt('Tasa de inasistencia', E.calculo),
    fx(`Inasistencia!${tasaAntes}`, E.porcentaje),
    fx(`Inasistencia!${tasaDespues}`, E.porcentaje),
    fx(`Inasistencia!D${rRed}`, E.porcentaje),
    num(0.5, E.porcentaje),
    fx(cumple('E5', 'F5')),
  ],
  [
    txt('Reducir el tiempo de cálculo de costos y revisión de stock', E.calculo),
    txt('Minutos promedio por cotización', E.calculo),
    fx(`'Cotización'!${cotizacion.promAntes}`, E.minutos),
    fx(`'Cotización'!${cotizacion.promDespues}`, E.minutos),
    fx(`'Cotización'!${cotizacion.reduccion}`, E.porcentaje),
    num(0.4, E.porcentaje),
    fx(cumple('E6', 'F6')),
  ],
  [
    txt('Reducir el tiempo de pruebas de tamaño y ubicación', E.calculo),
    txt('Minutos promedio por prueba', E.calculo),
    fx(`'Previsualización'!${previsualizacion.promAntes}`, E.minutos),
    fx(`'Previsualización'!${previsualizacion.promDespues}`, E.minutos),
    fx(`'Previsualización'!${previsualizacion.reduccion}`, E.porcentaje),
    num(0.3, E.porcentaje),
    fx(cumple('E7', 'F7')),
  ],
  [],
  [txt('Datos de la sesión', E.negrita)],
  // B a E van combinadas; las celdas que quedan bajo la combinación llevan el
  // mismo estilo para que el borde y el relleno se dibujen completos.
  [txt('Fecha', E.calculo), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto)],
  [txt('Lugar', E.calculo), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto)],
  [
    txt('Participante', E.calculo),
    txt('Héctor Salazar Moya, tatuador profesional (cliente experto)', E.datoTexto),
    vacio(E.datoTexto),
    vacio(E.datoTexto),
    vacio(E.datoTexto),
  ],
  [txt('Cronometró', E.calculo), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto), vacio(E.datoTexto)],
];

// ---------------------------------------------------------------- cómo llenarla
const pasos = [
  'Antes de la sesión: elegir 8 diseños para cotizar y 8 para previsualizar, agrupados en 4 pares de diseños parecidos (tamaño y si van en negro o color). Anotarlos en las hojas.',
  'Cada par se hace una vez con el método de antes y otra con la plataforma, sobre diseños distintos pero comparables: así el segundo intento no sale más rápido solo por haber pensado ya el mismo diseño.',
  'El orden ya está alternado en la planilla (columna «Orden»): en los pares 1 y 3 va primero el método de antes; en los 2 y 4, la plataforma. Seguir ese orden.',
  'Cronometrar con el teléfono y anotar minutos y segundos. Quien cronometra no ayuda ni comenta durante la tarea.',
  'Si algo interrumpe una tarea (una llamada, un error ajeno a la tarea), se anota en Observaciones y se repite esa tarea.',
  'Inasistencia: contar mes a mes en la agenda anterior (antes) y en la plataforma (después). Al menos 3 meses antes y 1 mes después.',
  'La hoja Resumen se llena sola. Lo que diga, se copia a la memoria tal cual, cumpla o no la meta.',
];
const instrucciones = [
  [txt('Cómo llenar esta planilla', E.titulo)],
  [],
  ...pasos.map((p, i) => [num(i + 1, E.negrita), txt(p, E.nota)]),
];

// --------------------------------------------------------------------- libro
const HOJAS = [
  {
    nombre: 'Resumen',
    xml: hoja(resumen, {
      anchos: [58, 32, 11, 11, 12, 9, 14],
      condicional: ['G5:G7'],
      combinar: ['A2:G2', 'B10:E10', 'B11:E11', 'B12:E12', 'B13:E13'],
      alto: { 2: 32 },
    }),
  },
  { nombre: 'Cotización', xml: hoja(cotizacion.filas, cotizacion.extra) },
  { nombre: 'Previsualización', xml: hoja(previsualizacion.filas, previsualizacion.extra) },
  { nombre: 'Inasistencia', xml: hoja(inas, formatoInas) },
  {
    nombre: 'Cómo llenarla',
    xml: hoja(instrucciones, { anchos: [5, 100], alto: Object.fromEntries(pasos.map((_, i) => [i + 3, 32])) }),
  },
];

const archivos = [
  {
    nombre: '[Content_Types].xml',
    datos:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      HOJAS.map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      ).join('') +
      '</Types>',
  },
  {
    nombre: '_rels/.rels',
    datos:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  },
  {
    nombre: 'xl/workbook.xml',
    datos:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${HOJAS.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>',
  },
  {
    nombre: 'xl/_rels/workbook.xml.rels',
    datos:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      HOJAS.map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      ).join('') +
      `<Relationship Id="rId${HOJAS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
  },
  { nombre: 'xl/styles.xml', datos: ESTILOS },
  ...HOJAS.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: h.xml })),
];

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, zip(archivos));
console.log(`Planilla generada: ${path.relative(process.cwd(), SALIDA)}`);
