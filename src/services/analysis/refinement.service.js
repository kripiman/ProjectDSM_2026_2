const { REFINEMENT_QUESTION_TYPES: TYPE } = require('../../config/constants');
const { stripDiacritics } = require('../../utils/text');

const MIN_CONFIDENCE = 0.10;
const MAX_CONFIDENCE = 0.98;

const HARDNESS_SCRATCH_DELTA = 0.15;
const MAGNETISM_MATCH_DELTA = 0.20;
const MAGNETISM_MISMATCH_DELTA = -0.30;

// Questions offered to the user after a recognition, to tell apart look-alike candidates.
const REFINEMENT_QUESTIONS = [
  {
    question_type: TYPE.HARDNESS,
    prompt: '¿La muestra puede ser rayada con una moneda de cobre o una uña?',
    options: ['Se raya con la uña (Muy blando < 2.5)', 'Se raya con una moneda (Blando ~3)', 'Raya el vidrio (Duro >= 6)', 'No tengo cómo probar']
  },
  {
    question_type: TYPE.STREAK,
    prompt: 'Al frotarla contra una superficie de porcelana sin esmaltar (o baldosa), ¿qué color de polvo deja?',
    options: ['Raya blanca o incolora', 'Raya negra o verdosa oscura', 'Raya rojiza / marrón', 'No deja raya']
  },
  {
    question_type: TYPE.MAGNETISM,
    prompt: '¿La roca o mineral es atraído por un imán común?',
    options: ['Sí, fuertemente magnético', 'No, nada magnético', 'Atracción débil']
  }
];

const normalizeAnswer = (answer) => stripDiacritics(answer).toLowerCase().trim();

/**
 * Reads a magnetism answer. The negative option also contains the word "magnético",
 * so the meaning is decided by how the answer starts, not by that word.
 * @returns {'strong'|'none'|'weak'|'unknown'}
 */
const classifyMagnetism = (answer) => {
  const text = normalizeAnswer(answer);
  if (text === 'no' || /^no\s*,/.test(text) || text.includes('nada')) return 'none';
  if (text.includes('debil')) return 'weak';
  if (text === 'si' || /^si\s*,/.test(text) || text.includes('fuerte')) return 'strong';
  return 'unknown';
};

const isScratchesGlass = (answer) => normalizeAnswer(answer).includes('vidrio');

class RefinementService {
  /**
   * How one answer changes the confidence of a candidate.
   * @param {{ magnetism: boolean, mohs_hardness_min: number }} specimen The candidate's catalog entry.
   * @param {{ question_type: string, user_answer: string }} answer
   * @returns {{ delta: number, note: string | null } | null} null when the answer says nothing about the candidate.
   */
  static scoreAnswer(specimen, answer) {
    if (answer.question_type === TYPE.MAGNETISM) {
      const magnetism = classifyMagnetism(answer.user_answer);
      if (magnetism === 'strong') {
        return specimen.magnetism
          ? { delta: MAGNETISM_MATCH_DELTA, note: 'Confirmado por magnetismo positivo' }
          : { delta: MAGNETISM_MISMATCH_DELTA, note: null };
      }
      if (magnetism === 'none' && specimen.magnetism) {
        return { delta: MAGNETISM_MISMATCH_DELTA, note: 'Descartado: la muestra no es atraída por un imán' };
      }
      return null;
    }

    if (answer.question_type === TYPE.HARDNESS && isScratchesGlass(answer.user_answer) && specimen.mohs_hardness_min >= 6) {
      return { delta: HARDNESS_SCRATCH_DELTA, note: 'Confirmado dureza alta >= 6' };
    }

    return null;
  }

  /**
   * Applies every answer to a candidate, updating its score (kept within bounds) and
   * its rationale.
   * @param {import('sequelize').Model} candidate AnalysisCandidate instance.
   * @param {import('sequelize').Model} specimen Its catalog entry.
   * @param {Array<{ question_type: string, user_answer: string }>} answers
   */
  static applyAnswers(candidate, specimen, answers) {
    for (const answer of answers) {
      const effect = RefinementService.scoreAnswer(specimen, answer);
      if (!effect) continue;

      const adjusted = candidate.confidence_score + effect.delta;
      candidate.confidence_score = Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, adjusted));
      if (effect.note) {
        candidate.rationale = `${candidate.rationale || ''} (${effect.note})`.trim();
      }
    }
  }
}

module.exports = RefinementService;
module.exports.REFINEMENT_QUESTIONS = REFINEMENT_QUESTIONS;
