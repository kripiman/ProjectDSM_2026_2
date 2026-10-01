const { ACHIEVEMENT_CONDITIONS, QUIZ_PASSING_SCORE } = require('../../config/constants');
const { CATEGORY_IDS } = require('./taxonomy');

// Automatic achievements. Each one carries the rule that unlocks it, which administrators
// can change afterwards.
const ACHIEVEMENT_SEEDS = [
  {
    id: 'first_scan',
    code: 'FIRST_SCAN',
    title: 'Primer Descubrimiento',
    description: 'Escanea y analiza tu primera roca o mineral.',
    category: 'discovery',
    icon_url: '/assets/achievements/first_scan.png',
    condition_type: ACHIEVEMENT_CONDITIONS.FIRST_SCAN,
    required_count: 1,
    xp_reward: 50,
    is_active: true
  },
  {
    id: 'novice_collector',
    code: 'NOVICE_COLLECTOR',
    title: 'Coleccionista Novato',
    description: 'Guarda 3 especímenes en tu colección personal.',
    category: 'discovery',
    icon_url: '/assets/achievements/novice_collector.png',
    condition_type: ACHIEVEMENT_CONDITIONS.UNIQUE_SPECIMENS,
    required_count: 3,
    xp_reward: 100,
    is_active: true
  },
  {
    id: 'mineral_expert',
    code: 'MINERAL_EXPERT',
    title: 'Experto en Minerales',
    description: 'Descubre al menos 5 minerales diferentes.',
    category: 'discovery',
    icon_url: '/assets/achievements/mineral_expert.png',
    condition_type: ACHIEVEMENT_CONDITIONS.CATEGORY_SPECIMENS,
    condition_value: String(CATEGORY_IDS.MINERAL),
    required_count: 5,
    xp_reward: 200,
    is_active: true
  },
  {
    id: 'ten_scans',
    code: 'TEN_SCANS',
    title: 'Explorador Constante',
    description: 'Completa 10 reconocimientos de rocas o minerales.',
    category: 'discovery',
    icon_url: '/assets/achievements/ten_scans.png',
    condition_type: ACHIEVEMENT_CONDITIONS.TOTAL_SCANS,
    required_count: 10,
    xp_reward: 120,
    is_active: true
  },
  {
    id: 'refinement_master',
    code: 'REFINEMENT_MASTER',
    title: 'Ojo Clínico',
    description: 'Completa preguntas de refinamiento físico para ajustar una identificación.',
    category: 'refinement',
    icon_url: '/assets/achievements/refinement_master.png',
    condition_type: ACHIEVEMENT_CONDITIONS.REFINEMENTS,
    required_count: 1,
    xp_reward: 75,
    is_active: true
  },
  {
    id: 'quiz_champion',
    code: 'QUIZ_CHAMPION',
    title: 'Cerebro Geológico',
    description: 'Aprueba tu primer quiz educativo sobre rocas y minerales.',
    category: 'quiz',
    icon_url: '/assets/achievements/quiz_champion.png',
    condition_type: ACHIEVEMENT_CONDITIONS.QUIZ_SCORE,
    condition_value: String(QUIZ_PASSING_SCORE),
    required_count: 1,
    xp_reward: 150,
    is_active: true
  }
];

module.exports = {
  ACHIEVEMENT_SEEDS
};
