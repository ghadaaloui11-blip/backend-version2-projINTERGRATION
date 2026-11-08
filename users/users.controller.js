const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nom, prenom, email, telephone, role
       FROM utilisateur
       WHERE id = $1`,
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('ERREUR getProfile:', err);
    res.status(500).json({ erreur: 'Erreur lors du chargement du profil.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const nom = String(req.body.nom || '').trim();
    const prenom = String(req.body.prenom || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const telephone = String(req.body.telephone || '').trim();
    const nomAssociation = String(req.body.nomAssociation || '').trim();
    const adresse = String(req.body.adresse || '').trim();

    if (nom.length < 2) {
      return res.status(400).json({ erreur: 'Le nom est obligatoire (2 caractères minimum).' });
    }
    if (prenom.length < 2) {
      return res.status(400).json({ erreur: 'Le prénom est obligatoire (2 caractères minimum).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erreur: "Le format de l'email est invalide." });
    }
    if (!/^[0-9+\s()-]{8,}$/.test(telephone)) {
      return res.status(400).json({ erreur: 'Le téléphone est obligatoire (8 caractères minimum).' });
    }

    const result = await pool.query(
      `UPDATE utilisateur
       SET nom = $1, prenom = $2, email = $3, telephone = $4
       WHERE id = $5
       RETURNING id, nom, prenom, email, telephone, role`,
      [nom, prenom, email, telephone, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }

    const user = result.rows[0];

    if (user.role === 'citoyen') {
      await pool.query('UPDATE citoyen SET prenom = $1 WHERE id = $2', [prenom, user.id]);
    }

    if (user.role === 'association') {
      if (nomAssociation) {
        await pool.query('UPDATE association SET nom_association = $1 WHERE id = $2', [nomAssociation, user.id]);
      }
      if (adresse) {
        await pool.query('UPDATE association SET adresse = $1 WHERE id = $2', [adresse, user.id]);
      }
    }

    // Nouveau token : l'ancien contient l'ancien nom/email
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      utilisateur: user,
      token: token,
    });
  } catch (err) {
    console.error('ERREUR updateProfile:', err);
    if (err.code === '23505') {
      return res.status(400).json({ erreur: 'Cet email est déjà utilisé par un autre utilisateur.' });
    }
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour du profil.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ erreur: 'Le mot de passe actuel et le nouveau mot de passe sont obligatoires.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ erreur: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    }

    const { rows } = await pool.query(
      'SELECT mot_de_passe_hache FROM utilisateur WHERE id = $1',
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(current_password, rows[0].mot_de_passe_hache);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ erreur: 'Le mot de passe actuel est incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      'UPDATE utilisateur SET mot_de_passe_hache = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    console.error('ERREUR changePassword:', err);
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour du mot de passe.' });
  }
};