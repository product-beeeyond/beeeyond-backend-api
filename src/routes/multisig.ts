/* eslint-disable @typescript-eslint/no-explicit-any */
// // src/routes/multisig.ts
// import { Router } from 'express';
// import { authenticate, requireAdmin, requireKYC, requireSuperAdmin } from '../middleware/auth';
// import { validate, multisigWalletSchema, multisigTransactionSchema, governanceProposalSchema } from '../middleware/validation';
// import {
//   // Wallet Management
//    createUserMultisigWallet,
//   createPlatformWallets,
//   createPropertyWallets,
//   recoverUserWallet,
//   getWalletInfo,
//   listUserWallets,
//   addSigner,
//   removeSigner,

//   // Transaction Management
//   // proposeMultiSigTransaction,
//   // signMultiSigTransaction,
//   // executeMultiSigTransaction,
//   // getPendingTransactions,
//   // getTransactionHistory,

//   // Governance
//   // createGovernanceProposal,
//   // voteOnProposal,
//   // getGovernanceProposals,

//   // Revenue Distribution
//   // createRevenueDistribution,
// } from '../controllers/multisigController';

// const router = Router();

// // ===========================================
// // USER WALLET ROUTES
// // ===========================================

// /**
//  * Create recovery wallet for KYC-verified user
//  * POST /api/multisig/user/wallet
//  */
// router.post('/user/wallet',
//   authenticate,
//   requireKYC,
//   createUserMultisigWallet
// );

// router.get('/user/wallets',
//   authenticate,
//   listUserWallets
// );

// router.post('/user/:userId/recover',
//   authenticate,
//   requireAdmin,
//   validateWalletRecovery,
//   recoverUserWallet
// );

// // // Add signer to multisig wallet (Admin only)
// // router.post(
// //   '/wallets/signers',
// //   authenticate,
// //   requireAdmin,
// //   addSigner
// // );

// // // Remove signer from multisig wallet (Admin only)
// // router.delete(
// //   '/wallets/signers/:signerId',
// //   authenticate,
// //   requireAdmin,
// //   removeSigner
// // );

// // ===========================================
// // PLATFORM WALLET ROUTES
// // ===========================================

// /**
//  * Create platform wallets (Super Admin only)
//  * POST /api/multisig/platform/wallets
//  */
// router.post('/platform/wallets',
//   authenticate,
//   requireSuperAdmin,
//   validateCreatePlatformWallet,
//   createPlatformWallets
// );
// // ===========================================
// // PROPERTY WALLET ROUTES
// // ===========================================

// /**
//  * Create property-specific wallets (Admin only)
//  * POST /api/multisig/property/:propertyId/wallets
//  */
// router.post('/property/:propertyId/wallets',
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   createPropertyWallets
// );

// // ===========================================
// // UTILITY ROUTES
// // ===========================================

// /**
//  * Get wallet information
//  * GET /api/multisig/wallet/:publicKey
//  */
// router.get('/wallet/:publicKey',
//   authenticate,
//   requireAdmin,
//   validatePublicKey,
//   getWalletInfo
// );
// // ===========================================
// // MULTISIG TRANSACTION ROUTES
// // ===========================================

// // // Propose a multisig transaction
// // router.post(
// //   '/transactions/propose',
// //   authenticate,
// //   requireKYC,
// //   validate(multisigTransactionSchema),
// //   proposeMultiSigTransaction
// // );

// // // Sign a multisig transaction
// // router.post(
// //   '/transactions/:proposalId/sign',
// //   authenticate,
// //   requireKYC,
// //   signMultiSigTransaction
// // );

// // // Execute a multisig transaction
// // router.post(
// //   '/transactions/:proposalId/execute',
// //   authenticate,
// //   requireKYC,
// //   executeMultiSigTransaction
// // );

// // // Get pending transactions for a wallet
// // router.get(
// //   '/transactions/pending/:walletPublicKey',
// //   authenticate,
// //   getPendingTransactions
// // );

// // // Get transaction history for a wallet
// // router.get(
// //   '/transactions/history/:walletPublicKey',
// //   authenticate,
// //   getTransactionHistory
// // );

