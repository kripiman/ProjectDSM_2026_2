const { z } = require('zod');
const { SPECIMEN_RARITIES } = require('../config/constants');
const {
  emptyToUndefined, queryInt, queryBoolean, queryText, paginationShape, optionalPaginationShape,
  imageReference, atLeastOneField
} = require('./common.validation');

// Text that is not a number becomes NaN so the schema rejects it; silently dropping it
// would accept (and ignore) an invalid value. An explicit null/empty value stays null:
// it clears optional fields and is refused for required ones.
const toNumber = (val) => {
  if (val === undefined) return undefined;
  if (val === null || val === '') return null;
  return Number(val);
};

// Multipart forms deliver booleans as text.
const toBoolean = (val) => {
  if (val === 'true' || val === '1' || val === 1) return true;
  if (val === 'false' || val === '0' || val === 0) return false;
  return val;
};

const optionalNumber = z.preprocess(toNumber, z.number().optional().nullable());
const optionalPositiveNumber = z.preprocess(toNumber, z.number().positive().optional().nullable());
const optionalText = (maxLength = 500) => z.string().trim().max(maxLength).optional().nullable();

// Alternative spellings accepted by the API (camelCase and classroom names) and the
// model column each one stands for.
const FIELD_ALIASES = {
  scientificName: 'scientific_name',
  index: 'catalog_index',
  typeId: 'type_id',
  categoryId: 'category_id',
  formula: 'chemical_formula',
  molarWeight: 'molar_weight',
  commonUses: 'common_uses',
  streak: 'streak_color',
  color: 'color_description',
  mindatUrl: 'mindat_url'
};

/**
 * Maps the different spellings accepted by the API onto the column names used by the
 * model, and fills in what can be derived (English name, scientific name, a hardness
 * range from a single value, the image from any of its names).
 */
const normalizeRockPayload = (raw, { creating }) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...raw };

  for (const [alias, column] of Object.entries(FIELD_ALIASES)) {
    if (data[alias] !== undefined && data[column] === undefined) data[column] = data[alias];
  }

  const resolvedName = data.name || data.name_es || data.name_en;
  if (creating) {
    if (resolvedName) {
      if (!data.name_es) data.name_es = resolvedName;
      if (!data.name_en) data.name_en = resolvedName;
    }
    data.scientific_name = data.scientific_name || resolvedName;
  } else if (data.name && !data.name_es) {
    data.name_es = data.name;
  }

  if (data.hardness !== undefined) {
    if (data.mohs_hardness_min === undefined) data.mohs_hardness_min = data.hardness;
    if (data.mohs_hardness_max === undefined) data.mohs_hardness_max = data.hardness;
  }

  const image = data.imgUrl ?? data.img_url ?? data.imageUrl ?? data.image_url ?? data.image;
  if (typeof image === 'string' && image.trim() !== '' && data.full_image_url === undefined) {
    data.full_image_url = image;
  }

  if (data.magnetism !== undefined) data.magnetism = toBoolean(data.magnetism);
  if (data.is_active !== undefined) data.is_active = toBoolean(data.is_active);

  return data;
};

const MOHS_RANGE_MESSAGE = 'La dureza de Mohs debe estar entre 1 y 10';
const mohsHardness = z.preprocess(toNumber, z.number().min(1, MOHS_RANGE_MESSAGE).max(10, MOHS_RANGE_MESSAGE));

const rockFields = {
  name_es: z.string({ error: 'El nombre de la roca es obligatorio' }).trim().min(1, 'El nombre de la roca es obligatorio').max(150),
  name_en: z.string().trim().min(1).max(150).optional(),
  scientific_name: z.string().trim().min(1).max(200).optional(),
  catalog_index: z.preprocess(toNumber, z.number().int().optional().nullable()),
  rarity: z.enum(Object.values(SPECIMEN_RARITIES)).optional(),
  description: z.string({ error: 'La descripción de la roca es obligatoria' }).trim().min(1, 'La descripción de la roca es obligatoria').max(5000),
  composition: optionalText(),
  chemical_formula: optionalText(),
  molar_weight: optionalPositiveNumber,
  environment: optionalText(),
  common_uses: optionalText(),
  mohs_hardness_min: mohsHardness,
  mohs_hardness_max: mohsHardness,
  streak_color: optionalText(),
  luster: optionalText(),
  color_description: optionalText(),
  texture: optionalText(),
  cleavage: optionalText(),
  fracture: optionalText(),
  crystal_system: optionalText(),
  identification_tips: optionalText(5000),
  magnetism: z.boolean().optional(),
  density: optionalPositiveNumber,
  specific_gravity: optionalPositiveNumber,
  transparency: optionalNumber,
  tenacity: optionalNumber,
  full_image_url: imageReference('La imagen debe ser una URL http(s) o una ruta que comience con "/"')
    .min(1, 'La imagen de la roca es obligatoria'),
  thumbnail_url: imageReference('La miniatura debe ser una URL http(s) o una ruta que comience con "/"').optional().nullable(),
  mindat_url: optionalText()
};

const requiredTaxonomyId = (label) => z.preprocess(
  toNumber,
  z.number({ error: `${label} es obligatorio` }).int().positive(`${label} es obligatorio`)
);
const optionalTaxonomyId = z.preprocess(toNumber, z.number().int().positive().optional());

const hardnessRange = (data) => data.mohs_hardness_min === undefined
  || data.mohs_hardness_max === undefined
  || data.mohs_hardness_min <= data.mohs_hardness_max;
const HARDNESS_RANGE_ISSUE = {
  message: 'La dureza mínima no puede ser mayor que la dureza máxima',
  path: ['mohs_hardness_min']
};

const createRockSchema = z.preprocess((raw) => normalizeRockPayload(raw, { creating: true }), z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/, 'El identificador solo admite letras, números, "_" y "-"').optional(),
  ...rockFields,
  mohs_hardness_min: rockFields.mohs_hardness_min.optional().default(1),
  mohs_hardness_max: rockFields.mohs_hardness_max.optional().default(1),
  type_id: requiredTaxonomyId('El tipo (typeId)'),
  category_id: requiredTaxonomyId('La categoría (categoryId)')
}).refine(hardnessRange, HARDNESS_RANGE_ISSUE));

const updateRockSchema = z.preprocess(
  (raw) => normalizeRockPayload(raw, { creating: false }),
  atLeastOneField(
    z.object({
      ...Object.fromEntries(Object.entries(rockFields).map(([key, schema]) => [key, schema.optional()])),
      type_id: optionalTaxonomyId,
      category_id: optionalTaxonomyId,
      is_active: z.boolean().optional()
    }).refine(hardnessRange, HARDNESS_RANGE_ISSUE),
    'Debe indicar al menos un campo para actualizar'
  )
);

const rockFilters = {
  category_id: queryInt({ min: 1 }),
  type_id: queryInt({ min: 1 }),
  category: queryText(60),
  type: queryText(60),
  rarity: z.preprocess(emptyToUndefined, z.enum(Object.values(SPECIMEN_RARITIES)).optional()),
  magnetism: queryBoolean,
  q: queryText(100)
};

const listRocksQuery = z.object({
  ...rockFilters,
  include_inactive: queryBoolean,
  ...optionalPaginationShape()
});

const listSpecimensQuery = z.object({
  ...rockFilters,
  ...paginationShape({ defaultLimit: 20 })
});

module.exports = {
  createRockSchema,
  updateRockSchema,
  listRocksQuery,
  listSpecimensQuery
};
