const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const env = require('../config/env');
const { connectDB } = require('../config/database');
const apiRouter = require('../routers/api.router');
const { errorHandler } = require('../middlewares/error.middleware');
const { successResponse } = require('./response_formatter');

class Server {
  constructor() {
    this.app = express();
    this.port = env.PORT;

    this.middlewares();
    this.routes();
    this.errorHandling();
  }

  middlewares() {
    this.app.use(cors());
    if (env.NODE_ENV !== 'test') {
      this.app.use(morgan('dev'));
    }
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Static uploads directory for images
    const uploadsPath = path.resolve(process.cwd(), 'uploads');
    this.app.use('/uploads', express.static(uploadsPath));
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
    this.app.use((req, res, next) => {
      res.status(404).json({
        success: false,
        statusCode: 404,
        errorCode: '404_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
      });
    });
  }

  errorHandling() {
    this.app.use(errorHandler);
  }

  async start() {
    await connectDB();
    return new Promise((resolve) => {
      const serverInstance = this.app.listen(this.port, () => {
        console.log(`[Server] ProjectDSM backend running on port ${this.port} in ${env.NODE_ENV} mode`);
        resolve(serverInstance);
      });
    });
  }
}

module.exports = Server;
