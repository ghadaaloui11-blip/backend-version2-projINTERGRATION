const router = require('express').Router();
const authMiddleware = require('../middlewares/auth.middleware');
const controller = require('./users.controller');

// Obtenir le profil de l'utilisateur connecté
router.get('/profile', authMiddleware, controller.getProfile);

// Mettre à jour le profil de l'utilisateur connecté
router.put('/profile', authMiddleware, controller.updateProfile);

// Changer le mot de passe de l'utilisateur connecté
router.put('/change-password', authMiddleware, controller.changePassword);

module.exports = router;