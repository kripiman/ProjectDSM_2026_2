/** Removes accents and other combining marks: "Pómez" -> "Pomez". */
const stripDiacritics = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '');

/** Accent-free, lower-case identifier made of letters, digits and underscores. */
const slugify = (value) => stripDiacritics(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

/** Canonical form of a taxonomy name: trimmed, single-spaced and lower-case. */
const normalizeName = (value) => String(value).trim().replace(/\s+/g, ' ').toLowerCase();

module.exports = {
  stripDiacritics,
  slugify,
  normalizeName
};
