const { z } = require('zod');

// Query-string parameters are always text; empty values are treated as "not provided".
const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

/** Optional integer query parameter. Rejects text that is not a whole number. */
const queryInt = ({ min = 1, max } = {}) => {
  let schema = z.coerce.number().int().min(min);
  if (max !== undefined) schema = schema.max(max);
  return z.preprocess(emptyToUndefined, schema.optional());
};

/** Optional boolean query parameter ("true"/"false"/"1"/"0"). */
const queryBoolean = z.preprocess(
  emptyToUndefined,
  z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1').optional()
);

/** Optional trimmed text query parameter. */
const queryText = (maxLength = 100) => z.preprocess(emptyToUndefined, z.string().trim().max(maxLength).optional());

const MAX_PAGE_SIZE = 100;

// A `limit` above the maximum is reduced to it instead of being refused, so clients
// that ask for "everything" with a large number keep working.
const pageSize = (maxLimit) => z.coerce.number().int().min(1).transform((value) => Math.min(value, maxLimit));

/** `page` and `limit` with defaults, for endpoints that always paginate. */
const paginationShape = ({ defaultLimit = 20, maxLimit = MAX_PAGE_SIZE } = {}) => ({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, pageSize(maxLimit).default(defaultLimit))
});

/** `page` and `limit` without defaults, for endpoints where pagination is opt-in. */
const optionalPaginationShape = ({ maxLimit = MAX_PAGE_SIZE } = {}) => ({
  page: queryInt({ min: 1 }),
  limit: z.preprocess(emptyToUndefined, pageSize(maxLimit).optional())
});

/** Whole number sent as a JSON number or as numeric text. Anything else is refused. */
const strictInteger = (label, { min, max }) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  z.number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`)
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Optional ISO-8601 date or date-time query parameter (e.g. 2026-10-01 or 2026-10-01T12:00:00Z). */
const queryIsoDate = z.preprocess(
  emptyToUndefined,
  z.string()
    .regex(ISO_DATE, 'Invalid date: use the ISO-8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)')
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), 'Invalid date')
    .optional()
);

// Images are referenced by an absolute http(s) URL or by a path served by this API.
const IMAGE_REFERENCE = /^(https?:\/\/|\/)/i;

/** Text field holding the reference to an image. */
const imageReference = (message) => z.string().trim().max(500).regex(IMAGE_REFERENCE, message);

/** Makes an update schema fail when the request carries no field at all. */
const atLeastOneField = (schema, message) => schema.refine((data) => Object.keys(data).length > 0, { message });

module.exports = {
  emptyToUndefined,
  queryInt,
  queryBoolean,
  queryText,
  queryIsoDate,
  paginationShape,
  optionalPaginationShape,
  strictInteger,
  imageReference,
  atLeastOneField
};
