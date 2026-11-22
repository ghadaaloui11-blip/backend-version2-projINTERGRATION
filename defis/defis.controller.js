const service = require("./defis.service");
const { repondreErreur } = require("../utils/http");
const { repondreListe } = require("../utils/filtres");

// Catalog public (filtres combines + pagination).
exports.lister = async (req, res) => {
  try {
    const defis = await service.listerDefis(req.query);
    const pagine = req.query.page !== undefined || req.query.limit !== undefined;
    const total = pagine ? await service.compterDefis(req.query) : undefined;
    repondreListe(res, defis, total);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement des défis.");
  }
};

exports.voir = async (req, res) => {
  try {
    const defi = await service.voirDefi(req.params.id);
    if (!defi) return res.status(404).json({ erreur: "Défi introuvable." });
    res.json(defi);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement du défi.");
  }
};

// Admin : creation d'un defi du catalog.
exports.creer = async (req, res) => {
  try {
    res.status(201).json(await service.creerDefi(req.body));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la création du défi.");
  }
};

// Citoyen : rejoindre un defi (idempotent).
exports.rejoindre = async (req, res) => {
  try {
    res.status(201).json(await service.rejoindre(req.params.id, req.user.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'inscription au défi.");
  }
};

exports.listerMes = async (req, res) => {
  try {
    res.json(await service.listerMes(req.user.id));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du chargement de vos défis.");
  }
};

// Citoyen : deposer une preuve photo (mode manuel).
exports.soumettrePreuve = async (req, res) => {
  try {
    const commentaire = req.body && req.body.commentaire;
    res.json(await service.soumettrePreuve(req.params.id, req.user.id, req.file, commentaire));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la soumission de la preuve.");
  }
};

// Admin : valider ou rejeter une preuve.
exports.valider = async (req, res) => {
  try {
    const accepte = req.body && (req.body.accepte === true || req.body.accepte === "true");
    res.json(await service.validerParticipation(req.params.id, accepte));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la validation de la preuve.");
  }
};
