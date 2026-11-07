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

module.exports = router;
