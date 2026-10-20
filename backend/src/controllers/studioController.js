const studioModel = require('../models/studioModel');
const userModel = require('../models/userModel');
const { sendError } = require('../utils/fields');

// Un mes y algo de margen: el resumen es mensual.
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

// GET /api/studio  → { studio, isOwner }: si la cuenta es dueña de un estudio (para el menú)
async function mine(req, res) {
  try {
    const owned = await studioModel.findOwnedBy(req.user.sub);
    if (owned) return res.json({ studio: owned, isOwner: true });
    const me = await userModel.findById(req.user.sub);
    return res.json({ studio: me?.studio_id ? { id: me.studio_id } : null, isOwner: false });
  } catch (err) {
    return sendError(res, err, 'leyendo el estudio');
  }
}

// GET /api/studio/summary?from=&to=  → lo que entró por tatuador (solo el dueño)
async function summary(req, res) {
  const from = new Date(String(req.query.from ?? ''));
  const to = new Date(String(req.query.to ?? ''));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return res.status(400).json({ message: 'Indica un rango de fechas válido (from y to).' });
  }
  if (to - from > MAX_RANGE_MS) {
    return res.status(400).json({ message: 'El resumen es de un mes a la vez.' });
  }

  try {
    const studio = await studioModel.findOwnedBy(req.user.sub);
    // Los montos de cada tatuador son información sensible: solo los ve el dueño.
    if (!studio) return res.status(403).json({ message: 'Solo el dueño del estudio ve este resumen.' });

    const tattooists = await studioModel.summary(studio.id, { from: from.toISOString(), to: to.toISOString() });
    const sum = (key) => tattooists.reduce((n, t) => n + t[key], 0);
    return res.json({
      studio,
      tattooists,
      totals: {
        collected: sum('collected'),
        pending: sum('pending'),
        sessionsDone: sum('sessions_done'),
        appointments: sum('appointments'),
      },
    });
  } catch (err) {
    return sendError(res, err, 'armando el resumen del estudio');
  }
}

module.exports = { mine, summary };
