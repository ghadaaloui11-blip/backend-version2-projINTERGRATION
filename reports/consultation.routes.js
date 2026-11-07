// US07 : consultation des signalements par l'association
// US06 / US32 / US33 : visibilite publique, suivi citoyen, prise en charge.
//
// Ordre des routes : les chemins statiques (/public, /mes, /mes-prises-en-charge)
// sont enregistres AVANT /:id pour ne pas etre avales par lui.
const router = require('express').Router();
const pool = require('../config/db');
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');
const priseEnChargeService = require('./reports.priseEnCharge.service');
const { repondreErreur } = require('../utils/http');

const TABLE = 'signalement';

// ::float8 => pg renvoie les NUMERIC en string ; on veut des nombres cote front.
// Projection SANS citoyen_id : l'anonymat du citoyen est garanti par le fait
// que l'identite n'est jamais renvoyee, anonyme ou non (privacy by design).
const COLS = `id, description, photo,
  latitude::float8 AS latitude,
  longitude::float8 AS longitude,
  est_anonyme, statut, created_at`;

// Liste (filtre optionnel ?statut=...) — reservee association/admin (US07)
router.get('/', authMiddleware, checkRole('association', 'admin'), async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.statut) {
      params.push(req.query.statut);
      where = 'WHERE statut = $1';
    }
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM ${TABLE} ${where} ORDER BY id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des signalements.');
  }
});

// ---------------------------------------------------------------------------
// US06 / US32 : visibilite PUBLIQUE des signalements publies.
// Aucune authentification : n'importe qui peut consulter (citoyens inclus).
// Projection volontairement restreinte : pas de citoyen_id, pas de donnee
// privee ; seule l'association responsable est identifiee.
// ---------------------------------------------------------------------------

// Liste publique (filtre optionnel ?statut=recu|en_cours|resolu)
router.get('/public', async (req, res) => {
  try {
    const signalements = await priseEnChargeService.listerPublics(req.query.statut);
    res.json(signalements);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des signalements.');
  }
});

// Détail public d'un signalement
router.get('/public/:id', async (req, res) => {
  try {
    const signalement = await priseEnChargeService.voirPublic(req.params.id);
    if (!signalement) {
      return res.status(404).json({ erreur: 'Signalement introuvable' });
    }
    res.json(signalement);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du signalement.');
  }
});

// US06 : suivi par le citoyen — uniquement SES signalements (statuts evolves
// visible : recu, pris en charge par X, resolu).
router.get('/mes', authMiddleware, async (req, res) => {
  try {
    const signalements = await priseEnChargeService.listerMes(req.user.id);
    res.json(signalements);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement de vos signalements.');
  }
});

// US32 : signalements dont l'association (ou l'admin) connectee est responsable.
router.get(
  '/mes-prises-en-charge',
  authMiddleware,
  checkRole('association', 'admin'),
  async (req, res) => {
    try {
      const signalements = await priseEnChargeService.listerPrisesEnCharge(req.user.id);
      res.json(signalements);
    } catch (err) {
      repondreErreur(res, err, 'Erreur lors du chargement de vos prises en charge.');
    }
  }
);

// US32 : une association prend explicitement la responsabilité d'un
// signalement disponible (statut recu, sans responsable). Le statut passe
// automatiquement a en_cours. Actions reservees a l'association (pas
// l'admin : une prise en charge doit etre portee par l'organisation elle-même).
router.post('/:id/prendre-en-charge', authMiddleware, checkRole('association'), async (req, res) => {
  try {
    const signalement = await priseEnChargeService.prendreEnCharge(
      req.params.id,
      req.user.id
    );
    res.status(201).json({
      message: 'Signalement pris en charge. Le statut est passé à "en cours".',
      signalement,
    });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la prise en charge du signalement.');
  }
});

// US33 : evolution du statut par l'association responsable uniquement
// (transition autorisee : en_cours -> resolu).
router.patch('/:id/statut', authMiddleware, checkRole('association'), async (req, res) => {
  try {
    const signalement = await priseEnChargeService.changerStatut(
      req.params.id,
      req.user.id,
      req.body && req.body.statut
    );
    res.json({
      message: 'Statut du signalement mis à jour.',
      signalement,
    });
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors de la mise à jour du statut.');
  }
});

// Détail d'un signalement — DERNIER, car /:id avale tout chemin simple.
// (US07 : consultation detaillee par l'association/admin, sans identite du
// citoyen.)
router.get('/:id', authMiddleware, checkRole('association', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM ${TABLE} WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erreur: 'Signalement introuvable' });

    res.json(rows[0]);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du signalement.');
  }
});

module.exports = router;
