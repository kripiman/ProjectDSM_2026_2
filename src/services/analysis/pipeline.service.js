const { uuidv4 } = require('../../utils/uuid');
const PreprocessorService = require('./preprocessor.service');
const FeatureService = require('./feature.service');
const PythonMLService = require('../ai/python_ml.service');
const HeuristicRanker = require('../heuristics/heuristic_ranker');
const OpenAIAdjudicator = require('../ai/openai_adjudicator');
const { Analysis, AnalysisCandidate, Specimen, sequelize } = require('../../models');
const { ANALYSIS_STATUS, PROVIDERS } = require('../../config/constants');

class PipelineService {
  /**
   * Executes the full automated rock/mineral identification flow with fault-tolerant fallbacks.
   */
  static async processImage({ userId, filePath, originalFilename, storedFilename, simulateFlag = false }) {
    const startTime = Date.now();

    // 1. Preprocessing validation (specimen check -> 422 if invalid)
    await PreprocessorService.validateSpecimen(filePath, originalFilename, simulateFlag);

    // 2. Visual feature extraction
    const features = await FeatureService.extractFeatures(filePath);

    // 3. AI ML Provider attempt
    let mlResult = await PythonMLService.predict(filePath, features);
    let candidates = [];
    let providerUsed = PROVIDERS.HEURISTIC;
    let aiConfidence = 0.50;

    if (mlResult.available && mlResult.predictions.length > 0) {
      candidates = mlResult.predictions;
      providerUsed = PROVIDERS.ML_PYTHON;
      aiConfidence = candidates[0].confidence_score || 0.80;
    } else {
      // 4. Heuristic ranking fallback
      candidates = await HeuristicRanker.rank(features);
      providerUsed = PROVIDERS.HEURISTIC;
      aiConfidence = candidates.length > 0 ? candidates[0].confidence_score : 0.50;
    }

    // 5. OpenAI Adjudicator (if confidence is intermediate or ambiguous)
    let educationalExplanation = null;
    let primarySpecimenId = candidates.length > 0 ? candidates[0].specimen_id : null;

    if (aiConfidence >= 0.40 && aiConfidence <= 0.75) {
      const adjudication = await OpenAIAdjudicator.adjudicate(candidates, features);
      if (adjudication.adjudicated) {
        providerUsed = PROVIDERS.OPENAI;
        primarySpecimenId = adjudication.primary_specimen_id || primarySpecimenId;
        aiConfidence = adjudication.confidence || aiConfidence;
        educationalExplanation = adjudication.educational_explanation;
        if (adjudication.candidates && adjudication.candidates.length > 0) {
          candidates = adjudication.candidates.map((c, i) => ({
            ...c,
            rank: i + 1,
            provider: 'openai'
          }));
        }
      }
    }

    // Ensure we have specimen details for educational response
    const topSpecimen = await Specimen.findByPk(primarySpecimenId);
    if (!educationalExplanation && topSpecimen) {
      educationalExplanation = `Identificado como ${topSpecimen.name_es} (${topSpecimen.category}) debido a su ${topSpecimen.luster.toLowerCase()} y características de fractura ${topSpecimen.fracture.toLowerCase()}. ${topSpecimen.description}`;
    }

    // Build dynamic refinement questions (HU-06)
    const refinementQuestions = [
      {
        question_type: 'hardness',
        prompt: '¿La muestra puede ser rayada con una moneda de cobre o una uña?',
        options: ['Se raya con la uña (Muy blando < 2.5)', 'Se raya con una moneda (Blando ~3)', 'Raya el vidrio (Duro >= 6)', 'No tengo cómo probar']
      },
      {
        question_type: 'streak',
        prompt: 'Al frotarla contra una superficie de porcelana sin esmaltar (o baldosa), ¿qué color de polvo deja?',
        options: ['Raya blanca o incolora', 'Raya negra o verdosa oscura', 'Raya rojiza / marrón', 'No deja raya']
      },
      {
        question_type: 'magnetism',
        prompt: '¿La roca o mineral es atraído por un imán común?',
        options: ['Sí, fuertemente magnético', 'No, nada magnético', 'Atracción débil']
      }
    ];

    const executionTimeMs = Date.now() - startTime;
    const analysisId = uuidv4();

    // 6. Persistence in SQLite
    const transaction = await sequelize.transaction();
    try {
      const analysisRecord = await Analysis.create({
        id: analysisId,
        user_id: userId,
        image_url: `/uploads/analyses/${storedFilename || originalFilename}`,
        status: ANALYSIS_STATUS.COMPLETED,
        is_specimen: true,
        extracted_features: features,
        provider_used: providerUsed,
        ai_confidence: aiConfidence,
        primary_specimen_id: primarySpecimenId,
        educational_explanation: educationalExplanation,
        refinement_status: 'none',
        raw_ai_response: { ml_result: mlResult, candidates },
        execution_time_ms: executionTimeMs
      }, { transaction });

      // Save ranked candidates
      for (const [idx, cand] of candidates.entries()) {
        await AnalysisCandidate.create({
          id: uuidv4(),
          analysis_id: analysisId,
          specimen_id: cand.specimen_id,
          rank: cand.rank || (idx + 1),
          confidence_score: cand.confidence_score,
          provider: cand.provider || providerUsed,
          rationale: cand.rationale,
          is_selected: cand.specimen_id === primarySpecimenId
        }, { transaction });
      }

      await transaction.commit();

      return {
        analysis_id: analysisId,
        status: ANALYSIS_STATUS.COMPLETED,
        provider_used: providerUsed,
        confidence: aiConfidence,
        primary_specimen: topSpecimen,
        educational_explanation: educationalExplanation,
        candidates,
        features,
        refinement_questions: refinementQuestions,
        execution_time_ms: executionTimeMs
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = PipelineService;
