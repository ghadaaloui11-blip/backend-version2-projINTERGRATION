const pool = require('../config/db');
const { echec } = require('../utils/http');
const bcrypt = require('bcrypt');

exports.getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nom, prenom, email, telephone, role, created_at
       FROM utilisateur 
       WHERE id = $1`,
      [req.user.id]
    );
    
    if (!rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur lors du chargement du profil.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { nom, prenom, email, telephone } = req.body;
    
    if (!nom || !prenom || !email) {
      return res.status(400).json({ erreur: 'Nom, prénom et email sont obligatoires.' });
    }
    
    const result = await pool.query(
      `UPDATE utilisateur 
       SET nom = $1, prenom = $2, email = $3, telephone = $4 
       WHERE id = $5 
       RETURNING id, nom, prenom, email, telephone, role, created_at`,
      [nom, prenom, email, telephone, req.user.id]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }
    
    res.json({ 
      message: 'Profil mis à jour avec succès', 
      utilisateur: result.rows[0] 
    });
  } catch (err) {
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
    
    // Récupérer le mot de passe actuel
    const { rows } = await pool.query(
      'SELECT mot_de_passe_hache FROM utilisateur WHERE id = $1',
      [req.user.id]
    );
    
    if (!rows[0]) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }
    
    // Vérifier le mot de passe actuel
    const isCurrentPasswordValid = await bcrypt.compare(current_password, rows[0].mot_de_passe_hache);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ erreur: 'Le mot de passe actuel est incorrect.' });
    }
    
    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Mettre à jour le mot de passe
    await pool.query(
      'UPDATE utilisateur SET mot_de_passe_hache = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );
    
    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour du mot de passe.' });
  }
};