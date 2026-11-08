const service = require("./demandes.service");
const { repondreErreur } = require("../utils/http");

exports.creer = async (req, res) => {
  try {
    let citoyenId = null;
    if (req.user) {
      citoyenId = req.user.id;
    }
    const demande = await service.creerDemande(req.body, citoyenId);
    res.status(201).json({ message: "Demande envoyée.", demande: demande });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'envoi de la demande.");
  }
};

exports.lister = async (req, res) => {
  try {
    const demandes = await service.listerPourAssociation(req.user.id);
    res.status(200).json(demandes);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la récupération des demandes.");
  }
};

exports.changerStatut = async (req, res) => {
  try {
    const resultat = await service.changerStatut(
      req.params.id,
      req.user.id,
      req.body.statut
    );
    res.status(200).json({ message: "Statut mis à jour.", demande: resultat });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la mise à jour.");
  }
};