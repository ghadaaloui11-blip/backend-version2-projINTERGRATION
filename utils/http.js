// Helpers HTTP communs : fabrique d'erreur "metier" et reponse d'erreur.
// Regle : on ne renvoie err.message au client que si le code a explicitement
// pose un status (erreur attendue). Sinon on logge et on renvoie un message
// generique, pour ne jamais fuiter les details PostgreSQL.

const echec = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const repondreErreur = (res, err, messageDefaut = 'Erreur serveur.') => {
  if (err && err.status) {
    return res.status(err.status).json({ erreur: err.message });
  }
  console.error(err);
  return res.status(500).json({ erreur: messageDefaut });
};

module.exports = { echec, repondreErreur };
