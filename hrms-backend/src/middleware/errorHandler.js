/**
 * src/middleware/errorHandler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Error Handling Middleware
 *
 * THESIS NOTE — Why Centralized Error Handling?
 * Express uses a 4-argument middleware `(err, req, res, next)` as its global
 * error catcher. All errors thrown in route handlers (including async ones,
 * enabled via `express-async-errors`) flow here. Benefits:
 *   1. Single place to translate errors → HTTP responses
 *   2. Consistent JSON error envelope across ALL endpoints
 *   3. Prevents stack traces from leaking to clients in production
 *   4. Handles Prisma-specific errors (P2002 = unique constraint, P2025 = not found)
 *
 * Error Response Envelope (always returned):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Human-readable message",
 *     "details": [...] // optional field-level errors from Joi
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const logger = require('../config/logger');
const { Prisma } = require('@prisma/client');

// Custom application error class
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // distinguishes from programming errors
  }
}

// Translates Prisma-specific errors to HTTP responses
function handlePrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = err.meta?.target;
        const field = Array.isArray(target)
          ? target.join(', ')
          : (typeof target === 'string' ? target : 'field');
        return new AppError(`A record with this ${field} already exists.`, 409, 'DUPLICATE_ENTRY');
      }
      case 'P2025':
        return new AppError('Record not found.', 404, 'NOT_FOUND');
      case 'P2003':
        return new AppError('Related record not found (foreign key constraint).', 400, 'FOREIGN_KEY_ERROR');
      case 'P2014':
        return new AppError('The change violates a required relation.', 400, 'RELATION_VIOLATION');
      default:
        return new AppError(`Database error: ${err.code}`, 500, 'DB_ERROR');
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('Invalid data provided to database layer.', 400, 'DB_VALIDATION_ERROR');
  }

  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  // Try to convert Prisma errors
  const prismaError = handlePrismaError(err);
  if (prismaError) error = prismaError;

  // Log all errors
  const isOperational = error.isOperational === true;
  if (!isOperational) {
    logger.error(`[Unhandled Error] ${req.method} ${req.path}`, {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
  } else {
    logger.warn(`[Operational Error] ${req.method} ${req.path}: ${error.message}`);
  }

  const statusCode = error.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  return res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: isOperational ? error.message : 'An unexpected error occurred. Please try again.',
      details: error.details || undefined,
      // Only expose stack trace in development
      ...(isDev && !isOperational && { stack: error.stack }),
    },
  });
}

module.exports = { errorHandler, AppError };
