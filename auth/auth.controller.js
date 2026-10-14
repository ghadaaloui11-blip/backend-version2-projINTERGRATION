const authService = require("./auth.service");

exports.inscription = async (req, res) => {
  try {
    const user = await authService.inscrireUtilisateur(req.body);
    res
      .status(201)
      .json({ message: "Inscription réussie !", utilisateur: user });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ erreur: err.message || "Erreur serveur." });
  }
};

exports.connexion = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    const result = await authService.connecterUtilisateur(email, motDePasse);
    res.status(200).json({ message: "Connexion réussie", ...result });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ erreur: err.message || "Erreur serveur." });
  }
};
