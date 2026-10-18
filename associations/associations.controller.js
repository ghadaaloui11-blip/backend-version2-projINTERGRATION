const service = require('./associations.service');
const path = require('path');

// ─── US02 : ASSOCIATION ─────────────────────────────────────────────────────

// POST /api/associations/documents  — déposer un document
exports.deposerDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni.' });
    }

    const { type_document } = req.body;
    if (!type_document) {
      return res.status(400).json({ message: 'Le type de document est obligatoire.' });
    }

    const typesAutorise = ['statuts', 'matricule_fiscal', 'registre_commerce', 'autre'];
    if (!typesAutorise.includes(type_document)) {
      return res.status(400).json({
        message: `Type invalide. Valeurs acceptées : ${typesAutorise.join(', ')}`,
      });
    }

    const doc = await service.ajouterDocument(
      req.user.id,
      type_document,
      req.file.path,
      req.file.originalname
    );

    res.status(201).json({ message: 'Document déposé avec succès.', document: doc });
  } catch (err) {
    console.error('ERREUR deposerDocument:', err);
    res.status(err.status || 500).json({ message: err.message || 'Erreur serveur.' });
  }
};

// GET /api/associations/documents  — mes documents
exports.getMesDocuments = async (req, res) => {
  try {
    const docs = await service.getMesDocuments(req.user.id);
    res.json(docs);
  } catch (err) {
    console.error('ERREUR getMesDocuments:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// DELETE /api/associations/documents/:id  — supprimer un de mes documents
exports.supprimerDocument = async (req, res) => {
  try {
    const deleted = await service.supprimerDocument(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Document introuvable ou accès refusé.' });
    }
    res.json({ message: 'Document supprimé.' });
  } catch (err) {
    console.error('ERREUR supprimerDocument:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// GET /api/associations/mon-statut  — statut de validation de l'association connectée
exports.getMonStatut = async (req, res) => {
  try {
    const statut = await service.getMonStatut(req.user.id);
    if (!statut) return res.status(404).json({ message: 'Association introuvable.' });
    res.json(statut);
  } catch (err) {
    console.error('ERREUR getMonStatut:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ─── US03 : ADMIN ───────────────────────────────────────────────────────────

// GET /api/associations  — liste des associations (admin)
exports.listerAssociations = async (req, res) => {
  try {
    const associations = await service.listerAssociationsPourAdmin(req.query.statut);
    res.json(associations);
  } catch (err) {
    console.error('ERREUR listerAssociations:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// GET /api/associations/:id/documents  — documents d'une association (admin)
exports.getDocumentsAssociation = async (req, res) => {
  try {
    const docs = await service.getDocumentsAssociation(req.params.id);
    res.json(docs);
  } catch (err) {
    console.error('ERREUR getDocumentsAssociation:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// PATCH /api/associations/:id/validation  — valider ou refuser (admin)
exports.validerAssociation = async (req, res) => {
  try {
    const { statut, commentaire } = req.body;
    if (!statut) {
      return res.status(400).json({ message: 'Le statut est obligatoire (approuve ou refuse).' });
    }

    const result = await service.validerAssociation(req.params.id, statut, commentaire);
    res.json({ message: `Association ${statut === 'approuve' ? 'validée' : 'refusée'} avec succès.`, association: result });
  } catch (err) {
    console.error('ERREUR validerAssociation:', err);
    res.status(err.status || 500).json({ message: err.message || 'Erreur serveur.' });
  }
};
