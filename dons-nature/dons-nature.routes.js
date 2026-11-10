const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole     = require('../middlewares/role.middleware');
const ctrl          = require('./dons-nature.controller');

// ─── Citoyen ──────────────────────────────────────────────────────────────

// US13 : proposer un don en nature
router.post('/',
  authMiddleware,
  checkRole('citoyen'),
  ctrl.proposer
);

// Historique de ses propres dons en nature
router.get('/mes-dons',
  authMiddleware,
  checkRole('citoyen'),
  ctrl.mesDons
);

// Annuler un don encore "propose"
router.patch('/:id/annuler',
  authMiddleware,
  checkRole('citoyen'),
  ctrl.annuler
);

// ─── Association ──────────────────────────────────────────────────────────

// Liste des dons disponibles + ses dons deja acceptes
// ?statut=propose|accepte|collecte  ?ville=...  ?type_don=...
router.get('/',
  authMiddleware,
  checkRole('association'),
  ctrl.listerPourAssociation
);

// Accepter un don (fixer date + lieu de collecte)
router.patch('/:id/accepter',
  authMiddleware,
  checkRole('association'),
  ctrl.accepter
);

// Marquer comme collecte
router.patch('/:id/collecte',
  authMiddleware,
  checkRole('association'),
  ctrl.marquerCollecte
);

// Refuser un don
router.patch('/:id/refuser',
  authMiddleware,
  checkRole('association'),
  ctrl.refuser
);

module.exports = router;
