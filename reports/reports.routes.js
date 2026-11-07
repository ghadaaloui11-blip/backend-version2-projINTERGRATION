const express = require("express");
const router = express.Router();
const reportsController = require("./reports.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const checkRole = require("../middlewares/role.middleware");
// Photo de signalement : stockee dans uploads-public/ et servie sur /uploads/photos.
const { uploadPhoto, verifierContenu } = require("../middlewares/upload.middleware");

// Seul un citoyen cree un signalement : sinon une association pourrait creer
// un faux signalement puis le prendre en charge elle-meme (US32).
router.post(
  "/",
  authMiddleware,
  checkRole("citoyen"),
  uploadPhoto.single("photo"),
  verifierContenu,
  reportsController.creer
);

// Obtenir un signalement par ID
router.get("/:id", authMiddleware, reportsController.getById);

// Mettre à jour un signalement (seul le créateur peut le modifier)
router.patch(
  "/:id",
  authMiddleware,
  checkRole("citoyen"),
  uploadPhoto.single("photo"),
  verifierContenu,
  reportsController.update
);

// Supprimer un signalement (seul le créateur peut le supprimer)
router.delete("/:id", authMiddleware, checkRole("citoyen"), reportsController.delete);

module.exports = router;
