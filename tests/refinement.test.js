const RefinementService = require('../src/services/analysis/refinement.service');

const { REFINEMENT_QUESTIONS } = RefinementService;

const magnetite = { magnetism: true, mohs_hardness_min: 5.5 };
const quartz = { magnetism: false, mohs_hardness_min: 7 };
const calcite = { magnetism: false, mohs_hardness_min: 3 };

const answer = (questionType, userAnswer) => ({ question_type: questionType, user_answer: userAnswer });
const optionsOf = (questionType) => REFINEMENT_QUESTIONS.find((q) => q.question_type === questionType).options;

describe('Refinement scoring', () => {
  describe('magnetism', () => {
    const [strong, none, weak] = optionsOf('magnetism');

    test('the options offered to the user are the ones the rules understand', () => {
      expect(strong).toMatch(/^Sí/);
      expect(none).toMatch(/^No/);
      expect(weak).toMatch(/débil/);
    });

    test('"strongly magnetic" favours magnetic candidates and penalises the others', () => {
      expect(RefinementService.scoreAnswer(magnetite, answer('magnetism', strong)))
        .toEqual({ delta: 0.20, note: 'Confirmado por magnetismo positivo' });
      expect(RefinementService.scoreAnswer(quartz, answer('magnetism', strong)))
        .toEqual({ delta: -0.30, note: null });
    });

    test('"not magnetic" penalises magnetic candidates and never favours them', () => {
      // The option contains the word "magnético" too: it must not be read as a positive answer.
      const result = RefinementService.scoreAnswer(magnetite, answer('magnetism', none));
      expect(result.delta).toBe(-0.30);
      expect(result.note).toMatch(/Descartado/);

      expect(RefinementService.scoreAnswer(quartz, answer('magnetism', none))).toBeNull();
      expect(RefinementService.scoreAnswer(calcite, answer('magnetism', none))).toBeNull();
    });

    test('a weak attraction or an unrecognised answer says nothing', () => {
      for (const text of [weak, 'no sé', '', '???']) {
        expect(RefinementService.scoreAnswer(magnetite, answer('magnetism', text))).toBeNull();
        expect(RefinementService.scoreAnswer(quartz, answer('magnetism', text))).toBeNull();
      }
    });

    test('answers are read regardless of case, accents and surrounding spaces', () => {
      expect(RefinementService.scoreAnswer(quartz, answer('magnetism', '  SÍ, fuertemente magnético '))?.delta).toBe(-0.30);
      expect(RefinementService.scoreAnswer(magnetite, answer('magnetism', 'NO, NADA MAGNÉTICO'))?.delta).toBe(-0.30);
      expect(RefinementService.scoreAnswer(magnetite, answer('magnetism', 'si'))?.delta).toBe(0.20);
    });
  });

  describe('hardness', () => {
    const [soft, medium, hard, unknown] = optionsOf('hardness');

    test('scratching glass favours hard candidates only', () => {
      expect(RefinementService.scoreAnswer(quartz, answer('hardness', hard)))
        .toEqual({ delta: 0.15, note: 'Confirmado dureza alta >= 6' });
      expect(RefinementService.scoreAnswer(calcite, answer('hardness', hard))).toBeNull();
    });

    test('the other hardness answers have no effect', () => {
      for (const text of [soft, medium, unknown]) {
        expect(RefinementService.scoreAnswer(quartz, answer('hardness', text))).toBeNull();
      }
    });
  });

  test('questions without a rule (streak, luster) have no effect', () => {
    expect(RefinementService.scoreAnswer(quartz, answer('streak', 'Raya blanca o incolora'))).toBeNull();
    expect(RefinementService.scoreAnswer(quartz, answer('luster', 'Vítreo'))).toBeNull();
  });

  describe('applyAnswers', () => {
    const candidate = (score, rationale = 'base') => ({ confidence_score: score, rationale });

    test('updates the score and records the reason', () => {
      const target = candidate(0.6);
      RefinementService.applyAnswers(target, magnetite, [answer('magnetism', optionsOf('magnetism')[0])]);

      expect(target.confidence_score).toBeCloseTo(0.8);
      expect(target.rationale).toBe('base (Confirmado por magnetismo positivo)');
    });

    test('adds up several answers', () => {
      const target = candidate(0.5);
      RefinementService.applyAnswers(target, quartz, [
        answer('hardness', optionsOf('hardness')[2]),
        answer('magnetism', optionsOf('magnetism')[0])
      ]);
      expect(target.confidence_score).toBeCloseTo(0.5 + 0.15 - 0.30);
    });

    test('keeps the score within bounds', () => {
      const high = candidate(0.95);
      RefinementService.applyAnswers(high, magnetite, [answer('magnetism', optionsOf('magnetism')[0])]);
      expect(high.confidence_score).toBe(0.98);

      const low = candidate(0.2);
      RefinementService.applyAnswers(low, quartz, [answer('magnetism', optionsOf('magnetism')[0])]);
      expect(low.confidence_score).toBe(0.10);
    });

    test('works when the candidate had no rationale', () => {
      const target = candidate(0.5, null);
      RefinementService.applyAnswers(target, magnetite, [answer('magnetism', optionsOf('magnetism')[0])]);
      expect(target.rationale).toBe('(Confirmado por magnetismo positivo)');
    });

    test('leaves the candidate untouched when no answer applies', () => {
      const target = candidate(0.6);
      RefinementService.applyAnswers(target, quartz, [answer('streak', 'Raya blanca o incolora')]);
      expect(target).toEqual({ confidence_score: 0.6, rationale: 'base' });
    });
  });
});
