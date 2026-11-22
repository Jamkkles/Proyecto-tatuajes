/**
 * Arma las tablas de casos de prueba de la memoria (Tablas 5.2 a 5.5) a partir
 * de la corrida real que deja `correr.js`.
 *
 *   node backend/funcional/tablas.js
 *
 * Lee docs/pruebas-funcionales/casos.json y escribe tablas-casos.tex al lado,
 * listo para pegar en tesis/main.tex. Las cifras salen de la corrida, nunca a mano.
 */
const fs = require('fs');
const path = require('path');

const CARPETA = path.join(__dirname, '..', '..', 'docs', 'pruebas-funcionales');
const { casos } = JSON.parse(fs.readFileSync(path.join(CARPETA, 'casos.json'), 'utf8'));

const esc = (s) =>
  String(s)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');

const GRUPOS = [
  ['Autenticación y bocetos', ['Autenticación', 'Bocetos'], 'tab:casosauth'],
  ['Previsualización, inventario y cotizaciones', ['Previsualización', 'Inventario', 'Cotizaciones'], 'tab:casosinv'],
  ['Agenda y pagos', ['Agenda'], 'tab:casosagenda'],
  ['Avisos y administración', ['Avisos', 'Administración'], 'tab:casosadmin'],
];

let out = '';
for (const [titulo, modulos, label] of GRUPOS) {
  const filas = casos.filter((c) => modulos.includes(c.modulo));
  out += `\\begin{table}[H]\n  \\centering\n  \\caption{Casos de prueba funcional: ${titulo.toLowerCase()}}\n`;
  out += `  \\label{${label}}\n  \\renewcommand{\\arraystretch}{1.2}\n`;
  out += '  \\footnotesize\n';
  out += '  \\begin{tabular}{|c|p{5.9cm}|p{5.3cm}|}\n    \\hline\n';
  out += '    \\textbf{ID} & \\textbf{Caso de prueba y resultado esperado} & \\textbf{Resultado obtenido} \\\\\n    \\hline\n';
  for (const c of filas) {
    const caso = `${esc(c.descripcion)} (${esc(c.hu)}). ${esc(c.esperado)}`;
    out += `    ${c.id} & ${caso} & ${esc(c.obtenido)} \\\\ \\hline\n`;
  }
  out += '  \\end{tabular}\n\\end{table}\n\n';
}

fs.writeFileSync(path.join(CARPETA, 'tablas-casos.tex'), out);
console.log('casos:', casos.length, 'conformes:', casos.filter((c) => c.ok).length);
console.log('bytes:', Buffer.byteLength(out));
