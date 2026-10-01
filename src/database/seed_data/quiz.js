// Introductory quiz. `correct_option_index` points into `options`.
const QUIZ_SEED = {
  id: 'geology_basics_101',
  title: 'Fundamentos de Mineralogía',
  description: 'Pon a prueba tus conocimientos sobre dureza, brillo y propiedades físicas de minerales.',
  category: 'minerals',
  difficulty: 'easy',
  xp_reward: 100,
  is_active: true
};

const QUIZ_QUESTION_SEEDS = [
  {
    id: 'q1_mohs_scale',
    specimen_id: 'quartz',
    question_text: '¿Cuál es la dureza del Cuarzo en la escala de Mohs?',
    explanation: 'El cuarzo es el mineral estándar para la dureza 7 en la escala de Mohs.',
    options: ['Dureza 3', 'Dureza 5', 'Dureza 7', 'Dureza 10'],
    correct_option_index: 2
  },
  {
    id: 'q2_fools_gold',
    specimen_id: 'pyrite',
    question_text: '¿Por qué la Pirita es comúnmente llamada "el oro de los tontos"?',
    explanation: 'Por su color amarillo latón y brillo metálico semejante al oro nativo, aunque su raya es negruzca y es mucho más dura.',
    options: ['Por ser magnética', 'Por su brillo dorado metálico similar al oro', 'Por disolverse en agua', 'Por ser transparente'],
    correct_option_index: 1
  },
  {
    id: 'q3_magnetism',
    specimen_id: 'magnetite',
    question_text: '¿Qué propiedad física distingue de inmediato a la Magnetita?',
    explanation: 'La magnetita es fuertemente ferrimagnética y atrae imanes.',
    options: ['Magnetismo natural', 'Color fluorescente', 'Efervescencia con agua', 'Sabor salado'],
    correct_option_index: 0
  }
];

module.exports = {
  QUIZ_SEED,
  QUIZ_QUESTION_SEEDS
};
