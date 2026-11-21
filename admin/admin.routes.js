const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("./admin.controller");

router.get("/stats", authMiddleware, role("admin"), controller.stats);
router.get("/utilisateurs", authMiddleware, role("admin"), controller.listerUtilisateurs);
router.patch(
  "/utilisateurs/:id/statut",
  authMiddleware,
  role("admin"),
  controller.changerStatutUtilisateur
);

module.exports = router;