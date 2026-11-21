const service = require("./notifications.service");

const uid = (req) =>
  (req.user && (req.user.id || req.user.userId)) ||
  req.userId ||
  (req.utilisateur && req.utilisateur.id);

const repondre = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e.status || e.statusCode || 500).json({ message: e.message });
  }
};

exports.lister = repondre((req) => service.lister(uid(req), req.query.page, req.query.limit));
exports.compterNonLues = repondre((req) => service.compterNonLues(uid(req)));
exports.marquerLue = repondre((req) => service.marquerLue(uid(req), req.params.id));
exports.toutMarquerLu = repondre((req) => service.toutMarquerLu(uid(req)));
exports.enregistrerAppareil = repondre((req) =>
  service.enregistrerAppareil(uid(req), req.body.token, req.body.plateforme)
);

// Route de TEST (à supprimer avant la remise) : vous envoie une notification à vous-même
exports.test = repondre(async (req) => {
  await service.notifier({
    userId: uid(req),
    type: "test",
    titre: "Notification de test",
    message: "Si vous lisez ceci, US21 fonctionne.",
  });
  return { message: "Notification de test créée." };
});