// src/middleware/errorHandler.js
import { writeLog } from './logger.js';

export function errorHandler(err, req, res, next) {
  // Log error
  writeLog('error', err.message || 'Unknown error', {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.user_id || null,
    error: {
      name: err.name,
      code: err.code,
      statusCode: err.statusCode
    }
  });

  // Console log for development
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  // Determine status code
  const status = err.statusCode || err.status || 500;

  // Send error response
  res.status(status).json({
    success: false,
    message: status === 500 
      ? 'Internal server error' 
      : (err.message || 'Something went wrong'),
    error_code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
