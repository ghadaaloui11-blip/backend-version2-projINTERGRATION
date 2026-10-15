module.exports = (...roles) => (req, res, next) => {
  console.log('USER:', req.user);
  console.log('ROLES ALLOWED:', roles);

  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Accès refusé',
      debug: { userRole: req.user?.role, allowed: roles }
    });
  }
  next();
};