const service = require('./search.service');
const { repondreErreur } = require('../utils/http');

// GET /api/search?q=...&type=campagne|signalement|evenement|association
// q est optionnel : sans lui, on liste par défaut les derniers éléments.
// type est optionnel : sans lui, on cherche dans toutes les ressources.
exports.chercher = async (req, res) => {
  const q = String(req.query.q || '').trim();

  const typesValides = ['campagne', 'signalement', 'evenement', 'association'];
  const typeParam = req.query.type ? String(req.query.type).trim() : null;
  if (typeParam && !typesValides.includes(typeParam)) {
    return res.status(400).json({
      erreur: `Type invalide. Valeurs acceptees : ${typesValides.join(', ')}.`,
    });
  }

  try {
    const resultats = await service.chercher(q, typeParam);
    res.json(resultats);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la recherche.');
  }
};
