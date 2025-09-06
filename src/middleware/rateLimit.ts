/* eslint-disable @typescript-eslint/no-explicit-any */
// middleware/rateLimiter.ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisRateLimitClient } from "../config/redisRateLimit";
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "../config";

// Factory to create unique handlers
const createHandler = (msg: string) => {
  return (req: any, res: any, next: any, options: any) => {
    res.status(options.statusCode).json({
      success: false,
      error: msg,
      retryAfter: new Date(Date.now() + options.windowMs).toISOString(),
    });
  };
};

// Shared store
const redisApiStore = new RedisStore({
  sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
});
const redisAuthStore = new RedisStore({
  sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
});

const redisInvestmentStore = new RedisStore({
  sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
});
// General API rate limiting
export const apiLimiter = rateLimit({
  store: redisApiStore,
  windowMs: Number(RATE_LIMIT_WINDOW_MS),
  max: Number(RATE_LIMIT_MAX_REQUESTS),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many API requests. Please try again after 2 minutes."
  ),
});

// Auth limiter (strict)
export const authLimiter = rateLimit({
  store: redisAuthStore,
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many authentication attempts. Please try again after 2 minutes."
  ),
});

// Investment limiter
export const investmentLimiter = rateLimit({
  store: redisInvestmentStore,
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many investment requests. Please try again after 1 minutes."
  ),
});

// import rateLimit from 'express-rate-limit';
// // import { redisClient } from '../config/redis';
// import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../config';

// // General API rate limiting
// export const apiLimiter = rateLimit({
//   windowMs: Number(RATE_LIMIT_WINDOW_MS), // 15 minutes
//   max: Number(RATE_LIMIT_MAX_REQUESTS),
//   message: {
//     error: 'Too many requests from this IP, please try again later',
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// // Strict rate limiting for auth endpoints
// export const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // 5 attempts per window
//   message: {
//     error: 'Too many authentication attempts, please try again later',
//   },
//   skipSuccessfulRequests: true,
// });

// // Investment transaction limiting
// export const investmentLimiter = rateLimit({
//   windowMs: 60 * 1000, // 1 minute
//   max: 10, // 10 transactions per minute
//   message: {
//     error: 'Too many investment requests, please slow down',
//   },
// });
