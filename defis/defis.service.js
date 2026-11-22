// US26 : defis (challenges), participations, progression automatique et
// completion hybride. Les ecritures de progression/completion se font dans
// la transaction de l'activite correspondante (decision Q12).
const pool = require("../config/db");
const { echec } = require("../utils/http");
const engagementService = require("../engagement/engagement.service");
const { ConstructeurFiltres, lirePagination, nettoyer } = require("../utils/filtres");

const MODES = ["automatique", "manuelle"];
const STATUTS_PARTICIPATION = ["en_cours", "en_attente", "complete", "rejete"];

const COLS_DEFI = `d.id, d.titre, d.description, d.categorie, d.mode,
  d.type_activite, d.objectif, d.recompense_points, d.icone,
  to_char(d.date_debut, 'YYYY-MM-DD') AS date_debut,
  to_char(d.date_fin, 'YYYY-MM-DD') AS date_fin,
  d.statut, d.created_at`;

// Variante sans alias pour le RETURNING d'un INSERT : il n'y a pas de `d`
// dans le FROM d'une insertion.
const COLS_DEFI_INSERT = `id, titre, description, categorie, mode,
  type_activite, objectif, recompense_points, icone,
  to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
  to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
  statut, created_at`;

// Un defi est "ouvert" s'il est actif et dans sa fenetre de dates.
const EST_OUVERT = `(d.statut = 'actif'
  AND (d.date_debut IS NULL OR d.date_debut <= CURRENT_DATE)
  AND (d.date_fin IS NULL OR d.date_fin >= CURRENT_DATE))`;

// ---------------------------------------------------------------------------
// Catalog (admin uniquement au niveau controller)
// ---------------------------------------------------------------------------

exports.creerDefi = async (data) => {
  const {
    titre, description, categorie, mode = "automatique",
    type_activite, objectif, recompense_points = 0, icone,
    date_debut, date_fin, statut = "actif",
  } = data || {};

  const titreClean = nettoyer(titre);
  if (!titreClean || titreClean.length < 3) {
    throw echec(400, "Le titre du défi est obligatoire (3 caractères minimum).");
  }
  if (!MODES.includes(mode)) {
    throw echec(400, `Mode invalide. Valeurs acceptées : ${MODES.join(", ")}.`);
  }
  const objectifNum = Number(objectif);
  if (!Number.isInteger(objectifNum) || objectifNum < 1) {
    throw echec(400, "L'objectif doit être un entier positif.");
  }
  const points = Number(recompense_points);
  if (!Number.isInteger(points) || points < 0) {
    throw echec(400, "La récompense doit être un entier positif ou nul.");
  }
  const typeActivite = nettoyer(type_activite);
  if (mode === "automatique" && !typeActivite) {
    throw echec(400, "Un défi automatique doit préciser le type d'activité suivi.");
  }
  if (!["actif", "archive"].includes(statut)) {
    throw echec(400, "Statut invalide (actif ou archive).");
  }

  const { rows } = await pool.query(
    `INSERT INTO defi
       (titre, description, categorie, mode, type_activite, objectif,
        recompense_points, icone, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '🎯'), $9, $10, $11)
     RETURNING ${COLS_DEFI_INSERT}`,
    [
      titreClean, nettoyer(description), nettoyer(categorie), mode, typeActivite,
      objectifNum, points, nettoyer(icone), nettoyer(date_debut), nettoyer(date_fin), statut,
    ]
  );
  return rows[0];
};

exports.listerDefis = async (query = {}) => {
  const { categorie, search, statut } = query || {};
  const filtres = new ConstructeurFiltres();
  // Par defaut on n'affiche que les defis ouverts ; ?statut=all montre tout.
  if (statut !== "all") {
    filtres.brut(EST_OUVERT);
  } else {
    filtres.exact("d.statut", statut === "all" ? undefined : statut, ["all"]);
  }
  filtres.exact("d.categorie", categorie, ["Toutes"]);
  filtres.recherche(["d.titre", "d.description"], search);

  const pagination = lirePagination(query);
  const limiteSql = pagination.actif
    ? `LIMIT $${filtres.parametres.length + 1} OFFSET $${filtres.parametres.length + 2}`
    : "";
  const params = pagination.actif
    ? [...filtres.parametres, pagination.limit, pagination.offset]
    : filtres.parametres;

  const { rows } = await pool.query(
    `SELECT ${COLS_DEFI} FROM defi d ${filtres.clause()}
     ORDER BY d.id DESC ${limiteSql}`,
    params
  );
  return rows;
};

