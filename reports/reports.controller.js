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

exports.getById = async (req, res) => {
  try {
    const signalement = await reportsService.getSignalementById(req.params.id, req.user.id);
    if (!signalement) {
      return res.status(404).json({ erreur: "Signalement introuvable" });
    }
    res.json(signalement);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement du signalement.");
  }
};

exports.update = async (req, res) => {
  try {
    const signalement = await reportsService.updateSignalement(
      req.params.id,
      req.body,
      req.file,
      req.user.id
    );
    res.json({ message: "Signalement mis à jour avec succès !", signalement });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la mise à jour du signalement.");
  }
};

exports.delete = async (req, res) => {
  try {
    await reportsService.deleteSignalement(req.params.id, req.user.id);
    res.json({ message: "Signalement supprimé avec succès !" });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la suppression du signalement.");
  }
};
