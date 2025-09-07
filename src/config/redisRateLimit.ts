// config/redisRateLimit.ts
import { createClient } from "redis";
import logger from "../utils/logger";
import { REDIS_URL, REDIS_PASSWORD } from ".";

export const redisRateLimitClient = createClient({
  url: REDIS_URL,
  ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
});

redisRateLimitClient.on("error", (err) => {
  logger.error("Redis RateLimit Client Error:", err);
});

redisRateLimitClient.on("connect", () => {
  logger.info("✅ Redis RateLimit Client Connected");
});

// Initialize
(async () => {
  try {
    await redisRateLimitClient.connect();
  } catch (error) {
    logger.error("Failed to connect Redis RateLimit Client:", error);
  }
})();
