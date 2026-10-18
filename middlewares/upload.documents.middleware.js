const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, Date.now() + '_' + safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG'), false);
  }
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB max
