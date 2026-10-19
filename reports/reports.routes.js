const express = require("express");
const router = express.Router();
const reportsController = require("./reports.controller");
const authMiddleware = require("../middlewares/auth.middleware");
// Meme filtre que les documents legaux : PDF/JPG/PNG, 10 Mo max.
const uploadMiddleware = require("../middlewares/upload.documents.middleware");

router.post(
  "/",
  authMiddleware,
  uploadMiddleware.single("photo"),
  reportsController.creer
);

module.exports = router;
