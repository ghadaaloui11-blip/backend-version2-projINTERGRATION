const express = require('express');
const router = express.Router();
const ctrl = require('./moderation.controller');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');

// All moderation routes require admin role
router.use(auth, role('admin'));

router.get('/signalements', ctrl.listerSignalements);
router.get('/signalements/:id', ctrl.getSignalement);
router.patch('/signalements/:id/statut', ctrl.changerStatut);
router.delete('/signalements/:id', ctrl.supprimer);

module.exports = router;