exports.compterDefis = async (query = {}) => {
  const { categorie, search, statut } = query || {};
  const filtres = new ConstructeurFiltres();
  if (statut !== "all") filtres.brut(EST_OUVERT);
  filtres.exact("d.categorie", categorie, ["Toutes"]);
  filtres.recherche(["d.titre", "d.description"], search);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM defi d ${filtres.clause()}`,
    filtres.parametres
  );
  return rows[0].total;
};

exports.voirDefi = async (id) => {
  const { rows } = await pool.query(`SELECT ${COLS_DEFI} FROM defi d WHERE d.id = $1`, [id]);
  return rows[0] || null;
};

const lireParticipation = async (executeur, defiId, utilisateurId) => {
  const { rows } = await executeur.query(
    `SELECT id, defi_id, utilisateur_id, statut, progression,
            photo_preuve, commentaire, created_at, completed_at
     FROM defi_participation WHERE defi_id = $1 AND utilisateur_id = $2`,
    [defiId, utilisateurId]
  );
  return rows[0] || null;
};

// ---------------------------------------------------------------------------
// Participation
// ---------------------------------------------------------------------------

exports.rejoindre = async (defiId, utilisateurId) => {
  const defi = await exports.voirDefi(defiId);
  if (!defi) throw echec(404, "Défi introuvable.");
  if (defi.statut !== "actif") throw echec(400, "Ce défi n'est plus actif.");
  if (defi.date_fin && new Date(defi.date_fin) < new Date()) {
    throw echec(400, "Ce défi est terminé.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotence : UNIQUE(defi_id, utilisateur_id) + ON CONFLICT DO NOTHING.
    const { rows } = await client.query(
      `INSERT INTO defi_participation (defi_id, utilisateur_id)
       VALUES ($1, $2)
       ON CONFLICT (defi_id, utilisateur_id) DO NOTHING
       RETURNING id, defi_id, utilisateur_id, statut, progression, created_at`,
      [defiId, utilisateurId]
    );

    // Un defi automatique peut se completer des l'adhesion si l'action a
    // deja ete faite auparavant.
    if (defi.mode === "automatique") {
      await exports.recalculerProgression(client, utilisateurId, defi.type_activite);
    }

    // Relire la participation concernee (la progression a pu etre mise a jour
    // ci-dessus, et plusieurs defis peuvent partager le meme type d'activite).
    const participation = await lireParticipation(client, defiId, utilisateurId);
    await client.query("COMMIT");
    return participation;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.listerMes = async (utilisateurId) => {
  const { rows } = await pool.query(
    `SELECT dp.id, dp.defi_id, dp.statut, dp.progression,
            dp.photo_preuve, dp.commentaire, dp.created_at, dp.completed_at,
            d.titre, d.icone, d.objectif, d.recompense_points, d.mode
     FROM defi_participation dp JOIN defi d ON d.id = dp.defi_id
     WHERE dp.utilisateur_id = $1
     ORDER BY dp.id DESC`,
    [utilisateurId]
  );
  return rows;
};

// Soumission de preuve photo (mode manuel). Le commentaire est optionnel.
exports.soumettrePreuve = async (defiId, utilisateurId, fichier, commentaire) => {
  const defi = await exports.voirDefi(defiId);
  if (!defi) throw echec(404, "Défi introuvable.");
  if (defi.mode !== "manuelle") {
    throw echec(400, "Ce défi se valide automatiquement, aucune preuve n'est attendue.");
  }

  const participation = await lireParticipation(pool, defiId, utilisateurId);
  if (!participation) throw echec(404, "Vous ne participez pas à ce défi.");
  if (participation.statut === "complete") {
    throw echec(400, "Ce défi est déjà complété.");
  }

  const photo = fichier ? "uploads/photos/" + fichier.filename : participation.photo_preuve;
  const comment = nettoyer(commentaire) ?? participation.commentaire;
  if (!photo) throw echec(400, "Une photo de preuve est obligatoire.");

  const { rows } = await pool.query(
    `UPDATE defi_participation
     SET statut = 'en_attente', photo_preuve = $1, commentaire = $2
     WHERE id = $3 AND utilisateur_id = $4
     RETURNING id, defi_id, statut, progression, photo_preuve, commentaire, created_at`,
    [photo, comment, participation.id, utilisateurId]
  );
  return rows[0];
};

// Validation admin d'une preuve (mode manuel).
exports.validerParticipation = async (participationId, accepte) => {
  const { rows: participations } = await pool.query(
    `SELECT dp.*, d.recompense_points, d.mode, d.titre
     FROM defi_participation dp JOIN defi d ON d.id = dp.defi_id
     WHERE dp.id = $1`,
    [participationId]
  );
  const participation = participations[0];
  if (!participation) throw echec(404, "Participation introuvable.");
  if (participation.mode !== "manuelle") {
    throw echec(400, "Seules les preuves des défis manuels sont à valider.");
  }
  if (participation.statut !== "en_attente") {
    throw echec(400, "Aucune preuve en attente de validation.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (accepte) {
      await completer(client, participation, participation.recompense_points);
    } else {
      await client.query(
        "UPDATE defi_participation SET statut = 'rejete' WHERE id = $1",
        [participationId]
      );
    }
    await client.query("COMMIT");
    return lireParticipation(pool, participation.defi_id, participation.utilisateur_id);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------------
// Progression automatique (appelee depuis activites.service.js)
// ---------------------------------------------------------------------------

// Complete une participation : ecrit l'activite 'defi_complete' puis force
// les points a la recompense du defi. Idempotent (activite unique + statut).
const completer = async (client, participation, recompensePoints) => {
  // require differe : evite le cycle activites <-> defis au chargement.
  const activitesService = require("../activites/activites.service");

  const activite = await activitesService.enregistrerActivite(client, {
    utilisateurId: participation.utilisateur_id,
    type: activitesService.TYPES.DEFI_COMPLETE,
    refTable: "defi_participation",
    refId: participation.id,
    libelle: `Défi « ${participation.titre || ""} » réalisé`.trim(),
    metadata: { defi_id: participation.defi_id, participation_id: participation.id },
  });

  // Si l'activite existe deja, le defi a deja ete complete : on ne re-attribue
  // pas les points (attribuerPoints a ete appele avec 0 pour defi_complete).
  if (activite) {
    await engagementService.attribuerPointsPersonnalises(
      client,
      activite,
      Number(recompensePoints) || 0
    );
  }

  await client.query(
    `UPDATE defi_participation
     SET statut = 'complete',
         progression = GREATEST(progression, $2),
         completed_at = NOW()
     WHERE id = $1`,
    [participation.id, participation.progression || 0]
  );
};

// Recalcule la progression de TOUTES les participations automatiques d'un
// utilisateur pour un type d'activite donne. Appele a chaque nouvelle activite.
exports.recalculerProgression = async (client, utilisateurId, typeActivite) => {
  if (!utilisateurId || !typeActivite || typeActivite === "defi_complete") return null;
  const executeur = client || pool;

  const { rows } = await executeur.query(
    `SELECT dp.id, dp.defi_id, dp.utilisateur_id, dp.statut, dp.progression,
            d.objectif, d.recompense_points, d.titre, d.type_activite
     FROM defi_participation dp
     JOIN defi d ON d.id = dp.defi_id
     WHERE dp.utilisateur_id = $1
       AND d.mode = 'automatique'
       AND d.type_activite = $2
       AND dp.statut IN ('en_cours', 'en_attente')`,
    [utilisateurId, typeActivite]
  );
  if (!rows.length) return null;

  const { rows: comptes } = await executeur.query(
    "SELECT COUNT(*)::int AS total FROM activite WHERE utilisateur_id = $1 AND type = $2",
    [utilisateurId, typeActivite]
  );
  const total = comptes[0].total;

  let derniere = null;
  for (const participation of rows) {
    const progression = Math.min(total, participation.objectif);
    await executeur.query(
      "UPDATE defi_participation SET progression = $1 WHERE id = $2",
      [progression, participation.id]
    );
    derniere = { ...participation, progression };

    if (progression >= participation.objectif) {
      await completer(executeur, { ...participation, progression }, participation.recompense_points);
    }
  }
  return derniere;
};
