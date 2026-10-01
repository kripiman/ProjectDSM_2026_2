const { z } = require('zod');
const { normalizeName } = require('../utils/text');
const { paginationShape, queryText, atLeastOneField } = require('./common.validation');

// Type and category names are identifiers shown to users and used in filters, so
// they are stored trimmed, single-spaced and lower-case: "Oxido" and " oxido " are
// the same entry.
const nameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(60, 'Name must be at most 60 characters')
  .transform(normalizeName);

const descriptionField = z.string().trim().max(500, 'Description must be at most 500 characters');

const createTaxonomySchema = z.object({
  name: nameField,
  description: descriptionField.optional().nullable()
});

const updateTaxonomySchema = atLeastOneField(
  z.object({
    name: nameField.optional(),
    description: descriptionField.optional().nullable()
  }),
  'At least one field (name, description) is required'
);

const listTaxonomyQuery = z.object({
  q: queryText(60)
});

const taxonomyRocksQuery = z.object({
  ...paginationShape({ defaultLimit: 20 })
});

module.exports = {
  createTaxonomySchema,
  updateTaxonomySchema,
  listTaxonomyQuery,
  taxonomyRocksQuery
};
