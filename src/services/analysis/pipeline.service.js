const { uuidv4 } = require('../../utils/uuid');
const PreprocessorService = require('./preprocessor.service');
const FeatureService = require('./feature.service');
const GeoDexService = require('../ai/geodex.service');
const PythonMLService = require('../ai/python_ml.service');
const HeuristicRanker = require('../heuristics/heuristic_ranker');
const OpenAIAdjudicator = require('../ai/openai_adjudicator');
const CollectionService = require('../collection.service');
const GuestQuotaService = require('../guest_quota.service');
const AchievementService = require('../gamification/achievement.service');
const { REFINEMENT_QUESTIONS } = require('./refinement.service');
const { Analysis, AnalysisCandidate, Specimen, User, sequelize } = require('../../models');
const { AppError } = require('../../utils/app_error');
const {
  ANALYSIS_STATUS, REFINEMENT_STATUS, PROVIDERS, ACHIEVEMENT_TRIGGERS, ERROR_CODES
} = require('../../config/constants');

// Confidence band in which the assisted adjudicator is asked to disambiguate.
const ADJUDICATION_MIN_CONFIDENCE = 0.40;
const ADJUDICATION_MAX_CONFIDENCE = 0.75;

// Confidence assumed when a provider does not report one.
const DEFAULT_ML_CONFIDENCE = 0.80;
const DEFAULT_HEURISTIC_CONFIDENCE = 0.50;

// Providers may suggest specimens the catalog does not contain; storing one of those
// would break the foreign keys, so only known ones are kept.
const keepCatalogCandidates = (candidates, knownIds) => (
  (candidates || []).filter((candidate) => candidate && knownIds.has(candidate.specimen_id))
);

const buildExplanation = (specimen) => {
  const evidence = [];
  if (specimen.luster) evidence.push(`su ${specimen.luster.toLowerCase()}`);
  if (specimen.fracture) evidence.push(`características de fractura ${specimen.fracture.toLowerCase()}`);
  const basis = evidence.length > 0 ? ` debido a ${evidence.join(' y ')}` : '';
  return `Identificado como ${specimen.name_es} (${specimen.category})${basis}. ${specimen.description}`;
};

class PipelineService {
  /**
   * Executes the full automated rock/mineral identification flow with fault-tolerant
   * fallbacks, then stores the result: the analysis, its candidates, the discovery in
   * the user's collection and any achievement it unlocks.
   */
  static async processImage({ userId, filePath, mimeType, originalFilename, storedFilename, simulateFlag = false }) {
    const startTime = Date.now();

    // 1. Preprocessing validation (specimen check -> 422 if invalid)
    await PreprocessorService.validateSpecimen(filePath, originalFilename, simulateFlag);

    // 2. Visual feature extraction
    const features = await FeatureService.extractFeatures(filePath);

    // 3-5. Identification: external providers, heuristic fallback, adjudication
    const catalog = await Specimen.findAll({ where: { is_active: true } });
    const identification = await PipelineService.identify({ filePath, mimeType, features, catalog });

    // 6. Persistence
    const analysisId = uuidv4();
    const executionTimeMs = Date.now() - startTime;
    const outcome = await PipelineService.persist({
      userId, analysisId, storedFilename, features, identification, executionTimeMs
    });

    return {
      analysis_id: analysisId,
      status: ANALYSIS_STATUS.COMPLETED,
      provider_used: identification.providerUsed,
      confidence: identification.confidence,
      primary_specimen: identification.primarySpecimen,
      educational_explanation: identification.explanation,
      candidates: identification.candidates,
      features,
      refinement_questions: REFINEMENT_QUESTIONS,
      discovery: outcome.discovery,
      unlocked_achievements: outcome.unlockedAchievements,
      guest_quota: outcome.guestQuota,
      execution_time_ms: executionTimeMs
    };
  }

