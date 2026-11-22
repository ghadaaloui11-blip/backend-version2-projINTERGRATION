const express = require("express");
const router = express.Router();
const controller = require("./activites.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get("/mes", authMiddleware, controller.listerMes);

module.exports = router;
