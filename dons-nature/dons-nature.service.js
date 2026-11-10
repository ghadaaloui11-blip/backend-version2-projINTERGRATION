const pool   = require('../config/db');
const { echec } = require('../utils/http');

const TYPES_VALIDES   = ['Vêtements', 'Nourriture', 'Matériel', 'Mobilier', 'Médicaments', 'Jouets', 'Autre'];
const STATUTS_VALIDES = ['propose', 'accepte', 'collecte', 'refuse', 'annule'];

// ─── Validation interne ────────────────────────────────────────────────────

const valider = (data) => {
  const type_don    = String(data.type_don    || '').trim();
  const description = String(data.description || '').trim();
  const quantite    = String(data.quantite    || '').trim() || null;
  const ville       = String(data.ville       || '').trim();

  if (!type_don) {
    throw echec(400, `Le type de don est obligatoire. Valeurs acceptées : ${TYPES_VALIDES.join(', ')}.`);
  }
  if (!TYPES_VALIDES.includes(type_don)) {
    throw echec(400, `Type de don invalide. Valeurs acceptées : ${TYPES_VALIDES.join(', ')}.`);
  }
  if (!description || description.length < 10) {
    throw echec(400, 'La description est obligatoire (10 caractères minimum).');
  }
  if (!ville) {
    throw echec(400, 'La ville est obligatoire.');
  }

  return { type_don, description, quantite, ville };
};

// ─── US13 : Citoyen propose un don en nature ──────────────────────────────

exports.proposer = async (data, citoyenId) => {
  const { type_don, description, quantite, ville } = valider(data);

  const { rows } = await pool.query(
    `INSERT INTO don_nature (citoyen_id, type_don, description, quantite, ville)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, type_don, description, quantite, ville, statut,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at`,
    [citoyenId, type_don, description, quantite, ville]
  );
  return rows[0];
};

// ─── Citoyen : ses propres propositions ───────────────────────────────────

exports.mesDons = async (citoyenId) => {
  const { rows } = await pool.query(
    `SELECT
       dn.id, dn.type_don, dn.description, dn.quantite, dn.ville,
       dn.statut, dn.date_collecte, dn.lieu_collecte, dn.commentaire,
       to_char(dn.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
       a.nom_association, dn.association_id
     FROM don_nature dn
     LEFT JOIN association a ON a.id = dn.association_id
     WHERE dn.citoyen_id = $1
     ORDER BY dn.id DESC`,
    [citoyenId]
  );
  return rows;
};

// ─── Citoyen : annuler un don encore "propose" ────────────────────────────

exports.annuler = async (donId, citoyenId) => {
  const { rows } = await pool.query(
    `UPDATE don_nature
     SET statut = 'annule'
     WHERE id = $1 AND citoyen_id = $2 AND statut = 'propose'
     RETURNING id, statut`,
    [donId, citoyenId]
  );
  if (!rows[0]) {
    throw echec(404, "Don introuvable ou déjà traité (impossible d'annuler).");
  }
  return rows[0];
};

// ─── Association : liste des dons disponibles ─────────────────────────────
// Affiche les dons "propose" non encore affectes + ses dons deja acceptes

exports.listerPourAssociation = async (associationId, { statut, ville, type_don } = {}) => {
  const params = [associationId];
  const conds  = ['(dn.statut = \'propose\' OR dn.association_id = $1)'];

  if (statut) {
    if (!STATUTS_VALIDES.includes(statut)) {
      throw echec(400, `Statut invalide. Valeurs acceptées : ${STATUTS_VALIDES.join(', ')}.`);
    }
    params.push(statut);
    conds.push(`dn.statut = $${params.length}`);
  }

  if (ville) {
    params.push(`%${ville.trim()}%`);
    conds.push(`dn.ville ILIKE $${params.length}`);
  }

  if (type_don) {
    params.push(type_don.trim());
    conds.push(`dn.type_don = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       dn.id, dn.type_don, dn.description, dn.quantite, dn.ville,
       dn.statut, dn.date_collecte, dn.lieu_collecte, dn.commentaire,
       to_char(dn.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
       dn.association_id
     FROM don_nature dn
     WHERE ${conds.join(' AND ')}
     ORDER BY dn.id DESC`,
    params
  );
  return rows;
};

// ─── Association : accepter un don (fixer la date et le lieu de collecte) ─

exports.accepter = async (donId, associationId, { date_collecte, lieu_collecte, commentaire } = {}) => {
  if (!date_collecte || !lieu_collecte) {
    throw echec(400, 'La date et le lieu de collecte sont obligatoires pour accepter un don.');
  }

  const { rows } = await pool.query(
    `UPDATE don_nature
     SET statut         = 'accepte',
         association_id = $2,
         date_collecte  = $3,
         lieu_collecte  = $4,
         commentaire    = $5
     WHERE id = $1 AND statut = 'propose'
     RETURNING id, statut, association_id, date_collecte, lieu_collecte, commentaire`,
    [donId, associationId, date_collecte, lieu_collecte, commentaire || null]
  );
  if (!rows[0]) {
    throw echec(404, "Don introuvable ou déjà pris en charge par une autre association.");
  }
  return rows[0];
};

// ─── Association : marquer comme collecté ─────────────────────────────────

exports.marquerCollecte = async (donId, associationId) => {
  const { rows } = await pool.query(
    `UPDATE don_nature
     SET statut = 'collecte'
     WHERE id = $1 AND association_id = $2 AND statut = 'accepte'
     RETURNING id, statut`,
    [donId, associationId]
  );
  if (!rows[0]) {
    throw echec(404, "Don introuvable, non accepté, ou vous n'en êtes pas responsable.");
  }
  return rows[0];
};

// ─── Association : refuser un don ─────────────────────────────────────────

exports.refuser = async (donId, associationId, commentaire) => {
  // Ne peut refuser que ce qu'elle a accepté (pas les dons d'autres associations)
  const { rows } = await pool.query(
    `UPDATE don_nature
     SET statut      = 'refuse',
         commentaire = $3
     WHERE id = $1 AND association_id = $2 AND statut = 'accepte'
     RETURNING id, statut`,
    [donId, associationId, commentaire || null]
  );
  if (!rows[0]) {
    throw echec(404, "Don introuvable ou vous n'en êtes pas responsable.");
  }
  return rows[0];
};
