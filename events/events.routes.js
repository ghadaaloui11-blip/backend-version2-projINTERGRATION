const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');
const controller = require('./events.controller');

// US17 : Consulter les événements avec filtres (Public / Citoyen)
router.get('/', controller.lister);

// Événements de l'association connectée (AVANT /:id)
router.get(
  '/mes-evenements',
  authMiddleware,
  checkRole('association'),
  controller.mesEvenements
);

// US16 : Créer et publier un événement (Association)
router.post(
  '/',
  authMiddleware,
  checkRole('association'),
  controller.creer
);

// Consulter le détail d'un événement (Public ou authentifié pour vérifier statut)
router.get('/:id', authMiddleware.optionnel, controller.details);

// Association : Changer le statut d'un événement (annuler, terminer)
router.patch(
  '/:id/statut',
  authMiddleware,
  checkRole('association'),
  controller.changerStatutEvenement
);

// US34 : S'inscrire à un événement (Citoyen)
router.post(
  '/:id/inscriptions',
  authMiddleware,
  checkRole('citoyen'),
  controller.inscrire
);

// Citoyen : Annuler sa participation
router.delete(
  '/:id/inscriptions',
  authMiddleware,
  checkRole('citoyen'),
  controller.annulerInscription
);

// US18 : Consulter la liste des participants inscrits (Association)
router.get(
  '/:id/participants',
  authMiddleware,
  checkRole('association'),
  controller.participants
);

// US35 : Accepter ou refuser une candidature/inscription (Association)
router.patch(
  '/:id/participants/:inscriptionId',
  authMiddleware,
  checkRole('association'),
  controller.changerStatutParticipant
);

module.exports = router;
