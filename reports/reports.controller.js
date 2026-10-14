const reportsService = require("./reports.service");

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
    res
      .status(err.status || 500)
      .json({
        erreur: err.message || "Erreur lors de la création du signalement.",
      });
  }
};
