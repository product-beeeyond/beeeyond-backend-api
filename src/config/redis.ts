import { createClient } from 'redis';
import logger from '../utils/logger';
import { REDIS_URL, REDIS_PASSWORD } from '.';

const redisClient = createClient({
  url: REDIS_URL ,
  ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

// Initialize connection
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
  }
})();

export { redisClient };
