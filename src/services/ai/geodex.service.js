const crypto = require('crypto');
const fs = require('fs');
const { uuidv4 } = require('../../utils/uuid');
const { stripDiacritics } = require('../../utils/text');
const logger = require('../../utils/logger');
const env = require('../../config/env');
const { PROVIDERS, MAX_UPLOAD_BYTES } = require('../../config/constants');

const IDENTIFY_PATH = '/api/v1/identify';
const TOP_K = 3;
const DEFAULT_MIME_TYPE = 'image/jpeg';
const DEFAULT_RATIONALE = 'Identificación sugerida por el modelo GeoDex';

// A key is limited to a few dozen queries per day. When the service refuses ours (wrong
// key, quota used up) asking again does not help, so the provider is skipped for a
// while: recognitions go straight to the next provider instead of uploading a photo
// just to have it rejected again.
const REJECTION_STATUSES = new Set([401, 403, 429]);
const DEFAULT_PAUSE_MS = 15 * 60 * 1000;
const MAX_PAUSE_MS = 24 * 60 * 60 * 1000;

// Successful answers are remembered, so sending the same photo again costs no query.
const ANSWER_CACHE_SIZE = 100;

let pausedUntil = 0;
let pauseCause = '';
const answers = new Map();

// A successful answer of POST /api/v1/identify, as returned by the live service:
//   {
//     success: true, request_id, model: { name, provider },
//     result: { label, confidence, specimen_id, catalog_match, ... },     // best match
//     predictions: [{                                                      // ranked
//       specimen_id,      // id of one of the candidates sent
//       label,            // name the model gave it
//       confidence,       // a percentage from 0 to 100 (not a fraction): 97 means 97 %
//       reasoning, catalog_match, catalog: { name_en, name_es, scientific_name, category }
//     }],
//     notes, warnings, limitations
//   }

const normalizeText = (value) => stripDiacritics(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The ranked list of an answer, or its best match alone when the list is missing. */
const extractItems = (body) => {
  if (!isObject(body)) {
    return [];
  }
  const ranked = Array.isArray(body.predictions) ? body.predictions.filter(isObject) : [];
  if (ranked.length > 0) {
    return ranked;
  }
  return isObject(body.result) ? [body.result] : [];
};

/** Converts the percentage of the API into the 0-1 scale used everywhere else. */
const toConfidence = (raw) => {
  const percentage = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  if (typeof percentage !== 'number' || Number.isNaN(percentage)) {
    return null;
  }
  return Number((Math.min(100, Math.max(0, percentage)) / 100).toFixed(2));
};

/** Sends the local catalog so the model can answer with entries the app knows. */
const toCandidate = (specimen) => ({
  id: specimen.id,
  name_en: specimen.name_en,
  name_es: specimen.name_es,
  scientific_name: specimen.scientific_name,
  category: specimen.category
});

const requestKey = (image, candidates) => crypto
  .createHash('sha256')
  .update(image)
  .update(JSON.stringify(candidates))
  .digest('hex');

const recallAnswer = (key) => {
  if (!answers.has(key)) {
    return null;
  }
  const answer = answers.get(key);
  answers.delete(key); // the most recently used goes last
  answers.set(key, answer);
  return structuredClone(answer);
};

const rememberAnswer = (key, answer) => {
  answers.delete(key);
  answers.set(key, structuredClone(answer));
  if (answers.size > ANSWER_CACHE_SIZE) {
    answers.delete(answers.keys().next().value);
  }
};

/** Stops asking for as long as the service says so (Retry-After), or for a default time. */
const pauseProvider = (response, cause) => {
  const retryAfter = Number(response.headers && response.headers.get && response.headers.get('retry-after'));
  const duration = retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_PAUSE_MS) : DEFAULT_PAUSE_MS;
  pausedUntil = Date.now() + duration;
  pauseCause = cause;
  logger.warn(`[GeoDex] no more queries will be sent until ${new Date(pausedUntil).toISOString()}`);
};

class GeoDexService {
  /** How many answers are remembered. */
  static ANSWER_CACHE_SIZE = ANSWER_CACHE_SIZE;

  /**
   * The provider is used only when an API key is configured (the test suite never
   * configures one, so the daily quota of a real key is not consumed).
   */
  static isEnabled() {
    return Boolean(env.GEODEX_API_KEY);
  }

  /** Forgets the pause and the remembered answers. */
  static reset() {
    pausedUntil = 0;
    pauseCause = '';
    answers.clear();
  }

  /**
   * Builds lookups that resolve whatever the API names an item to a local specimen.
   */
  static buildCatalogIndex(catalog) {
    const byId = new Map();
    const byName = new Map();

    for (const specimen of catalog) {
      byId.set(normalizeText(specimen.id), specimen);
      // Scientific names are not indexed: several specimens share one ("Calcium Carbonate").
      for (const label of [specimen.id, specimen.name_en, specimen.name_es]) {
        if (!label) continue;
        const normalized = normalizeText(label);
        if (!byName.has(normalized)) {
          byName.set(normalized, specimen);
        }
      }
    }
    return { byId, byName };
  }