// // ===========================================
// // GOVERNANCE ROUTES
// // ===========================================

// // // Create governance proposal
// // router.post(
// //   '/governance/proposals',
// //   authenticate,
// //   requireKYC,
// //   validate(governanceProposalSchema),
// //   createGovernanceProposal
// // );

// // // Vote on governance proposal
// // router.post(
// //   '/governance/proposals/:proposalId/vote',
// //   authenticate,
// //   requireKYC,
// //   voteOnProposal
// // );

// // Get governance proposals for a property
// // router.get(
// //   '/governance/proposals/:propertyId',
// //   authenticate,
// //   getGovernanceProposals
// // );

// // ===========================================
// // REVENUE DISTRIBUTION ROUTES
// // ===========================================

// // // Create revenue distribution (Admin only)
// // router.post(
// //   '/revenue/distribute',
// //   authenticate,
// //   requireAdmin,
// //   createRevenueDistribution
// // );

// export default router;

import { Response, Router } from "express";
import {
  authenticate,
  AuthRequest,
  requireAdmin,
  requireKYC,
  requireSuperAdmin,
} from "../middleware/auth";
import {
  // Wallet Management
  createUserMultisigWallet,
  createPlatformWallets,
  createPropertyWallets,
  // recoverUserWallet,
  getWalletInfo,
  listUserWallets,
  createPlatformTreasury,
  finalizePlatformTreasury,
  checkTreasuryStatus,
  listTreasuryWallets,
} from "../controllers/multisigController";
import MultiSigWallet from '../models/MultiSigWallet';

const router = Router();

// ===========================================
// VALIDATION MIDDLEWARE
// ===========================================

const validatePropertyId = (req: any, res: any, next: any) => {
  const { propertyId } = req.params;
  if (!propertyId || propertyId.length < 1) {
    return res.status(400).json({ error: "Valid property ID is required" });
  }
  next();
};

const validatePublicKey = (req: any, res: any, next: any) => {
  const { publicKey } = req.params;
  if (!publicKey || publicKey.length !== 56) {
    return res
      .status(400)
      .json({ error: "Valid Stellar public key is required (56 characters)" });
  }
  next();
};

