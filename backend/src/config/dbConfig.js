/**
 * Opciones del pool de PostgreSQL según el entorno.
 *
 * Pensadas para una base gestionada que se suspende sola (Neon): al despertar
 * tarda un poco en aceptar conexiones, y una conexión inactiva puede haber sido
 * cortada del otro lado. Por eso se espera más al conectar y se sueltan pronto
 * las conexiones ociosas, en vez de reutilizar una que ya murió.
 */
function buildPoolConfig(env = process.env) {
  const config = {
    connectionString: env.DATABASE_URL,
    max: Number(env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  };

  // Las bases en la nube exigen TLS. Las cadenas de Neon ya traen
  // `?sslmode=require`; esto cubre las que no.
  if (env.DATABASE_SSL === 'true') config.ssl = { rejectUnauthorized: true };

  return config;
}

module.exports = { buildPoolConfig };
