const service = require("./benevoles.service");
const { repondreErreur } = require("../utils/http");

exports.inscrire = async (req, res) => {
  try {
    const benevole = await service.inscrire(req.user.id, req.body);
    res.status(201).json({ message: "Inscription bénévole réussie.", benevole: benevole });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'inscription bénévole.");
  }
};

exports.getMonProfil = async (req, res) => {
  try {
    const benevole = await service.getMonProfil(req.user.id);
    res.status(200).json(benevole);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement du profil bénévole.");
  }
};

exports.modifier = async (req, res) => {
  try {
    const benevole = await service.modifier(req.user.id, req.body);
    res.status(200).json({ message: "Profil bénévole mis à jour.", benevole: benevole });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la mise à jour.");
  }
};