const express = require('express');
const router = express.Router();
const ctrl = require('./dons-recurrents.controller');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');

// Admin : tous les dons recurrents
router.get('/admin', auth, role('admin'), ctrl.listerTous);

// Citoyen : ses dons recurrents
router.get('/', auth, role('citoyen'), ctrl.listerMes);

// Citoyen : creer un don recurrent
router.post('/', auth, role('citoyen'), ctrl.creer);

// Citoyen : annuler un de ses dons recurrents
router.patch('/:id/annuler', auth, role('citoyen'), ctrl.annuler);

module.exports = router;
