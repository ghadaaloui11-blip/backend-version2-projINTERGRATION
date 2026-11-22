// US19 / Q15 : page de partage backend pour les evenements publies.
// Les robots (WhatsApp, Facebook, LinkedIn, X) lisent les balises OG/Twitter
// sans executer JavaScript ; les utilisateurs sont rediriges vers le SPA.
// Q17 : image OG statique par defaut (pas encore d'image par evenement).
const router = require("express").Router();
const eventsService = require("./events.service");
const { repondreErreur } = require("../utils/http");

const SPA_BASE = (process.env.FRONT_BASE || "http://localhost:4200").replace(/\/+$/, "");
// Avec PUBLIC_API_BASE defini -> URL absolue (recommandee par les robots) ;
// sinon -> chemin relatif /og-image.png servi par express.static plus bas.
const OG_IMAGE = `${process.env.PUBLIC_API_BASE || ""}/og-image.png`;

const echapperHtml = (valeur) =>
  String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pageHtml = ({ titre, description, urlCanonique, urlSpa }) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${echapperHtml(titre)} — MennaFina</title>
  <meta name="description" content="${echapperHtml(description)}">
  <link rel="canonical" href="${echapperHtml(urlCanonique)}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MennaFina">
  <meta property="og:title" content="${echapperHtml(titre)}">
  <meta property="og:description" content="${echapperHtml(description)}">
  <meta property="og:url" content="${echapperHtml(urlCanonique)}">
  <meta property="og:image" content="${echapperHtml(OG_IMAGE)}">
  <meta property="og:locale" content="fr_FR">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${echapperHtml(titre)}">
  <meta name="twitter:description" content="${echapperHtml(description)}">
  <meta name="twitter:image" content="${echapperHtml(OG_IMAGE)}">

  <meta http-equiv="refresh" content="0;url=${echapperHtml(urlSpa)}">
  <script>window.location.replace(${JSON.stringify(urlSpa)});</script>
  <style>body{font-family:system-ui,sans-serif;padding:2rem;color:#0d6b52}a{color:#0d6b52}</style>
</head>
<body>
  <p>Redirection vers l'événement… <a href="${echapperHtml(urlSpa)}">Cliquez ici</a></p>
</body>
</html>`;

router.get("/:id/partage", async (req, res) => {
  try {
    const evenement = await eventsService.findEventById(req.params.id);
    // findEventById (sans citoyen) ne renvoie deja que les evenements publies ;
    // on garde neanmoins ce garde-fou.
    if (!evenement || evenement.statut !== "publie") {
      return res.status(404).type("text/plain").send("Événement introuvable.");
    }

    const titre = evenement.titre;
    const description =
      `Action solidaire « ${titre} » — ${evenement.ville || evenement.lieu || "Tunisie"}. ` +
      `Rejoignez-nous sur MennaFina.`;
    const urlCanonique = `${process.env.PUBLIC_API_BASE || ""}/evenements/${encodeURIComponent(String(req.params.id))}/partage`;
    const urlSpa = `${SPA_BASE}/evenements/${encodeURIComponent(String(req.params.id))}`;

    res.type("html").send(pageHtml({ titre, description, urlCanonique, urlSpa }));
  } catch (err) {
    repondreErreur(res, err, "Erreur lors de la generation de la page de partage.");
  }
});

module.exports = router;
