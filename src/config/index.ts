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
export const STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL;
export const STELLAR_ISSUER_SECRET = process.env.STELLAR_ISSUER_SECRET;
export const STELLAR_DISTRIBUTION_SECRET = process.env.STELLAR_DISTRIBUTION_SECRET;

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