  /**
   * The API echoes the id of the candidate it chose; the name it gave is the fallback.
   * Names must match exactly: "quartzite" is not "quartz".
   */
  static resolveSpecimen(item, index) {
    if (typeof item.specimen_id === 'string') {
      const byId = index.byId.get(normalizeText(item.specimen_id));
      if (byId) return byId;
    }
    return typeof item.label === 'string' ? index.byName.get(normalizeText(item.label)) || null : null;
  }

  /**
   * Converts an API response into ranked predictions over the local catalog.
   * Items that cannot be matched to a catalog entry are dropped.
   * @returns {Array<{specimen_id: string, specimen_name: string, category: string, confidence_score: number, rationale: string, rank: number, provider: string}>}
   */
  static normalizeResponse(body, catalog, topK = TOP_K) {
    const index = GeoDexService.buildCatalogIndex(catalog);
    const seen = new Set();
    const predictions = [];

    for (const item of extractItems(body)) {
      const specimen = GeoDexService.resolveSpecimen(item, index);
      const confidence = toConfidence(item.confidence !== undefined ? item.confidence : item.score);
      if (!specimen || confidence === null || seen.has(specimen.id)) {
        continue;
      }
      seen.add(specimen.id);

      predictions.push({
        specimen_id: specimen.id,
        specimen_name: specimen.name_es,
        category: specimen.category,
        confidence_score: confidence,
        rationale: typeof item.reasoning === 'string' && item.reasoning.trim() !== '' ? item.reasoning.trim() : DEFAULT_RATIONALE,
        provider: PROVIDERS.GEODEX
      });
    }

    return predictions
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, topK)
      .map((prediction, position) => ({ ...prediction, rank: position + 1 }));
  }

  /**
   * Asks the GeoDex identification API to recognise a photo.
   * It never throws: when the service is disabled, paused, slow, over quota or returns
   * nothing usable, the result is `available: false` and the caller falls back to
   * the next provider. A photo sent before is answered from memory (`cached: true`).
   *
   * @param {object} input
   * @param {string} input.filePath Stored image.
   * @param {string} [input.mimeType]
   * @param {Array} input.catalog Active specimens of the local catalog.
   */
  static async identify({ filePath, mimeType, catalog = [] }) {
    if (!GeoDexService.isEnabled()) {
      return { available: false, reason: 'GeoDex provider is not enabled', predictions: [] };
    }

    if (Date.now() < pausedUntil) {
      return {
        available: false,
        reason: `GeoDex paused until ${new Date(pausedUntil).toISOString()} after ${pauseCause}`,
        predictions: []
      };
    }

    // A failed attempt is logged: the recognition continues with another provider, so
    // without the log nobody would notice an invalid key or an exhausted quota.
    const fail = (reason, extra = {}) => {
      logger.warn(`[GeoDex] ${reason}; using the next recognition provider`);
      return { available: false, reason, predictions: [], ...extra };
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.GEODEX_TIMEOUT_MS);

    try {
      const image = await fs.promises.readFile(filePath);
      if (image.length > MAX_UPLOAD_BYTES) {
        return fail('Image exceeds the size accepted by GeoDex');
      }

      const candidates = catalog.map(toCandidate);
      const key = requestKey(image, candidates);
      const remembered = recallAnswer(key);
      if (remembered) {
        return { ...remembered, cached: true };
      }

      const response = await fetch(`${env.GEODEX_API_URL}${IDENTIFY_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GEODEX_API_KEY}`
        },
        body: JSON.stringify({
          request_id: uuidv4(),
          image: { base64: image.toString('base64'), mime_type: mimeType || DEFAULT_MIME_TYPE },
          candidates,
          top_k: TOP_K
        }),
        signal: controller.signal
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = body && body.error && body.error.code;
        const cause = `HTTP ${response.status}${code ? ` (${code})` : ''}`;
        if (REJECTION_STATUSES.has(response.status)) {
          pauseProvider(response, cause);
        }
        return fail(`GeoDex returned ${cause}`);
      }

      const predictions = GeoDexService.normalizeResponse(body, catalog, TOP_K);
      if (predictions.length === 0) {
        return fail('GeoDex returned no result that matches the local catalog', { raw: body });
      }

      const answer = { available: true, provider: PROVIDERS.GEODEX, predictions, raw: body };
      rememberAnswer(key, answer);
      return answer;
    } catch (error) {
      return fail(error.name === 'AbortError' ? `GeoDex timeout after ${env.GEODEX_TIMEOUT_MS} ms` : `GeoDex unavailable: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = GeoDexService;
