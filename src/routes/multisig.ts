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
