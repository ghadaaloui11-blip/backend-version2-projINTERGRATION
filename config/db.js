const { Pool } = require("pg");
require("dotenv").config();

// Configuration du pool de connexion PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "solidarite_db",
  password: process.env.DB_PASSWORD || "postgrespw",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
});

pool
  .query(`
    SELECT
      current_database() AS base,
      inet_server_port() AS port,
      current_schema() AS schema,
      to_regclass('public.signalement') AS table_signalement
  `)
  .then((res) => {
    console.log("✅ Connecté à PostgreSQL :", res.rows[0]);
    if (!res.rows[0].table_signalement) {
      console.warn("⚠️ La table 'signalement' n'existe PAS dans cette base.");
    }
  })
  .catch((err) => {
    console.error("❌ Erreur de connexion à PostgreSQL :", err.message);
  });

module.exports = pool;