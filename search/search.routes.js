const router = require('express').Router();
const controller = require('./search.controller');

// Public endpoint: no auth required (searches only public/approved data).
router.get('/', controller.chercher);

module.exports = router;
