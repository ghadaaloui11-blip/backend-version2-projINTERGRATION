const express = require("express");
const router = express.Router();
const reportsController = require("./reports.controller");
const authMiddleware = require("../middlewares/auth.middleware");
// Photo de signalement : stockee dans uploads-public/ et servie sur /uploads/photos.
const { uploadPhoto } = require("../middlewares/upload.middleware");

router.post(
  "/",
  authMiddleware,
  uploadPhoto.single("photo"),
  reportsController.creer
);

module.exports = router;
