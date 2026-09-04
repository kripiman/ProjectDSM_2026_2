const env = require('../../config/env');

class PythonMLService {
  /**
   * Pluggable client to the Python ML microservice.
   * Tolerant to missing ML servers (falls back cleanly).
   */
  static async predict(imagePath, features = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.ML_TIMEOUT_MS);

    try {
      // In production/integration, sends multipart/form-data or path to ML_SERVER_URL/predict
      const response = await fetch(`${env.ML_SERVER_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: imagePath, features }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          available: false,
          error: `Python ML server returned HTTP ${response.status}`,
          predictions: []
        };
      }

      const data = await response.json();
      return {
        available: true,
        provider: 'ml_python',
        predictions: data.predictions || []
      };
    } catch (error) {
      clearTimeout(timeoutId);
      // Graceful fallback when Python server is not yet deployed / offline
      return {
        available: false,
        reason: error.name === 'AbortError' ? 'ML Server timeout' : 'ML Server unavailable',
        predictions: []
      };
    }
  }
}

module.exports = PythonMLService;
