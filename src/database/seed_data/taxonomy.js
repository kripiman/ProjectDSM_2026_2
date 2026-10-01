const { USER_ROLES, ROLE_IDS } = require('../../config/constants');

// Identifiers are fixed so that other seed data (specimens, achievements) and the code
// can refer to them.
const CATEGORY_IDS = {
  MINERAL: 1,
  IGNEOUS: 2,
  SEDIMENTARY: 3,
  METAMORPHIC: 4
};

const TYPE_IDS = {
  SILICATE: 1,
  OXIDE: 2,
  SULFIDE: 3,
  CARBONATE: 4
};

const ROLE_SEEDS = [
  { id: ROLE_IDS[USER_ROLES.GUEST], name: USER_ROLES.GUEST, description: 'Invitado no registrado' },
  { id: ROLE_IDS[USER_ROLES.USER], name: USER_ROLES.USER, description: 'Usuario registrado' },
  { id: ROLE_IDS[USER_ROLES.ADMIN], name: USER_ROLES.ADMIN, description: 'Administrador' }
];

const CATEGORY_SEEDS = [
  { id: CATEGORY_IDS.MINERAL, name: 'mineral', description: 'Minerales' },
  { id: CATEGORY_IDS.IGNEOUS, name: 'igneous_rock', description: 'Rocas Ígneas' },
  { id: CATEGORY_IDS.SEDIMENTARY, name: 'sedimentary_rock', description: 'Rocas Sedimentarias' },
  { id: CATEGORY_IDS.METAMORPHIC, name: 'metamorphic_rock', description: 'Rocas Metamórficas' }
];

const TYPE_SEEDS = [
  { id: TYPE_IDS.SILICATE, name: 'silicato', description: 'Silicatos' },
  { id: TYPE_IDS.OXIDE, name: 'oxido', description: 'Óxidos' },
  { id: TYPE_IDS.SULFIDE, name: 'sulfuro', description: 'Sulfuros' },
  { id: TYPE_IDS.CARBONATE, name: 'carbonato', description: 'Carbonatos' }
];

module.exports = {
  CATEGORY_IDS,
  TYPE_IDS,
  ROLE_SEEDS,
  CATEGORY_SEEDS,
  TYPE_SEEDS
};
