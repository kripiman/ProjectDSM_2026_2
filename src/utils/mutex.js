/**
 * Minimal FIFO mutex for async code: tasks passed to `runExclusive` run one at a
 * time, in the order they were submitted.
 */
class AsyncMutex {
  /**
   * @param {number} [maxWaitMs] How long a task may wait for its turn before giving up.
   *   It guards against a task that never finishes stalling every other one.
   */
  constructor(maxWaitMs = 30000) {
    this.maxWaitMs = maxWaitMs;
    this.tail = Promise.resolve();
  }

  /**
   * Runs `task` once every task submitted before it has finished. If the wait exceeds
   * `maxWaitMs` the returned promise rejects and `task` never runs; the turn is passed
   * on only after the task ahead actually finishes, so exclusion is never broken.
   *
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  runExclusive(task) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });

    let gaveUp = false;
    const waitForTurn = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        gaveUp = true;
        reject(new Error('Timed out waiting for the database write lock'));
      }, this.maxWaitMs);

      previous.then(() => {
        clearTimeout(timer);
        if (gaveUp) {
          release();
        } else {
          resolve();
        }
      });
    });

    return waitForTurn.then(task).finally(() => {
      if (!gaveUp) {
        release();
      }
    });
  }
}

module.exports = {
  AsyncMutex
};
