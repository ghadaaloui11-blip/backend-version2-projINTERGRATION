const express = require("express");
const router = express.Router();
const controller = require("./engagement.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get("/moi", authMiddleware, controller.lireMoi);

module.exports = router;
