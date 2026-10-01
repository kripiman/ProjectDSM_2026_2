const fs = require('fs');
const path = require('path');
const { AppError } = require('./app_error');
const { ERROR_CODES } = require('../config/constants');

// Private images are kept out of shared caches and never sniffed into another type.
const PRIVATE_IMAGE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, max-age=86400'
};

const collectUploadedFiles = (req) => {
  const files = [];
  if (req.file) {
    files.push(req.file);
  }
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((group) => files.push(...group));
  }
  return files;
};

/**
 * Deletes the files Multer stored for a request. Used when the request ends in an
 * error, so rejected uploads do not pile up on disk. Failures are ignored on purpose:
 * cleanup must never mask the original error.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
const removeUploadedFiles = async (req) => {
  const files = collectUploadedFiles(req);
  await Promise.all(
    files.map((file) => (file.path ? fs.promises.unlink(file.path).catch(() => {}) : null))
  );
};

/**
 * Deletes a previously uploaded image given the public URL it was served under.
 * URLs that do not belong to `urlPrefix` (for instance external links) are ignored,
 * and only the file name is used, so a URL can never point outside `directory`.
 * @param {string|null|undefined} url
 * @param {{ urlPrefix: string, directory: string }} location
 */
const removeStoredImage = async (url, { urlPrefix, directory }) => {
  if (typeof url !== 'string' || !url.startsWith(`${urlPrefix}/`)) {
    return;
  }
  const file = path.resolve(process.cwd(), directory, path.basename(url));
  await fs.promises.unlink(file).catch(() => {});
};

/**
 * Sends a stored image as a private response. Only the file name of `stored` is used,
 * so a stored reference can never point outside `directory`. A missing file answers
 * 404; a file that exists but cannot be read is a server error, which the error handler
 * reports without showing where files are kept.
 * @param {import('express').Response} res
 * @param {string} directory Uploads folder, absolute or relative to the working directory.
 * @param {string|null|undefined} stored Stored reference: the file name, or an older "/uploads/..." path.
 * @returns {Promise<void>}
 */
const sendStoredImage = async (res, directory, stored) => {
  const root = path.resolve(process.cwd(), directory);
  const filename = typeof stored === 'string' ? path.basename(stored) : '';
  const notAvailable = () => new AppError(404, 'The image is no longer available', ERROR_CODES.NOT_FOUND);

  if (filename === '' || filename.startsWith('.')) {
    throw notAvailable();
  }

  // Checked before sending: once `send` has described the file in the headers, a failure
  // can no longer become a clean JSON answer.
  const file = path.join(root, filename);
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    if (!(await fs.promises.stat(file)).isFile()) {
      throw notAvailable();
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw error.code === 'ENOENT' || error.code === 'ENOTDIR' ? notAvailable() : error;
  }

  await new Promise((resolve, reject) => {
    res.sendFile(filename, { root, dotfiles: 'deny', headers: PRIVATE_IMAGE_HEADERS }, (error) => {
      if (!error || error.code === 'ECONNABORTED') {
        resolve(); // sent, or the client went away
      } else if (res.headersSent) {
        res.destroy(); // the body was cut short: end the connection rather than leave the client waiting
        resolve();
      } else {
        reject(error.code === 'ENOENT' || error.status === 404 ? notAvailable() : error); // removed after the check above
      }
    });
  });
};

module.exports = {
  removeUploadedFiles,
  removeStoredImage,
  sendStoredImage
};
