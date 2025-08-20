import dotenv from "dotenv";
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
export const JWT_REFRESH_EXPIRES_IN = process.env
  .JWT_REFRESH_EXPIRES_IN as string;

// Redis Configuration
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = process.env.REDIS_PORT;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
export const REDIS_URL = process.env.REDIS_URL;

// Stellar Configuration
export const STELLAR_NETWORK = process.env.STELLAR_NETWORK;
export const STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ||
  (STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");
export const STELLAR_ISSUER_SECRET = process.env.STELLAR_ISSUER_SECRET;
export const STELLAR_DISTRIBUTION_SECRET =
  process.env.STELLAR_DISTRIBUTION_SECRET;
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

export const STELLAR_RESERVES = {
  // Current Stellar network reserves (in XLM)
  BASE_RESERVE: 0.5, // Base reserve per account
  ENTRY_RESERVE: 0.5, // Reserve per entry (signer, trustline, offer, data)

  // Buffer percentage for safety margin
  RESERVE_BUFFER: 0.1, // 10% buffer on calculated reserves

  // Network reserve monitoring
  MIN_TREASURY_BALANCE: 1000, // Alert when treasury has less than 1000 XLM
  RESERVE_CHECK_INTERVAL: 3600000, // Check reserves every hour (in ms)
};

export const MULTISIG_CONFIG = {
  // User recovery wallets (1-of-2: User OR Platform)
  USER_RECOVERY: {
    LOW_THRESHOLD: 1,     // Either user OR platform can sign payments/offers
    MEDIUM_THRESHOLD: 2,  // Both user AND platform required for account management
    HIGH_THRESHOLD: 2,    // Both signatures for critical operations
    USER_WEIGHT: 2,       // User has primary control
    PLATFORM_WEIGHT: 1,   // Platform can assist/recover
    MASTER_WEIGHT: 0,     // Disable master key after setup
    EXPECTED_SIGNERS: 2,  // User + Platform recovery
    EXPECTED_TRUSTLINES: 3, // NGN + 2 property tokens average
    CALCULATED_RESERVE: 0.5 + 2 * 0.5 + 3 * 0.5, // 3 XLM base
    FUNDING_AMOUNT: "3.3", // 3 XLM + 10% buffer
  },

  // Platform treasury (2-of-3: Enhanced security)
  PLATFORM_TREASURY: {
   LOW_THRESHOLD: 2,     // 2-of-3 for payments and offers
    MEDIUM_THRESHOLD: 3,  // 3-of-3 for account management
    HIGH_THRESHOLD: 3,    // 3-of-3 for critical operations
    PRIMARY_WEIGHT: 2,    // Primary operations key
    SECONDARY_WEIGHT: 1,  // Backup operational key  
    RECOVERY_WEIGHT: 1,   // Emergency recovery key
    TOTAL_SIGNERS: 3,
    MASTER_WEIGHT: 0,
    EXPECTED_SIGNERS: 3,  // 3 platform keys
    EXPECTED_TRUSTLINES: 1, // NGN for operations
    CALCULATED_RESERVE: 0.5 + 3 * 0.5 + 1 * 0.5, // 2.5 XLM
    FUNDING_AMOUNT: "2.75", // 2.5 XLM + 10% buffer
  },

  // Platform issuer/distribution (1-of-2: Operational efficiency + recovery)
  PLATFORM_ISSUER: {
    LOW_THRESHOLD: 1,     // 1-of-2 for routine issuance
    MEDIUM_THRESHOLD: 2,  // 2-of-2 for issuer account changes
    HIGH_THRESHOLD: 2,    // 2-of-2 for authorization flags
    PRIMARY_WEIGHT: 2,    // Main issuer operations
    BACKUP_WEIGHT: 1,     // Backup for availability
    TOTAL_SIGNERS: 2,
    MASTER_WEIGHT: 0,
    EXPECTED_SIGNERS: 2,  // Platform + Backup
    EXPECTED_TRUSTLINES: 5, // Multiple assets for operations
    CALCULATED_RESERVE: 0.5 + 2 * 0.5 + 5 * 0.5, // 4 XLM
    FUNDING_AMOUNT: "4.4", // 4 XLM + 10% buffer
  },

  // Property distribution (1-of-2: Platform + Optional Property Manager)
  PROPERTY_DISTRIBUTION: {
     LOW_THRESHOLD: 1,     // Either platform or property manager
    MEDIUM_THRESHOLD: 2,  // Both required for account changes
    HIGH_THRESHOLD: 2,    // Both required for critical ops
    PLATFORM_WEIGHT: 2,   // Platform has operational control
    PROPERTY_MANAGER_WEIGHT: 1, // Property manager oversight
    MASTER_WEIGHT: 0,
    EXPECTED_SIGNERS: 2,  // Platform + Property manager (max case)
    EXPECTED_TRUSTLINES: 2, // Property token + NGN
    CALCULATED_RESERVE: 0.5 + 2 * 0.5 + 2 * 0.5, // 2.5 XLM
    FUNDING_AMOUNT: "2.75", // 2.5 XLM + 10% buffer
  },

  // Property governance (2-of-3: Major decisions require multiple signatures)
  PROPERTY_GOVERNANCE: {
    LOW_THRESHOLD: 2,     // 2-of-3 for routine decisions
    MEDIUM_THRESHOLD: 2,  // 2-of-3 for governance changes
    HIGH_THRESHOLD: 3,    // 3-of-3 for critical decisions
    PLATFORM_WEIGHT: 1,   // Platform vote
    GOVERNANCE_WEIGHT: 1, // Governance committee vote
    RECOVERY_WEIGHT: 1,   // Emergency recovery vote
    TOTAL_SIGNERS: 3,
    MASTER_WEIGHT: 0,
    EXPECTED_SIGNERS: 3,  // Platform + Governance key + Recovery
    EXPECTED_TRUSTLINES: 1, // NGN for revenue distribution
    CALCULATED_RESERVE: 0.5 + 3 * 0.5 + 1 * 0.5, // 2.5 XLM
    FUNDING_AMOUNT: "2.75", // 2.5 XLM + 10% buffer
  },

  // Default funding amounts
  FUNDING: {
    USER_WALLET_XLM: "2", // Minimum reserve for user wallets
    PROPERTY_WALLET_XLM: "2", // Minimum reserve for property wallets
    PLATFORM_WALLET_XLM: "10", // Higher reserve for platform wallets
  },
  FEE_BUMP: {
    ENABLED: true,
    FEE_MULTIPLIER: 2, // 2x base fee for priority inclusion
    MAX_FEE_BUMP: "1", // Maximum 1 XLM fee bump
    TREASURY_MIN_BALANCE: 1000, // Alert threshold for treasury
  },

  // Trustline management
  // TRUSTLINES: {
  //   AUTO_ADD: true, // Automatically add required trustlines
  //   BATCH_SIZE: 10, // Max trustlines per transaction
  //   RESERVE_PER_TRUSTLINE: 0.5, // XLM reserved per trustline
  //   COMMON_ASSETS: [
  //     // Pre-add these trustlines for efficiency
  //     { code: "NGN", issuer: "platform" }, // Will be replaced with actual issuer
  //     {
  //       code: "USDC",
  //       issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  //     },
  //   ],
  // },
  // Recovery settings
  RECOVERY: {
    ADMIN_ROLES: ["admin", "super_admin"],
    MAX_RECOVERY_ATTEMPTS: 3,
    RECOVERY_COOLDOWN_HOURS: 24,
    RECOVERY_RESERVE_BUFFER: "1",
  },
  MONITORING: {
    LOW_BALANCE_THRESHOLD: 1, // Alert when wallet has < 1 XLM
    RESERVE_VIOLATION_ALERT: true, // Alert on reserve violations
    AUTO_REFILL_ENABLED: false, // Auto-refill from treasury (disabled for safety)
    DAILY_BALANCE_REPORT: true, // Generate daily balance reports
  },
};

export const PLATFORM_RESERVE_REQUIREMENTS = {
  USER_WALLET: MULTISIG_CONFIG.USER_RECOVERY.FUNDING_AMOUNT,
  TREASURY_WALLET: MULTISIG_CONFIG.PLATFORM_TREASURY.FUNDING_AMOUNT,
  ISSUER_WALLET: MULTISIG_CONFIG.PLATFORM_ISSUER.FUNDING_AMOUNT,
  PROPERTY_DISTRIBUTION: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.FUNDING_AMOUNT,
  PROPERTY_GOVERNANCE: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.FUNDING_AMOUNT,

  // Estimate for 1000 users with 10 properties
  ESTIMATED_USER_WALLETS: 1000,
  ESTIMATED_PROPERTIES: 10,

  get TOTAL_USER_RESERVES(): number {
    return this.ESTIMATED_USER_WALLETS * parseFloat(this.USER_WALLET);
  },

  get TOTAL_PROPERTY_RESERVES(): number {
    return (
      this.ESTIMATED_PROPERTIES *
      (parseFloat(this.PROPERTY_DISTRIBUTION) +
        parseFloat(this.PROPERTY_GOVERNANCE))
    );
  },

  get PLATFORM_RESERVES(): number {
    return parseFloat(this.TREASURY_WALLET) + parseFloat(this.ISSUER_WALLET);
  },

  get TOTAL_ESTIMATED_RESERVES(): number {
    return (
      this.TOTAL_USER_RESERVES +
      this.TOTAL_PROPERTY_RESERVES +
      this.PLATFORM_RESERVES
    );
  },

  // Monthly operational costs (fees + refills)
  MONTHLY_FEE_BUDGET: 500, // XLM for fee bumps
  MONTHLY_RESERVE_REFILL: 100, // XLM for reserve top-ups

  get MONTHLY_OPERATIONAL_COST(): number {
    return this.MONTHLY_FEE_BUDGET + this.MONTHLY_RESERVE_REFILL;
  },
};
