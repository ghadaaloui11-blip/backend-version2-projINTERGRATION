const pool = require("../config/db");
const { echec } = require("../utils/http");

exports.creerSignalement = async (data, file, userId) => {
  const { description, latitude, longitude, est_anonyme } = data || {};

  if (!description) {
    throw echec(400, "La description est obligatoire.");
  }

  // URL publique : /uploads/photos/<fichier> (dossier uploads-public/)
  const photoPath = file ? "uploads/photos/" + file.filename : null;
  const estAnonymeBool = est_anonyme === "true" || est_anonyme === true;
  const citoyenId = estAnonymeBool ? null : userId;
  const latValue = latitude ? parseFloat(latitude) : null;
  const lonValue = longitude ? parseFloat(longitude) : null;

  const query = `
    INSERT INTO signalement (description, photo, latitude, longitude, est_anonyme, citoyen_id)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
  `;
  const values = [
    description,
    photoPath,
    latValue,
    lonValue,
    estAnonymeBool,
    citoyenId,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};
