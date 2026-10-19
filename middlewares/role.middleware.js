module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ erreur: 'Accès refusé. Rôle insuffisant.' });
  }
  next();
};
