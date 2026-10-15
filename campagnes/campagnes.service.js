const pool = require('../config/db'); // adapte si db.js exporte { pool }

exports.create = async (data, associationId) => {
  const { titre, description, objectif_montant, date_debut, date_fin } = data;

  const { rows } = await pool.query(
    `INSERT INTO campagnes
       (titre, description, objectif_montant, date_debut, date_fin, association_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [titre, description, objectif_montant, date_debut, date_fin, associationId]
  );
  return rows[0];
};
// to_char => bech el dates ma yetbaddlouch b fuseau horaire (2026-10-31T23:00Z)
const COLS = `id, titre, description, objectif_montant, montant_collecte,
  to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
  to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
  statut, association_id`;

// US10 : liste des campagnes (par défaut: actives seulement, ?statut=all pour tout)
exports.findAll = async ({ statut = 'active', search } = {}) => {
  const params = [];
  const where = [];

  if (statut !== 'all') {
    params.push(statut);
    where.push(`statut = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(titre ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${COLS} FROM campagnes
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY id DESC`,
    params
  );
  return rows;
};

// US10 : détail d'une campagne
exports.findById = async (id) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM campagnes WHERE id = $1`, [id]);
  return rows[0];
};

// US10 : campagnes de l'association connectée
exports.findByAssociation = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM campagnes WHERE association_id = $1 ORDER BY id DESC`,
    [associationId]
  );
  return rows;
};

// US10 : liste des associations (sans mot de passe)
// US10 : liste des associations (sans mot de passe)
exports.listAssociations = async () => {
  const { rows } = await pool.query(
    `SELECT id, nom, prenom, email, telephone, role
     FROM utilisateur
     WHERE role = 'association'
     ORDER BY id`
  );
  return rows;
};
// US12 : avancement d'une campagne
exports.getAvancement = async (id) => {
  const camp = await pool.query(`SELECT ${COLS} FROM campagnes WHERE id = $1`, [id]);
  const c = camp.rows[0];
  if (!c) return null;

  const objectif = Number(c.objectif_montant);
  const collecte = Number(c.montant_collecte);

  let pourcentage = 0;
  if (objectif > 0) {
    pourcentage = Math.round((collecte / objectif) * 100);
  }
  if (pourcentage > 100) {
    pourcentage = 100;
  }

  let joursRestants = Math.ceil((new Date(c.date_fin) - new Date()) / (1000 * 60 * 60 * 24));
  if (joursRestants < 0) {
    joursRestants = 0;
  }

  const fonds = await pool.query(
    `SELECT id, libelle, montant, to_char(date_utilisation, 'YYYY-MM-DD') AS date_utilisation
     FROM utilisation_fonds WHERE campagne_id = $1 ORDER BY id DESC`,
    [id]
  );

  let totalUtilise = 0;
  for (let i = 0; i < fonds.rows.length; i++) {
    totalUtilise = totalUtilise + Number(fonds.rows[i].montant);
  }

  return {
    campagne_id: c.id,
    titre: c.titre,
    statut: c.statut,
    objectif_montant: objectif,
    montant_collecte: collecte,
    pourcentage: pourcentage,
    montant_restant: Math.max(objectif - collecte, 0),
    jours_restants: joursRestants,
    total_utilise: totalUtilise,
    solde_disponible: collecte - totalUtilise,
    utilisation_fonds: fonds.rows
  };
};

// US12 : ajouter une utilisation de fonds
exports.addUtilisation = async (campagneId, libelle, montant) => {
  const { rows } = await pool.query(
    `INSERT INTO utilisation_fonds (campagne_id, libelle, montant)
     VALUES ($1, $2, $3) RETURNING *`,
    [campagneId, libelle, montant]
  );
  return rows[0];
};