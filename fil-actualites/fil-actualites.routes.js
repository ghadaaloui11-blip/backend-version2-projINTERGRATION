const express = require('express');
const router = express.Router();
const ctrl = require('./fil-actualites.controller');

// Public route — no auth required
router.get('/', ctrl.lister);

module.exports = router;
