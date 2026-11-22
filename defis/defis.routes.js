const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { uploadPhoto, verifierContenu } = require("../middlewares/upload.middleware");
const controller = require("./defis.controller");

// ORDRE : les chemins statiques (/mes) AVANT /:id.
router.get("/", controller.lister);

router.get("/mes", authMiddleware, controller.listerMes);

router.post(
  "/:id/rejoindre",
  authMiddleware,
  role("citoyen"),
  controller.rejoindre
);

router.post(
  "/:id/preuve",
  authMiddleware,
  role("citoyen"),
  uploadPhoto.single("photo"),
  verifierContenu,
  controller.soumettrePreuve
);

router.patch(
  "/participations/:id/validation",
  authMiddleware,
  role("admin"),
  controller.valider
);

// Admin : creation du catalog (Q5).
router.post("/", authMiddleware, role("admin"), controller.creer);

router.get("/:id", controller.voir);

module.exports = router;
