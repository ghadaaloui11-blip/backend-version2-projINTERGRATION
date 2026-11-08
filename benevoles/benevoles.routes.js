const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("./benevoles.controller");

router.post("/", authMiddleware, role("citoyen"), controller.inscrire);
router.get("/me", authMiddleware, role("citoyen"), controller.getMonProfil);
router.put("/me", authMiddleware, role("citoyen"), controller.modifier);

module.exports = router;