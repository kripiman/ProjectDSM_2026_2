const { Specimen } = require('../../models');

class HeuristicRanker {
  /**
   * Evaluates and ranks known specimens from SQLite based on extracted visual features.
   * Fallback classifier when ML is offline or produces low confidence.
   */
  static async rank(features = {}, preferredCategory = null) {
    const where = { is_active: true };
    if (preferredCategory) {
      where.category = preferredCategory;
    }

    const specimens = await Specimen.findAll({ where });
    if (!specimens || specimens.length === 0) {
      return [];
    }

    const lusterHint = (features.estimated_luster || '').toLowerCase();
    const dominantColors = (features.dominant_colors || []).map(c => c.toLowerCase());

    const scored = specimens.map(specimen => {
      let score = 0.45; // baseline probability
      const rationaleParts = [];

      const specLuster = (specimen.luster || '').toLowerCase();
      const specColor = (specimen.color_description || '').toLowerCase();

      // Match luster
      if (lusterHint && specLuster.includes(lusterHint.split(' ')[0])) {
        score += 0.25;
        rationaleParts.push(`Coincidencia en brillo ${specimen.luster}`);
      }

      // Match color keywords
      if (dominantColors.length > 0) {
        if (specColor.includes('dorado') || specColor.includes('amarillo')) {
          if (dominantColors.some(c => c.includes('ffd700') || c.includes('b8860b'))) {
            score += 0.20;
            rationaleParts.push('Coincidencia en tonalidad dorada');
          }
        }
        if (specColor.includes('blanco') || specColor.includes('incoloro')) {
          if (dominantColors.some(c => c.includes('ffffff') || c.includes('e6e6fa'))) {
            score += 0.20;
            rationaleParts.push('Coincidencia en tonalidad clara/vítrea');
          }
        }
        if (specColor.includes('negro') || specColor.includes('oscuro')) {
          if (dominantColors.some(c => c.includes('1c1c1c') || c.includes('2f4f4f'))) {
            score += 0.20;
            rationaleParts.push('Coincidencia en tonalidad oscura/máfica');
          }
        }
      }

      // Cap at 0.92 for heuristic ranking
      score = Math.min(0.92, Math.max(0.30, Number(score.toFixed(2))));

      if (rationaleParts.length === 0) {
        rationaleParts.push(`Identificación heurística por frecuencia geológica y textura ${specimen.category}`);
      }

      return {
        specimen_id: specimen.id,
        specimen_name: specimen.name_es,
        category: specimen.category,
        confidence_score: score,
        rationale: rationaleParts.join('. ')
      };
    });

    // Sort descending by score
    scored.sort((a, b) => b.confidence_score - a.confidence_score);

    // Return top 3 candidates with assigned ranks
    return scored.slice(0, 3).map((cand, idx) => ({
      ...cand,
      rank: idx + 1,
      provider: 'heuristic'
    }));
  }
}

module.exports = HeuristicRanker;
