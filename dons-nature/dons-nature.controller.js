const service = require('./dons-nature.service');
const { repondreErreur } = require('../utils/http');

// US13 : Citoyen propose un don en nature
exports.proposer = async (req, res) => {
  try {
    const don = await service.proposer(req.body, req.user.id);
    res.status(201).json({ message: 'Don en nature proposé avec succès.', don });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la proposition de don.');
  }
};

// Citoyen : liste de ses propres dons
exports.mesDons = async (req, res) => {
  try {
    const dons = await service.mesDons(req.user.id);
    res.json(dons);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement de vos dons en nature.');
  }
};

// Citoyen : annuler un don encore "propose"
exports.annuler = async (req, res) => {
  try {
    const don = await service.annuler(req.params.id, req.user.id);
    res.json({ message: 'Don annulé avec succès.', don });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'annulation du don.");
  }
};

// Association : liste des dons disponibles (avec filtres optionnels)
exports.listerPourAssociation = async (req, res) => {
  try {
    const { statut, ville, type_don } = req.query;
    const dons = await service.listerPourAssociation(req.user.id, { statut, ville, type_don });
    res.json(dons);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des dons en nature.');
  }
};

// Association : accepter un don (fixer date + lieu de collecte)
exports.accepter = async (req, res) => {
  try {
    const don = await service.accepter(req.params.id, req.user.id, req.body);
    res.json({ message: 'Don accepté. Le citoyen sera informé.', don });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'acceptation du don.");
  }
};

// Association : marquer comme collecté
exports.marquerCollecte = async (req, res) => {
  try {
    const don = await service.marquerCollecte(req.params.id, req.user.id);
    res.json({ message: 'Don marqué comme collecté.', don });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la mise à jour du don.');
  }
};

// Association : refuser un don
exports.refuser = async (req, res) => {
  try {
    const don = await service.refuser(req.params.id, req.user.id, req.body.commentaire);
    res.json({ message: 'Don refusé.', don });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du refus du don.');
  }
};
