const SPECIMEN_CATEGORIES = {
  MINERAL: 'mineral',
  IGNEOUS_ROCK: 'igneous_rock',
  SEDIMENTARY_ROCK: 'sedimentary_rock',
  METAMORPHIC_ROCK: 'metamorphic_rock'
};

const SPECIMEN_RARITIES = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  VERY_RARE: 'very_rare',
  LEGENDARY: 'legendary'
};

const ANALYSIS_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REJECTED_NON_SPECIMEN: 'rejected_non_specimen'
};

const PROVIDERS = {
  ML_PYTHON: 'ml_python',
  HEURISTIC: 'heuristic',
  OPENAI: 'openai',
  BASE_FALLBACK: 'base_fallback'
};

const USER_ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin'
};

const FEEDBACK_RATINGS = {
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  UNCERTAIN: 'uncertain'
};

const ERROR_CODES = {
  NON_SPECIMEN_IMAGE: '422_NON_SPECIMEN_IMAGE',
  UNAUTHORIZED: '401_UNAUTHORIZED',
  FORBIDDEN: '403_FORBIDDEN',
  NOT_FOUND: '404_NOT_FOUND',
  VALIDATION_ERROR: '400_VALIDATION_ERROR',
  INTERNAL_ERROR: '500_INTERNAL_SERVER_ERROR'
};

module.exports = {
  SPECIMEN_CATEGORIES,
  SPECIMEN_RARITIES,
  ANALYSIS_STATUS,
  PROVIDERS,
  USER_ROLES,
  FEEDBACK_RATINGS,
  ERROR_CODES
};
