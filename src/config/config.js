require('dotenv').config({ quiet: true });
const path = require('path');

const storagePath = path.resolve(process.cwd(), process.env.DATABASE_STORAGE || './rock.sqlite');

module.exports = {
  development: {
    dialect: 'sqlite',
    storage: storagePath,
    logging: (msg) => console.log(`[Sequelize-CLI] ${msg}`)
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  },
  production: {
    dialect: 'sqlite',
    storage: storagePath,
    logging: false
  }
};
