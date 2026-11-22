const pool = require("../config/db");
const { echec } = require("../utils/http");
const activitesService = require("../activites/activites.service");
const { CATEGORIES_SIGNALEMENT } = require("../utils/categories");

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
  const { titre, categorie, description, latitude, longitude, est_anonyme, ville } = data || {};
  const villeClean = String(ville || '').trim() || null;

  // Validation du titre (obligatoire)
  const titreClean = String(titre || "").trim();
  if (!titreClean) {
    throw echec(400, "Le titre est obligatoire.");
  }
  if (titreClean.length < 5) {
    throw echec(400, "Le titre doit contenir au moins 5 caractères.");
  }
  if (titreClean.length > 200) {
    throw echec(400, "Le titre ne peut pas dépasser 200 caractères.");
  }

  // Validation de la catégorie
  const categoriesValides = CATEGORIES_SIGNALEMENT;
  const categorieClean = String(categorie || "Autre").trim();
  if (!categoriesValides.includes(categorieClean)) {
    throw echec(400, `Catégorie invalide. Valeurs acceptées : ${categoriesValides.join(', ')}.`);
  }

  // Validation de la description
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
      `INSERT INTO signalement (titre, categorie, description, photo, latitude, longitude, est_anonyme, citoyen_id, ville)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;`,
      [titreClean, categorieClean, description, photoPath, latValue, lonValue, estAnonymeBool, citoyenId, villeClean]
    );
    const signalement = result.rows[0];

    await client.query(
      `INSERT INTO signalement_statut_historique (signalement_id, statut, association_id)
       VALUES ($1, 'recu', NULL)`,
      [signalement.id]
    );

    // US37 / Q13 : le signalement reste anonyme cote public (citoyen_id = NULL)
    // mais l'auteur en garde une trace dans son historique PRIVE.
    await activitesService.enregistrerActivite(client, {
      utilisateurId: userId,
      type: activitesService.TYPES.SIGNALEMENT,
      refTable: "signalement",
      refId: signalement.id,
      libelle: `Signalement « ${titreClean} » envoyé${estAnonymeBool ? ' (anonyme)' : ''}`,
      metadata: { categorie: categorieClean, est_anonyme: estAnonymeBool },
    });

    await client.query("COMMIT");
    return signalement;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.getSignalementById = async (id, userId) => {
  const { rows } = await pool.query(
    `SELECT id, titre, categorie, description, photo,
     latitude::float8 AS latitude,
     longitude::float8 AS longitude,
     est_anonyme, statut, ville, created_at
     FROM signalement 
     WHERE id = $1`,
    [id]
  );
  
  if (!rows[0]) {
    throw echec(404, "Signalement introuvable");
  }
  
  return rows[0];
};

// US07 : seul le createur peut modifier ou supprimer son signalement.
// Un signalement anonyme a citoyen_id = NULL : personne ne peut plus le modifier,
// ce qui est coherent avec l'anonymat garanti a la creation.
const exigerProprietaire = async (id, userId) => {
  const { rows } = await pool.query(
    "SELECT citoyen_id FROM signalement WHERE id = $1",
    [id]
  );
  if (!rows[0]) {
    throw echec(404, "Signalement introuvable");
  }
  if (rows[0].citoyen_id === null || Number(rows[0].citoyen_id) !== Number(userId)) {
    throw echec(403, "Vous n'êtes pas autorisé à modifier ce signalement.");
  }
};

exports.updateSignalement = async (id, data, file, userId) => {
  const { titre, categorie, description, latitude, longitude, est_anonyme, ville } = data || {};

  // Vérifier si le signalement existe et appartient à l'utilisateur
  await exigerProprietaire(id, userId);
  const existing = await exports.getSignalementById(id, userId);
  
  // Validation du titre (obligatoire)
  const titreClean = String(titre || "").trim();
  if (!titreClean) {
    throw echec(400, "Le titre est obligatoire.");
  }
  if (titreClean.length < 5) {
    throw echec(400, "Le titre doit contenir au moins 5 caractères.");
  }
  if (titreClean.length > 200) {
    throw echec(400, "Le titre ne peut pas dépasser 200 caractères.");
  }

  // Validation de la catégorie
  const categoriesValides = CATEGORIES_SIGNALEMENT;
  const categorieClean = String(categorie || "Autre").trim();
  if (!categoriesValides.includes(categorieClean)) {
    throw echec(400, `Catégorie invalide. Valeurs acceptées : ${categoriesValides.join(', ')}.`);
  }

  // Validation de la description
  if (!description || !String(description).trim()) {
    throw echec(400, "La description est obligatoire.");
  }

  const photoPath = file ? "uploads/photos/" + file.filename : existing.photo;
  const estAnonymeBool = est_anonyme === "true" || est_anonyme === true;
  const latValue = parserCoordonnee(latitude, -90, 90, "La latitude");
  const lonValue = parserCoordonnee(longitude, -180, 180, "La longitude");

  const result = await pool.query(
    `UPDATE signalement 
     SET titre = $1, categorie = $2, description = $3, photo = $4, latitude = $5, longitude = $6, est_anonyme = $7,
         ville = COALESCE($9, ville)
     WHERE id = $8 RETURNING *`,
    [titreClean, categorieClean, description, photoPath, latValue, lonValue, estAnonymeBool, id, String(ville || '').trim() || null]
  );
  
  return result.rows[0];
};

exports.deleteSignalement = async (id, userId) => {
  // Vérifier si le signalement existe et appartient au citoyen connecte
  await exigerProprietaire(id, userId);

  await pool.query("DELETE FROM signalement WHERE id = $1", [id]);
};
