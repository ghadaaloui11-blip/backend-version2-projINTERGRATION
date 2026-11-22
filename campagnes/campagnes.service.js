const pool = require('../config/db'); // adapte si db.js exporte { pool }
const { echec } = require('../utils/http');
const activitesService = require('../activites/activites.service');
const { ConstructeurFiltres, lirePagination, validerDate, nettoyer } = require('../utils/filtres');
const { CATEGORIES_CAMPAGNE } = require('../utils/categories');

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
  c.ville, c.categorie,
  COALESCE(a.nom_association, u.nom) AS association_nom`;

// Jointure commune : nom de l'association proprietaire de la campagne
const JOINS = `FROM campagnes c
  LEFT JOIN association a ON a.id = c.association_id
  LEFT JOIN utilisateur u ON u.id = c.association_id`;

exports.create = async (data, associationId) => {
  const { titre, description, objectif_montant, date_debut, date_fin } = data;

  // US38 : categorie obligatoire par defaut 'Autre' ; une valeur explicite
  // invalide est refusee (les filtres en lecture, eux, sont tolerants).
  const categorie = nettoyer(data.categorie) || 'Autre';
  if (!CATEGORIES_CAMPAGNE.includes(categorie)) {
    throw echec(400, `Catégorie invalide. Valeurs acceptées : ${CATEGORIES_CAMPAGNE.join(', ')}.`);
  }
  const ville = nettoyer(data.ville);

  const { rows } = await pool.query(
    `INSERT INTO campagnes
       (titre, description, objectif_montant, date_debut, date_fin, association_id, ville, categorie)
     VALUES ($1, $2, $3, $4, $5, $6,
             COALESCE($7, (SELECT ville FROM association WHERE id = $6)), $8)
     RETURNING id, titre, description,
               objectif_montant::float8 AS objectif_montant,
               montant_collecte::float8 AS montant_collecte,
               to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
               to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
               statut, association_id, ville, categorie`,
    [titre, description, objectif_montant, date_debut, date_fin, associationId, ville, categorie]
  );
  return rows[0];
};

// US10 / US38 : construction mutualisee des filtres de campagnes. Utilisee
// a la fois par findAll (donnees) et compter (X-Total-Count).
const construireFiltresCampagnes = (query = {}) => {
  const { statut = 'active', search, ville, categorie, date_debut, date_fin, association_id } = query || {};
  const filtres = new ConstructeurFiltres();

  filtres.exact(STATUT_SQL, statut, ['all']);
  filtres.recherche(['c.titre', 'c.description'], search);
  filtres.ilike('c.ville', ville);
  filtres.exact('c.categorie', categorie, ['Toutes']);
  filtres.nombre('c.association_id', association_id);

  const debut = validerDate(date_debut, 'date_debut');
  const fin = validerDate(date_fin, 'date_fin');
  if (debut) filtres.brut('c.date_debut >= ?::date', [debut]);
  if (fin) filtres.brut('c.date_fin <= ?::date', [fin]);

  return { filtres, pagination: lirePagination(query) };
};

// US10 : liste des campagnes (par défaut: actives seulement, ?statut=all pour tout)
// Filtres avancés : ?statut=..., ?search=..., ?ville=..., ?categorie=...,
// ?date_debut=..., ?date_fin=..., ?association_id=..., ?page=..., ?limit=...
exports.findAll = async (query = {}) => {
  const { filtres, pagination } = construireFiltresCampagnes(query);
  const limiteSql = pagination.actif
    ? `LIMIT $${filtres.parametres.length + 1} OFFSET $${filtres.parametres.length + 2}`
    : '';
  const params = pagination.actif
    ? [...filtres.parametres, pagination.limit, pagination.offset]
    : filtres.parametres;

  const { rows } = await pool.query(
    `SELECT ${COLS} ${JOINS}
     ${filtres.clause()}
     ORDER BY c.id DESC
     ${limiteSql}`,
    params
  );
  return rows;
};

// Total des lignes correspondant aux memes filtres (sans pagination).
exports.compter = async (query = {}) => {
  const { filtres } = construireFiltresCampagnes(query);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total ${JOINS} ${filtres.clause()}`,
    filtres.parametres
  );
  return rows[0].total;
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

