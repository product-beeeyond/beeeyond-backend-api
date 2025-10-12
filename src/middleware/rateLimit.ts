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
  prefix: "rl:api:", // Namespace for API rate limits
});
const redisAuthStore = new RedisStore({
  sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
  prefix: "rl:auth:", // Namespace for auth rate limits
});

const redisInvestmentStore = new RedisStore({
  sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
  prefix: "rl:investment:", // Namespace for investment rate limits
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
  // Use IP address as the key
  keyGenerator: (req: any) => {
    return req.ip || req.connection.remoteAddress;
  },
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
  keyGenerator: (req: any) => {
    return req.ip || req.connection.remoteAddress;
  },
});

// Investment limiter
export const investmentLimiter = rateLimit({
  store: redisInvestmentStore,
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many investment requests. Please try again after 1 minute."
  ),
keyGenerator: (req: any) => {
    // If user is authenticated, use their user ID
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    // Otherwise use IP address (for non-authenticated requests)
    return `ip:${req.ip || req.connection.remoteAddress}`;
  },
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
});

// ===========================================
// OPTIONAL: CUSTOM RATE LIMITERS
// ===========================================

/**
 * Stricter limiter for sensitive operations
 * Use for: password changes, email changes, etc.
 */
export const strictLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
    prefix: 'rl:strict:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many requests for this sensitive operation. Please try again after 15 minutes."
  ),
  keyGenerator: (req: any) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip || req.connection.remoteAddress}`;
  },
});

/**
 * Lenient limiter for read-only operations
 * Use for: viewing properties, portfolios, etc.
 */
export const readLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisRateLimitClient.sendCommand(args),
    prefix: 'rl:read:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 read requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(
    "Too many requests. Please try again after 1 minute."
  ),
  keyGenerator: (req: any) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip || req.connection.remoteAddress}`;
  },
});
