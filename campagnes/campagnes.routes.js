const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');
const controller = require('./campagnes.controller');

// US10 : consultation (public)
router.get('/', controller.getAll);
router.get('/associations', controller.getAssociations);
router.get('/mes-campagnes', authMiddleware, checkRole('association'), controller.getMine);

router.get('/:id', controller.getOne);

router.post('/', authMiddleware, checkRole('association'), controller.createCampagne);
// US12
router.get('/:id/avancement', controller.getAvancement);
router.post('/:id/utilisation', authMiddleware, checkRole('association'), controller.addUtilisation);
// US11 : don financier (public, don possiblement anonyme)
// Un don anonyme reste possible sans login ; un admin ou une association
// connecte(e) est refuse (seuls les citoyens donnent).
router.post(
  '/:id/don',
  authMiddleware.optionnel,
  checkRole.interdire('admin', 'association'),
  controller.createDon
);
module.exports = router;