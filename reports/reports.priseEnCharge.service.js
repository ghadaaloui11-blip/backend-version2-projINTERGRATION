// US32 & US33 : prise en charge d'un signalement par une association et
// mise a jour du statut. Business rules :
//   - aucune affectation automatique : une association choisit explicitement ;
//   - un seul responsable a la fois (garantis par UPDATE conditionnel) ;
//   - seule l'association responsable peut faire evoluer le statut ;
//   - transitions autorisees : recu -> en_cours (prise en charge),
//     en_cours -> resolu (resolution), resolu -> en_cours (reouverture, si la
//     situation n'est finalement pas reglee). Chaque transition est journalisee
//     dans signalement_statut_historique.
const pool = require("../config/db");
const { echec } = require("../utils/http");

const STATUTS = ["recu", "en_cours", "resolu"];

// Projection PUBLIQUE : jamais de citoyen_id ni d'information privee.
// ::float8 => pg renvoie les NUMERIC en string ; on veut des nombres cote front.
const COLS_PUBLIC = `
  s.id, s.titre, s.categorie, s.description, s.photo,
  s.latitude::float8 AS latitude,
  s.longitude::float8 AS longitude,
  s.est_anonyme, s.statut,
  s.created_at, s.date_prise_en_charge, s.date_resolution,
  s.association_id, a.nom_association,
  hist.historique
`;

// Journal de statut agrégé : [{ statut, date, nom_association }...]
const HISTORIQUE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'statut', h.statut,
               'date', h.date_changement,
               'nom_association', a2.nom_association
             ) ORDER BY h.id
           ) AS historique
    FROM signalement_statut_historique h
    LEFT JOIN association a2 ON a2.id = h.association_id
    WHERE h.signalement_id = s.id
  ) hist ON TRUE
`;

exports.listerPublics = async ({ statut, categorie, search, date_debut, date_fin } = {}) => {
  const params = [];
  const conditions = [];

  if (statut) {
    if (!STATUTS.includes(statut)) {
      throw echec(400, "Statut invalide. Valeurs acceptées : recu, en_cours, resolu.");
    }
    params.push(statut);
    conditions.push("s.statut = $" + params.length);
  }

  if (categorie) {
    params.push(categorie);
    conditions.push("s.categorie = $" + params.length);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push("(s.titre ILIKE $" + params.length + " OR s.description ILIKE $" + params.length + ")");
  }

  if (date_debut) {
    params.push(date_debut);
    conditions.push("s.created_at >= $" + params.length);
  }

  if (date_fin) {
    params.push(date_fin);
    conditions.push("s.created_at <= $" + params.length);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const { rows } = await pool.query(
    `SELECT ${COLS_PUBLIC}
     FROM signalement s
     LEFT JOIN association a ON a.id = s.association_id
     ${HISTORIQUE_JOIN}
     ${where}
     ORDER BY s.id DESC`,
    params
  );
  return rows;
};

exports.voirPublic = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_PUBLIC}
     FROM signalement s
     LEFT JOIN association a ON a.id = s.association_id
     ${HISTORIQUE_JOIN}
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
};

// US06 : le citoyen ne voit que SES signalements (avec leurs statuts).
exports.listerMes = async (userId) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_PUBLIC}
     FROM signalement s
     LEFT JOIN association a ON a.id = s.association_id
     ${HISTORIQUE_JOIN}
     WHERE s.citoyen_id = $1
     ORDER BY s.id DESC`,
    [userId]
  );
  return rows;
};

