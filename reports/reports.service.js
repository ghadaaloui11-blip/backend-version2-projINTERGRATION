const pool = require("../config/db");

exports.creerSignalement = async (data, file, userId) => {
  const { description, latitude, longitude, est_anonyme } = data;

  if (!description) {
    throw { status: 400, message: "La description est obligatoire." };
  }

  // Chemin relatif servi par /uploads (le fichier est deja stocke dans <backend>/uploads)
  const photoPath = file ? "uploads/" + file.filename : null;
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
