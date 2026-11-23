// US30 : signaler un contenu abusif (utilisateur authentifié).
const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('./signalements-abuse.controller');

router.use(auth);

router.post('/', ctrl.creer);
router.get('/mes', ctrl.listerMes);

module.exports = router;
