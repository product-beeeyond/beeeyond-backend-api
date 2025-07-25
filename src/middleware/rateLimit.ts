import rateLimit from 'express-rate-limit';
// import { redisClient } from '../config/redis';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../config';

// General API rate limiting
export const apiLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS), // 15 minutes
  max: Number(RATE_LIMIT_MAX_REQUESTS),
  message: {
    error: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later',
  },
  skipSuccessfulRequests: true,
});

// Investment transaction limiting
export const investmentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 transactions per minute
  message: {
    error: 'Too many investment requests, please slow down',
  },
});
