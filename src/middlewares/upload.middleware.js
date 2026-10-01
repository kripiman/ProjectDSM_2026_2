const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uuidv4 } = require('../utils/uuid');
const env = require('../config/env');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, MAX_UPLOAD_BYTES, UPLOAD_URL_PREFIXES } = require('../config/constants');

// The stored extension is derived from the (allow-listed) MIME type rather than
// from the client-supplied file name, so an upload can never be saved as, say, .html.
const ALLOWED_IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

// Text fields accompanying a file are small; bounding them keeps a single request
// from making the server parse thousands of parts.
const MAX_FIELD_BYTES = 64 * 1024;

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_EXTENSIONS[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Invalid file format. Only JPEG, PNG, and WebP images are allowed.', ERROR_CODES.VALIDATION_ERROR), false);
  }
};

/**
 * Builds a Multer instance that stores single image uploads in `directory`.
 * @param {string} directory Folder (relative to the working directory) for the files.
 * @param {number} maxFields Text fields allowed next to the file.
 */
const createImageUpload = (directory, maxFields) => {
  const uploadDir = path.resolve(process.cwd(), directory);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${uuidv4()}${ALLOWED_IMAGE_EXTENSIONS[file.mimetype]}`);
    }
  });

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: maxFields,
      fieldSize: MAX_FIELD_BYTES,
      parts: maxFields + 1
    }
  });
};

// Images submitted for recognition: no fields are needed besides the file.
const upload = createImageUpload(env.UPLOAD_DIR, 5);

// Reference pictures attached to catalog entries, sent together with the rock's data.
const rockImageUpload = createImageUpload(env.SPECIMEN_UPLOAD_DIR, 60);

/**
 * Exposes an uploaded catalog picture to the body validation as the rock's image,
 * so a rock can be described either with an image URL or with an image file.
 */
const attachUploadedRockImage = (req, res, next) => {
  if (req.file) {
    const url = `${UPLOAD_URL_PREFIXES.SPECIMENS}/${req.file.filename}`;
    req.body.full_image_url = url;
    if (!req.body.thumbnail_url) {
      req.body.thumbnail_url = url;
    }
  }
  next();
};

module.exports = {
  upload,
  rockImageUpload,
  attachUploadedRockImage
};
