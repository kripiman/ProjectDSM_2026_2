const { uuidv4 } = require('../utils/uuid');
const { Quiz, QuizQuestion, UserQuizAttempt, sequelize } = require('../models');
const AchievementService = require('../services/gamification/achievement.service');
const ExperienceService = require('../services/gamification/experience.service');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, ACHIEVEMENT_TRIGGERS, QUIZ_PASSING_SCORE } = require('../config/constants');

// Share of the reward given for a first, failed attempt.
const FAILED_ATTEMPT_XP_RATIO = 0.2;

const findActiveQuiz = async (id, options = {}) => {
  const quiz = await Quiz.findOne({ where: { id, is_active: true }, ...options });
  if (!quiz) {
    throw new AppError(404, `Quiz with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
  }
  return quiz;
};

const listQuizzes = async (req, res, next) => {
  try {
    const quizzes = await Quiz.findAll({
      where: { is_active: true },
      order: [['difficulty', 'ASC']]
    });

    return successResponse(res, quizzes, 'Educational quizzes retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getQuizById = async (req, res, next) => {
  try {
    const quiz = await findActiveQuiz(req.params.id, {
      include: [
        {
          model: QuizQuestion,
          as: 'questions',
          attributes: ['id', 'question_text', 'options', 'specimen_id'] // hide correct_option_index
        }
      ]
    });

    return successResponse(res, quiz, 'Quiz retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Experience for an attempt. Quizzes can be retaken to practise, but the reward is
 * paid once: in full for the first pass, and a fraction for a first failed attempt.
 */
const experienceForAttempt = (quiz, passed, previousAttempts) => {
  if (passed) {
    return previousAttempts.some((attempt) => attempt.passed) ? 0 : quiz.xp_reward;
  }
  return previousAttempts.length === 0 ? Math.round(quiz.xp_reward * FAILED_ATTEMPT_XP_RATIO) : 0;
};

const submitQuiz = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { answers } = req.body; // Array of { question_id, selected_option_index }

    const quiz = await findActiveQuiz(id, {
      include: [{ model: QuizQuestion, as: 'questions' }]
    });

    let correctCount = 0;
    const answerMap = new Map(answers.map((a) => [a.question_id, a.selected_option_index]));
    const questionResults = [];

    for (const q of quiz.questions) {
      const selectedIndex = answerMap.get(q.id);
      const isCorrect = selectedIndex === q.correct_option_index;
      if (isCorrect) correctCount++;

      questionResults.push({
        question_id: q.id,
        question_text: q.question_text,
        user_selected_index: selectedIndex ?? null,
        correct_option_index: q.correct_option_index,
        is_correct: isCorrect,
        explanation: q.explanation
      });
    }

    const totalQuestions = quiz.questions.length;
    const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = scorePercentage >= QUIZ_PASSING_SCORE;

    // The attempt, its experience and the achievements it unlocks are stored together.
    const { attempt, xpEarned, unlockedAchievements } = await sequelize.transaction(async (transaction) => {
      const previousAttempts = await UserQuizAttempt.findAll({
        where: { user_id: userId, quiz_id: id },
        attributes: ['passed'],
        transaction
      });
      const xp = experienceForAttempt(quiz, passed, previousAttempts);

      const savedAttempt = await UserQuizAttempt.create({
        id: uuidv4(),
        user_id: userId,
        quiz_id: id,
        score: scorePercentage,
        total_questions: totalQuestions,
        xp_earned: xp,
        passed
      }, { transaction });

      await ExperienceService.award(userId, xp, { transaction });
      const unlocked = await AchievementService.evaluate(userId, ACHIEVEMENT_TRIGGERS.QUIZ, { transaction });

      return { attempt: savedAttempt, xpEarned: xp, unlockedAchievements: unlocked };
    });

    return successResponse(res, {
      attempt_id: attempt.id,
      score: scorePercentage,
      correct_answers: correctCount,
      total_questions: totalQuestions,
      passed,
      xp_earned: xpEarned,
      breakdown: questionResults,
      unlocked_achievements: unlockedAchievements
    }, 'Quiz evaluated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listQuizzes,
  getQuizById,
  submitQuiz
};
