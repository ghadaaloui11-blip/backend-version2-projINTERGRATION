const jwt = require("jsonwebtoken");

const verifierToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

const depuisEntete = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
};

const authentifier = (recupererToken) => (req, res, next) => {
  try {
    const token = recupererToken(req);
    if (!token) {
      return res
        .status(401)
        .json({ erreur: "Accès non autorisé. Token manquant." });
    }
    req.user = verifierToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ erreur: "Token invalide ou expiré." });
  }
};

const authMiddleware = authentifier(depuisEntete);

// Variante non bloquante : sans token, laisse passer sans definir req.user.
// Avec un token, verifie le et l'attache. Sert aux routes ouvertes mais
// oublieuses du role connecte (ex : don anonyme refuse admin/association).
authMiddleware.optionnel = async (req, res, next) => {
  const token = depuisEntete(req);
  if (!token) return next();
  try {
    req.user = verifierToken(token);
    next();
  } catch {
    return res.status(401).json({ erreur: 'Token invalide ou expiré.' });
  }
};

// Reserve au telechargement de fichiers : un lien <a href> ne peut pas porter
// d'entete Authorization, le token est donc aussi accepte en query string.
// A n'utiliser que sur des routes GET de fichiers.
authMiddleware.depuisQuery = authentifier(
  (req) => depuisEntete(req) || req.query.token || null
);

module.exports = authMiddleware;
