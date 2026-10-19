// US07 : consultation des signalements par l'association
const router = require('express').Router();
const pool = require('../config/db');
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');
const { repondreErreur } = require('../utils/http');

const TABLE = 'signalement';

// ::float8 => pg renvoie les NUMERIC en string ; on veut des nombres cote front.
const COLS = `id, description, photo,
  latitude::float8 AS latitude,
  longitude::float8 AS longitude,
  est_anonyme, citoyen_id, statut, created_at`;

// Liste (filtre optionnel ?statut=...)
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

    // Respect de l'anonymat du citoyen (la colonne est est_anonyme)
    const result = rows.map((s) => {
      if (s.est_anonyme) {
        const { citoyen_id, ...rest } = s;
        return rest;
      }
      return s;
    });
    res.json(result);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement des signalements.');
  }
});

// Détail d'un signalement
router.get('/:id', authMiddleware, checkRole('association', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM ${TABLE} WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erreur: 'Signalement introuvable' });

    const s = rows[0];
    if (s.est_anonyme) {
      delete s.citoyen_id;
    }
    res.json(s);
  } catch (err) {
    repondreErreur(res, err, 'Erreur lors du chargement du signalement.');
  }
});

module.exports = router;
