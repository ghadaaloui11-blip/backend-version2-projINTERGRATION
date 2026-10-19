const { Pool } = require("pg");
const path = require("path");

// Le .env est resolu depuis le dossier du backend (pas depuis le CWD) :
// le serveur fonctionne donc meme s'il est lance depuis un autre dossier.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Pas de valeurs par defaut pour les identifiants : on echoue vite et clairement
// plutot que de tenter une connexion silencieuse avec un mot de passe generique.
const CHAMPS_REQUIS = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT"];
const champsManquants = CHAMPS_REQUIS.filter((cle) => !process.env[cle]);
if (champsManquants.length > 0) {
  console.error(
    `❌ Configuration PostgreSQL incomplete : ${champsManquants.join(", ")}. ` +
      "Copiez .env.example vers .env et renseignez les valeurs."
  );
  process.exit(1);
}

// Configuration du pool de connexion PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
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
