const env = require('../../config/env');

class OpenAIAdjudicator {
  /**
   * Adjudicates ambiguous classifications using OpenAI LLM.
   * Resolves close candidates using physical properties and educational reasoning.
   */
  static async adjudicate(candidates = [], features = {}, refinementAnswers = []) {
    if (!env.OPENAI_API_KEY || candidates.length === 0) {
      return {
        adjudicated: false,
        reason: 'OpenAI API key not configured or no candidates provided',
        candidates
      };
    }

    try {
      const prompt = `
Eres un experto mineralogista y geólogo. Analiza los siguientes candidatos propuestos para una muestra geológica:
Candidatos: ${JSON.stringify(candidates)}
Características visuales extraídas: ${JSON.stringify(features)}
Respuestas de refinamiento del usuario: ${JSON.stringify(refinementAnswers)}

Determina cuál es el candidato más probable, justifica educativamente la elección y reordena los puntajes de confianza.
Responde estrictamente en formato JSON con la siguiente estructura:
{
  "primary_specimen_id": "id_del_mejor_candidato",
  "confidence": 0.85,
  "educational_explanation": "Explicación clara y didáctica...",
  "updated_candidates": [
    { "specimen_id": "...", "confidence_score": 0.85, "rationale": "..." }
  ]
}
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un adjudicador geológico experto y pedagógico. Responde siempre en JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (!response.ok) {
        return {
          adjudicated: false,
          reason: `OpenAI API returned HTTP ${response.status}`,
          candidates
        };
      }

      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);

      return {
        adjudicated: true,
        provider: 'openai',
        primary_specimen_id: content.primary_specimen_id,
        confidence: content.confidence,
        educational_explanation: content.educational_explanation,
        candidates: content.updated_candidates || candidates
      };
    } catch (error) {
      return {
        adjudicated: false,
        reason: `OpenAI adjudication failed: ${error.message}`,
        candidates
      };
    }
  }
}

module.exports = OpenAIAdjudicator;
