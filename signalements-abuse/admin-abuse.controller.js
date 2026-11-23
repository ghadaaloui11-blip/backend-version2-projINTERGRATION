const service = require('./signalements-abuse.service');
const { repondreErreur } = require('../utils/http');

// GET /api/admin/signalements-abuse?statut=&type=&page=&limit=
exports.lister = async (req, res) => {
  try {
    const data = await service.lister({
      statut: req.query.statut,
      type: req.query.type,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des signalements de contenu.');
  }
};

// GET /api/admin/signalements-abuse/:id
exports.voir = async (req, res) => {
  try {
    res.json(await service.voir(req.params.id));
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du signalement.');
  }
};

// PATCH /api/admin/signalements-abuse/:id/statut
exports.changerStatut = async (req, res) => {
  try {
    const { statut, decision } = req.body || {};
    if (!statut) return res.status(400).json({ erreur: 'statut est obligatoire.' });
    const signalement = await service.changerStatut(
      req.user.id,
      req.params.id,
      statut,
      decision
    );
    res.json({ message: 'Décision enregistrée.', signalement });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de l’enregistrement de la décision.');
  }
};

// DELETE /api/admin/signalements-abuse/:id/contenu
exports.supprimerContenu = async (req, res) => {
  try {
    const signalement = await service.supprimerContenu(req.user.id, req.params.id);
    res.json({ message: 'Contenu supprimé.', signalement });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la suppression du contenu.');
  }
};
