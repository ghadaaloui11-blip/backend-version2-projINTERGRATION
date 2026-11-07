const pool = require("../config/db");
const { echec } = require("../utils/http");

// Coordonnee optionnelle mais, si fournie, strictement numerique et bornee.
// Number() (et non parseFloat) : "12abc" ou "NaN" sont refuses au lieu d'etre
// tronques / convertis en NaN stockable par PostgreSQL.
const parserCoordonnee = (valeur, min, max, libelle) => {
  if (valeur === undefined || valeur === null || String(valeur).trim() === "") {
    return null;
  }
  const nombre = Number(String(valeur).trim());
  if (!Number.isFinite(nombre) || nombre < min || nombre > max) {
    throw echec(
      400,
      `${libelle} invalide : une valeur numérique entre ${min} et ${max} est attendue.`
    );
  }
  return nombre;
};

exports.creerSignalement = async (data, file, userId) => {
  const { description, latitude, longitude, est_anonyme } = data || {};

  if (!description || !String(description).trim()) {
    throw echec(400, "La description est obligatoire.");
  }

  // URL publique : /uploads/photos/<fichier> (dossier uploads-public/)
  const photoPath = file ? "uploads/photos/" + file.filename : null;
  const estAnonymeBool = est_anonyme === "true" || est_anonyme === true;
  const citoyenId = estAnonymeBool ? null : userId;
  const latValue = parserCoordonnee(latitude, -90, 90, "La latitude");
  const lonValue = parserCoordonnee(longitude, -180, 180, "La longitude");

  // Insertion + entree initiale du journal dans la meme transaction : un
  // signalement cree sans sa trace "recu" ferait un historique incomplet.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO signalement (description, photo, latitude, longitude, est_anonyme, citoyen_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
      [description, photoPath, latValue, lonValue, estAnonymeBool, citoyenId]
    );
    const signalement = result.rows[0];

    await client.query(
      `INSERT INTO signalement_statut_historique (signalement_id, statut, association_id)
       VALUES ($1, 'recu', NULL)`,
      [signalement.id]
    );

    await client.query("COMMIT");
    return signalement;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
