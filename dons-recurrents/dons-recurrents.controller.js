const service = require('./dons-recurrents.service');
const { repondreErreur } = require('../utils/http');

// GET /api/dons-recurrents - citoyen : ses dons recurrents
exports.listerMes = async (req, res) => {
  try {
    const dons = await service.listerMes(req.user.id);
    res.json(dons);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des dons recurrents.');
  }
};

// POST /api/dons-recurrents - citoyen : creer un don recurrent
exports.creer = async (req, res) => {
  try {
    const don = await service.creer(req.user.id, req.body || {});
    res.status(201).json({ message: 'Don recurrent cree.', don });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la creation du don recurrent.');
  }
};

// PATCH /api/dons-recurrents/:id/annuler - citoyen : annuler le sien
exports.annuler = async (req, res) => {
  try {
    const don = await service.annuler(req.user.id, req.params.id);
    res.json({ message: 'Don recurrent annule.', don });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'annulation du don recurrent.");
  }
};

// GET /api/dons-recurrents/admin - admin : tous les dons recurrents
exports.listerTous = async (req, res) => {
  try {
    const dons = await service.listerTous();
    res.json(dons);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des dons recurrents.');
  }
};
