// US24 : solde, attribution idempotente et badges. Toutes les ecritures
// se font dans la transaction de l'action metier lorsqu'un client pg est fourni.
const pool = require("../config/db");
const { echec } = require("../utils/http");
const { pointsPour, REGLES_BADGES } = require("./regles");

const executer = (client, sql, params) => (client || pool).query(sql, params);

// Statistiques utilisees a la fois pour attribuer et pour retirer des badges.
const calculerStats = async (executeur, utilisateurId) => {
  const { rows: totaux } = await executeur.query(
    `SELECT COUNT(*)::int AS nb_actions
     FROM activite WHERE utilisateur_id = $1`,
    [utilisateurId]
  );
  const { rows: points } = await executeur.query(
    `SELECT COALESCE(SUM(points), 0)::int AS total_points
     FROM point_engagement WHERE utilisateur_id = $1`,
    [utilisateurId]
  );
  const { rows: parType } = await executeur.query(
    `SELECT type, COUNT(*)::int AS total FROM activite
     WHERE utilisateur_id = $1 GROUP BY type`,
    [utilisateurId]
  );

  return {
    nbActions: totaux[0].nb_actions,
    totalPoints: points[0].total_points,
    parType: Object.fromEntries(parType.map((ligne) => [ligne.type, ligne.total])),
  };
};

const badgesEligibles = (stats) =>
  REGLES_BADGES.filter((regle) => regle.test(stats)).map((regle) => regle.code);

// Insere les badges nouvellement merites. UNIQUE(utilisateur_id, badge_id)
// garantit l'idempotence.
const attribuerBadges = async (executeur, utilisateurId) => {
  const stats = await calculerStats(executeur, utilisateurId);
  for (const code of badgesEligibles(stats)) {
    await executeur.query(
      `INSERT INTO badge_obtenu (utilisateur_id, badge_id)
       SELECT $1, b.id FROM badge b WHERE b.code = $2
       ON CONFLICT (utilisateur_id, badge_id) DO NOTHING`,
      [utilisateurId, code]
    );
  }
};

// Appele par activites.service.enregistrerActivite juste apres l'insertion.
// `activite` = { id, utilisateur_id, type }.
exports.attribuerPoints = async (client, activite) => {
  if (!activite || !activite.id || !activite.utilisateur_id) return;
  const executeur = client || pool;

  // Le plafond journalier se compte sur les activites deja presentes, y compris
  // celle qui vient d'etre inseree -> on retire 1 pour obtenir l'etat avant.
  const { rows } = await executeur.query(
    `SELECT COUNT(*)::int AS total FROM activite
     WHERE utilisateur_id = $1 AND type = $2 AND created_at >= CURRENT_DATE`,
    [activite.utilisateur_id, activite.type]
  );
  const points = pointsPour(activite.type, Math.max((rows[0].total || 1) - 1, 0));

  await executeur.query(
    `INSERT INTO point_engagement (utilisateur_id, activite_id, type, points)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (activite_id) DO NOTHING`,
    [activite.utilisateur_id, activite.id, activite.type, points]
  );

  await attribuerBadges(executeur, activite.utilisateur_id);
};

// Utilise par US26 : une recompense de defi peut valoir plus que le forfait.
exports.attribuerPointsPersonnalises = async (client, activite, points) => {
  if (!activite || !activite.id || !activite.utilisateur_id) return;
  if (!Number.isInteger(points) || points < 0) {
    throw echec(400, "La recompense doit etre un entier positif.");
  }
  await executer(client,
    `INSERT INTO point_engagement (utilisateur_id, activite_id, type, points)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (activite_id) DO UPDATE SET points = EXCLUDED.points`,
    [activite.utilisateur_id, activite.id, activite.type || "defi_complete", points]
  );
  await attribuerBadges(client || pool, activite.utilisateur_id);
};

// Decision Q4 : revoquer lorsque la source est annulee / refusee. On retire
// le point et l'activite (l'activite etant la cle d'idempotence).
exports.revoquerPourSource = async (client, refTable, refId) => {
  const executeur = client || pool;
  const { rows } = await executeur.query(
    `SELECT DISTINCT utilisateur_id FROM activite WHERE ref_table = $1 AND ref_id = $2`,
    [refTable, refId]
  );
  if (!rows.length) return;

  await executeur.query(
    `DELETE FROM point_engagement WHERE activite_id IN
       (SELECT id FROM activite WHERE ref_table = $1 AND ref_id = $2)`,
    [refTable, refId]
  );
  await executeur.query(
    "DELETE FROM activite WHERE ref_table = $1 AND ref_id = $2",
    [refTable, refId]
  );

  for (const utilisateur of rows) {
    const stats = await calculerStats(executeur, utilisateur.utilisateur_id);
    const eligibles = badgesEligibles(stats);
    const { rows: obtenus } = await executeur.query(
      `SELECT b.code FROM badge_obtenu bo JOIN badge b ON b.id = bo.badge_id
       WHERE bo.utilisateur_id = $1`,
      [utilisateur.utilisateur_id]
    );
    for (const badge of obtenus) {
      if (!eligibles.includes(badge.code)) {
        await executeur.query(
          `DELETE FROM badge_obtenu
           WHERE utilisateur_id = $1 AND badge_id = (SELECT id FROM badge WHERE code = $2)`,
          [utilisateur.utilisateur_id, badge.code]
        );
      }
    }
  }
};

// GET /api/engagement/moi : solde, badges obtenus et badges restants.
exports.lireMoi = async (utilisateurId) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(points), 0)::int AS solde, COUNT(*)::int AS actions
     FROM point_engagement WHERE utilisateur_id = $1`,
    [utilisateurId]
  );
  const { rows: obtenus } = await pool.query(
    `SELECT b.code, b.nom, b.description, b.icone,
            to_char(bo.obtenu_le, 'YYYY-MM-DD') AS obtenu_le
     FROM badge_obtenu bo JOIN badge b ON b.id = bo.badge_id
     WHERE bo.utilisateur_id = $1
     ORDER BY bo.obtenu_le ASC, b.id ASC`,
    [utilisateurId]
  );
  const { rows: restants } = await pool.query(
    `SELECT b.code, b.nom, b.description, b.icone
     FROM badge b
     WHERE b.id NOT IN (SELECT badge_id FROM badge_obtenu WHERE utilisateur_id = $1)
     ORDER BY b.id ASC`,
    [utilisateurId]
  );

  return {
    solde: rows[0].solde,
    actions: rows[0].actions,
    badges: obtenus,
    badges_restants: restants,
  };
};
