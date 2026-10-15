// US07 : consultation des signalements par l'association
const router = require('express').Router();
const pool = require('../config/db');
const authMiddleware = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/role.middleware');

const TABLE = 'signalement'; 

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
      `SELECT * FROM ${TABLE} ${where} ORDER BY id DESC`,
      params
    );

    // Respect de l'anonymat du citoyen
    const result = rows.map((s) => {
      if (s.anonyme) {
        const { citoyen_id, user_id, ...rest } = s;
        return rest;
      }
      return s;
    });
    res.json(result);
  } catch (err) {
    console.error('ERREUR LISTE SIGNALEMENTS:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Détail d'un signalement
router.get('/:id', authMiddleware, checkRole('association', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${TABLE} WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Signalement introuvable' });

    const s = rows[0];
    if (s.anonyme) {
      delete s.citoyen_id;
      delete s.user_id;
    }
    res.json(s);
  } catch (err) {
    console.error('ERREUR DETAIL SIGNALEMENT:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;