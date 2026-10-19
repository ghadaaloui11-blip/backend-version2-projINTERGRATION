const reportsService = require("./reports.service");
const { repondreErreur } = require("../utils/http");

exports.creer = async (req, res) => {
  try {
    const signalement = await reportsService.creerSignalement(
      req.body,
      req.file,
      req.user.id
    );
    res
      .status(201)
      .json({ message: "Signalement créé avec succès !", signalement });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la création du signalement.");
  }
};
