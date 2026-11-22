const express = require("express");
const router = express.Router();
const controller = require("./notifications.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// Toutes les routes exigent une session : le centre de notifications est prive.
router.get("/", authMiddleware, controller.lister);
router.get("/non-lues/count", authMiddleware, controller.compterNonLues);
router.patch("/lire-tout", authMiddleware, controller.toutMarquerLu);
router.patch("/:id/lue", authMiddleware, controller.marquerLue);
router.post("/appareil", authMiddleware, controller.enregistrerAppareil);

module.exports = router;
