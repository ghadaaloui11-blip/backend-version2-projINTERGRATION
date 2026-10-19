const campagnesService = require('./campagnes.service');
const { repondreErreur } = require('../utils/http');

exports.createCampagne = async (req, res) => {
  try {
    const { titre, description, objectif_montant, date_debut, date_fin } = req.body || {};

    if (!titre || !description || !objectif_montant || !date_debut || !date_fin) {
      return res.status(400).json({ erreur: 'Tous les champs sont obligatoires' });
    }
    if (Number(objectif_montant) <= 0) {
      return res.status(400).json({ erreur: "L'objectif doit être supérieur à 0" });
    }
    if (new Date(date_fin) <= new Date(date_debut)) {
      return res.status(400).json({ erreur: 'La date de fin doit être après la date de début' });
    }

    const campagne = await campagnesService.create(req.body, req.user.id);
    res.status(201).json({ message: 'Campagne créée avec succès', campagne });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la création de la campagne.');
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
    repondreErreur(res, err, 'Erreur lors du chargement des campagnes.');
  }
};

exports.getOne = async (req, res) => {
  try {
    const campagne = await campagnesService.findById(req.params.id);
    if (!campagne) return res.status(404).json({ erreur: 'Campagne introuvable' });
    res.json(campagne);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement de la campagne.');
  }
};

exports.getMine = async (req, res) => {
  try {
    res.json(await campagnesService.findByAssociation(req.user.id));
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement de vos campagnes.');
  }
};

exports.getAssociations = async (req, res) => {
  try {
    res.json(await campagnesService.listAssociations());
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des associations.');
  }
};

// US12
exports.getAvancement = async (req, res) => {
  try {
    const avancement = await campagnesService.getAvancement(req.params.id);
    if (!avancement) return res.status(404).json({ erreur: 'Campagne introuvable' });
    res.json(avancement);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors du calcul de l'avancement.");
  }
};

exports.addUtilisation = async (req, res) => {
  try {
    const { libelle, montant } = req.body || {};

    if (!libelle || !montant) {
      return res.status(400).json({ erreur: 'libelle et montant sont obligatoires' });
    }
    if (!Number.isFinite(Number(montant)) || Number(montant) <= 0) {
      return res.status(400).json({ erreur: 'Le montant doit être supérieur à 0' });
    }

    const campagne = await campagnesService.findById(req.params.id);
    if (!campagne) return res.status(404).json({ erreur: 'Campagne introuvable' });

    if (campagne.association_id !== req.user.id) {
      return res.status(403).json({ erreur: "Cette campagne n'est pas la vôtre" });
    }

    // Le controle du solde est fait dans la transaction (service).
    const utilisation = await campagnesService.addUtilisation(req.params.id, libelle, montant);
    res.status(201).json({ message: 'Utilisation enregistrée', utilisation });
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'enregistrement de l'utilisation.");
  }
};

// US11 : don financier sur une campagne (public : le don peut etre anonyme)
exports.createDon = async (req, res) => {
  try {
    const { montant, est_anonyme, nom, message } = req.body || {};
    const montantNum = Number(montant);

    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return res.status(400).json({ erreur: 'Le montant du don doit être supérieur à 0.' });
    }

    const campagne = await campagnesService.findById(req.params.id);
    if (!campagne) return res.status(404).json({ erreur: 'Campagne introuvable.' });

    const anonyme = est_anonyme === true || est_anonyme === 'true';
    const nomDonateur = anonyme ? null : (nom ? String(nom).trim() || null : null);
    const messageDon = message ? String(message).trim() || null : null;

    const don = await campagnesService.createDon(req.params.id, {
      montant: montantNum,
      estAnonyme: anonyme,
      nom: nomDonateur,
      message: messageDon,
    });

    // Le front attend directement l'objet du don (comme le faisait le mock)
    res.status(201).json(don);
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de l'enregistrement du don.");
  }
};
