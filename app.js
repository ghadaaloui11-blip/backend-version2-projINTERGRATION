const path = require("path");

// Chargement du .env depuis le dossier du backend (et non depuis le CWD).
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Echec rapide : sans secret, la signature/verification des JWT est impossible.
if (!process.env.JWT_SECRET) {
  console.error(
    "❌ JWT_SECRET manquant. Copiez .env.example vers .env et definissez un secret."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  console.log("🔐 JWT_SECRET: set");
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./auth/auth.routes");
const reportsRoutes = require("./reports/reports.routes");
const documentsRoutes = require("./associations/documents.routes");

const app = express();

// Derriere un eventuel reverse proxy, req.ip doit refleter le client reel
// pour que le rate-limiting fonctionne.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Photographies de signalements : publiques (destinees a etre vues).
// Les documents legaux, eux, ne sont servis que par /api/documents/:id/file.
const uploadsPublicDir = path.join(__dirname, "uploads-public");

app.use(
  helmet({
    // Le front (4200) charge les photos depuis l'API (5000) : politique cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const originesAutorisees = (process.env.CORS_ORIGIN || "http://localhost:4200")
  .split(",")
  .map((origine) => origine.trim())
  .filter(Boolean);
app.use(cors({ origin: originesAutorisees }));

const estEnTest = () => process.env.NODE_ENV === "test";

const limiteGlobale = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: estEnTest,
  message: { erreur: "Trop de requêtes. Réessayez dans quelques minutes." },
});
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: estEnTest,
  message: { erreur: "Trop de tentatives. Réessayez dans quelques minutes." },
});

app.use(limiteGlobale);
app.use(express.json({ limit: "100kb" }));
app.use("/uploads/photos", express.static(uploadsPublicDir));

// Routes intégrées du Membre 2
app.use("/api/auth", limiteAuth, authRoutes);
app.use("/api/reports", reportsRoutes);
// Routes intégrées du Membre 4
app.use("/api/campagnes", require("./campagnes/campagnes.routes"));
app.use("/api/signalement", require("./reports/consultation.routes"));
// US02 & US03 : Dépôt documents légaux + validation associations
app.use("/api/associations", require("./associations/associations.routes"));
// Documents legaux : telechargement authentifie (association proprietaire ou admin)
app.use("/api/documents", documentsRoutes);

// 404 JSON (avant le middleware d'erreurs) : les routes inconnues ne renvoient
// plus la page HTML d'Express.
app.use((req, res) => {
  res.status(404).json({ erreur: "Route introuvable." });
});

// Gestion d'erreurs JSON (ex. fichier refuse par multer) :
// evite la page HTML d'Express et les fuites de chemins dans les stack traces.
app.use((err, req, res, next) => {
  if (!err) return next();
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 400);
  const message =
    err.code === "LIMIT_FILE_SIZE"
      ? "Fichier trop volumineux (10 Mo maximum)."
      : err.message || "Requête invalide.";
  res.status(status).json({ erreur: message });
});

module.exports = app;
