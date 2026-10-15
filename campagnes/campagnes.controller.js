const campagnesService = require('./campagnes.service');

exports.createCampagne = async (req, res) => {
  try {
    const { titre, description, objectif_montant, date_debut, date_fin } = req.body;

    if (!titre || !description || !objectif_montant || !date_debut || !date_fin) {
      return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
    }
    if (Number(objectif_montant) <= 0) {
      return res.status(400).json({ message: "L'objectif doit être supérieur à 0" });
    }
    if (new Date(date_fin) <= new Date(date_debut)) {
      return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
    }

    const campagne = await campagnesService.create(req.body, req.user.id);
    res.status(201).json({ message: 'Campagne créée avec succès', campagne });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
// US10
exports.getAll = async (req, res) => {
  try {
    const campagnes = await campagnesService.findAll({
      statut: req.query.statut,
      search: req.query.search,
    });
    res.json(campagnes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const campagne = await campagnesService.findById(req.params.id);
    if (!campagne) return res.status(404).json({ message: 'Campagne introuvable' });
    res.json(campagne);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getMine = async (req, res) => {
  try {
    res.json(await campagnesService.findByAssociation(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getAssociations = async (req, res) => {
  try {
    res.json(await campagnesService.listAssociations());
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
// US12
exports.getAvancement = async (req, res) => {
  try {
    const avancement = await campagnesService.getAvancement(req.params.id);
    if (!avancement) return res.status(404).json({ message: 'Campagne introuvable' });
    res.json(avancement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.addUtilisation = async (req, res) => {
  try {
    const { libelle, montant } = req.body;

    if (!libelle || !montant) {
      return res.status(400).json({ message: 'libelle et montant sont obligatoires' });
    }
    if (Number(montant) <= 0) {
      return res.status(400).json({ message: 'Le montant doit être supérieur à 0' });
    }

    const campagne = await campagnesService.findById(req.params.id);
    if (!campagne) return res.status(404).json({ message: 'Campagne introuvable' });

    if (campagne.association_id !== req.user.id) {
      return res.status(403).json({ message: "Cette campagne n'est pas la vôtre" });
    }

    const avancement = await campagnesService.getAvancement(req.params.id);
    if (Number(montant) > avancement.solde_disponible) {
      return res.status(400).json({ message: 'Montant supérieur au solde disponible' });
    }

    const utilisation = await campagnesService.addUtilisation(req.params.id, libelle, montant);
    res.status(201).json({ message: 'Utilisation enregistrée', utilisation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};