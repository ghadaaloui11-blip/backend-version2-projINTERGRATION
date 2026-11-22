const service = require('./moderation.service');
const { repondreErreur } = require('../utils/http');

// GET /api/admin/moderation/signalements?statut=&page=&limit=
exports.listerSignalements = async (req, res) => {
  try {
    const { statut, page, limit } = req.query;
    const data = await service.listerSignalements({ statut, page, limit });
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des signalements.');
  }
};

// GET /api/admin/moderation/signalements/:id
exports.getSignalement = async (req, res) => {
  try {
    const data = await service.getSignalement(req.params.id);
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du signalement.');
  }
};

// PATCH /api/admin/moderation/signalements/:id/statut
exports.changerStatut = async (req, res) => {
  try {
    const { statut, commentaire } = req.body || {};
    if (!statut) return res.status(400).json({ erreur: 'statut est obligatoire.' });
    const sig = await service.changerStatut(req.user.id, req.params.id, statut, commentaire);
    res.json({ message: 'Statut mis a jour.', signalement: sig });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la mise a jour du statut.');
  }
};

// DELETE /api/admin/moderation/signalements/:id
exports.supprimer = async (req, res) => {
  try {
    await service.supprimer(req.params.id);
    res.json({ message: 'Signalement supprime.' });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la suppression du signalement.');
  }
};
