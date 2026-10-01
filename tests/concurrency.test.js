const { sequelize } = require('../src/models');
const { AsyncMutex } = require('../src/utils/mutex');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('AsyncMutex', () => {
  test('runs tasks one at a time, in the order they were submitted', async () => {
    const mutex = new AsyncMutex();
    const events = [];
    const task = (name, ms) => mutex.runExclusive(async () => {
      events.push(`${name}:start`);
      await delay(ms);
      events.push(`${name}:end`);
      return name;
    });

    // The first task is the slowest: the others must still wait for it.
    const results = await Promise.all([task('a', 30), task('b', 1), task('c', 10)]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  test('never lets two tasks overlap, however many are queued', async () => {
    const mutex = new AsyncMutex();
    const finished = [];
    let running = 0;
    let mostAtOnce = 0;

    await Promise.all(Array.from({ length: 50 }, (_, index) => mutex.runExclusive(async () => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      finished.push(index);
    })));

    expect(mostAtOnce).toBe(1);
    expect(finished).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  test('returns what the task returns and passes its error on', async () => {
    const mutex = new AsyncMutex();
    await expect(mutex.runExclusive(async () => ({ value: 42 }))).resolves.toEqual({ value: 42 });
    await expect(mutex.runExclusive(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  test('a task that fails, even by throwing at once, releases the turn for the next one', async () => {
    const mutex = new AsyncMutex();
    const rejected = mutex.runExclusive(async () => { throw new Error('boom'); });
    const thrown = mutex.runExclusive(() => { throw new Error('thrown at once'); });
    const next = mutex.runExclusive(async () => 'still works');

    await expect(rejected).rejects.toThrow('boom');
    await expect(thrown).rejects.toThrow('thrown at once');
    await expect(next).resolves.toBe('still works');
  });

  describe('when the wait is too long', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test('the waiting task gives up without running, and the one ahead keeps its exclusive turn', async () => {
      jest.useFakeTimers();
      const mutex = new AsyncMutex(1000);
      const holder = deferred();
      const order = [];

      const first = mutex.runExclusive(async () => {
        order.push('first:start');
        await holder.promise;
        order.push('first:end');
      });
      const abandoned = mutex.runExclusive(async () => {
        order.push('abandoned:start');
      });
      const abandonedOutcome = expect(abandoned).rejects.toThrow(/Timed out waiting for the database write lock/);

      await jest.advanceTimersByTimeAsync(1001);
      await abandonedOutcome;

      // Giving up did not hand the turn to anyone: a later task still waits for the first one.
      const third = mutex.runExclusive(async () => {
        order.push('third:start');
        return 'third';
      });
      await jest.advanceTimersByTimeAsync(900);
      expect(order).toEqual(['first:start']);

      holder.resolve();
      await first;
      await expect(third).resolves.toBe('third');
      expect(order).toEqual(['first:start', 'first:end', 'third:start']);
    });

    test('a task that gets its turn in time is not affected by the limit', async () => {
      jest.useFakeTimers();
      const mutex = new AsyncMutex(1000);
      const holder = deferred();

      const first = mutex.runExclusive(() => holder.promise);
      const second = mutex.runExclusive(async () => 'on time');

      await jest.advanceTimersByTimeAsync(999);
      holder.resolve();
      await first;
      await expect(second).resolves.toBe('on time');

      await jest.advanceTimersByTimeAsync(5000); // its timer was cancelled: nothing fires later
      await expect(mutex.runExclusive(async () => 'next')).resolves.toBe('next');
    });
  });
});

describe('Managed transactions', () => {
  const insert = (value, transaction) => sequelize.query('INSERT INTO transaction_probe (value) VALUES (?)', { replacements: [value], transaction });
  const stored = async () => (await sequelize.query('SELECT value FROM transaction_probe ORDER BY id', { type: 'SELECT' })).map((row) => row.value);

  beforeAll(async () => {
    await sequelize.query('CREATE TABLE transaction_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)');
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM transaction_probe');
  });

  test('what a transaction wrote is kept when it finishes and discarded when it fails', async () => {
    await sequelize.transaction(async (transaction) => {
      await insert('kept', transaction);
    });
    await expect(sequelize.transaction(async (transaction) => {
      await insert('discarded', transaction);
      throw new Error('abort');
    })).rejects.toThrow('abort');

    expect(await stored()).toEqual(['kept']);
  });

  test('concurrent transactions run one after another, in the order they were started', async () => {
    const events = [];
    const run = (name, ms) => sequelize.transaction(async (transaction) => {
      events.push(`${name}:start`);
      await insert(name, transaction);
      await delay(ms);
      events.push(`${name}:end`);
    });

    await Promise.all([run('a', 30), run('b', 1), run('c', 1)]);

    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(await stored()).toEqual(['a', 'b', 'c']);
  });

  test('a transaction that fails does not hold up the ones queued behind it', async () => {
    const failing = sequelize.transaction(async (transaction) => {
      await insert('failed', transaction);
      throw new Error('abort');
    });
    const following = [
      sequelize.transaction((transaction) => insert('first after', transaction)),
      sequelize.transaction((transaction) => insert('second after', transaction))
    ];

    await expect(failing).rejects.toThrow('abort');
    await Promise.all(following);
    expect(await stored()).toEqual(['first after', 'second after']);
  });

  test('many concurrent writers all succeed instead of failing with SQLITE_BUSY', async () => {
    const writers = 64;
    const outcomes = await Promise.allSettled(Array.from({ length: writers }, (_, index) => (
      sequelize.transaction(async (transaction) => {
        await insert(`writer ${index}`, transaction);
        await delay(1);
      })
    )));

    expect(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason.message)).toEqual([]);
    expect(await stored()).toHaveLength(writers);
  });

  test('starting another managed transaction inside one without passing it fails at once, instead of waiting for itself', async () => {
    const outcome = sequelize.transaction(async (transaction) => {
      await insert('outer', transaction);
      await sequelize.transaction(async (inner) => insert('inner', inner));
    });

    await expect(outcome).rejects.toThrow(/inside another managed transaction/);
    expect(await stored()).toEqual([]); // the outer transaction was rolled back with it

    // The failure released the turn.
    await sequelize.transaction((transaction) => insert('after', transaction));
    expect(await stored()).toEqual(['after']);
  });

  test('passing the parent transaction is allowed, and a failed nested one only undoes its own work', async () => {
    await sequelize.transaction(async (transaction) => {
      await insert('outer', transaction);
      await sequelize.transaction({ transaction }, async (nested) => insert('nested', nested));
      await sequelize.transaction({ transaction }, async (nested) => {
        await insert('nested that fails', nested);
        throw new Error('nested failure');
      }).catch(() => {});
    });

    expect(await stored()).toEqual(['outer', 'nested']);
  });

  test('queries that are not part of a transaction are not held back by the queue', async () => {
    const holder = deferred();
    const writing = sequelize.transaction(async (transaction) => {
      await insert('in progress', transaction);
      await holder.promise;
    });
    await delay(20); // the transaction owns the write lock by now

    expect(await sequelize.query('SELECT 1 AS alive', { type: 'SELECT' })).toEqual([{ alive: 1 }]);

    holder.resolve();
    await writing;
    expect(await stored()).toEqual(['in progress']);
  });
});
