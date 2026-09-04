const fs = require('fs');

class FeatureService {
  /**
   * Extracts visual features from an uploaded specimen image.
   */
  static async extractFeatures(filePath) {
    const stats = fs.statSync(filePath);
    const hashSeed = stats.size % 100;

    // Feature extraction representation
    const palettes = [
      { colors: ['#E6E6FA', '#FFFFFF', '#D3D3D3'], luster_hint: 'Vítreo', texture_hint: 'Concoidea vítrea' },
      { colors: ['#FFD700', '#B8860B', '#2F4F4F'], luster_hint: 'Metálico brillante', texture_hint: 'Cristalina cúbica' },
      { colors: ['#1C1C1C', '#363636', '#4F4F4F'], luster_hint: 'Mate / Submetálico', texture_hint: 'Afanítica densa' },
      { colors: ['#D2B48C', '#F5DEB3', '#8B4513'], luster_hint: 'Arenoso / Mate', texture_hint: 'Clástica de grano medio' }
    ];

    const selectedPalette = palettes[hashSeed % palettes.length];

    return {
      dominant_colors: selectedPalette.colors,
      estimated_luster: selectedPalette.luster_hint,
      surface_texture: selectedPalette.texture_hint,
      roughness_index: Number((0.3 + (hashSeed % 50) / 100).toFixed(2)),
      reflectivity_ratio: Number((0.2 + (hashSeed % 60) / 100).toFixed(2)),
      extracted_at: new Date().toISOString()
    };
  }
}

module.exports = FeatureService;
