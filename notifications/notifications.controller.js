const service = require("./notifications.service");
const { repondreErreur } = require("../utils/http");

// Le JWT pose toujours req.user.id (cf. middlewares/auth.middleware.js).
const lister = async (req, res) => {
  try {
    res.json(await service.lister(req.user.id, req.query.page, req.query.limit));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement des notifications.");
  }
};

const compterNonLues = async (req, res) => {
  try {
    res.json(await service.compterNonLues(req.user.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du comptage des notifications.");
  }
};

const marquerLue = async (req, res) => {
  try {
    res.json(await service.marquerLue(req.user.id, req.params.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la mise à jour de la notification.");
  }
};

const toutMarquerLu = async (req, res) => {
  try {
    res.json(await service.toutMarquerLu(req.user.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la mise à jour des notifications.");
  }
};

const enregistrerAppareil = async (req, res) => {
  try {
    res.status(201).json(
      await service.enregistrerAppareil(req.user.id, req.body && req.body.token, req.body && req.body.plateforme)
    );
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'enregistrement de l'appareil.");
  }
};

module.exports = { lister, compterNonLues, marquerLue, toutMarquerLu, enregistrerAppareil };
