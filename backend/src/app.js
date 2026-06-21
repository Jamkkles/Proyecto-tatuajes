const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const { requireAuth } = require('./middleware/auth');

// Construye y configura la app de Express sin ponerla a escuchar.
// Se exporta así para poder importarla en las pruebas (supertest).
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

// Ruta protegida de ejemplo: devuelve el usuario del token.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email });
});

module.exports = app;
