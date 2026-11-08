const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("./demandes.controller");

// Envoyer une demande (avec ou sans compte, mais pas admin/association)
router.post(
  "/",
  authMiddleware.optionnel,
  role.interdire("admin", "association"),
  controller.creer
);

// L'association consulte les demandes
router.get("/", authMiddleware, role("association"), controller.lister);

// L'association accepte ou refuse
router.patch(
  "/:id/statut",
  authMiddleware,
  role("association"),
  controller.changerStatut
);

module.exports = router;