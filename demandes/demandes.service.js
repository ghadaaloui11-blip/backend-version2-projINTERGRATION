const pool = require("../config/db");
const { echec } = require("../utils/http");
const activitesService = require("../activites/activites.service");
const { avecTransaction } = require("../utils/db");

exports.creerDemande = async (data, citoyenId) => {
  const categorie = String(data.categorie || "").trim();
  const description = String(data.description || "").trim();
  const ville = String(data.ville || "").trim();
  const telephone = String(data.telephone || "").trim();
  const associationId = data.associationId || null;

  if (!categorie || !description || !ville) {
    throw echec(400, "Catégorie, description et ville sont obligatoires.");
  }
  if (description.length < 10) {
    throw echec(400, "La description doit contenir au moins 10 caractères.");
  }

  return avecTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO demande_aide (citoyen_id, categorie, description, ville, telephone, association_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, categorie, ville, statut, created_at`,
      [citoyenId, categorie, description, ville, telephone, associationId]
    );

    // Tracee dans le journal (0 point : demander de l'aide n'est pas un don).
    await activitesService.enregistrerActivite(client, {
      utilisateurId: citoyenId,
      type: activitesService.TYPES.DEMANDE_AIDE,
      refTable: 'demande_aide',
      refId: result.rows[0].id,
      libelle: `Demande d'aide envoyée (${categorie}, ${ville})`,
      metadata: { categorie, ville },
    });

    return result.rows[0];
  });
};

// L'association voit ses demandes + celles qui ne sont pas encore affectees
exports.listerPourAssociation = async (associationId) => {
  const result = await pool.query(
    `SELECT id, categorie, description, ville, telephone, statut, created_at
     FROM demande_aide
     WHERE association_id = $1 OR association_id IS NULL
     ORDER BY created_at DESC`,
    [associationId]
  );
  return result.rows;
};

exports.changerStatut = async (demandeId, associationId, statut) => {
  if (statut !== "acceptee" && statut !== "refusee") {
    throw echec(400, "Statut invalide (acceptee ou refusee).");
  }

  const result = await pool.query(
    `UPDATE demande_aide
     SET statut = $1, association_id = $2
     WHERE id = $3 AND (association_id = $2 OR association_id IS NULL)
     RETURNING id, statut`,
    [statut, associationId, demandeId]
  );
  if (result.rows.length === 0) {
    throw echec(404, "Demande introuvable.");
  }
  return result.rows[0];
};