// US32 : signalements dont l'association connectee est responsable.
exports.listerPrisesEnCharge = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_PUBLIC}
     FROM signalement s
     LEFT JOIN association a ON a.id = s.association_id
     ${HISTORIQUE_JOIN}
     WHERE s.association_id = $1
     ORDER BY s.id DESC`,
    [associationId]
  );
  return rows;
};

const journaliser = (client, signalementId, statut, associationId) =>
  client.query(
    `INSERT INTO signalement_statut_historique (signalement_id, statut, association_id)
     VALUES ($1, $2, $3)`,
    [signalementId, statut, associationId]
  );

// US32 : prise en charge explicite. Le mecanisme anti-course est l'UPDATE
// conditionnel dans une transaction : deux associations concurrentes ne
// peuvent pas revendiquer le meme signalement, la seconde reçoit 409.
exports.prendreEnCharge = async (signalementId, associationId) => {
  // Association validee par un admin uniquement (US03) avant d'agir.
  const verifValidation = await pool.query(
    "SELECT statut_validation FROM association WHERE id = $1",
    [associationId]
  );
  const asso = verifValidation.rows[0];
  if (!asso) {
    throw echec(403, "Compte d'association introuvable.");
  }
  if (asso.statut_validation !== "approuve") {
    throw echec(403, "Votre association doit être validée par un administrateur avant de prendre en charge un signalement.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE : verrouille la ligne jusqu'au COMMIT ; un concurrent qui
    // tente la meme revendication s'aligne apres nous et ne voit plus
    // association_id IS NULL. Il recoit alors 409.
    const verrouille = await client.query(
      "SELECT id, association_id, statut FROM signalement WHERE id = $1 FOR UPDATE",
      [signalementId]
    );
    const signalement = verrouille.rows[0];
    if (!signalement) {
      throw echec(404, "Signalement introuvable.");
    }
    if (signalement.association_id !== null || signalement.statut !== "recu") {
      throw echec(409, "Ce signalement a déjà été pris en charge par une autre association.");
    }

    const resultat = await client.query(
      `UPDATE signalement
       SET association_id = $2, statut = 'en_cours', date_prise_en_charge = NOW()
       WHERE id = $1
       RETURNING id, description, photo, latitude::float8 AS latitude, longitude::float8 AS longitude,
         est_anonyme, statut, created_at, date_prise_en_charge, association_id`,
      [signalementId, associationId]
    );

    await journaliser(client, signalementId, "en_cours", associationId);

    await client.query("COMMIT");
    return resultat.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// US33 : evolution du statut par le responsable uniquement.
// La propriete est verifiee dans la requete : une autre association ne peut
// jamais ecrire. Transitions :
//   en_cours -> resolu   (resolution ; date_resolution = maintenant)
//   resolu   -> en_cours (reouverture ; date_resolution remise a NULL)
exports.changerStatut = async (signalementId, associationId, statutCible) => {
  if (!["en_cours", "resolu"].includes(statutCible)) {
    throw echec(400, "Statut invalide. Transitions autorisées : en_cours -> resolu, resolu -> en_cours.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE : verrouille la ligne jusqu'au COMMIT.
    const verrouille = await client.query(
      "SELECT id, association_id, statut FROM signalement WHERE id = $1 FOR UPDATE",
      [signalementId]
    );
    const signalement = verrouille.rows[0];
    if (!signalement) {
      throw echec(404, "Signalement introuvable.");
    }
    // Message volontairement generique : on ne revele pas qui est responsable.
    if (signalement.association_id !== associationId) {
      throw echec(403, "Accès refusé. Ce signalement n'est pas sous votre responsabilité.");
    }
    if (statutCible === signalement.statut) {
      throw echec(409, `Ce signalement est déjà ${statutCible === "en_cours" ? "en cours" : "résolu"}.`);
    }
    if (signalement.statut === "recu") {
      throw echec(409, "Ce signalement doit d'abord être pris en charge.");
    }

    const resultat = await client.query(
      `UPDATE signalement
       SET statut = $3::varchar,
           date_resolution = CASE WHEN $3::varchar = 'resolu' THEN NOW() ELSE NULL END
       WHERE id = $1 AND association_id = $2
       RETURNING id, description, photo, latitude::float8 AS latitude, longitude::float8 AS longitude,
         est_anonyme, statut, created_at, date_prise_en_charge, date_resolution, association_id`,
      [signalementId, associationId, statutCible]
    );

    await journaliser(client, signalementId, statutCible, associationId);

    await client.query("COMMIT");
    return resultat.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
