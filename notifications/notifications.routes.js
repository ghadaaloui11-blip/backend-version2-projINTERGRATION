const express = require("express");
const router = express.Router();
const controller = require("./notifications.controller");
const auth = require("../middlewares/auth.middleware");

router.get("/", auth, controller.lister);
router.get("/non-lues/count", auth, controller.compterNonLues);
router.patch("/lire-tout", auth, controller.toutMarquerLu);
router.patch("/:id/lue", auth, controller.marquerLue);
router.post("/appareil", auth, controller.enregistrerAppareil);

// TEST : à supprimer avant la remise
if (process.env.NODE_ENV !== "production") {
  router.post("/test", auth, controller.test);
}

module.exports = router;