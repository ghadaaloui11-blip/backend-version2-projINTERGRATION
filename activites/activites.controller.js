const service = require("./activites.service");
const { repondreErreur } = require("../utils/http");

// GET /api/activites/mes : toujours l'utilisateur du JWT, jamais un :id fourni.
exports.listerMes = async (req, res) => {
  try {
    const { activites, total } = await service.listerMes(
      req.user.id,
      req.query.page,
      req.query.limit
    );
    res.setHeader("X-Total-Count", String(total));
    res.json(activites);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement de votre historique.");
  }
};