const validateCreatePlatformWallet = (req: any, res: any, next: any) => {
  const { walletType } = req.body;
  const validTypes = ["treasury", "issuer", "distribution", "fee_collection"];

  if (!walletType || !validTypes.includes(walletType)) {
    return res.status(400).json({
      error: `Invalid wallet type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  // if (!description || description.trim().length < 10) {
  //   return res.status(400).json({
  //     error: "Description must be at least 10 characters long",
  //   });
  // }

  next();
};

// const validateWalletRecovery = (req: any, res: any, next: any) => {
//   const { userId } = req.params;
//   const { recoveryReason, newUserPublicKey } = req.body;

//   if (!userId) {
//     return res.status(400).json({ error: "User ID is required" });
//   }

//   if (!recoveryReason || recoveryReason.trim().length < 10) {
//     return res.status(400).json({
//       error: "Recovery reason must be at least 10 characters long",
//     });
//   }

//   if (newUserPublicKey && newUserPublicKey.length !== 56) {
//     return res.status(400).json({
//       error: "New user public key must be exactly 56 characters",
//     });
//   }

//   next();
// };

// const validateMultisigTransaction = (req: any, res: any, next: any) => {
//   const { walletPublicKey, operations, description, category } = req.body;

//   if (!walletPublicKey || walletPublicKey.length !== 56) {
//     return res
//       .status(400)
//       .json({ error: "Valid wallet public key is required" });
//   }

//   if (!operations || !Array.isArray(operations) || operations.length === 0) {
//     return res
//       .status(400)
//       .json({ error: "At least one operation is required" });
//   }

//   if (!description || description.trim().length < 5) {
//     return res
//       .status(400)
//       .json({ error: "Description must be at least 5 characters" });
//   }

//   const validCategories = [
//     "fund_management",
//     "governance",
//     "revenue_distribution",
//     "emergency",
//     "recovery",
//   ];
//   if (!category || !validCategories.includes(category)) {
//     return res.status(400).json({
//       error: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
//     });
//   }

//   next();
// };

// const validateTransactionSigning = (req: any, res: any, next: any) => {
//   const { transactionId } = req.params;
//   const { signature, signerPublicKey } = req.body;

//   if (!transactionId) {
//     return res.status(400).json({ error: "Transaction ID is required" });
//   }

//   if (!signature || signature.trim().length === 0) {
//     return res.status(400).json({ error: "Signature is required" });
//   }

//   if (!signerPublicKey || signerPublicKey.length !== 56) {
//     return res
//       .status(400)
//       .json({ error: "Valid signer public key is required" });
//   }

//   next();
// };

// ===========================================
// USER WALLET ROUTES
// ===========================================

/**
 * Create recovery wallet for KYC-verified user
 * POST /api/multisig/user/wallet
 */
router.post("/user/wallet", authenticate, requireKYC, createUserMultisigWallet);

/**
 * List user's multisig wallets
 * GET /api/multisig/user/wallets
 */
router.get("/user/wallets", authenticate, listUserWallets);

/** ---DEPRECATED----
 * Recover user wallet (Admin only)
 * POST /api/multisig/user/:userId/recover
 */
// router.post(
//   "/user/:userId/recover",
//   authenticate,
//   requireAdmin,
//   validateWalletRecovery,
//   recoverUserWallet
// );

// ===========================================
// PLATFORM WALLET ROUTES
// ===========================================

/**
 * Create platform wallets (Super Admin only)
 * POST /api/multisig/platform/wallets
 */
router.post(
  "/create-platform-wallets",
  authenticate,
  requireSuperAdmin,
  validateCreatePlatformWallet,
  createPlatformWallets
);

router.post("/platform/treasury/create", authenticate, createPlatformTreasury);
router.post(
  "/platform/treasury/finalize",
  authenticate,
  finalizePlatformTreasury
);
router.get(
  "/platform/treasury/status/:publicKey",
  authenticate,
  checkTreasuryStatus
);
router.get("/platform/treasury/list", authenticate, listTreasuryWallets);
/**
 * Emergency recovery route for failed finalization
 * POST /api/multisig/platform/treasury/recover
 * Body: { publicKey: string, reason: string }
 * Auth: Super Admin only
 * 
 * Allows retry of finalization process if it failed due to network issues.
 */
router.post('/platform/treasury/recover', authenticate, async (req: AuthRequest, res:Response) => {
  try {
    const { publicKey, reason } = req.body;
    
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    if (!publicKey || !reason) {
      return res.status(400).json({ error: 'publicKey and reason required' });
    }

    // Reset wallet to awaiting_finalization status
    const wallet = await MultiSigWallet.findOne({
      where: { 
        stellarPublicKey: publicKey,
        walletType: 'platform_treasury',
        status: 'inactive'
      }
    });

    if (!wallet) {
      return res.status(404).json({ 
        error: 'Treasury wallet not found or not in recoverable status' 
      });
    }

    await wallet.update({
      status: 'awaiting_finalization',
      metadata: {
        ...wallet.metadata,
        recoveryReason: reason,
        recoveredAt: new Date().toISOString(),
      }
    });

    res.json({
      message: 'Treasury wallet reset for recovery',
      publicKey,
      status: 'awaiting_finalization',
      nextStep: 'Call finalize endpoint to retry setup'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Recovery failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===========================================
// PROPERTY WALLET ROUTES
// ===========================================

/**
 * Create property-specific wallets (Admin only)
 * POST /api/multisig/property/:propertyId/wallets
 */
router.post(
  "/property/:propertyId/wallets",
  authenticate,
  requireAdmin,
  validatePropertyId,
  createPropertyWallets
);

// ===========================================
// UTILITY ROUTES
// ===========================================

/**
 * Get wallet information
 * GET /api/multisig/wallet/:publicKey
 */
router.get(
  "/wallet/:publicKey",
  authenticate,
  requireAdmin,
  validatePublicKey,
  getWalletInfo
);

// ===========================================
// MULTISIG TRANSACTION ROUTES
// ===========================================

/**
 * Propose a multisig transaction
 * POST /api/multisig/transactions/propose
 */
// router.post(
//   "/transactions/propose",
//   authenticate,
//   requireKYC,
//   validateMultisigTransaction,
//   async (req, res) => {
//     try {
//       const { proposeMultiSigTransaction } = await import(
//         "../controllers/multisigController"
//       );
//       await proposeMultiSigTransaction(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Sign a multisig transaction
 * POST /api/multisig/transactions/:transactionId/sign
 */
// router.post(
//   "/transactions/:transactionId/sign",
//   authenticate,
//   requireKYC,
//   validateTransactionSigning,
//   async (req, res) => {
//     try {
//       const { signMultiSigTransaction } = await import(
//         "../controllers/multisigController"
//       );
//       await signMultiSigTransaction(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Execute a multisig transaction
 * POST /api/multisig/transactions/:transactionId/execute
 */
// router.post(
//   "/transactions/:transactionId/execute",
//   authenticate,
//   requireKYC,
//   async (req, res) => {
//     try {
//       const { executeMultiSigTransaction } = await import(
//         "../controllers/multisigController"
//       );
//       await executeMultiSigTransaction(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get pending transactions for user's wallets
 * GET /api/multisig/transactions/pending
 */
// router.get("/transactions/pending", authenticate, async (req, res) => {
//   try {
//     const { GetPendingTransactions } = await import(
//       "../controllers/investmentController"
//     );
//     await GetPendingTransactions(req, res);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to load investment controller" });
//   }
// });

/**
 * Get transaction history for a specific wallet
 * GET /api/multisig/transactions/history/:walletPublicKey
 */
// router.get(
//   "/transactions/history/:walletPublicKey",
//   authenticate,
//   validatePublicKey,
//   async (req, res) => {
//     try {
//       const { getWalletTransactionHistory } = await import(
//         "../controllers/multisigController"
//       );
//       await getWalletTransactionHistory(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get transaction details
 * GET /api/multisig/transactions/:transactionId
 */
// router.get("/transactions/:transactionId", authenticate, async (req, res) => {
//   try {
//     const { getMultiSigTransactionDetails } = await import(
//       "../controllers/multisigController"
//     );
//     await getMultiSigTransactionDetails(req, res);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to load multisig controller" });
//   }
// });

// ===========================================
// GOVERNANCE ROUTES
// ===========================================

/**
 * Create governance proposal for property
 * POST /api/multisig/governance/proposals
 */
// router.post(
//   "/governance/proposals",
//   authenticate,
//   requireKYC,
//   async (req, res) => {
//     try {
//       const { createGovernanceProposal } = await import(
//         "../controllers/multisigController"
//       );
//       await createGovernanceProposal(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Vote on governance proposal
 * POST /api/multisig/governance/proposals/:proposalId/vote
 */
// router.post(
//   "/governance/proposals/:proposalId/vote",
//   authenticate,
//   requireKYC,
//   async (req, res) => {
//     try {
//       const { voteOnGovernanceProposal } = await import(
//         "../controllers/multisigController"
//       );
//       await voteOnGovernanceProposal(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get governance proposals for a property
 * GET /api/multisig/governance/proposals/:propertyId
 */
// router.get(
//   "/governance/proposals/:propertyId",
//   authenticate,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const { getGovernanceProposals } = await import(
//         "../controllers/multisigController"
//       );
//       await getGovernanceProposals(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

// ===========================================
// REVENUE DISTRIBUTION ROUTES
// ===========================================

/**
 * Create revenue distribution (Admin only)
 * POST /api/multisig/revenue/distribute
 */
// router.post(
//   "/revenue/distribute",
//   authenticate,
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const { createRevenueDistribution } = await import(
//         "../controllers/multisigController"
//       );
//       await createRevenueDistribution(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get revenue distribution history for property
 * GET /api/multisig/revenue/history/:propertyId
 */
// router.get(
//   "/revenue/history/:propertyId",
//   authenticate,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const { getRevenueDistributionHistory } = await import(
//         "../controllers/multisigController"
//       );
//       await getRevenueDistributionHistory(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

// ===========================================
// SIGNER MANAGEMENT ROUTES
// ===========================================

/**
 * Add signer to multisig wallet (Admin only)
 * POST /api/multisig/wallets/signers
 */
// router.post(
//   "/wallets/signers",
//   authenticate,
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const { addSigner } = await import("../controllers/multisigController");
//       await addSigner(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Remove signer from multisig wallet (Admin only)
 * DELETE /api/multisig/wallets/signers/:signerId
 */
// router.delete(
//   "/wallets/signers/:signerId",
//   authenticate,
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const { removeSigner } = await import(
//         "../controllers/multisigController"
//       );
//       await removeSigner(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get signers for a wallet
 * GET /api/multisig/wallets/:walletId/signers
 */
// router.get(
//   "/wallets/:walletId/signers",
//   authenticate,
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const { getWalletSigners } = await import(
//         "../controllers/multisigController"
//       );
//       await getWalletSigners(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

// ===========================================
// ADMIN MANAGEMENT ROUTES
// ===========================================

/**
 * Get all platform wallets (Super Admin only)
 * GET /api/multisig/platform/wallets
 */
// router.get(
//   "/platform/wallets",
//   authenticate,
//   requireSuperAdmin,
//   async (req, res) => {
//     try {
//       const { getAllPlatformWallets } = await import(
//         "../controllers/multisigController"
//       );
//       await getAllPlatformWallets(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Get all property wallets for a property (Admin only)
 * GET /api/multisig/property/:propertyId/wallets
 */
// router.get(
//   "/property/:propertyId/wallets",
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const { getPropertyWallets } = await import(
//         "../controllers/multisigController"
//       );
//       await getPropertyWallets(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Emergency wallet operations (Super Admin only)
 * POST /api/multisig/emergency/:walletId/freeze
 */
// router.post(
//   "/emergency/:walletId/freeze",
//   authenticate,
//   requireSuperAdmin,
//   async (req, res) => {
//     try {
//       const { emergencyFreezeWallet } = await import(
//         "../controllers/multisigController"
//       );
//       await emergencyFreezeWallet(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

/**
 * Emergency wallet operations (Super Admin only)
 * POST /api/multisig/emergency/:walletId/unfreeze
 */
// router.post(
//   "/emergency/:walletId/unfreeze",
//   authenticate,
//   requireSuperAdmin,
//   async (req, res) => {
//     try {
//       const { emergencyUnfreezeWallet } = await import(
//         "../controllers/multisigController"
//       );
//       await emergencyUnfreezeWallet(req, res);
//     } catch (error) {
//       res.status(500).json({ error: "Failed to load multisig controller" });
//     }
//   }
// );

// ===========================================
// MONITORING AND ANALYTICS ROUTES
// ===========================================

/**
 * Get platform-wide wallet statistics (Admin only)
 * GET /api/multisig/stats
 */
// router.get("/stats", authenticate, requireAdmin, async (req, res) => {
//   try {
//     const { getPlatformWalletStats } = await import(
//       "../controllers/multisigController"
//     );
//     await getPlatformWalletStats(req, res);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to load multisig controller" });
//   }
// });

/**
 * Get wallet activity feed (Admin only)
 * GET /api/multisig/activity
 */
// router.get("/activity", authenticate, requireAdmin, async (req, res) => {
//   try {
//     const { getWalletActivityFeed } = await import(
//       "../controllers/multisigController"
//     );
//     await getWalletActivityFeed(req, res);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to load multisig controller" });
//   }
// });

/**
 * Health check for all platform wallets (Super Admin only)
 * GET /api/multisig/health
 */
// router.get("/health", authenticate, requireSuperAdmin, async (req, res) => {
//   try {
//     const { performWalletHealthCheck } = await import(
//       "../controllers/multisigController"
//     );
//     await performWalletHealthCheck(req, res);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to load multisig controller" });
//   }
// });

export default router;
