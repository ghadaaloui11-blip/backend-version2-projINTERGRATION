const pool = require('../config/db');

// US02 : Déposer un document légal pour l'association connectée
exports.ajouterDocument = async (associationId, typeDocument, filePath, nomOriginal) => {
  const { rows } = await pool.query(
    `INSERT INTO document_association (association_id, type_document, chemin_fichier, nom_original)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [associationId, typeDocument, filePath, nomOriginal]
  );
  return rows[0];
};

// US02 : Lister les documents de l'association connectée
exports.getMesDocuments = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT id, type_document, nom_original,
            to_char(date_depot, 'YYYY-MM-DD HH24:MI') AS date_depot
     FROM document_association
     WHERE association_id = $1
     ORDER BY id DESC`,
    [associationId]
  );
  return rows;
};

// US02 : Supprimer un document (seulement si appartient à l'association)
exports.supprimerDocument = async (docId, associationId) => {
  const { rows } = await pool.query(
    `DELETE FROM document_association
     WHERE id = $1 AND association_id = $2
     RETURNING *`,
    [docId, associationId]
  );
  return rows[0]; // undefined si non trouvé ou non propriétaire
};

// US03 : Lister toutes les associations avec leur statut et nombre de documents (admin)
exports.listerAssociationsPourAdmin = async (statut) => {
  const params = [];
  let where = '';
  if (statut && statut !== 'all') {
    params.push(statut);
    where = `WHERE a.statut_validation = $1`;
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.nom, u.email, u.telephone,
            a.nom_association, a.adresse, a.matricule_fiscal,
            a.statut_validation, a.commentaire_admin,
            to_char(a.date_validation, 'YYYY-MM-DD HH24:MI') AS date_validation,
            COUNT(d.id) AS nb_documents
     FROM utilisateur u
     JOIN association a ON u.id = a.id
     LEFT JOIN document_association d ON a.id = d.association_id
     ${where}
     GROUP BY u.id, u.nom, u.email, u.telephone,
              a.nom_association, a.adresse, a.matricule_fiscal,
              a.statut_validation, a.commentaire_admin, a.date_validation
     ORDER BY u.id DESC`,
    params
  );
  return rows;
};

// US03 : Obtenir les documents d'une association (admin)
exports.getDocumentsAssociation = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT id, type_document, nom_original, chemin_fichier,
            to_char(date_depot, 'YYYY-MM-DD HH24:MI') AS date_depot
     FROM document_association
     WHERE association_id = $1
     ORDER BY id DESC`,
    [associationId]
  );
  return rows;
};

// US03 : Valider ou refuser une association (admin)
exports.validerAssociation = async (associationId, statut, commentaire) => {
  if (!['approuve', 'refuse'].includes(statut)) {
    throw { status: 400, message: 'Statut invalide. Valeurs acceptées : approuve, refuse' };
  }

  const { rows } = await pool.query(
    `UPDATE association
     SET statut_validation = $1,
         commentaire_admin = $2,
         date_validation = NOW()
     WHERE id = $3
     RETURNING *`,
    [statut, commentaire || null, associationId]
  );

  if (!rows[0]) {
    throw { status: 404, message: 'Association introuvable' };
  }
  return rows[0];
};

// Statut de validation de l'association connectée (pour le front)
exports.getMonStatut = async (associationId) => {
  const { rows } = await pool.query(
    `SELECT a.statut_validation, a.commentaire_admin,
            to_char(a.date_validation, 'YYYY-MM-DD HH24:MI') AS date_validation
     FROM association a
     WHERE a.id = $1`,
    [associationId]
  );
  return rows[0];
};
