const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");

router.post("/inscription", authController.inscription);
router.post("/connexion", authController.connexion);
router.post("/google", authController.google);

module.exports = router;