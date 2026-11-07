// Telechargement des documents legaux : reserve au proprietaire ou a un admin.
// Authentification par entete uniquement : le front telecharge en blob via
// HttpClient (l'intercepteur ajoute le Bearer). Le token en query string est
// refuse pour ne pas fuiter dans les logs et l'historique du navigateur.
const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const ctrl = require('./associations.controller');

router.get('/:id/file', authMiddleware, ctrl.telechargerDocument);

module.exports = router;
