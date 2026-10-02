const { Pool } = require('pg');
const { buildPoolConfig } = require('./dbConfig');

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

module.exports = pool;
