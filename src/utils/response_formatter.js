const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data
  });
};

const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, errorCode = null, details = null) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    errorCode: errorCode || `HTTP_${statusCode}`,
    message,
    details
  });
};

module.exports = {
  successResponse,
  errorResponse
};
