const pool = require('../config/db');
const { echec } = require('../utils/http');

// List signalements pending moderation (all statuts, with history summary)
exports.listerSignalements = async ({ statut, page = 1, limit = 20 } = {}) => {
  const offset = (Math.max(1, page) - 1) * limit;
  const params = [];
  let where = '';

  if (statut) {
    params.push(statut);
    where = `WHERE s.statut = $${params.length}`;
  }

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT
       s.id, s.titre, s.categorie, s.description, s.statut, s.ville,
       s.est_anonyme, s.created_at, s.date_prise_en_charge, s.date_resolution,
       a.nom_association,
       u.nom AS citoyen_nom, u.email AS citoyen_email,
       COUNT(*) OVER() AS total
     FROM signalement s
     LEFT JOIN association a ON a.id = s.association_id
     LEFT JOIN utilisateur u ON u.id = s.citoyen_id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    total,
    page: Number(page),
    limit: Number(limit),
    signalements: rows.map(r => { const { total: _, ...rest } = r; return rest; }),
  };
};

// Get one signalement detail for moderation
exports.getSignalement = async (id) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.nom AS citoyen_nom, u.email AS citoyen_email, a.nom_association
     FROM signalement s
     LEFT JOIN utilisateur u ON u.id = s.citoyen_id
     LEFT JOIN association a ON a.id = s.association_id
     WHERE s.id = $1`,
    [id]
  );
  if (!rows.length) throw echec(404, 'Signalement introuvable.');
  return rows[0];
};

// Admin : forcer le statut d'un signalement (ex: clore un spam)
const STATUTS_VALIDES = ['recu', 'en_cours', 'resolu'];
exports.changerStatut = async (adminId, signalementId, statut, commentaire) => {
  if (!STATUTS_VALIDES.includes(statut)) {
    throw echec(400, `Statut invalide. Valeurs acceptees : ${STATUTS_VALIDES.join(', ')}.`);
  }

  const { rows } = await pool.query(
    `UPDATE signalement 
     SET statut = $1::varchar,
         date_resolution = CASE WHEN $1::varchar = 'resolu' THEN NOW() ELSE date_resolution END
     WHERE id = $2 
     RETURNING *`,
    [statut, signalementId]
  );
  if (!rows.length) throw echec(404, 'Signalement introuvable.');

  // Log the action in history (association_id is null or kept if already assigned)
  const assoId = rows[0].association_id || null;
  await pool.query(
    `INSERT INTO signalement_statut_historique (signalement_id, statut, association_id, date_changement)
     VALUES ($1, $2, $3, NOW())`,
    [signalementId, statut, assoId]
  );

  return rows[0];
};

// Admin : supprimer un signalement inapproprie
exports.supprimer = async (id) => {
  const { rows } = await pool.query(
    `DELETE FROM signalement WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!rows.length) throw echec(404, 'Signalement introuvable.');
  return rows[0];
};
