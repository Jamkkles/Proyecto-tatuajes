const { notify } = require('./notifier');
const { ZONE } = require('../utils/chileTime');

const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }); // 2026-10-16

/**
 * Avisa de los insumos que llegaron a su nivel crítico (HU13, HU25).
 *
 * Como mucho un aviso por insumo y por día: si el artista sigue gastando lo que
 * queda no le llega uno por cada descuento, pero al día siguiente, si sigue sin
 * reponerlo, se lo vuelve a recordar.
 *
 * @param {Array<{id, name, unit, quantity, min_quantity}>} materials
 */
async function notifyLowStock(userId, materials, now = new Date()) {
  for (const m of materials) {
    if (m.quantity > m.min_quantity) continue;
    await notify(userId, {
      kind: 'stock_bajo',
      title: `${m.name} llegó a su nivel crítico`,
      body: `Quedan ${m.quantity} ${m.unit} (mínimo ${m.min_quantity}). Es hora de reponer.`,
      url: '/inventario',
      data: { materialId: m.id },
      dedupeKey: `stock:${m.id}:${day.format(now)}`,
    });
  }
}

/**
 * Avisa de los insumos que no alcanzaron para descontar una cotización. Uno por
 * insumo, cotización y día: reintentar sin reponer no llena la campanita.
 *
 * @param {Array<{id, name, unit, needed, available, missing}>} shortages
 */
async function notifyShortages(userId, quote, shortages, now = new Date()) {
  for (const m of shortages) {
    await notify(userId, {
      kind: 'stock_faltante',
      title: `Falta ${m.name} para descontar «${quote.title}»`,
      body: `La cotización necesita ${m.needed} ${m.unit} y tienes ${m.available}. Repón ${m.missing} ${m.unit} y vuelve a descontar.`,
      url: '/inventario',
      data: { materialId: m.id, quoteId: quote.id },
      dedupeKey: `faltante:${quote.id}:${m.id}:${day.format(now)}`,
    });
  }
}

module.exports = { notifyLowStock, notifyShortages };
