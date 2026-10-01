const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const env = require('../config/env');
const logger = require('./logger');
const { initDatabase } = require('../database/init');
const apiRouter = require('../routers/api.router');
const { errorHandler } = require('../middlewares/error.middleware');
const { rejectNullBytes } = require('../middlewares/null_bytes.middleware');
const { ERROR_CODES, UPLOAD_URL_PREFIXES } = require('../config/constants');
const { successResponse, errorResponse } = require('./response_formatter');

class Server {
  constructor() {
    this.app = express();
    this.port = env.PORT;

    this.middlewares();
    this.routes();
    this.errorHandling();
  }

  middlewares() {
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', env.TRUST_PROXY);
    this.app.use(cors());
    if (!env.isTest) {
      this.app.use(morgan('dev'));
    }
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Express 5 leaves `req.body` undefined when a request carries no parsable body.
    this.app.use((req, res, next) => {
      if (req.body === undefined) {
        req.body = {};
      }
      next();
    });
    this.app.use(rejectNullBytes);

    // Catalog pictures are public. They are served as-is, never sniffed into another
    // content type. The photos of recognitions are not mounted here: they are private
    // and only GET /analysis/:id/image sends them.
    const staticOptions = {
      index: false,
      dotfiles: 'ignore',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    };
    this.app.use(UPLOAD_URL_PREFIXES.SPECIMENS, express.static(path.resolve(process.cwd(), env.SPECIMEN_UPLOAD_DIR), staticOptions));
  }

  routes() {
    // Health Check
    this.app.get('/health', (req, res) => {
      return successResponse(res, {
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'ProjectDSM Rock Analysis Backend'
      }, 'Service healthy');
    });

    // API Routes
    this.app.use('/', apiRouter);

    // 404 Fallback
    this.app.use((req, res) => {
      return errorResponse(res, `Endpoint ${req.method} ${req.originalUrl} not found`, 404, ERROR_CODES.NOT_FOUND);
    });
  }

  errorHandling() {
    this.app.use(errorHandler);
  }

  async start() {
    // Connects, creates any missing table and seeds the reference data (roles,
    // taxonomy, administrator, ...). Every step is idempotent.
    await initDatabase(false);
    return new Promise((resolve) => {
      const serverInstance = this.app.listen(this.port, () => {
        logger.info(`[Server] ProjectDSM backend running on port ${this.port} in ${env.NODE_ENV} mode`);
        resolve(serverInstance);
      });
    });
  }
}

module.exports = Server;
