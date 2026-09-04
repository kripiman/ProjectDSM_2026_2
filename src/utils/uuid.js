const crypto = require('crypto');

const uuidv4 = () => crypto.randomUUID();

module.exports = {
  uuidv4
};
