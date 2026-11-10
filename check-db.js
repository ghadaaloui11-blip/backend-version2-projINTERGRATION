require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

async function check() {
  // 1. Colonnes dons
  const colsDons = await p.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'dons' ORDER BY ordinal_position"
  );
  console.log('=== COLONNES dons ===', colsDons.rows.map(r=>r.column_name).join(', '));

  // 2. Test query mes-dons (simuler findDonsByCitoyen avec un userId fictif)
  try {
    const r = await p.query(
      `SELECT d.id, d.reference, d.montant::float8 AS montant,
         d.est_anonyme, d.nom, d.message,
         to_char(d.date, 'YYYY-MM-DD"T"HH24:MI:SS') AS date,
         d.statut,
         c.id AS campagne_id, c.titre AS campagne_titre,
         COALESCE(a.nom_association, u.nom) AS association_nom
       FROM dons d
       JOIN campagnes c ON c.id = d.campagne_id
       LEFT JOIN association a ON a.id = c.association_id
       LEFT JOIN utilisateur u ON u.id = c.association_id
       WHERE d.citoyen_id = $1
       ORDER BY d.date DESC`,
      [999]
    );
    console.log('=== QUERY mes-dons OK ===', r.rows.length, 'résultats');
  } catch (e) {
    console.error('=== QUERY mes-dons ERREUR ===', e.message);
  }

  // 3. Corriger le DEFAULT de statut signalement
  try {
    await p.query("ALTER TABLE signalement ALTER COLUMN statut SET DEFAULT 'recu'");
    console.log('=== DEFAULT statut corrigé → recu ===');
  } catch(e) {
    console.error('=== ERREUR correction DEFAULT ===', e.message);
  }

  // 4. Vérifier le nouveau DEFAULT
  const def = await p.query(
    "SELECT column_default FROM information_schema.columns WHERE table_name='signalement' AND column_name='statut'"
  );
  console.log('=== NOUVEAU DEFAULT statut ===', def.rows[0]?.column_default);

  await p.end();
}

check().catch(e => { console.error(e.message); p.end(); });
