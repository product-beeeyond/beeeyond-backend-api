/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { NODE_ENV } from '../config';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response
) => {
  logger.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Sequelize validation errors
  if (error.name === 'SequelizeValidationError') {
    const errors = error.errors.map((err: any) => ({
      field: err.path,
      message: err.message,
    }));
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
    });
  }

  // Sequelize unique constraint errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    const field = error.errors[0]?.path || 'field';
    return res.status(400).json({
      error: `${field} already exists`,
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
    });
  }

  // Default error
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(NODE_ENV === 'development' && { stack: error.stack }),
  });
};

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    error: `Route ${req.originalUrl} not found`,
  });
};
