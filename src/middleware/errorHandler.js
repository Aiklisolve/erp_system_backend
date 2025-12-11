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

  // If this is a download request and headers haven't been sent, send error as file
  if ((req.isDownloadRequest || (req.originalUrl && req.originalUrl.includes('/download'))) && !res.headersSent) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="error.txt"');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(status).end(Buffer.from(`Error: ${err.message || 'Internal server error'}\n\nPlease contact support if this issue persists.`, 'utf-8'));
    return;
  }

  // Send error response as JSON (only if headers not sent)
  if (!res.headersSent) {
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
}
