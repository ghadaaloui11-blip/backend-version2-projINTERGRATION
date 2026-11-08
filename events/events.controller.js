const eventsService = require('./events.service');
const { repondreErreur } = require('../utils/http');
const associationsService = require('../associations/associations.service');

const exigerAssociationApprouvee = async (req, res) => {
  try {
    const asso = await associationsService.getMonStatut(req.user.id);
    if (asso && asso.statut_validation !== 'approuve') {
      res.status(403).json({
        erreur: 'Votre association doit être validée par un administrateur avant de publier des événements.',
      });
      return false;
    }
  } catch (err) {
    // Si la vérification échoue, on continue
  }
  return true;
};

// US16 : Créer un événement (Association)
exports.creer = async (req, res) => {
  try {
    if (!(await exigerAssociationApprouvee(req, res))) return;

    const { titre, description, date_evenement, lieu, ville, categorie, places_disponibles } = req.body || {};
    if (!titre || !date_evenement || !lieu || !ville || !places_disponibles) {
      return res.status(400).json({ erreur: 'Les champs titre, date, lieu, ville et nombre de places sont obligatoires.' });
    }

    const event = await eventsService.createEvent(req.body, req.user.id);
    res.status(201).json(event);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la création de l\'événement.');
  }
};

// US17 : Lister les événements (Public / Citoyen avec filtres)
exports.lister = async (req, res) => {
  try {
    const { ville, categorie, date, search, statut } = req.query;
    const events = await eventsService.findAllEvents({ ville, categorie, date, search, statut });
    res.json(events);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la récupération des événements.');
  }
};

// Obtenir le détail d'un événement (avec statut d'inscription pour l'utilisateur connecté)
exports.details = async (req, res) => {
  try {
    const citoyenId = req.user ? req.user.id : null;
    const event = await eventsService.findEventById(req.params.id, citoyenId);
    res.json(event);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la récupération de l\'événement.');
  }
};

// Obtenir les événements de l'association connectée
exports.mesEvenements = async (req, res) => {
  try {
    const events = await eventsService.findEventsByAssociation(req.user.id);
    res.json(events);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la récupération de vos événements.');
  }
};

// US34 : S'inscrire à un événement (Citoyen)
exports.inscrire = async (req, res) => {
  try {
    const { message_motivation } = req.body || {};
    const inscription = await eventsService.registerCitoyen(
      req.params.id,
      req.user.id,
      message_motivation
    );
    res.status(201).json(inscription);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de l\'inscription à l\'événement.');
  }
};

// Citoyen : Annuler sa participation
exports.annulerInscription = async (req, res) => {
  try {
    const result = await eventsService.cancelRegistration(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de l\'annulation de l\'inscription.');
  }
};

// US18 : Lister les participants inscrits à un événement (Association)
exports.participants = async (req, res) => {
  try {
    const data = await eventsService.findParticipantsByEvent(req.params.id, req.user.id);
    res.json(data);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la récupération des participants.');
  }
};

// US35 : Accepter ou refuser une candidature/inscription (Association)
exports.changerStatutParticipant = async (req, res) => {
  try {
    const { statut } = req.body || {};
    if (!statut) {
      return res.status(400).json({ erreur: 'Le statut est obligatoire (accepte ou refuse).' });
    }

    const updated = await eventsService.updateParticipantStatus(
      req.params.id,
      req.params.inscriptionId,
      statut,
      req.user.id
    );
    res.json(updated);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la mise à jour du statut du participant.');
  }
};

// Association : Annuler ou clore un événement
exports.changerStatutEvenement = async (req, res) => {
  try {
    const { statut } = req.body || {};
    if (!statut) {
      return res.status(400).json({ erreur: 'Le statut est obligatoire.' });
    }

    const updated = await eventsService.updateEventStatus(
      req.params.id,
      statut,
      req.user.id
    );
    res.json(updated);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la mise à jour de l\'événement.');
  }
};
