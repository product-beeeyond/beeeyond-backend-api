// src/routes/trovotech.ts - Phase 1 Routes

import { Router } from "express";
import {
  authenticate,
  requireAdmin,
  requireKYC,
  requireSuperAdmin,
} from "../middleware/auth";
import {
  registerCompanyProfile,
  registerUserSubwallet,
  registerIssuerWallet,
  getTrovoWalletBalance,
  getTrovoPaymentHistory,
} from "../controllers/trovotechController";

const router = Router();

// ===========================================
// COMPANY PROFILE ROUTES (Super Admin Only)
// ===========================================

/**
 * Register Brikkle company profile on Trovotech
 * POST /api/trovotech/company/register
 * Body: { email, firstName, mobile, mobileCountryCode, referrer? }
 */
router.post(
  "/company/register",
  authenticate,
  requireSuperAdmin,
  registerCompanyProfile,
);

// ===========================================
// WALLET REGISTRATION ROUTES
// ===========================================

/**
 * Register user wallet as Trovotech subwallet
 * POST /api/trovotech/wallet/register-user
 * Body: { walletId? } - Optional, defaults to user's active wallet
 */
router.post(
  "/wallet/register-user",
  authenticate,
  requireKYC,
  registerUserSubwallet,
);

/**
 * Register platform issuer wallet on Trovotech (Admin only)
 * POST /api/trovotech/wallet/register-issuer
 */
router.post(
  "/wallet/register-issuer",
  authenticate,
  requireSuperAdmin,
  registerIssuerWallet,
);

// ===========================================
// QUERY ROUTES
// ===========================================

/**
 * Get wallet balance from Trovotech
 * GET /api/trovotech/wallet/:publicKey/balance
 */
router.get("/wallet/:publicKey/balance", authenticate, getTrovoWalletBalance);

/**
 * Get payment history from Trovotech
 * GET /api/trovotech/wallet/:publicKey/history?page=1&limit=20
 */
router.get("/wallet/:publicKey/history", authenticate, getTrovoPaymentHistory);

// ===========================================
// HEALTH CHECK ROUTE
// ===========================================

/**
 * Check Trovotech integration health
 * GET /api/trovotech/health
 */
router.get("/health", authenticate, requireAdmin, async (req, res) => {
  try {
    // // Test API connectivity
    // const testPublicKey =
    //   "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

    try {
      await Promise.race([
        fetch(`${process.env.TROVOTECH_API_URL}/v1/trovo-api/health`, {
          method: "GET",
          headers: {
            "X-TW-SERVICE-LINK-API-KEY":
              process.env.TROVOTECH_SERVICE_LINK_API_KEY!,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000),
        ),
      ]);

      res.json({
        status: "healthy",
        trovotech: {
          apiUrl: process.env.TROVOTECH_API_URL,
          connected: true,
          hasApiKey: !!process.env.TROVOTECH_SERVICE_LINK_API_KEY,
        },
        features: {
          enabled: process.env.ENABLE_TROVOTECH === "true",
          walletRegistration: process.env.ENABLE_TROVO_WALLET_REG === "true",
          tokenMinting: process.env.ENABLE_TROVO_MINTING === "true",
          payments: process.env.ENABLE_TROVO_PAYMENTS === "true",
          balanceQueries: process.env.ENABLE_TROVO_BALANCE === "true",
          stellarFallback: process.env.STELLAR_FALLBACK_ENABLED !== "false",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (apiError) {
      res.json({
        status: "degraded",
        trovotech: {
          apiUrl: process.env.TROVOTECH_API_URL,
          connected: false,
          hasApiKey: !!process.env.TROVOTECH_SERVICE_LINK_API_KEY,
          error:
            apiError instanceof Error ? apiError.message : "Connection failed",
        },
        features: {
          enabled: process.env.ENABLE_TROVOTECH === "true",
          walletRegistration: process.env.ENABLE_TROVO_WALLET_REG === "true",
          tokenMinting: process.env.ENABLE_TROVO_MINTING === "true",
          payments: process.env.ENABLE_TROVO_PAYMENTS === "true",
          balanceQueries: process.env.ENABLE_TROVO_BALANCE === "true",
          stellarFallback: process.env.STELLAR_FALLBACK_ENABLED !== "false",
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
