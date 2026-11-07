/**
 * Script pour créer un compte admin en base.
 * Usage :
 *   ADMIN_PASSWORD='motdepasse_solide' node migrations/create-admin.js
 *   node migrations/create-admin.js 'motdepasse_solide'
 *
 * Le mot de passe n'a plus de valeur par defaut : un mot de passe code en dur
 * finirait tot ou tard en production.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// ── Paramètres du compte admin ─────────────────────────────────────────────
const ADMIN_NOM       = process.env.ADMIN_NOM || 'Admin';
const ADMIN_EMAIL     = process.env.ADMIN_EMAIL || 'admin@solidarite.tn';
const ADMIN_TELEPHONE = process.env.ADMIN_TELEPHONE || '00000000';
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD || process.argv[2];
// ───────────────────────────────────────────────────────────────────────────

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error(
    "❌ Mot de passe admin manquant ou trop court (8 caractères minimum).\n" +
      "   Exemple : ADMIN_PASSWORD='un_mot_de_passe_solide' node migrations/create-admin.js"
  );
  process.exit(1);
}

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'solidarite_db',
  password: process.env.DB_PASSWORD || 'postgrespw',
  port:     parseInt(process.env.DB_PORT) || 5432,
});

async function createAdmin() {
  try {
    // Vérifie si l'email existe déjà
    const existing = await pool.query(
      'SELECT id FROM utilisateur WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (existing.rows.length > 0) {
      console.log(`⚠️  Un utilisateur avec l'email "${ADMIN_EMAIL}" existe déjà (id=${existing.rows[0].id}).`);
      return;
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const { rows } = await pool.query(
      `INSERT INTO utilisateur (nom, email, telephone, mot_de_passe_hache, role)
       VALUES ($1, $2, $3, $4, 'admin')
       RETURNING id, nom, email, role`,
      [ADMIN_NOM, ADMIN_EMAIL, ADMIN_TELEPHONE, hashed]
    );

    console.log('✅ Admin créé avec succès :');
    console.table(rows);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await pool.end();
  }
}

createAdmin();