  /**
   * Finds out what a photo shows. Providers are tried in order of preference (GeoDex,
   * the local Python service, the heuristic ranking) and the assisted adjudicator may
   * refine an ambiguous answer. Touches no table: nothing is stored here.
   */
  static async identify({ filePath, mimeType, features, catalog }) {
    const knownIds = new Set(catalog.map((specimen) => specimen.id));
    const providerAttempts = [];

    // External recognition providers
    let mlResult = await GeoDexService.identify({ filePath, mimeType, catalog });
    let providerUsed = PROVIDERS.GEODEX;
    if (GeoDexService.isEnabled()) {
      providerAttempts.push({
        provider: PROVIDERS.GEODEX,
        available: mlResult.available,
        reason: mlResult.reason || null,
        ...(mlResult.cached && { cached: true })
      });
    }

    if (!mlResult.available) {
      mlResult = await PythonMLService.predict(filePath, features);
      providerUsed = PROVIDERS.ML_PYTHON;
      if (PythonMLService.isEnabled()) {
        providerAttempts.push({ provider: PROVIDERS.ML_PYTHON, available: mlResult.available, reason: mlResult.reason || null });
      }
    }

    let candidates = keepCatalogCandidates(mlResult.predictions, knownIds);
    let confidence = DEFAULT_HEURISTIC_CONFIDENCE;

    if (mlResult.available && candidates.length > 0) {
      confidence = candidates[0].confidence_score ?? DEFAULT_ML_CONFIDENCE;
    } else {
      // Heuristic ranking fallback
      candidates = await HeuristicRanker.rank(features, null, catalog);
      providerUsed = PROVIDERS.HEURISTIC;
      confidence = candidates.length > 0 ? candidates[0].confidence_score : DEFAULT_HEURISTIC_CONFIDENCE;
    }

    // OpenAI adjudicator (if confidence is intermediate or ambiguous)
    let explanation = null;
    let primarySpecimenId = candidates.length > 0 ? candidates[0].specimen_id : null;

    if (confidence >= ADJUDICATION_MIN_CONFIDENCE && confidence <= ADJUDICATION_MAX_CONFIDENCE) {
      const adjudication = await OpenAIAdjudicator.adjudicate(candidates, features);
      if (adjudication.adjudicated) {
        providerUsed = PROVIDERS.OPENAI;
        if (knownIds.has(adjudication.primary_specimen_id)) {
          primarySpecimenId = adjudication.primary_specimen_id;
        }
        confidence = adjudication.confidence || confidence;
        explanation = adjudication.educational_explanation;

        const adjudicated = keepCatalogCandidates(adjudication.candidates, knownIds);
        if (adjudicated.length > 0) {
          candidates = adjudicated.map((candidate, index) => ({
            ...candidate,
            rank: index + 1,
            provider: PROVIDERS.OPENAI
          }));
        }
      }
    }

    // Educational text for the answer
    const primarySpecimen = catalog.find((specimen) => specimen.id === primarySpecimenId) || null;
    if (!explanation && primarySpecimen) {
      explanation = buildExplanation(primarySpecimen);
    }

    return {
      providerUsed,
      providerAttempts,
      mlResult,
      candidates,
      confidence,
      primarySpecimenId,
      primarySpecimen,
      explanation
    };
  }

  /**
   * Stores a recognition and everything it causes in one transaction: it either
   * happens completely or not at all.
   */
  static async persist({ userId, analysisId, storedFilename, features, identification, executionTimeMs }) {
    const {
      providerUsed, providerAttempts, mlResult, candidates, confidence, primarySpecimenId, explanation
    } = identification;

    return sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        throw new AppError(401, 'User associated with token no longer exists', ERROR_CODES.UNAUTHORIZED);
      }

      // Authoritative guest limit. The middleware in front of the upload is only a
      // cheap early exit: concurrent requests are serialized here.
      if (user.is_anonymous) {
        await GuestQuotaService.assertWithinLimit(userId, { transaction });
      }

      await Analysis.create({
        id: analysisId,
        user_id: userId,
        image_file: storedFilename,
        status: ANALYSIS_STATUS.COMPLETED,
        is_specimen: true,
        extracted_features: features,
        provider_used: providerUsed,
        ai_confidence: confidence,
        primary_specimen_id: primarySpecimenId,
        educational_explanation: explanation,
        refinement_status: REFINEMENT_STATUS.NONE,
        raw_ai_response: { ml_result: mlResult, provider_attempts: providerAttempts, candidates },
        execution_time_ms: executionTimeMs
      }, { transaction });

      // Save ranked candidates
      await AnalysisCandidate.bulkCreate(candidates.map((candidate, index) => ({
        id: uuidv4(),
        analysis_id: analysisId,
        specimen_id: candidate.specimen_id,
        rank: candidate.rank || (index + 1),
        confidence_score: candidate.confidence_score,
        provider: candidate.provider || providerUsed,
        rationale: candidate.rationale,
        is_selected: candidate.specimen_id === primarySpecimenId
      })), { transaction });

      const discovery = await CollectionService.recordRecognition({
        userId,
        specimenId: primarySpecimenId,
        analysisId,
        transaction
      });
      const unlockedAchievements = await AchievementService.evaluate(userId, ACHIEVEMENT_TRIGGERS.ANALYSIS, { transaction });
      const guestQuota = user.is_anonymous ? await GuestQuotaService.usage(userId, { transaction }) : null;

      return { discovery, unlockedAchievements, guestQuota };
    });
  }
}

module.exports = PipelineService;
