const env = require('../../config/env');
const { PROVIDERS } = require('../../config/constants');

class PythonMLService {
  /**
   * The local Python microservice is optional: it is only queried when ML_SERVER_URL
   * is configured.
   */
  static isEnabled() {
    return Boolean(env.ML_SERVER_URL);
  }

  /**
   * Pluggable client to the Python ML microservice.
   * Tolerant to missing ML servers (falls back cleanly).
   */
  static async predict(imagePath, features = {}) {
    if (!PythonMLService.isEnabled()) {
      return { available: false, reason: 'Python ML provider is not enabled', predictions: [] };
    }

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
          reason: `Python ML server returned HTTP ${response.status}`,
          predictions: []
        };
      }

      const data = await response.json();
      return {
        available: true,
        provider: PROVIDERS.ML_PYTHON,
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
