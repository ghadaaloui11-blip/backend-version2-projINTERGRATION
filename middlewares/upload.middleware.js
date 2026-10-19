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

module.exports = uploadDocument; // compat historique : require(...).single('document')
module.exports.uploadDocument = uploadDocument;
module.exports.uploadPhoto = uploadPhoto;
module.exports.DOCUMENTS_DIR = DOCUMENTS_DIR;
