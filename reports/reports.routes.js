const express = require("express");
const router = express.Router();
const reportsController = require("./reports.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

router.post(
  "/",
  authMiddleware,
  uploadMiddleware.single("photo"),
  reportsController.creer
);

module.exports = router;
