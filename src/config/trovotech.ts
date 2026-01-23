import dotenv from 'dotenv';
dotenv.config();

export const TROVOTECH_CONFIG = {
  API_URL: process.env.TROVOTECH_API_URL,
  SERVICE_LINK_API_KEY: process.env.TROVOTECH_SERVICE_LINK_API_KEY!,
  COMPANY_USERNAME: process.env.TROVOTECH_COMPANY_USERNAME || 'brikkle',
  TIMEOUT_MS: parseInt(process.env.TROVOTECH_TIMEOUT_MS || '30000'),
  MAX_RETRIES: parseInt(process.env.TROVOTECH_MAX_RETRIES || '3'),
  RETRY_DELAY_MS: parseInt(process.env.TROVOTECH_RETRY_DELAY_MS || '1000'),
};

// Feature flags for gradual rollout
export const TROVOTECH_FEATURES = {
  ENABLED: process.env.ENABLE_TROVOTECH === 'true',
  WALLET_REGISTRATION: process.env.ENABLE_TROVO_WALLET_REG === 'true',
  TOKEN_MINTING: process.env.ENABLE_TROVO_MINTING === 'true',
  PAYMENTS: process.env.ENABLE_TROVO_PAYMENTS === 'true',
  BALANCE_QUERIES: process.env.ENABLE_TROVO_BALANCE === 'true',
  STELLAR_FALLBACK: process.env.STELLAR_FALLBACK_ENABLED !== 'false', // default true
};

// Validate required configuration
if (TROVOTECH_FEATURES.ENABLED && !TROVOTECH_CONFIG.SERVICE_LINK_API_KEY) {
  throw new Error('TROVOTECH_SERVICE_LINK_API_KEY is required when Trovotech is enabled');
}

export default TROVOTECH_CONFIG;