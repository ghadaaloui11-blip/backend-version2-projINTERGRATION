// Telechargement des documents legaux : reserve au proprietaire ou a un admin.
const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const ctrl = require('./associations.controller');

// Le token peut venir de l'entete ou de ?token= (lien direct depuis le front).
router.get('/:id/file', authMiddleware.depuisQuery, ctrl.telechargerDocument);

module.exports = router;
