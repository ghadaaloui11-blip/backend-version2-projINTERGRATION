const pool = require("../config/db");
const { echec } = require("../utils/http");

const nettoyer = (data) => {
  const competences = String(data.competences || "").trim();
  const disponibilites = String(data.disponibilites || "").trim();
  const ville = String(data.ville || "").trim();
  const motivation = String(data.motivation || "").trim();

  if (!competences || !disponibilites || !ville) {
    throw echec(400, "Compétences, disponibilités et ville sont obligatoires.");
  }
  return { competences, disponibilites, ville, motivation };
};

exports.inscrire = async (userId, data) => {
  const b = nettoyer(data);
  try {
    const result = await pool.query(
      `INSERT INTO benevole (utilisateur_id, competences, disponibilites, ville, motivation)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, competences, disponibilites, ville, motivation`,
      [userId, b.competences, b.disponibilites, b.ville, b.motivation]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") {
      throw echec(400, "Vous êtes déjà inscrit comme bénévole.");
    }
    throw err;
  }
};

exports.getMonProfil = async (userId) => {
  const result = await pool.query(
    `SELECT id, competences, disponibilites, ville, motivation
     FROM benevole
     WHERE utilisateur_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    throw echec(404, "Vous n'êtes pas encore inscrit comme bénévole.");
  }
  return result.rows[0];
};

exports.modifier = async (userId, data) => {
  const b = nettoyer(data);
  const result = await pool.query(
    `UPDATE benevole
     SET competences = $1, disponibilites = $2, ville = $3, motivation = $4
     WHERE utilisateur_id = $5
     RETURNING id, competences, disponibilites, ville, motivation`,
    [b.competences, b.disponibilites, b.ville, b.motivation, userId]
  );
  if (result.rows.length === 0) {
    throw echec(404, "Vous n'êtes pas encore inscrit comme bénévole.");
  }
  return result.rows[0];
};