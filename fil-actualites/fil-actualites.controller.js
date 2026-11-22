const service = require('./fil-actualites.service');
const { repondreErreur } = require('../utils/http');

// GET /api/fil-actualites?page=&limit=
exports.lister = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const data = await service.lister({ page, limit });
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du fil d\'actualites.');
  }
};
