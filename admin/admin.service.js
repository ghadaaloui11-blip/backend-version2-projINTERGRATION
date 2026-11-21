const pool = require("../config/db");
const { echec } = require("../utils/http");

const compterParStatut = async (table) => {
  const result = await pool.query(
    "SELECT statut, COUNT(*)::int AS total FROM " + table + " GROUP BY statut"
  );
  return result.rows;
};

const compter = async (table) => {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM " + table
  );
  return result.rows[0].total;
};

exports.stats = async () => {
  const parRole = await pool.query(
    "SELECT role, COUNT(*)::int AS total FROM utilisateur GROUP BY role"
  );
  const totalUsers = await compter("utilisateur");
  const benevoles = await compter("benevole");

  const signalements = await compterParStatut("signalement");
  const demandes = await compterParStatut("demande_aide");
  const donsNature = await compterParStatut("don_nature");

  const campagnes = await compter("campagnes");
  const dons = await compter("dons");
  const evenements = await compter("evenements");
  const inscriptions = await compter("inscriptions_evenements");

  return {
    utilisateurs: {
      total: totalUsers,
      parRole: parRole.rows,
    },
    benevoles: benevoles,
    signalements: signalements,
    demandesAide: demandes,
    donsNature: donsNature,
    campagnes: campagnes,
    dons: dons,
    evenements: evenements,
    inscriptions: inscriptions,
  };
};

exports.listerUtilisateurs = async (q, page, limit) => {
  let p = parseInt(page);
  let l = parseInt(limit);
  if (!p || p < 1) {
    p = 1;
  }
  if (!l || l < 1 || l > 100) {
    l = 20;
  }

  const recherche = "%" + String(q || "").trim() + "%";

  const result = await pool.query(
    `SELECT id, nom, prenom, email, role, actif
     FROM utilisateur
     WHERE nom ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [recherche, l, (p - 1) * l]
  );
  return result.rows;
};

exports.changerStatutUtilisateur = async (id, actif, adminId) => {
  const userId = parseInt(id);
  if (!userId) {
    throw echec(400, "Identifiant invalide.");
  }
  if (typeof actif !== "boolean") {
    throw echec(400, "Le champ actif doit être true ou false.");
  }
  if (userId === adminId) {
    throw echec(400, "Vous ne pouvez pas désactiver votre propre compte.");
  }

  const cible = await pool.query(
    "SELECT id, role FROM utilisateur WHERE id = $1",
    [userId]
  );
  if (!cible.rows[0]) {
    throw echec(404, "Utilisateur introuvable.");
  }
  if (cible.rows[0].role === "admin") {
    throw echec(403, "Impossible de modifier le statut d'un administrateur.");
  }

  const result = await pool.query(
    "UPDATE utilisateur SET actif = $1 WHERE id = $2 RETURNING id, actif",
    [actif, userId]
  );
  return result.rows[0];
};