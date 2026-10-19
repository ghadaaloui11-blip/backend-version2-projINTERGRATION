const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');
const ctrl = require('./associations.controller');

// ─── US02 : Routes pour l'association connectée ───────────────────────────

// Statut de validation de mon association
router.get('/mon-statut', authMiddleware, checkRole('association'), ctrl.getMonStatut);

// Déposer un document légal (dossier prive : uploads/)
router.post(
  '/documents',
  authMiddleware,
  checkRole('association'),
  upload.single('document'),
  ctrl.deposerDocument
);

// Lister mes documents
router.get('/documents', authMiddleware, checkRole('association'), ctrl.getMesDocuments);

// Supprimer un de mes documents
router.delete('/documents/:id', authMiddleware, checkRole('association'), ctrl.supprimerDocument);

// ─── US03 : Routes admin ──────────────────────────────────────────────────

// Lister toutes les associations (optionnel: ?statut=pending|approuve|refuse|all)
router.get('/', authMiddleware, checkRole('admin'), ctrl.listerAssociations);

// Voir les documents d'une association
router.get('/:id/documents', authMiddleware, checkRole('admin'), ctrl.getDocumentsAssociation);

// Valider ou refuser une association
router.patch('/:id/validation', authMiddleware, checkRole('admin'), ctrl.validerAssociation);

module.exports = router;
