const service = require("./engagement.service");
const { repondreErreur } = require("../utils/http");

// Le solde est toujours celui du JWT : aucun identifiant n'est accepte.
exports.lireMoi = async (req, res) => {
  try {
    res.json(await service.lireMoi(req.user.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement de votre engagement.");
  }
};
