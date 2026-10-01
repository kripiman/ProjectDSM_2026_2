const env = require('../config/env');

// Console output of the application. It is silent under test so suites stay readable.
const write = (method) => (...args) => {
  if (!env.isTest) {
    console[method](...args);
  }
};

module.exports = {
  info: write('log'),
  warn: write('warn'),
  error: write('error')
};
