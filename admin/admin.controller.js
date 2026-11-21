const service = require("./admin.service");
const { repondreErreur } = require("../utils/http");

exports.stats = async (req, res) => {
  try {
    const data = await service.stats();
    res.status(200).json(data);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du calcul des statistiques.");
  }
};

exports.listerUtilisateurs = async (req, res) => {
  try {
    const data = await service.listerUtilisateurs(
      req.query.q,
      req.query.page,
      req.query.limit
    );
    res.status(200).json(data);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la récupération des utilisateurs.");
  }
};

exports.changerStatutUtilisateur = async (req, res) => {
  try {
    const data = await service.changerStatutUtilisateur(
      req.params.id,
      req.body.actif,
      req.user.id
    );
    res.status(200).json(data);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du changement de statut du compte.");
  }
};