const authService = require("./auth.service");
const { repondreErreur } = require("../utils/http");

exports.inscription = async (req, res) => {
  try {
    const user = await authService.inscrireUtilisateur(req.body);
    res
      .status(201)
      .json({ message: "Inscription réussie !", utilisateur: user });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'inscription.");
  }
};

exports.connexion = async (req, res) => {
  try {
    const { email, motDePasse } = req.body || {};
    const result = await authService.connecterUtilisateur(email, motDePasse);
    res.status(200).json({ message: "Connexion réussie", ...result });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la connexion.");
  }
};
