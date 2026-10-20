module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ erreur: 'Accès refusé. Rôle insuffisant.' });
  }
  next();
};

// Usage sur les routes "optionnelles" : refuse l'action si l'utilisateur est
// connecte ET porte l'un des roles interdits. Sans token, laisse passer
// (le don anonyme reste public).
module.exports.interdire = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) {
    return res.status(403).json({ erreur: 'Accès refusé. Rôle insuffisant.' });
  }
  next();
};
