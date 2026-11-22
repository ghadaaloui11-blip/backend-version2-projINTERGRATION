// US37 : journal d'activite. Egalement source de verite pour US24 (points)
// et US26 (progression des defis).
const pool = require("../config/db");
const { echec } = require("../utils/http");
const engagementService = require("../engagement/engagement.service");

const TYPES = Object.freeze({
  DON: "don",
  INSCRIPTION_EVENEMENT_ACCEPTEE: "inscription_evenement_acceptee",
  DON_NATURE_COLLECTE: "don_nature_collecte",
  DEMANDE_AIDE: "demande_aide",
  SIGNALEMENT: "signalement",
  BENEVOLAT: "benevolat",
  DEFI_COMPLETE: "defi_complete",
});

// `client` est facultatif : fournir le client pg deja ouvert permet d'ecrire
// le journal dans la MEME transaction que l'action metier.
exports.enregistrerActivite = async (
  client,
  { utilisateurId, type, refTable, refId, libelle, metadata = {} } = {}
) => {
  if (!utilisateurId || !type || !refTable || !refId || !libelle) return null;
  const executeur = client || pool;
  const { rows } = await executeur.query(
    `INSERT INTO activite (utilisateur_id, type, ref_table, ref_id, libelle, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (type, ref_table, ref_id) DO NOTHING
     RETURNING id, utilisateur_id, type, libelle, created_at`,
    [utilisateurId, type, refTable, refId, libelle, JSON.stringify(metadata || {})]
  );
  const activite = rows[0] || null;

  // US24 : l'attribution des points et des badges suit l'activite dans la
  // MEME transaction. Un conflit (deja inscrit) ne cree ni point ni badge.
  if (activite) {
    await engagementService.attribuerPoints(client, activite);

    // US26 : met a jour la progression des defis automatiques (et complete
    // ceux ayant atteint leur objectif) dans la meme transaction.
    // require differe pour eviter le cycle activites <-> defis.
    const defisService = require("../defis/defis.service");
    await defisService.recalculerProgression(client, utilisateurId, type);
  }
  return activite;
};

exports.listerMes = async (utilisateurId, page = 1, limit = 20) => {
  const p = Math.max(Number.parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const { rows } = await pool.query(
    `SELECT id, type, ref_table, ref_id, libelle, metadata,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
     FROM activite
     WHERE utilisateur_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [utilisateurId, l, (p - 1) * l]
  );
  const total = await pool.query(
    "SELECT COUNT(*)::int AS total FROM activite WHERE utilisateur_id = $1",
    [utilisateurId]
  );
  return { activites: rows, total: total.rows[0].total };
};

exports.compterParType = async (utilisateurId, type) => {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS total FROM activite WHERE utilisateur_id = $1 AND type = $2",
    [utilisateurId, type]
  );
  return rows[0].total;
};

exports.TYPES = TYPES;
