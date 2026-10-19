const service = require('./associations.service');
const path = require('path');
const fs = require('fs');
const { repondreErreur } = require('../utils/http');

const DOSSIER_DOCUMENTS = path.resolve(path.join(__dirname, '..', 'uploads'));

// ─── US02 : ASSOCIATION ─────────────────────────────────────────────────────

// POST /api/associations/documents  — déposer un document
exports.deposerDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erreur: 'Aucun fichier fourni.' });
    }

    const { type_document } = req.body || {};
    if (!type_document) {
      return res.status(400).json({ erreur: 'Le type de document est obligatoire.' });
    }

    const typesAutorise = ['statuts', 'matricule_fiscal', 'registre_commerce', 'autre'];
    if (!typesAutorise.includes(type_document)) {
      return res.status(400).json({
        erreur: `Type invalide. Valeurs acceptées : ${typesAutorise.join(', ')}`,
      });
    }

    const doc = await service.ajouterDocument(
      req.user.id,
      type_document,
      'uploads/' + req.file.filename,
      req.file.originalname
    );

    res.status(201).json({ message: 'Document déposé avec succès.', document: doc });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du dépôt du document.");
  }
};

// GET /api/associations/documents  — mes documents
exports.getMesDocuments = async (req, res) => {
  try {
    const docs = await service.getMesDocuments(req.user.id);
    res.json(docs);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des documents.');
  }
};

// GET /api/documents/:id/file  — telecharger un document (proprietaire ou admin)
exports.telechargerDocument = async (req, res) => {
  try {
    const doc = await service.getDocumentParId(req.params.id);
    if (!doc) {
      return res.status(404).json({ erreur: 'Document introuvable.' });
    }
    if (req.user.role !== 'admin' && doc.association_id !== req.user.id) {
      return res.status(403).json({ erreur: 'Accès refusé à ce document.' });
    }

    const fichierAbsolu = path.resolve(path.join(__dirname, '..', doc.chemin_fichier));
    if (!fichierAbsolu.startsWith(DOSSIER_DOCUMENTS + path.sep)) {
      return res.status(400).json({ erreur: 'Chemin de document invalide.' });
    }
    if (!fs.existsSync(fichierAbsolu)) {
      return res.status(404).json({ erreur: 'Fichier absent du serveur.' });
    }

    res.sendFile(fichierAbsolu);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du téléchargement du document.');
  }
};

// DELETE /api/associations/documents/:id  — supprimer un de mes documents
exports.supprimerDocument = async (req, res) => {
  try {
    const deleted = await service.supprimerDocument(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ erreur: 'Document introuvable ou accès refusé.' });
    }
    res.json({ message: 'Document supprimé.' });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la suppression du document.');
  }
};

// GET /api/associations/mon-statut  — statut de validation de l'association connectée
exports.getMonStatut = async (req, res) => {
  try {
    const statut = await service.getMonStatut(req.user.id);
    if (!statut) return res.status(404).json({ erreur: 'Association introuvable.' });
    res.json(statut);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du statut.');
  }
};

// ─── US03 : ADMIN ───────────────────────────────────────────────────────────

// GET /api/associations  — liste des associations (admin)
exports.listerAssociations = async (req, res) => {
  try {
    const associations = await service.listerAssociationsPourAdmin(req.query.statut);
    res.json(associations);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des associations.');
  }
};

// GET /api/associations/:id/documents  — documents d'une association (admin)
exports.getDocumentsAssociation = async (req, res) => {
  try {
    const docs = await service.getDocumentsAssociation(req.params.id);
    res.json(docs);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des documents.');
  }
};

// PATCH /api/associations/:id/validation  — valider ou refuser (admin)
exports.validerAssociation = async (req, res) => {
  try {
    const { statut, commentaire } = req.body || {};
    if (!statut) {
      return res.status(400).json({ erreur: 'Le statut est obligatoire (approuve ou refuse).' });
    }

    const result = await service.validerAssociation(req.params.id, statut, commentaire);
    res.json({ message: `Association ${statut === 'approuve' ? 'validée' : 'refusée'} avec succès.`, association: result });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la validation de l'association.");
  }
};
