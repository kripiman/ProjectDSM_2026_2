const { uuidv4 } = require('../utils/uuid');
const { UserEvent } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES } = require('../config/constants');

const logEvent = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { event_type, payload } = req.body;

    if (!event_type) {
      throw new AppError(400, 'event_type is required', ERROR_CODES.VALIDATION_ERROR);
    }

    const event = await UserEvent.create({
      id: uuidv4(),
      user_id: userId,
      event_type,
      payload: payload || null,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'] || null
    });

    return successResponse(res, { event_id: event.id }, 'Activity event logged successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logEvent
};
