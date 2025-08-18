import dotenv from 'dotenv';
dotenv.config();

export const NODE_ENV = process.env.NODE_ENV;
export const PORT = process.env.PORT;

// Database Configuration
export const DB_HOST = process.env.DB_HOST;
export const DB_NAME = process.env.DB_NAME;
export const DB_PASSWORD = process.env.DB_PASSWORD;
export const DB_PORT = process.env.DB_PORT;
export const DB_USERNAME = process.env.DB_USERNAME;
export const DATABASE_URL = process.env.DATABASE_URL;

// JWT Configuration
export const JWT_SECRET = process.env.JWT_SECRET as string;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as string;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN as string;

// Redis Configuration
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = process.env.REDIS_PORT;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
export const REDIS_URL = process.env.REDIS_URL;

// Stellar Configuration
export const STELLAR_NETWORK = process.env.STELLAR_NETWORK;
export const STELLAR_HORIZON_URL= process.env.STELLAR_HORIZON_URL || 
  (STELLAR_NETWORK === 'mainnet' 
    ? 'https://horizon.stellar.org' 
    : 'https://horizon-testnet.stellar.org');
export const STELLAR_ISSUER_SECRET = process.env.STELLAR_ISSUER_SECRET;
export const STELLAR_DISTRIBUTION_SECRET = process.env.STELLAR_DISTRIBUTION_SECRET;
export const STELLAR_PLATFORM_SECRET = process.env.STELLAR_PLATFORM_SECRET!;
export const STELLAR_RECOVERY_SECRET = process.env.STELLAR_RECOVERY_SECRET!;
export const STELLAR_TREASURY_SECRET = process.env.STELLAR_TREASURY_SECRET!;
// Email Services
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const FROM_EMAIL = process.env.FROM_EMAIL;

// SMS
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// File Storage
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// KYC Services
export const SMILE_IDENTITY_API_KEY = process.env.SMILE_IDENTITY_API_KEY;
export const BVN_VERIFICATION_URL = process.env.BVN_VERIFICATION_URL;
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Security
export const BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS;
export const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS;
export const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS;

// App Configuration
export const APP_NAME = process.env.APP_NAME;
export const APP_URL = process.env.APP_URL;
export const FRONTEND_URL = process.env.FRONTEND_URL;


// ===========================================
// MULTISIG WALLET CONFIGURATION
// ===========================================

export const MULTISIG_CONFIG = {
  // User recovery wallets (1-of-2: User OR Platform)
  USER_RECOVERY: {
    USER_WEIGHT: 1,
    PLATFORM_WEIGHT: 1,
    THRESHOLD: 1,
    MASTER_WEIGHT: 0, // Disable master key after setup
  },
  
  // Platform treasury (2-of-3: Enhanced security)
  PLATFORM_TREASURY: {
    THRESHOLD: 2,
    TOTAL_SIGNERS: 3,
    MASTER_WEIGHT: 0,
  },
  
  // Platform issuer/distribution (1-of-2: Operational efficiency + recovery)
  PLATFORM_ISSUER: {
    THRESHOLD: 1,
    TOTAL_SIGNERS: 2,
    MASTER_WEIGHT: 0,
  },
  
  // Property distribution (1-of-2: Platform + Optional Property Manager)
  PROPERTY_DISTRIBUTION: {
    THRESHOLD: 1,
    MASTER_WEIGHT: 0,
  },
  
  // Property governance (2-of-3: Major decisions require multiple signatures)
  PROPERTY_GOVERNANCE: {
    THRESHOLD: 2,
    TOTAL_SIGNERS: 3,
    MASTER_WEIGHT: 0,
  },
  
  // Default funding amounts
  FUNDING: {
    USER_WALLET_XLM: '2', // Minimum reserve for user wallets
    PROPERTY_WALLET_XLM: '2', // Minimum reserve for property wallets
    PLATFORM_WALLET_XLM: '10', // Higher reserve for platform wallets
  },
  
  // Recovery settings
  RECOVERY: {
    ADMIN_ROLES: ['admin', 'super_admin'],
    MAX_RECOVERY_ATTEMPTS: 3,
    RECOVERY_COOLDOWN_HOURS: 24,
  },
};