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

// Test de la connexion au démarrage
pool
  .connect()
  .then((client) => {
    console.log("✅ Connecté à la base de données PostgreSQL avec succès");
    client.release();
  })
  .catch((err) => {
    console.error("❌ Erreur de connexion à PostgreSQL :", err.message);
  });

module.exports = pool;
