/**
 * Applique toutes les migrations SQL du dossier, dans l'ordre alphabetique.
 * Usage : npm run migrate
 *
 * Les fichiers sont idempotents (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
 * la commande peut donc etre relancee sans risque.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const { Pool } = require('pg');

const CHAMPS_REQUIS = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
const manquants = CHAMPS_REQUIS.filter((cle) => !process.env[cle]);
if (manquants.length > 0) {
  console.error(`❌ Configuration PostgreSQL incomplete : ${manquants.join(', ')}. Copiez .env.example vers .env.`);
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
  });

  try {
    const fichiers = fs
      .readdirSync(__dirname)
      .filter((fichier) => fichier.endsWith('.sql'))
      .sort();

    if (fichiers.length === 0) {
      console.log('Aucune migration a appliquer.');
      return;
    }

    for (const fichier of fichiers) {
      const sql = fs.readFileSync(path.join(__dirname, fichier), 'utf8');
      await pool.query(sql);
      console.log(`✅ ${fichier}`);
    }
    console.log(`\n✅ ${fichiers.length} migration(s) appliquée(s) sur ${process.env.DB_NAME}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration échouée :', err.message);
  process.exit(1);
});
