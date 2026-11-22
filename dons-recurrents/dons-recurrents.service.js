const pool = require('../config/db');
const { echec } = require('../utils/http');

const PERIODICITES = ['mensuel', 'trimestriel', 'annuel'];

exports.creer = async (citoyenId, { campagne_id, montant, periodicite, date_debut, date_fin }) => {
  if (!campagne_id || !montant || !periodicite) {
    throw echec(400, 'campagne_id, montant et periodicite sont obligatoires.');
  }
  if (!PERIODICITES.includes(periodicite)) {
    throw echec(400, `periodicite invalide. Valeurs acceptees : ${PERIODICITES.join(', ')}.`);
  }
  const montantNum = Number(montant);
  if (!Number.isFinite(montantNum) || montantNum <= 0) {
    throw echec(400, 'Le montant doit etre superieur a 0.');
  }

  // Verify campaign exists and is active
  const { rows: camps } = await pool.query(
    `SELECT id FROM campagnes WHERE id = $1 AND statut = 'active'`,
    [campagne_id]
  );
  if (!camps.length) throw echec(404, 'Campagne introuvable ou inactive.');

  const { rows } = await pool.query(
    `INSERT INTO dons_recurrents (citoyen_id, campagne_id, montant, periodicite, date_debut, date_fin)
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
     RETURNING *`,
    [citoyenId, campagne_id, montantNum, periodicite, date_debut || null, date_fin || null]
  );
  return rows[0];
};

exports.listerMes = async (citoyenId) => {
  const { rows } = await pool.query(
    `SELECT dr.*, c.titre AS campagne_titre, c.statut AS campagne_statut
     FROM dons_recurrents dr
     JOIN campagnes c ON c.id = dr.campagne_id
     WHERE dr.citoyen_id = $1
     ORDER BY dr.created_at DESC`,
    [citoyenId]
  );
  return rows;
};

exports.annuler = async (citoyenId, id) => {
  const { rows } = await pool.query(
    `UPDATE dons_recurrents SET actif = FALSE
     WHERE id = $1 AND citoyen_id = $2 AND actif = TRUE
     RETURNING *`,
    [id, citoyenId]
  );
  if (!rows.length) throw echec(404, 'Don recurrent introuvable ou deja annule.');
  return rows[0];
};

// Admin : list all
exports.listerTous = async () => {
  const { rows } = await pool.query(
    `SELECT dr.*, c.titre AS campagne_titre, u.nom AS citoyen_nom, u.email AS citoyen_email
     FROM dons_recurrents dr
     JOIN campagnes c ON c.id = dr.campagne_id
     JOIN utilisateur u ON u.id = dr.citoyen_id
     ORDER BY dr.created_at DESC`
  );
  return rows;
};
