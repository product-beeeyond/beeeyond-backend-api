// src/controllers/trovotechController.ts - Phase 1 Testing & Management

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { trovotechService } from "../services/trovotechService";
import { stellarService } from "../services/stellarService";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigSigner from "../models/MultiSigSigner";
import logger from "../utils/logger";
import { Keypair } from "@stellar/stellar-sdk";
import { secureWalletService } from "../services/secureWalletService";

/**
 * Create Brikkle company profile on Trovotech (Super Admin only)
 * POST /api/trovotech/company/register
 */
export const registerCompanyProfile = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { email, firstName, mobile, mobileCountryCode, referrer } = req.body;

    // Get platform primary wallet to use as company wallet
    const platformWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_primary", status: "active" },
    });

    if (!platformWallet) {
      return res.status(400).json({
        error: "Platform primary wallet not found. Create it first.",
      });
    }

    // Get primary signer (platform recovery key)
    const primarySigner = await MultiSigSigner.findOne({
      where: {
        multiSigWalletId: platformWallet.id,
        role: "platform_recovery",
        status: "active",
      },
    });

    if (!primarySigner) {
      return res.status(400).json({
        error: "Platform primary signer not found",
      });
    }

    // Register company profile
    const companyProfile = await trovotechService.createCompanyProfile({
      email,
      firstName,
      lastName: "Platform",
      mobile,
      mobileCountryCode,
      publicKey: platformWallet.stellarPublicKey,
      primarySigner: primarySigner.publicKey,
      referrer,
      corporate: 1,
    });

    logger.info("Brikkle company profile created on Trovotech", {
      username: companyProfile.username,
      publicKey: companyProfile.publicKey,
    });

    res.status(201).json({
      message: "Company profile registered successfully on Trovotech",
      company: {
        username: companyProfile.username,
        email: companyProfile.email,
        publicKey: companyProfile.publicKey,
        corporate: companyProfile.corporate,
      },
    });
  } catch (error) {
    logger.error("Register company profile error:", error);
    res.status(500).json({
      error: "Failed to register company profile",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Register user wallet as Trovotech subwallet
 * POST /api/trovotech/wallet/register-user
 */
export const registerUserSubwallet = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user!.id;
    const { walletId } = req.body;

    // Get user's wallet
    const userWallet = await MultiSigWallet.findOne({
      where: {
        id: walletId || undefined,
        userId,
        walletType: "user",
        status: "active",
      },
      include: [
        {
          model: MultiSigSigner,
          as: "signers",
          where: { status: "active" },
        },
      ],
    });

    if (!userWallet) {
      return res.status(404).json({ error: "User wallet not found" });
    }

    // Check if already registered
    if (userWallet.metadata?.trovoRegistered) {
      return res.status(400).json({
        error: "Wallet already registered on Trovotech",
        trovoAlias: userWallet.metadata.trovoAlias,
      });
    }

    // Get user signer
    const userSigner = (userWallet.signers as MultiSigSigner[]).find(
      (s) => s.role === "user",
    );

    if (!userSigner) {
      return res.status(400).json({ error: "User signer not found" });
    }

    // Get platform signer keypair for signing
    const platformSigner = (userWallet.signers as MultiSigSigner[]).find(
      (s) => s.role === "platform_recovery",
    );

    if (!platformSigner || !platformSigner.encryptedSecretId) {
      return res.status(400).json({ error: "Platform signer not found" });
    }

    // Decrypt platform signer secret
    const platformSecret = await secureWalletService.retrieveWalletSecret(
      platformSigner.encryptedSecretId,
      {
        walletId: userWallet.id,
        userId,
        walletType: "user",
      },
    );

    const platformKeypair = Keypair.fromSecret(platformSecret);

    // Register as subwallet on Trovotech
    const subwalletResult = await trovotechService.createSubwallet(
      {
        walletType: 0, // Normal wallet
        subwalletPublicKey: userWallet.stellarPublicKey,
        walletTag: `user_${userId}`,
        alias: `${req.user!.firstName}_${req.user!.lastName}_wallet`,
      },
      {
        primary: platformKeypair, // Platform signs on behalf of user
      },
    );

    // Update wallet metadata
    await userWallet.update({
      metadata: {
        ...userWallet.metadata,
        trovoRegistered: true,
        trovoAlias: subwalletResult.alias,
        trovoWalletTag: `user_${userId}`,
        trovoTransactionId: subwalletResult.transactionId,
        trovoRegisteredAt: new Date().toISOString(),
      },
    });

    logger.info(`User wallet registered on Trovotech`, {
      userId,
      walletId: userWallet.id,
      trovoAlias: subwalletResult.alias,
    });

    res.status(200).json({
      message: "Wallet registered successfully on Trovotech",
      registration: {
        alias: subwalletResult.alias,
        walletTag: `user_${userId}`,
        publicKey: userWallet.stellarPublicKey,
        transactionId: subwalletResult.transactionId,
      },
    });
  } catch (error) {
    logger.error("Register user subwallet error:", error);
    res.status(500).json({
      error: "Failed to register wallet on Trovotech",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Register platform issuer wallet on Trovotech
 * POST /api/trovotech/wallet/register-issuer
 */
export const registerIssuerWallet = async (req: AuthRequest, res: Response) => {
  try {
    // Get platform issuer wallet
    const issuerWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_issuer", status: "active" },
      include: [
        {
          model: MultiSigSigner,
          as: "signers",
          where: { status: "active" },
        },
      ],
    });

    if (!issuerWallet) {
      return res
        .status(404)
        .json({ error: "Platform issuer wallet not found" });
    }

    // Check if already registered
    if (issuerWallet.metadata?.trovoRegistered) {
      return res.status(400).json({
        error: "Issuer wallet already registered on Trovotech",
        trovoAlias: issuerWallet.metadata.trovoAlias,
      });
    }

    // Get issuer signer keypair
    const issuerSigner = (issuerWallet.signers as MultiSigSigner[]).find(
      (s) => s.role === "platform_issuer",
    );

    if (!issuerSigner || !issuerSigner.encryptedSecretId) {
      return res.status(400).json({ error: "Issuer signer not found" });
    }

    // Decrypt issuer secret
    const issuerSecret = await secureWalletService.retrieveWalletSecret(
      issuerSigner.encryptedSecretId,
      {
        walletId: issuerWallet.id,
        walletType: "platform_issuer",
      },
    );

    const issuerKeypair = Keypair.fromSecret(issuerSecret);

    // TODO: Create middleware distribution wallet on Trovotech
    // For now, we'll use a placeholder - this would be created by Trovotech
    const middlewarePublicKey = "PLACEHOLDER_MIDDLEWARE_WALLET";

    // Register as issuing subwallet
    const subwalletResult = await trovotechService.createSubwallet(
      {
        walletType: 1, // Issuing wallet
        subwalletPublicKey: issuerWallet.stellarPublicKey,
        walletTag: "platform_issuer",
        alias: "brikkle_issuer",
        linkedWalletPublicKey: middlewarePublicKey,
      },
      {
        primary: issuerKeypair,
      },
    );

    // Update wallet metadata
    await issuerWallet.update({
      metadata: {
        ...issuerWallet.metadata,
        trovoRegistered: true,
        trovoAlias: subwalletResult.alias,
        trovoWalletTag: "platform_issuer",
        trovoMiddlewareWallet: middlewarePublicKey,
        trovoTransactionId: subwalletResult.transactionId,
        trovoRegisteredAt: new Date().toISOString(),
      },
    });

    logger.info("Platform issuer registered on Trovotech", {
      alias: subwalletResult.alias,
      middlewareWallet: middlewarePublicKey,
    });

    res.status(200).json({
      message: "Issuer wallet registered successfully on Trovotech",
      registration: {
        alias: subwalletResult.alias,
        walletTag: "platform_issuer",
        publicKey: issuerWallet.stellarPublicKey,
        middlewareWallet: middlewarePublicKey,
        transactionId: subwalletResult.transactionId,
      },
    });
  } catch (error) {
    logger.error("Register issuer wallet error:", error);
    res.status(500).json({
      error: "Failed to register issuer wallet",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get Trovotech wallet balance
 * GET /api/trovotech/wallet/:publicKey/balance
 */
export const getTrovoWalletBalance = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { publicKey } = req.params;
    const userId = req.user!.id;

    // Verify user owns this wallet (except for admins)
    if (req.user!.role === "user") {
      const wallet = await MultiSigWallet.findOne({
        where: {
          userId,
          stellarPublicKey: publicKey,
          status: "active",
        },
      });

      if (!wallet) {
        return res.status(403).json({ error: "Unauthorized access to wallet" });
      }
    }

    // Get balance from Trovotech
    const balance = await trovotechService.getBalance(publicKey);

    // Also get Stellar balance for comparison
    const stellarBalance = await stellarService.getAccountBalance(publicKey);

    res.json({
      publicKey,
      trovotech: {
        claimed: balance.claimed,
        unclaimed: balance.unclaimed,
      },
      stellar: stellarBalance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get Trovotech balance error:", error);
    res.status(500).json({
      error: "Failed to fetch wallet balance",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get Trovotech payment history
 * GET /api/trovotech/wallet/:publicKey/history
 */
export const getTrovoPaymentHistory = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { publicKey } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user!.id;

    // Verify user owns this wallet (except for admins)
    if (req.user!.role === "user") {
      const wallet = await MultiSigWallet.findOne({
        where: {
          userId,
          stellarPublicKey: publicKey,
          status: "active",
        },
      });

      if (!wallet) {
        return res.status(403).json({ error: "Unauthorized access to wallet" });
      }
    }

    // Get payment history from Trovotech
    const history = await trovotechService.getPaymentHistory(publicKey, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      publicKey,
      transactions: history.records,
      pagination: {
        page: history.currentPage,
        pages: history.pages,
        totalRecords: history.totalRecords,
        limit: history.limit,
      },
    });
  } catch (error) {
    logger.error("Get Trovotech payment history error:", error);
    res.status(500).json({
      error: "Failed to fetch payment history",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
