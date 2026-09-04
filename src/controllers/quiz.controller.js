const { uuidv4 } = require('../utils/uuid');
const { Quiz, QuizQuestion, UserQuizAttempt, User, Achievement, UserAchievement } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES } = require('../config/constants');

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
    const { id } = req.params;
    const quiz = await Quiz.findByPk(id, {
      include: [
        {
          model: QuizQuestion,
          as: 'questions',
          attributes: ['id', 'question_text', 'options', 'specimen_id'] // hide correct_option_index
        }
      ]
    });

    if (!quiz) {
      throw new AppError(404, `Quiz with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    return successResponse(res, quiz, 'Quiz retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const submitQuiz = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { answers } = req.body; // Array of { question_id, selected_option_index }

    if (!answers || !Array.isArray(answers)) {
      throw new AppError(400, 'Answers array is required', ERROR_CODES.VALIDATION_ERROR);
    }

    const quiz = await Quiz.findByPk(id, {
      include: [{ model: QuizQuestion, as: 'questions' }]
    });

    if (!quiz) {
      throw new AppError(404, `Quiz with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    let correctCount = 0;
    const answerMap = new Map(answers.map(a => [a.question_id, a.selected_option_index]));
    const questionResults = [];

    for (const q of quiz.questions) {
      const selectedIndex = answerMap.get(q.id);
      const isCorrect = selectedIndex === q.correct_option_index;
      if (isCorrect) correctCount++;

      questionResults.push({
        question_id: q.id,
        question_text: q.question_text,
        user_selected_index: selectedIndex,
        correct_option_index: q.correct_option_index,
        is_correct: isCorrect,
        explanation: q.explanation
      });
    }

    const totalQuestions = quiz.questions.length;
    const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = scorePercentage >= 60;
    const xpEarned = passed ? quiz.xp_reward : Math.round(quiz.xp_reward * 0.2);

    // Save attempt
    const attempt = await UserQuizAttempt.create({
      id: uuidv4(),
      user_id: userId,
      quiz_id: id,
      score: scorePercentage,
      total_questions: totalQuestions,
      xp_earned: xpEarned,
      passed
    });

    // Update user XP and level
    const user = await User.findByPk(userId);
    if (user) {
      user.experience_points += xpEarned;
      user.current_level = Math.floor(user.experience_points / 100) + 1;
      await user.save();
    }

    // Check achievement: QUIZ_CHAMPION
    if (passed) {
      const quizAch = await Achievement.findOne({ where: { code: 'QUIZ_CHAMPION' } });
      if (quizAch) {
        const [achRecord] = await UserAchievement.findOrCreate({
          where: { user_id: userId, achievement_id: quizAch.id },
          defaults: { id: uuidv4(), current_progress: 1, is_unlocked: true, unlocked_at: new Date() }
        });
        if (!achRecord.is_unlocked) {
          achRecord.is_unlocked = true;
          achRecord.current_progress = 1;
          achRecord.unlocked_at = new Date();
          await achRecord.save();
        }
      }
    }

    return successResponse(res, {
      attempt_id: attempt.id,
      score: scorePercentage,
      correct_answers: correctCount,
      total_questions: totalQuestions,
      passed,
      xp_earned: xpEarned,
      breakdown: questionResults
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
