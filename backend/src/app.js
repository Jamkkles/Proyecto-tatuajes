const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const sketchRoutes = require('./routes/sketchRoutes');
const previewRoutes = require('./routes/previewRoutes');
const clientRoutes = require('./routes/clientRoutes');
const projectRoutes = require('./routes/projectRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const { requireAuth } = require('./middleware/auth');
const localDriver = require('./services/storage/localDriver');

// Construye y configura la app de Express sin ponerla a escuchar.
// Se exporta así para poder importarla en las pruebas (supertest).
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Imágenes del driver de disco local. Con STORAGE_DRIVER=cloudinary esta ruta
// deja de usarse (las URLs apuntan al CDN) pero se mantiene para poder seguir
// mostrando los bocetos subidos antes de migrar.
// Cada boceto se guarda con un nombre nuevo (UUID) y nunca se sobrescribe: si
// cambia, es un archivo distinto en otra URL. Por eso el cache puede ser
// permanente en vez de expirar en 1 día.
app.use(
  '/uploads',
  express.static(localDriver.UPLOAD_DIR, {
    maxAge: '1y',
    immutable: true,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/sketches', sketchRoutes);
app.use('/api/previews', previewRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/sessions', sessionRoutes);

// Ruta protegida de ejemplo: devuelve el usuario del token.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email });
});

module.exports = app;
