const { sequelize } = require('../config/database');

const User = require('./user.model');
const UserPreference = require('./user_preference.model');
const Specimen = require('./specimen.model');
const Category = require('./category.model');
const Type = require('./type.model');
const Role = require('./role.model');
const Analysis = require('./analysis.model');
const AnalysisCandidate = require('./analysis_candidate.model');
const AnalysisRefinement = require('./analysis_refinement.model');
const CollectionItem = require('./collection_item.model');
const Feedback = require('./feedback.model');
const Achievement = require('./achievement.model');
const UserAchievement = require('./user_achievement.model');
const Quiz = require('./quiz.model');
const QuizQuestion = require('./quiz_question.model');
const UserQuizAttempt = require('./user_quiz_attempt.model');
const UserEvent = require('./user_event.model');
const Notification = require('./notification.model');

// Role <-> User
Role.hasMany(User, { foreignKey: 'role_id', as: 'users', onDelete: 'SET NULL' });
User.belongsTo(Role, { foreignKey: 'role_id', as: 'role_rel' });

// Category <-> Specimen
Category.hasMany(Specimen, { foreignKey: 'category_id', as: 'specimens', onDelete: 'SET NULL' });
Specimen.belongsTo(Category, { foreignKey: 'category_id', as: 'category_rel' });

// Type <-> Specimen
Type.hasMany(Specimen, { foreignKey: 'type_id', as: 'specimens', onDelete: 'SET NULL' });
Specimen.belongsTo(Type, { foreignKey: 'type_id', as: 'type_rel' });

// User <-> UserPreference
User.hasOne(UserPreference, { foreignKey: 'user_id', as: 'preference', onDelete: 'CASCADE' });
UserPreference.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Analysis
User.hasMany(Analysis, { foreignKey: 'user_id', as: 'analyses', onDelete: 'CASCADE' });
Analysis.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Specimen <-> Analysis
Specimen.hasMany(Analysis, { foreignKey: 'primary_specimen_id', as: 'analyses', onDelete: 'SET NULL' });
Analysis.belongsTo(Specimen, { foreignKey: 'primary_specimen_id', as: 'primary_specimen' });

// Analysis <-> AnalysisCandidate
Analysis.hasMany(AnalysisCandidate, { foreignKey: 'analysis_id', as: 'candidates', onDelete: 'CASCADE' });
AnalysisCandidate.belongsTo(Analysis, { foreignKey: 'analysis_id', as: 'analysis' });

// Specimen <-> AnalysisCandidate
Specimen.hasMany(AnalysisCandidate, { foreignKey: 'specimen_id', as: 'analysis_candidates', onDelete: 'CASCADE' });
AnalysisCandidate.belongsTo(Specimen, { foreignKey: 'specimen_id', as: 'specimen' });

// Analysis <-> AnalysisRefinement
Analysis.hasMany(AnalysisRefinement, { foreignKey: 'analysis_id', as: 'refinements', onDelete: 'CASCADE' });
AnalysisRefinement.belongsTo(Analysis, { foreignKey: 'analysis_id', as: 'analysis' });

// User <-> CollectionItem
User.hasMany(CollectionItem, { foreignKey: 'user_id', as: 'collection_items', onDelete: 'CASCADE' });
CollectionItem.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Specimen <-> CollectionItem
Specimen.hasMany(CollectionItem, { foreignKey: 'specimen_id', as: 'collection_items', onDelete: 'CASCADE' });
CollectionItem.belongsTo(Specimen, { foreignKey: 'specimen_id', as: 'specimen' });

// Analysis <-> CollectionItem
Analysis.hasOne(CollectionItem, { foreignKey: 'analysis_id', as: 'collection_item', onDelete: 'SET NULL' });
CollectionItem.belongsTo(Analysis, { foreignKey: 'analysis_id', as: 'analysis' });

// Analysis <-> Feedback
Analysis.hasMany(Feedback, { foreignKey: 'analysis_id', as: 'feedbacks', onDelete: 'CASCADE' });
Feedback.belongsTo(Analysis, { foreignKey: 'analysis_id', as: 'analysis' });

// User <-> Feedback
User.hasMany(Feedback, { foreignKey: 'user_id', as: 'feedbacks', onDelete: 'SET NULL' });
Feedback.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Specimen <-> Feedback (suggested alternative)
Specimen.hasMany(Feedback, { foreignKey: 'suggested_specimen_id', as: 'suggested_feedbacks', onDelete: 'SET NULL' });
Feedback.belongsTo(Specimen, { foreignKey: 'suggested_specimen_id', as: 'suggested_specimen' });

// User <-> UserAchievement
User.hasMany(UserAchievement, { foreignKey: 'user_id', as: 'user_achievements', onDelete: 'CASCADE' });
UserAchievement.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Achievement <-> UserAchievement
Achievement.hasMany(UserAchievement, { foreignKey: 'achievement_id', as: 'user_achievements', onDelete: 'CASCADE' });
UserAchievement.belongsTo(Achievement, { foreignKey: 'achievement_id', as: 'achievement' });

// Quiz <-> QuizQuestion
Quiz.hasMany(QuizQuestion, { foreignKey: 'quiz_id', as: 'questions', onDelete: 'CASCADE' });
QuizQuestion.belongsTo(Quiz, { foreignKey: 'quiz_id', as: 'quiz' });

// Specimen <-> QuizQuestion
Specimen.hasMany(QuizQuestion, { foreignKey: 'specimen_id', as: 'quiz_questions', onDelete: 'SET NULL' });
QuizQuestion.belongsTo(Specimen, { foreignKey: 'specimen_id', as: 'specimen' });

// User <-> UserQuizAttempt
User.hasMany(UserQuizAttempt, { foreignKey: 'user_id', as: 'quiz_attempts', onDelete: 'CASCADE' });
UserQuizAttempt.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Quiz <-> UserQuizAttempt
Quiz.hasMany(UserQuizAttempt, { foreignKey: 'quiz_id', as: 'attempts', onDelete: 'CASCADE' });
UserQuizAttempt.belongsTo(Quiz, { foreignKey: 'quiz_id', as: 'quiz' });

// User <-> UserEvent
User.hasMany(UserEvent, { foreignKey: 'user_id', as: 'events', onDelete: 'SET NULL' });
UserEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Role,
  UserPreference,
  Specimen,
  Rock: Specimen, // Alias for classroom compatibility
  Category,
  Type,
  Analysis,
  AnalysisCandidate,
  AnalysisRefinement,
  CollectionItem,
  Feedback,
  Achievement,
  UserAchievement,
  Quiz,
  QuizQuestion,
  UserQuizAttempt,
  UserEvent,
  Notification
};
