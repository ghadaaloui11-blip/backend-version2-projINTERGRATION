const pool = require('../config/db');

// Each resource query returns id, type discriminator, title, and a brief description.
// Results are ordered by relevance (exact title match first) then recency.

const rechercheCampagnes = async (q) => {
  const { rows } = await pool.query(
    `SELECT
       c.id,
       'campagne'           AS type,
       c.titre              AS titre,
       c.description        AS description,
       c.statut,
       c.ville,
       c.categorie,
       to_char(c.date_fin, 'YYYY-MM-DD') AS date_fin,
       COALESCE(a.nom_association, u.nom) AS association_nom
     FROM campagnes c
     LEFT JOIN association a ON a.id = c.association_id
     LEFT JOIN utilisateur u ON u.id = c.association_id
     WHERE COALESCE(c.titre, '') ILIKE $1 OR COALESCE(c.description, '') ILIKE $1
     ORDER BY
       CASE WHEN $2 <> '' AND c.titre ILIKE $2 THEN 0 ELSE 1 END,
       c.id DESC
     LIMIT 20`,
    [`%${q}%`, q]
  );
  return rows;
};

const rechercheSignalements = async (q) => {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       'signalement'  AS type,
       s.titre        AS titre,
       s.description  AS description,
       s.statut,
       s.ville,
       s.categorie,
       to_char(s.created_at, 'YYYY-MM-DD') AS date_creation
     FROM signalement s
     WHERE COALESCE(s.titre, '') ILIKE $1 OR COALESCE(s.description, '') ILIKE $1
     ORDER BY
       CASE WHEN $2 <> '' AND s.titre ILIKE $2 THEN 0 ELSE 1 END,
       s.created_at DESC
     LIMIT 20`,
    [`%${q}%`, q]
  );
  return rows;
};

const rechercheEvenements = async (q) => {
  const { rows } = await pool.query(
    `SELECT
       e.id,
       'evenement'    AS type,
       e.titre        AS titre,
       e.description  AS description,
       e.statut,
       e.ville,
       e.categorie,
       to_char(e.date_evenement, 'YYYY-MM-DD') AS date_evenement,
       COALESCE(a.nom_association, u.nom) AS association_nom
     FROM evenements e
     LEFT JOIN association a ON a.id = e.association_id
     LEFT JOIN utilisateur u ON u.id = e.association_id
     WHERE COALESCE(e.titre, '') ILIKE $1 OR COALESCE(e.description, '') ILIKE $1
     ORDER BY
       CASE WHEN $2 <> '' AND e.titre ILIKE $2 THEN 0 ELSE 1 END,
       e.date_evenement DESC
     LIMIT 20`,
    [`%${q}%`, q]
  );
  return rows;
};

const rechercheAssociations = async (q) => {
  const { rows } = await pool.query(
    `SELECT
       a.id,
       'association'      AS type,
       a.nom_association  AS titre,
       u.email            AS description,
       a.statut_validation AS statut,
       a.ville
     FROM association a
     JOIN utilisateur u ON u.id = a.id
     WHERE a.statut_validation = 'approuve'
       AND (COALESCE(a.nom_association, '') ILIKE $1 OR COALESCE(u.email, '') ILIKE $1 OR COALESCE(a.ville, '') ILIKE $1)
     ORDER BY
       CASE WHEN $2 <> '' AND a.nom_association ILIKE $2 THEN 0 ELSE 1 END,
       a.id DESC
     LIMIT 20`,
    [`%${q}%`, q]
  );
  return rows;
};

// typeFilter null = search all categories.
exports.chercher = async (q, typeFilter = null) => {
  const cherchers = {
    campagne:     rechercheCampagnes,
    signalement:  rechercheSignalements,
    evenement:    rechercheEvenements,
    association:  rechercheAssociations,
  };

  if (typeFilter) {
    const fn = cherchers[typeFilter];
    const resultats = await fn(q);
    return { [typeFilter + 's']: resultats };
  }

  const [campagnes, signalements, evenements, associations] = await Promise.all([
    rechercheCampagnes(q),
    rechercheSignalements(q),
    rechercheEvenements(q),
    rechercheAssociations(q),
  ]);

  return { campagnes, signalements, evenements, associations };
};
