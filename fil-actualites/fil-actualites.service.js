const pool = require('../config/db');

// US25 : fil d'actualites = agrege les evenements recents de la plateforme.
// Sources : campagnes actives, evenements a venir, signalements resolus recents.
// Chaque item a : type, id, titre, description, date, association_nom, url_detail.

exports.lister = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (Math.max(1, page) - 1) * limit;

  // Pull from 3 sources and union them, ordered by date desc
  const { rows } = await pool.query(
    `SELECT *
     FROM (
       -- Campagnes actives recentes
       SELECT
         'campagne'                       AS type,
         c.id::TEXT                       AS id,
         c.titre                          AS titre,
         c.description                    AS description,
         COALESCE(a.nom_association, u.nom) AS auteur,
         c.date_debut::timestamp          AS date,
         c.statut,
         c.objectif_montant::float8       AS montant_objectif,
         c.montant_collecte::float8       AS montant_collecte,
         NULL::TEXT                       AS ville,
         NULL::TEXT                       AS categorie
       FROM campagnes c
       LEFT JOIN association a ON a.id = c.association_id
       LEFT JOIN utilisateur u ON u.id = c.association_id
       WHERE c.statut = 'active'

       UNION ALL

       -- Evenements a venir (publies)
       SELECT
         'evenement'                      AS type,
         e.id::TEXT,
         e.titre,
         e.description,
         COALESCE(a.nom_association, u.nom) AS auteur,
         e.created_at                     AS date,
         e.statut,
         NULL::float8,
         NULL::float8,
         e.ville,
         e.categorie
       FROM evenements e
       LEFT JOIN association a ON a.id = e.association_id
       LEFT JOIN utilisateur u ON u.id = e.association_id
       WHERE e.statut = 'publie'
         AND e.date_evenement >= CURRENT_DATE

       UNION ALL

       -- Signalements resolus recemment (succes stories)
       SELECT
         'signalement_resolu'             AS type,
         s.id::TEXT,
         s.titre,
         s.description,
         COALESCE(a.nom_association, '')  AS auteur,
         s.date_resolution                AS date,
         s.statut,
         NULL::float8,
         NULL::float8,
         s.ville,
         s.categorie
       FROM signalement s
       LEFT JOIN association a ON a.id = s.association_id
       WHERE s.statut = 'resolu'
         AND s.date_resolution >= NOW() - INTERVAL '90 days'
     ) AS fil
     ORDER BY date DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return {
    page: Number(page),
    limit: Number(limit),
    items: rows,
  };
};
