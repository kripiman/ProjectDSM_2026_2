/**
 * Counts attempts per key and blocks a key once it has used all of them. The state
 * lives in memory (one Node process) and is bounded, so a flood of different keys
 * cannot grow it without limit.
 *
 * Every allowed attempt (re)inserts its key last with a new expiry, and the expiry
 * is always `lockMs` away: the map is therefore ordered by expiry, oldest first.
 */
class AttemptLimiter {
  /**
   * @param {object} options
   * @param {number} options.maxAttempts Attempts a key may use before it is blocked.
   * @param {number} options.lockMs How long a key that used them all stays blocked, and
   *   how long unused attempts are remembered, counted from its last allowed attempt.
   * @param {number} [options.maxEntries] Keys remembered at once.
   * @param {() => number} [options.now] Clock in milliseconds. It must never go back, so
   *   the default is not the wall clock; tests replace it.
   */
  constructor({ maxAttempts, lockMs, maxEntries = 100000, now = () => performance.now() }) {
    this.maxAttempts = maxAttempts;
    this.lockMs = lockMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map(); // key -> { attempts, expiresAt }
  }

  /**
   * Reserves one attempt for `key` before it is known how it ends, so concurrent
   * requests cannot all slip in under the limit. The caller reports the outcome
   * afterwards with `clear` or `refund`.
   * @returns {{ allowed: true } | { allowed: false, retryAfterMs: number }}
   */
  consume(key) {
    const now = this.now();
    const entry = this.current(key, now);

    if (entry && entry.attempts >= this.maxAttempts) {
      // A refused attempt changes nothing: hammering a blocked key does not extend its block.
      return { allowed: false, retryAfterMs: entry.expiresAt - now };
    }

    this.entries.delete(key); // inserted last again: the map stays ordered by expiry
    this.entries.set(key, { attempts: (entry ? entry.attempts : 0) + 1, expiresAt: now + this.lockMs });
    while (this.entries.size > this.maxEntries) {
      this.evictOne(now, key);
    }

    return { allowed: true };
  }

  /** The attempt succeeded: the key starts over. */
  clear(key) {
    this.entries.delete(key);
  }

  /** The attempt did not fail on its merits (for instance the service errored): give it back. */
  refund(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    if (entry.attempts <= 1) {
      this.entries.delete(key);
    } else {
      entry.attempts -= 1;
    }
  }

  reset() {
    this.entries.clear();
  }

  /** The live entry of a key; one whose time ran out is forgotten. */
  current(key, now) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Makes room for one key, never the one just inserted (`keep`). An entry whose time ran
   * out goes first; then the oldest key that is not blocked yet, so flooding with other
   * keys cannot free a blocked one; a blocked key only goes when every other key is blocked.
   */
  evictOne(now, keep) {
    const [oldestKey, oldest] = this.entries.entries().next().value;
    if (oldest.expiresAt <= now) {
      this.entries.delete(oldestKey);
      return;
    }

    for (const [key, entry] of this.entries) {
      if (key !== keep && entry.attempts < this.maxAttempts) {
        this.entries.delete(key);
        return;
      }
    }
    this.entries.delete(oldestKey);
  }
}

module.exports = {
  AttemptLimiter
};
