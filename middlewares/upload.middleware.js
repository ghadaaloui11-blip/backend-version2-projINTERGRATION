const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Deux emplacements distincts :
//  - uploads/        : documents legaux, PRIVES (servis uniquement via
//                      GET /api/documents/:id/file pour le proprietaire ou un admin)
//  - uploads-public/ : photos de signalement, PUBLIQUES (montees sur /uploads/photos)
const DOCUMENTS_DIR = path.join(__dirname, '..', 'uploads');
const PHOTOS_DIR = path.join(__dirname, '..', 'uploads-public');
[DOCUMENTS_DIR, PHOTOS_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const EXTENSIONS_AUTORISEES = ['.pdf', '.jpg', '.jpeg', '.png'];

// Nom de fichier sur : path.basename() supprime toute composante de chemin
// (anti path traversal `..\..\evil.pdf`), puis on neutralise les caracteres
// exotiques et on prefixe par un timestamp.
const nomSur = (originalname) => {
  const base = path
    .basename(String(originalname || 'fichier'))
    .replace(/[^A-Za-z0-9._() -]/g, '_')
    .replace(/\s+/g, '_');
  return Date.now() + '_' + base;
};

const creerUpload = (destination) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, destination),
      filename: (req, file, cb) => cb(null, nomSur(file.originalname)),
    }),
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (EXTENSIONS_AUTORISEES.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG'));
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  });

const uploadDocument = creerUpload(DOCUMENTS_DIR);
const uploadPhoto = creerUpload(PHOTOS_DIR);

// Signatures binaires (magic bytes) des formats autorises. L'extension seule
// ne prouve rien : un executable renomme en .jpg passait le fileFilter.
const SIGNATURES = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};

// A placer APRES multer (le fichier doit exister sur disque). Supprime le
// fichier et renvoie 400 si son contenu ne correspond pas a son extension.
const verifierContenu = (req, res, next) => {
  if (!req.file) return next();

  const ext = path.extname(req.file.originalname).toLowerCase();
  const signatures = SIGNATURES[ext] || [];
  let conforme = false;

  try {
    const fd = fs.openSync(req.file.path, 'r');
    try {
      const entete = Buffer.alloc(8);
      const lus = fs.readSync(fd, entete, 0, entete.length, 0);
      conforme = signatures.some(
        (signature) =>
          lus >= signature.length &&
          signature.every((octet, index) => entete[index] === octet)
      );
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    conforme = false;
  }

  if (!conforme) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({
      erreur:
        'Contenu de fichier invalide : le fichier doit être un PDF, un JPG ou un PNG.',
    });
  }

  next();
};

module.exports = uploadDocument; // compat historique : require(...).single('document')
module.exports.uploadDocument = uploadDocument;
module.exports.uploadPhoto = uploadPhoto;
module.exports.verifierContenu = verifierContenu;
module.exports.DOCUMENTS_DIR = DOCUMENTS_DIR;
