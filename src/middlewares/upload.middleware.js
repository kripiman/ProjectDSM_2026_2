const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uuidv4 } = require('../utils/uuid');
const env = require('../config/env');
const { AppError } = require('./error.middleware');
const { ERROR_CODES } = require('../config/constants');

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Invalid file format. Only JPEG, PNG, and WebP images are allowed.', ERROR_CODES.VALIDATION_ERROR), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = {
  upload
};
