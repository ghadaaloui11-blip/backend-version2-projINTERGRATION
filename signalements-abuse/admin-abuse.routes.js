// US31 / US32 : examiner les contenus signalés et supprimer ceux jugés abusifs.
const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const ctrl = require('./admin-abuse.controller');

router.use(auth, role('admin'));

router.get('/', ctrl.lister);
router.get('/:id', ctrl.voir);
router.patch('/:id/statut', ctrl.changerStatut);
router.delete('/:id/contenu', ctrl.supprimerContenu);

module.exports = router;
