require('dotenv').config();
const app = require('./app');
const scheduler = require('./services/scheduler');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  // Solo aquí y no en app.js: las pruebas importan la app y no deben arrancar un
  // programador que siga corriendo detrás.
  scheduler.start();
});
