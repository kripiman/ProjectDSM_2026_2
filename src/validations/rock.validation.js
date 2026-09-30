const { z } = require('zod');
const { SPECIMEN_CATEGORIES } = require('../config/constants');

const toNumber = (val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isNaN(num) ? undefined : num;
};

const createRockSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...raw };

  // Harmonize naming fields
  const resolvedName = data.name || data.name_es || data.name_en;
  if (resolvedName) {
    if (!data.name_es) data.name_es = resolvedName;
    if (!data.name_en) data.name_en = resolvedName;
  }
  data.scientific_name = data.scientificName || data.scientific_name || resolvedName;

  // Harmonize index and relations
  if (data.index !== undefined && data.catalog_index === undefined) data.catalog_index = data.index;
  if (data.typeId !== undefined && data.type_id === undefined) data.type_id = data.typeId;
  if (data.categoryId !== undefined && data.category_id === undefined) data.category_id = data.categoryId;

  // Harmonize chemical and physical properties
  if (data.formula !== undefined && data.chemical_formula === undefined) data.chemical_formula = data.formula;
  if (data.molarWeight !== undefined && data.molar_weight === undefined) data.molar_weight = data.molarWeight;
  if (data.commonUses !== undefined && data.common_uses === undefined) data.common_uses = data.commonUses;
  if (data.streak !== undefined && data.streak_color === undefined) data.streak_color = data.streak;
  if (data.color !== undefined && data.color_description === undefined) data.color_description = data.color;

  if (data.hardness !== undefined) {
    if (data.mohs_hardness_min === undefined) data.mohs_hardness_min = data.hardness;
    if (data.mohs_hardness_max === undefined) data.mohs_hardness_max = data.hardness;
  }

  // Harmonize URLs
  if (data.imgUrl !== undefined || data.img_url !== undefined) {
    data.full_image_url = data.imgUrl || data.img_url || data.full_image_url;
  }
  if (data.mindatUrl !== undefined && data.mindat_url === undefined) data.mindat_url = data.mindatUrl;

  return data;
}, z.object({
  id: z.string().optional(),
  name_es: z.string({ required_error: 'El nombre de la roca es obligatorio' }).min(1, 'El nombre de la roca es obligatorio'),
  name_en: z.string().optional(),
  scientific_name: z.string().optional(),
  catalog_index: z.preprocess(toNumber, z.number().int().optional().nullable()),
  type_id: z.preprocess(toNumber, z.number().int().optional().nullable()),
  category_id: z.preprocess(toNumber, z.number().int().optional().nullable()),
  category: z.string().optional().default(SPECIMEN_CATEGORIES.MINERAL),
  description: z.string().optional().default('Sin descripción disponible'),
  composition: z.string().optional().nullable(),
  chemical_formula: z.string().optional().nullable(),
  molar_weight: z.preprocess(toNumber, z.number().optional().nullable()),
  environment: z.string().optional().nullable(),
  common_uses: z.string().optional().nullable(),
  mohs_hardness_min: z.preprocess(toNumber, z.number().optional().default(1.0)),
  mohs_hardness_max: z.preprocess(toNumber, z.number().optional().default(1.0)),
  streak_color: z.string().optional().nullable(),
  color_description: z.string().optional().nullable(),
  texture: z.string().optional().nullable(),
  density: z.preprocess(toNumber, z.number().optional().nullable()),
  transparency: z.preprocess(toNumber, z.number().optional().nullable()),
  tenacity: z.preprocess(toNumber, z.number().optional().nullable()),
  full_image_url: z.string().optional().nullable(),
  mindat_url: z.string().optional().nullable()
}));

const updateRockSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...raw };

  if (data.molarWeight !== undefined && data.molar_weight === undefined) data.molar_weight = data.molarWeight;
  if (data.commonUses !== undefined && data.common_uses === undefined) data.common_uses = data.commonUses;
  if (data.scientificName !== undefined && data.scientific_name === undefined) data.scientific_name = data.scientificName;
  if (data.typeId !== undefined && data.type_id === undefined) data.type_id = data.typeId;
  if (data.categoryId !== undefined && data.category_id === undefined) data.category_id = data.categoryId;
  if (data.index !== undefined && data.catalog_index === undefined) data.catalog_index = data.index;
  if (data.formula !== undefined && data.chemical_formula === undefined) data.chemical_formula = data.formula;
  if (data.streak !== undefined && data.streak_color === undefined) data.streak_color = data.streak;
  if (data.color !== undefined && data.color_description === undefined) data.color_description = data.color;

  if (data.hardness !== undefined) {
    if (data.mohs_hardness_min === undefined) data.mohs_hardness_min = data.hardness;
    if (data.mohs_hardness_max === undefined) data.mohs_hardness_max = data.hardness;
  }

  if (data.imgUrl !== undefined || data.img_url !== undefined) {
    data.full_image_url = data.imgUrl || data.img_url || data.full_image_url;
  }
  if (data.mindatUrl !== undefined && data.mindat_url === undefined) data.mindat_url = data.mindatUrl;

  return data;
}, z.object({
  name_es: z.string().min(1).optional(),
  name_en: z.string().min(1).optional(),
  scientific_name: z.string().min(1).optional(),
  catalog_index: z.preprocess(toNumber, z.number().int().optional().nullable()),
  type_id: z.preprocess(toNumber, z.number().int().optional().nullable()),
  category_id: z.preprocess(toNumber, z.number().int().optional().nullable()),
  category: z.string().optional(),
  description: z.string().optional(),
  composition: z.string().optional().nullable(),
  chemical_formula: z.string().optional().nullable(),
  molar_weight: z.preprocess(toNumber, z.number().optional().nullable()),
  environment: z.string().optional().nullable(),
  common_uses: z.string().optional().nullable(),
  mohs_hardness_min: z.preprocess(toNumber, z.number().optional()),
  mohs_hardness_max: z.preprocess(toNumber, z.number().optional()),
  streak_color: z.string().optional().nullable(),
  color_description: z.string().optional().nullable(),
  texture: z.string().optional().nullable(),
  density: z.preprocess(toNumber, z.number().optional().nullable()),
  transparency: z.preprocess(toNumber, z.number().optional().nullable()),
  tenacity: z.preprocess(toNumber, z.number().optional().nullable()),
  full_image_url: z.string().optional().nullable(),
  mindat_url: z.string().optional().nullable()
}));

module.exports = {
  createRockSchema,
  updateRockSchema
};
