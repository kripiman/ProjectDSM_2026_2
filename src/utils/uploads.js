const fs = require('fs');
const path = require('path');

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

module.exports = {
  removeUploadedFiles,
  removeStoredImage
};
