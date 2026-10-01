/**
 * `instance.update(values)` saves only the fields it was given. A value that a hook
 * adjusts on its own (a denormalized copy, a derived column, ...) must be added to
 * that list, otherwise it changes in memory but never reaches the database.
 *
 * @param {import('sequelize').Model} instance
 * @param {{ fields?: string[] }} options The options object received by the hook.
 * @param {string[]} fields Attributes the hook may have modified.
 */
const persistHookChanges = (instance, options, fields) => {
  if (!Array.isArray(options.fields)) {
    return;
  }
  for (const field of fields) {
    if (instance.changed(field) && !options.fields.includes(field)) {
      options.fields.push(field);
    }
  }
};

module.exports = {
  persistHookChanges
};
