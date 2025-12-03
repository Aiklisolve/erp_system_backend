const { log } = require('./logger');

function errorHandler(err, req, res, next) {
  // Log error
  log('error', err.message, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.user_id || null,
  });

  const status = err.statusCode || 500;

  res.status(status).json({
    success: false,
    message:
      status === 500
        ? 'Internal server error'
        : err.message || 'Something went wrong',
  });
}

module.exports = errorHandler;


// export function errorHandler(err, req, res, next) {
//   console.error(err);

//   const status = err.status || 500;
//   const message = err.message || 'Internal server error';

//   return res.status(status).json({
//     success: false,
//     message,
//     error_code: err.code || 'INTERNAL_ERROR',
//     timestamp: new Date().toISOString()
//   });
// }
