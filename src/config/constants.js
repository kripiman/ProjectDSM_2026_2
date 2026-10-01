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

const REFINEMENT_STATUS = {
  NONE: 'none',
  REFINED: 'refined'
};

const PROVIDERS = {
  GEODEX: 'geodex',
  ML_PYTHON: 'ml_python',
  HEURISTIC: 'heuristic',
  OPENAI: 'openai'
};

const USER_ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin'
};

// Primary keys of the rows seeded into the `role` table.
const ROLE_IDS = {
  [USER_ROLES.GUEST]: 1,
  [USER_ROLES.USER]: 2,
  [USER_ROLES.ADMIN]: 3
};

const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned'
};

const FEEDBACK_RATINGS = {
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  UNCERTAIN: 'uncertain'
};

const REFINEMENT_QUESTION_TYPES = {
  HARDNESS: 'hardness',
  STREAK: 'streak',
  MAGNETISM: 'magnetism',
  LUSTER: 'luster'
};

// Metrics an achievement can be unlocked by. Administrators pick one of these
// and a threshold (`required_count`) when they define an achievement.
const ACHIEVEMENT_CONDITIONS = {
  FIRST_SCAN: 'FIRST_SCAN',
  TOTAL_SCANS: 'TOTAL_SCANS',
  UNIQUE_SPECIMENS: 'UNIQUE_SPECIMENS',
  CATEGORY_SPECIMENS: 'CATEGORY_SPECIMENS',
  REFINEMENTS: 'REFINEMENTS',
  QUIZ_SCORE: 'QUIZ_SCORE'
};

// Domain events that can unlock achievements.
const ACHIEVEMENT_TRIGGERS = {
  ANALYSIS: 'analysis',
  REFINEMENT: 'refinement',
  QUIZ: 'quiz'
};

// Recognitions allowed per temporary (guest) session before an account is required.
const GUEST_RECOGNITION_LIMIT = 10;

// Largest image accepted for recognition (matches the limit of the external model API).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Score (percentage) a quiz attempt needs to be passed.
const QUIZ_PASSING_SCORE = 60;

// Public URL prefixes under which uploaded images are served. The photos of
// recognitions are private and have none: GET /analysis/:id/image sends them.
const UPLOAD_URL_PREFIXES = {
  SPECIMENS: '/uploads/specimens'
};

const ERROR_CODES = {
  NON_SPECIMEN_IMAGE: '422_NON_SPECIMEN_IMAGE',
  UNAUTHORIZED: '401_UNAUTHORIZED',
  FORBIDDEN: '403_FORBIDDEN',
  NOT_FOUND: '404_NOT_FOUND',
  CONFLICT: '409_CONFLICT',
  VALIDATION_ERROR: '400_VALIDATION_ERROR',
  GUEST_LIMIT_REACHED: 'GUEST_LIMIT_REACHED',
  TOO_MANY_LOGIN_ATTEMPTS: 'TOO_MANY_LOGIN_ATTEMPTS',
  INTERNAL_ERROR: '500_INTERNAL_SERVER_ERROR'
};

module.exports = {
  SPECIMEN_RARITIES,
  ANALYSIS_STATUS,
  REFINEMENT_STATUS,
  PROVIDERS,
  USER_ROLES,
  ROLE_IDS,
  USER_STATUS,
  FEEDBACK_RATINGS,
  REFINEMENT_QUESTION_TYPES,
  ACHIEVEMENT_CONDITIONS,
  ACHIEVEMENT_TRIGGERS,
  GUEST_RECOGNITION_LIMIT,
  MAX_UPLOAD_BYTES,
  QUIZ_PASSING_SCORE,
  UPLOAD_URL_PREFIXES,
  ERROR_CODES
};