// US10 : liste des associations (projection publique)
// Aucune donnee de contact privee (email, telephone, nom du responsable) :
// l'endpoint est public. nom = nom de l'association (affichage).
exports.listAssociations = async () => {
  const { rows } = await pool.query(
    `SELECT u.id, a.nom_association AS nom, a.nom_association
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
// Une campagne terminee (date de fin passee ou statut non actif) est fermee :
// aucune utilisation ne peut plus y etre declaree.
exports.addUtilisation = async (campagneId, libelle, montant) => {
  const montantNum = Number(montant);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const camp = await client.query(
      `SELECT montant_collecte::float8 AS montant_collecte,
              (date_fin < CURRENT_DATE OR statut <> 'active') AS fermee
       FROM campagnes WHERE id = $1 FOR UPDATE`,
      [campagneId]
    );
    if (!camp.rows[0]) {
      throw echec(404, 'Campagne introuvable');
    }
    if (camp.rows[0].fermee) {
      throw echec(400, 'Cette campagne est terminée : aucune utilisation ne peut y être déclarée.');
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
// Refuse les dons sur une campagne terminee (date de fin passee ou statut non
// actif). La ligne campagne est verrouillee : le controle reste valable face a
// une mise a jour concurrente du statut/des dates.
// citoyenId est fourni uniquement si le don est fait par un citoyen connecte (pas anonyme).
exports.createDon = async (
  campagneId,
  { montant, estAnonyme, nom, message },
  citoyenId = null,
  utilisateurId = null
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const camp = await client.query(
      `SELECT id, titre, (date_fin < CURRENT_DATE OR statut <> 'active') AS fermee
       FROM campagnes WHERE id = $1 FOR UPDATE`,
      [campagneId]
    );
    if (!camp.rows[0]) {
      throw echec(404, 'Campagne introuvable.');
    }
    if (camp.rows[0].fermee) {
      throw echec(400, 'Cette campagne est terminée : les dons ne sont plus acceptés.');
    }

    const inserted = await client.query(
      `INSERT INTO dons (campagne_id, montant, est_anonyme, nom, message, citoyen_id, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [campagneId, montant, estAnonyme, nom, message, citoyenId, 'enregistre']
    );

    // Reference deterministe : DON-<annee>-<id sur 4 chiffres>
    const { rows } = await client.query(
      `UPDATE dons
         SET reference = 'DON-' || to_char(NOW(), 'YYYY') || '-' || lpad(id::text, 4, '0')
       WHERE id = $1
       RETURNING id, reference, campagne_id, montant::float8 AS montant,
                 est_anonyme, nom, message, date, statut, citoyen_id`,
      [inserted.rows[0].id]
    );

    await client.query(
      `UPDATE campagnes SET montant_collecte = montant_collecte + $1 WHERE id = $2`,
      [montant, campagneId]
    );

    // US37 / Q13 : trace du don dans le journal PRIVE de l'auteur, meme quand
    // le don public est anonyme (le libelle porte alors "Don anonyme").
    await activitesService.enregistrerActivite(client, {
      utilisateurId: utilisateurId || citoyenId,
      type: activitesService.TYPES.DON,
      refTable: 'dons',
      refId: inserted.rows[0].id,
      libelle: `${estAnonyme ? 'Don anonyme' : 'Don'} à la campagne « ${camp.rows[0].titre} »`,
      metadata: {
        campagne_id: campagneId,
        montant: Number(montant),
        est_anonyme: Boolean(estAnonyme),
      },
    });

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

exports.update = async (id, data) => {
  const { titre, description, objectif_montant, date_debut, date_fin } = data;

  const categorie = nettoyer(data.categorie);
  if (categorie && !CATEGORIES_CAMPAGNE.includes(categorie)) {
    throw echec(400, `Catégorie invalide. Valeurs acceptées : ${CATEGORIES_CAMPAGNE.join(', ')}.`);
  }
  const ville = nettoyer(data.ville);

  const { rows } = await pool.query(
    `UPDATE campagnes 
     SET titre = $1, description = $2, objectif_montant = $3, date_debut = $4, date_fin = $5,
         ville = COALESCE($6, ville), categorie = COALESCE($7, categorie)
     WHERE id = $8 
     RETURNING id, titre, description,
               objectif_montant::float8 AS objectif_montant,
               montant_collecte::float8 AS montant_collecte,
               to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
               to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
               statut, association_id, ville, categorie`,
    [titre, description, objectif_montant, date_debut, date_fin, ville, categorie, id]
  );
  
  if (!rows[0]) {
    throw echec(404, 'Campagne introuvable');
  }
  
  return rows[0];
};

exports.delete = async (id) => {
  const result = await pool.query('DELETE FROM campagnes WHERE id = $1', [id]);
  
  if (result.rowCount === 0) {
    throw echec(404, 'Campagne introuvable');
  }
};

// US31 : Historique des dons du citoyen
exports.findDonsByCitoyen = async (citoyenId) => {
  const { rows } = await pool.query(
    `SELECT 
       d.id, d.reference, d.montant::float8 AS montant,
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
    [citoyenId]
  );
  return rows;
};
