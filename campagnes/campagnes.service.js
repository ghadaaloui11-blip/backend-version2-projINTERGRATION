const pool = require('../config/db'); // adapte si db.js exporte { pool }
const { echec } = require('../utils/http');

// Statut effectif : une campagne dont la date de fin est passee est "terminee",
// sans avoir a ecrire en base (pas de tache planifiee).
const STATUT_SQL = `CASE WHEN c.date_fin < CURRENT_DATE THEN 'terminee' ELSE c.statut END`;

// to_char => bech el dates ma yetbaddlouch b fuseau horaire (2026-10-31T23:00Z)
// ::float8 => pg renvoie les NUMERIC en string ; on veut des nombres cote front.
const COLS = `c.id, c.titre, c.description,
  c.objectif_montant::float8 AS objectif_montant,
  c.montant_collecte::float8 AS montant_collecte,
  to_char(c.date_debut, 'YYYY-MM-DD') AS date_debut,
  to_char(c.date_fin, 'YYYY-MM-DD') AS date_fin,
  ${STATUT_SQL} AS statut, c.association_id,
  COALESCE(a.nom_association, u.nom) AS association_nom`;

// Jointure commune : nom de l'association proprietaire de la campagne
const JOINS = `FROM campagnes c
  LEFT JOIN association a ON a.id = c.association_id
  LEFT JOIN utilisateur u ON u.id = c.association_id`;

exports.create = async (data, associationId) => {
  const { titre, description, objectif_montant, date_debut, date_fin } = data;

  const { rows } = await pool.query(
    `INSERT INTO campagnes
       (titre, description, objectif_montant, date_debut, date_fin, association_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, titre, description,
               objectif_montant::float8 AS objectif_montant,
               montant_collecte::float8 AS montant_collecte,
               to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
               to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
               statut, association_id`,
    [titre, description, objectif_montant, date_debut, date_fin, associationId]
  );
  return rows[0];
};

// US10 : liste des campagnes (par défaut: actives seulement, ?statut=all pour tout)
exports.findAll = async ({ statut = 'active', search } = {}) => {
  const params = [];
  const where = [];

  if (statut !== 'all') {
    params.push(statut);
    where.push(`${STATUT_SQL} = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(c.titre ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${COLS} ${JOINS}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.id DESC`,
    params
  );
  return rows;
};

// US10 : détail d'une campagne
exports.findById = async (id) => {
  const { rows } = await pool.query(`SELECT ${COLS} ${JOINS} WHERE c.id = $1`, [id]);
  return rows[0];
};

// US10 : campagnes de l'association connectée
exports.findByAssociation = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} ${JOINS} WHERE c.association_id = $1 ORDER BY c.id DESC`,
    [associationId]
  );
  return rows;
};

// US10 : liste des associations (sans mot de passe)
// nom = nom de l'association (affichage), nom_contact = nom du responsable
exports.listAssociations = async () => {
  const { rows } = await pool.query(
    `SELECT u.id, a.nom_association AS nom, a.nom_association,
            u.nom AS nom_contact, u.email, u.telephone
     FROM utilisateur u
     LEFT JOIN association a ON a.id = u.id
     WHERE u.role = 'association'
     ORDER BY u.id`
  );
  return rows;
};

// US12 : avancement d'une campagne
exports.getAvancement = async (id) => {
  const camp = await pool.query(`SELECT ${COLS} ${JOINS} WHERE c.id = $1`, [id]);
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
    `SELECT id, libelle, montant::float8 AS montant,
            to_char(date_utilisation, 'YYYY-MM-DD') AS date_utilisation
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

// US12 : ajouter une utilisation de fonds.
// Le controle du solde est fait DANS la transaction et la ligne campagne est
// verrouillee (FOR UPDATE) : deux requetes concurrentes ne peuvent plus
// depasser le solde disponible.
exports.addUtilisation = async (campagneId, libelle, montant) => {
  const montantNum = Number(montant);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const camp = await client.query(
      'SELECT montant_collecte::float8 AS montant_collecte FROM campagnes WHERE id = $1 FOR UPDATE',
      [campagneId]
    );
    if (!camp.rows[0]) {
      throw echec(404, 'Campagne introuvable');
    }

    const total = await client.query(
      'SELECT COALESCE(SUM(montant), 0)::float8 AS total FROM utilisation_fonds WHERE campagne_id = $1',
      [campagneId]
    );
    const solde = Number(camp.rows[0].montant_collecte) - Number(total.rows[0].total);

    if (montantNum > solde) {
      throw echec(
        400,
        `Montant supérieur au solde disponible (${solde.toFixed(2)}).`
      );
    }

    const { rows } = await client.query(
      `INSERT INTO utilisation_fonds (campagne_id, libelle, montant)
       VALUES ($1, $2, $3)
       RETURNING id, campagne_id, libelle, montant::float8 AS montant,
                 to_char(date_utilisation, 'YYYY-MM-DD') AS date_utilisation`,
      [campagneId, libelle, montantNum]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// US11 : enregistrer un don et mettre a jour le montant collecte (transaction)
exports.createDon = async (campagneId, { montant, estAnonyme, nom, message }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO dons (campagne_id, montant, est_anonyme, nom, message, statut)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [campagneId, montant, estAnonyme, nom, message, 'Don enregistré (paiement simulé)']
    );

    // Reference deterministe : DON-<annee>-<id sur 4 chiffres>
    const { rows } = await client.query(
      `UPDATE dons
         SET reference = 'DON-' || to_char(NOW(), 'YYYY') || '-' || lpad(id::text, 4, '0')
       WHERE id = $1
       RETURNING id, reference, campagne_id, montant::float8 AS montant,
                 est_anonyme, nom, message, date, statut`,
      [inserted.rows[0].id]
    );

    await client.query(
      `UPDATE campagnes SET montant_collecte = montant_collecte + $1 WHERE id = $2`,
      [montant, campagneId]
    );

    await client.query('COMMIT');

    const don = rows[0];
    return { ...don, montant: Number(don.montant) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
