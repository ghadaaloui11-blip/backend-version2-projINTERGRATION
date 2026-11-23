const service = require('./signalements-abuse.service');
const { repondreErreur } = require('../utils/http');

// POST /api/signalements-abuse — utilisateur connecté (US30)
exports.creer = async (req, res) => {
  try {
    const { type_cible, cible_id, motif, description } = req.body || {};
    const signalement = await service.creer(req.user.id, {
      type_cible,
      cible_id,
      motif,
      description,
    });
    res.status(201).json({
      message: 'Merci, les administrateurs ont été alertés.',
      signalement,
    });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du signalement du contenu.');
  }
};

// GET /api/signalements-abuse/mes
exports.listerMes = async (req, res) => {
  try {
    const data = await service.listerMes(req.user.id, req.query.page, req.query.limit);
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement de vos signalements.');
  }
};
