/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { stellarService } from '../services/stellarService';
import User from '../models/User';
import Property from '../models/Property';
import MultiSigWallet from '../models/MultiSigWallet';
import logger from '../utils/logger';
import MultiSigSigner from '../models/MultiSigSigner';
// import { v4 as uuidv4 } from 'uuid';

// ===========================================
// USER MULTISIG WALLET CREATION 
// ===========================================

export const createUserMultisigWallet = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only create wallet for KYC-verified users
    if (user.kycStatus !== 'verified') {
      return res.status(400).json({ 
        error: 'KYC verification required before wallet creation' 
      });
    }

    // Check if user already has a multisig wallet
    const existingWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: 'user_recovery' }
    });

    if (existingWallet) {
      return res.status(400).json({ 
        error: 'User already has a recovery wallet',
        wallet: {
          publicKey: existingWallet.stellarPublicKey,
          walletId: existingWallet.id
        }
      });
    }

    // Create user wallet (1-of-2: User OR Platform can sign)
    const walletResult = await stellarService.createUserMultiSigWallet({
      userId: user.id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`.trim()
    });

    // // Fund wallet with minimum XLM for operations
    // await stellarService.fundWalletFromTreasury(
    //   walletResult.publicKey,
    //   '2' // 2 XLM minimum reserve
    // );

    logger.info(`User  wallet created for ${user.email}: ${walletResult.publicKey}`);

    res.status(201).json({
      message: 'Wallet created successfully',
      wallet: {
        publicKey: walletResult.publicKey,
        walletId: walletResult.walletId,
        canRecover: true,
        fundedAmount: '2 XLM'
      }
    });

  } catch (error) {
    logger.error('Create user multisig wallet error:', error);
    res.status(500).json({ 
      error: 'Failed to create recovery wallet',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ===========================================
// PLATFORM MULTISIG WALLETS (Treasury, Issuer, etc.)
// ===========================================

export const createPlatformWallets = async (req: AuthRequest, res: Response) => {
  try {
    // Only super admin can create platform wallets
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { walletType, description } = req.body;

    if (!walletType || !['treasury', 'issuer', 'distribution', 'fee_collection'].includes(walletType)) {
      return res.status(400).json({ 
        error: 'Invalid wallet type. Must be: treasury, issuer, distribution, or fee_collection' 
      });
    }

    // Check if platform wallet already exists
    const existingWallet = await MultiSigWallet.findOne({
      where: { walletType: `platform_${walletType}` }
    });

    if (existingWallet) {
      return res.status(400).json({ 
        error: `Platform ${walletType} wallet already exists`,
        publicKey: existingWallet.stellarPublicKey
      });
    }

    let walletResult;
    
    switch (walletType) {
      // case 'treasury':
      //   walletResult = await stellarService.createPlatformTreasuryWallet({
      //     description: description || 'Main platform treasury for funding operations',
      //     createdBy: req.user!.id
      //   });
      //   break;

      case 'issuer':
        walletResult = await stellarService.createPlatformIssuerWallet({
          description: description || 'Asset issuer for property tokens',
          createdBy: req.user!.id
        });
        break;

      // case 'distribution':
      //   walletResult = await stellarService.createPlatformDistributionWallet({
      //     description: description || 'Main distribution wallet for token sales',
      //     createdBy: req.user!.id
      //   });
      //   break;

      // case 'fee_collection':
      //   walletResult = await stellarService.createPlatformFeeCollectionWallet({
      //     description: description || 'Platform fee collection wallet',
      //     createdBy: req.user!.id
      //   });
      //   break;

      default:
        throw new Error('Invalid wallet type');
    }

    logger.info(`Platform ${walletType} wallet created: ${walletResult.publicKey}`);

    res.status(201).json({
      message: `Platform ${walletType} wallet created successfully`,
      wallet: {
        type: `platform_${walletType}`,
        publicKey: walletResult.publicKey,
        walletId: walletResult.walletId,
        signers: walletResult.signers,
        thresholds: walletResult.thresholds
      }
    });

  } catch (error) {
    logger.error('Create platform wallet error:', error);
    res.status(500).json({ 
      error: 'Failed to create platform wallet',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
// ===========================================
// UPDATED CONTROLLER METHODS FOR TWO-PHASE TREASURY CREATION
// ===========================================

/**
 * Phase 1: Create platform treasury wallet (initial creation)
 * POST /api/multisig/platform/treasury/create
 */
export const createPlatformTreasury = async (req: AuthRequest, res: Response) => {
  try {
    // Only super admin can create platform wallets
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { description } = req.body;

    // Check if platform treasury already exists
    const existingTreasury = await MultiSigWallet.findOne({
      where: { walletType: 'platform_treasury' }
    });

    // if (existingTreasury) {.              //deprecated. atomic implemetation now in stellar service
    //   return res.status(400).json({ 
    //     error: 'Platform treasury wallet already exists',
    //     publicKey: existingTreasury.stellarPublicKey,
    //     status: existingTreasury.status,
    //     message: existingTreasury.status === 'awaiting_funding' 
    //       ? 'Treasury exists but needs funding. Check funding status and finalize setup.'
    //       : 'Treasury is already active.'
    //   });
    // }

    // Phase 1: Create treasury wallet
    const treasuryResult = await stellarService.createPlatformTreasuryWallet({
      description: description || 'Main platform treasury for funding operations',
      createdBy: req.user!.id
    });

    logger.info(`Platform treasury created (Phase 1): ${treasuryResult.publicKey}`);

    res.status(201).json({
      message: 'Platform treasury created successfully (Phase 1)',
      phase: 1,
      treasury: {
        publicKey: treasuryResult.publicKey,
        walletId: treasuryResult.walletId,
        status: treasuryResult.status,
        requiredBalance: treasuryResult.requiredBalance,
        fundingRequired: treasuryResult.fundingRequired,
        nextSteps: treasuryResult.nextSteps,
      },
      instructions: treasuryResult.fundingRequired 
        ? `IMPORTANT: Fund this wallet with ${treasuryResult.requiredBalance} XLM, then call POST /api/multisig/platform/treasury/finalize to complete setup.`
        : 'Call POST /api/multisig/platform/treasury/finalize to complete multisig setup.'
    });

  } catch (error) {
    logger.error('Create platform treasury error:', error);
    res.status(500).json({ 
      error: 'Failed to create platform treasury',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Phase 2: Finalize treasury wallet setup
 * POST /api/multisig/platform/treasury/finalize
 */
export const finalizePlatformTreasury = async (req: AuthRequest, res: Response) => {
  try {
    // Only super admin can finalize platform wallets
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ 
        error: 'Treasury wallet public key is required' 
      });
    }

    // Validate that this is a pending treasury wallet
    const wallet = await MultiSigWallet.findOne({
      where: { 
        stellarPublicKey: publicKey,
        walletType: 'platform_treasury',
        status: ['awaiting_funding', 'awaiting_finalization']
      }
    });

    if (!wallet) {
      return res.status(404).json({ 
        error: 'Treasury wallet not found or not in finalizable status',
        hint: 'Wallet must be in awaiting_funding or awaiting_finalization status'
      });
    }

    // Phase 2: Finalize multisig setup
    const finalizationResult = await stellarService.finalizeTreasuryWalletSetup(publicKey);

    logger.info(`Platform treasury finalized: ${publicKey}, TxHash: ${finalizationResult.transactionHash}`);

    res.status(200).json({
      message: 'Platform treasury finalized successfully (Phase 2)',
      phase: 2,
      treasury: {
        publicKey,
        status: finalizationResult.status,
        transactionHash: finalizationResult.transactionHash,
        multisigConfig: finalizationResult.multisigConfig,
        signers: finalizationResult.signers,
      },
      success: true
    });

  } catch (error) {
    logger.error('Finalize platform treasury error:', error);
    res.status(500).json({ 
      error: 'Failed to finalize platform treasury',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Check treasury funding status
 * GET /api/multisig/platform/treasury/status/:publicKey
 */
export const checkTreasuryStatus = async (req: AuthRequest, res: Response) => {
  try {
    // Only super admin can check treasury status
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { publicKey } = req.params;

    if (!publicKey) {
      return res.status(400).json({ 
        error: 'Treasury wallet public key is required' 
      });
    }

    const statusResult = await stellarService.checkTreasuryFundingStatus(publicKey);

    res.status(200).json({
      message: 'Treasury status retrieved successfully',
      treasury: statusResult,
      recommendations: {
        canFinalize: statusResult.readyForFinalization,
        action: statusResult.readyForFinalization 
          ? 'Ready for finalization - call POST /api/multisig/platform/treasury/finalize'
          : statusResult.isSufficientlyFunded 
            ? 'Already finalized or insufficient balance'
            : `Fund wallet with ${statusResult.requiredBalance - statusResult.currentBalance} additional XLM`
      }
    });

  } catch (error) {
    logger.error('Check treasury status error:', error);
    res.status(500).json({ 
      error: 'Failed to check treasury status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * List all treasury wallets (for admin overview)
 * GET /api/multisig/platform/treasury/list
 */
export const listTreasuryWallets = async (req: AuthRequest, res: Response) => {
  try {
    // Only super admin can list treasury wallets
    if (req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const treasuries = await MultiSigWallet.findAll({
      where: { walletType: 'platform_treasury' },
      include: [
        {
          model: MultiSigSigner,
          as: 'signers',
          attributes: ['publicKey', 'role', 'weight', 'status']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const treasuriesWithStatus = await Promise.all(
      treasuries.map(async (treasury) => {
        try {
          const statusResult = await stellarService.checkTreasuryFundingStatus(
            treasury.stellarPublicKey
          );
          return {
            ...treasury.toJSON(),
            fundingStatus: statusResult,
          };
        } catch (error) {
          return {
            ...treasury.toJSON(),
            fundingStatus: { error: 'Could not fetch on-chain status' },
          };
        }
      })
    );

    res.status(200).json({
      message: 'Treasury wallets retrieved successfully',
      count: treasuries.length,
      treasuries: treasuriesWithStatus,
    });

  } catch (error) {
    logger.error('List treasury wallets error:', error);
    res.status(500).json({ 
      error: 'Failed to list treasury wallets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
// ===========================================
// PROPERTY-SPECIFIC MULTISIG WALLETS
// ===========================================

export const createPropertyWallets = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ error: 'Property ID is required' });
    }

    // Verify property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Check if property wallets already exist
    const existingWallet = await MultiSigWallet.findOne({
      where: { propertyId, walletType: 'property_distribution' }
    });

    if (existingWallet) {
      return res.status(400).json({ 
        error: 'Property wallets already exist',
        distributionWallet: existingWallet.stellarPublicKey
      });
    }

    // Create property-specific wallets
    const walletResult = await stellarService.createPropertyWallets({
      propertyId: property.id,
      propertyTitle: property.title,
      propertyManager: property.propertyManager,
      createdBy: req.user!.id
    });

    // Fund distribution wallet with minimum XLM
    await stellarService.fundWalletFromTreasury(
      walletResult.distributionWallet.publicKey,
      '2' // 2 XLM for operations
    );

    // Update property with wallet information
    await property.update({
      stellarAssetCode: `PROP${propertyId.substring(0, 8).toUpperCase()}`,
      stellarAssetIssuer: walletResult.distributionWallet.publicKey
    });

    logger.info(`Property wallets created for ${property.title}: Distribution ${walletResult.distributionWallet.publicKey}`);

    res.status(201).json({
      message: 'Property wallets created successfully',
      property: {
        id: property.id,
        title: property.title
      },
      wallets: {
        distribution: {
          publicKey: walletResult.distributionWallet.publicKey,
          purpose: 'Holds property tokens for sale to investors',
          funded: true
        },
        governance: walletResult.governanceWallet ? {
          publicKey: walletResult.governanceWallet.publicKey,
          purpose: 'Property governance and major decisions'
        } : null
      }
    });

  } catch (error) {
    logger.error('Create property wallets error:', error);
    res.status(500).json({ 
      error: 'Failed to create property wallets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ===========================================
// WALLET RECOVERY OPERATIONS
// ===========================================

export const recoverUserWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { recoveryReason, newUserPublicKey } = req.body;

    // Only admin can initiate recovery
    if (!['admin', 'super_admin'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Admin access required for wallet recovery' });
    }

    if (!userId || !recoveryReason) {
      return res.status(400).json({ 
        error: 'User ID and recovery reason are required' 
      });
    }

    // Find user's recovery wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: 'user_recovery' }
    });

    if (!userWallet) {
      return res.status(404).json({ error: 'User recovery wallet not found' });
    }

    // Perform recovery operation
    const recoveryResult = await stellarService.performWalletRecovery({
      walletPublicKey: userWallet.stellarPublicKey,
      userId,
      newUserPublicKey,
      recoveryReason,
      recoveredBy: req.user!.id
    });

    logger.info(`Wallet recovery performed for user ${userId} by ${req.user!.email}`);

    res.json({
      message: 'Wallet recovery completed successfully',
      recovery: {
        walletPublicKey: userWallet.stellarPublicKey,
        recoveryTransactionHash: recoveryResult.transactionHash,
        newUserPublicKey: newUserPublicKey,
        recoveredBy: req.user!.email,
        recoveryReason
      }
    });

  } catch (error) {
    logger.error('Wallet recovery error:', error);
    res.status(500).json({ 
      error: 'Wallet recovery failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

export const getWalletInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { publicKey } = req.params;

    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }

    const walletInfo = await stellarService.getWalletDetails(publicKey);
    const dbWallet = await MultiSigWallet.findOne({
      where: { stellarPublicKey: publicKey },
      include: ['signers', 'transactions']
    });

    res.json({
      stellarAccount: walletInfo.account,
      walletData: dbWallet,
      signers: walletInfo.signers,
      thresholds: walletInfo.thresholds,
      balances: walletInfo.balances
    });

  } catch (error) {
    logger.error('Get wallet info error:', error);
    res.status(500).json({ 
      error: 'Failed to get wallet information',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const listUserWallets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const wallets = await MultiSigWallet.findAll({
      where: { userId },
      attributes: ['id', 'stellarPublicKey', 'walletType', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balances = await stellarService.getAccountBalance(wallet.stellarPublicKey);
          return {
            ...wallet.toJSON(),
            balances
          };
        } catch (error: any) {
          return {
            ...wallet.toJSON(),
            balances: [],
            balanceError: 'Failed to load balance'
          };
        }
      })
    );

    res.json({
      wallets: walletsWithBalances,
      count: walletsWithBalances.length
    });

  } catch (error) {
    logger.error('List user wallets error:', error);
    res.status(500).json({ 
      error: 'Failed to list user wallets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// export const getGovernanceProposals = async (req: AuthRequest, res: Response) => {
//   try {
//     const { propertyId } = req.params;
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 20;
//     const offset = (page - 1) * limit;

//     const { count, rows: proposals } = await PropertyGovernance.findAndCountAll({
//       where: { propertyId },
//       include: [
//         {
//           model: User,
//           as: 'proposer',
//           attributes: ['firstName', 'lastName', 'email'],
//         },
//         {
//           model: Property,
//           as: 'property',
//           attributes: ['title', 'location'],
//         },
//       ],
//       order: [['createdAt', 'DESC']],
//       limit,
//       offset,
//     });

//     // Check if current user has voted on each proposal
//     const userHolding = await PropertyHolding.findOne({
//       where: { userId: req.user!.id, propertyId },
//     });

//     const proposalsWithUserVote = proposals.map(proposal => {
//       const userVote = proposal.votes?.find((v: any) => v.voter === req.user!.id);
//       return {
//         ...proposal.toJSON(),
//         userHasVoted: !!userVote,
//         userVote: userVote?.vote,
//         userCanVote: !!userHolding && userHolding.tokensOwned > 0,
//         timeRemaining: proposal.status === 'active' ? 
//           Math.max(0, proposal.votingEndAt.getTime() - new Date().getTime()) : 0,
//       };
//     });

//     res.json({
//       proposals: proposalsWithUserVote,
//       pagination: {
//         total: count,
//         page,
//         pages: Math.ceil(count / limit),
//         limit,
//       },
//     });
//   } catch (error) {
//     logger.error('Get governance proposals error:', error);
//     res.status(500).json({ error: 'Failed to fetch governance proposals' });
//   }
// };

// // ===========================================
// // REVENUE DISTRIBUTION
// // ===========================================

// export const createRevenueDistribution = async (req: AuthRequest, res: Response) => {
//   try {
//     const {
//       propertyId,
//       totalRevenue,
//       distributionPeriod, // 'monthly', 'quarterly', 'annual'
//       platformFeePercentage = 2.5,
//     } = req.body;

//     // Validate admin role
//     if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     // Get all token holders for the property
//     const tokenHolders = await PropertyHolding.findAll({
//       where: { 
//         propertyId, 
//         tokensOwned: { [Op.gt]: 0 } 
//       },
//       include: [{ model: User, as: 'user', attributes: ['email', 'firstName'] }],
//     });

//     if (tokenHolders.length === 0) {
//       return res.status(400).json({ error: 'No token holders found for this property' });
//     }

//     // Calculate total tokens in circulation
//     const totalTokensInCirculation = tokenHolders.reduce((sum, holder) => sum + holder.tokensOwned, 0);

//     // Create distribution data
//     const distributionData = tokenHolders.map(holder => ({
//       userId: holder.userId,
//       publicKey: holder.user?.stellarPublicKey, // Assuming users have stellar public keys
//       tokenBalance: holder.tokensOwned,
//       percentage: (holder.tokensOwned / totalTokensInCirculation) * 100,
//     }));

//     const proposalId = await stellarService.createRevenueDistribution(
//       propertyId,
//       totalRevenue,
//       distributionData,
//       platformFeePercentage
//     );

//     // Notify token holders about the distribution
//     try {
//       for (const holder of tokenHolders) {
//         if (holder.user) {
//           const distribution = distributionData.find(d => d.userId === holder.userId);
//           if (distribution) {
//             await emailService.sendRevenueDistributionNotification(
//               holder.user.email,
//               holder.user.firstName,
//               {
//                 propertyId,
//                 totalRevenue,
//                 userShare: (totalRevenue * (1 - platformFeePercentage / 100)) * (distribution.percentage / 100),
//                 distributionPeriod,
//               }
//             );
//           }
//         }
//       }
//     } catch (notificationError) {
//       logger.error('Failed to send revenue distribution notifications:', notificationError);
//     }

//     res.status(201).json({
//       message: 'Revenue distribution created successfully',
//       proposalId,
//       distributionSummary: {
//         totalRevenue,
//         platformFee: totalRevenue * (platformFeePercentage / 100),
//         distributionAmount: totalRevenue * (1 - platformFeePercentage / 100),
//         recipientCount: tokenHolders.length,
//       },
//     });
//   } catch (error) {
//     logger.error('Create revenue distribution error:', error);
//     res.status(500).json({ error: 'Failed to create revenue distribution' });
//   }
// };

// // ===========================================
// // SIGNER MANAGEMENT
// // ===========================================

// export const addSigner = async (req: AuthRequest, res: Response) => {
//   try {
//     const { walletPublicKey, signerPublicKey, weight, role, userId } = req.body;

//     // Validate admin role
//     if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     // This would require creating a multisig transaction to add the signer
//     // For now, we'll just add to the database and require manual Stellar transaction
//     const wallet = await MultiSigWallet.findOne({
//       where: { stellarPublicKey: walletPublicKey }
//     });

//     if (!wallet) {
//       return res.status(404).json({ error: 'Multisig wallet not found' });
//     }

//     // Check if signer already exists
//     const existingSigner = await MultiSigSigner.findOne({
//       where: { multiSigWalletId: wallet.id, publicKey: signerPublicKey }
//     });

//     if (existingSigner) {
//       return res.status(400).json({ error: 'Signer already exists for this wallet' });
//     }

//     const newSigner = await MultiSigSigner.create({
//       multiSigWalletId: wallet.id,
//       userId,
//       publicKey: signerPublicKey,
//       weight,
//       role,
//       status: 'active',
//     });

//     res.status(201).json({
//       message: 'Signer added successfully',
//       signer: newSigner,
//       note: 'Manual Stellar transaction required to activate signer',
//     });
//   } catch (error) {
//     logger.error('Add signer error:', error);
//     res.status(500).json({ error: 'Failed to add signer' });
//   }
// };

// export const removeSigner = async (req: AuthRequest, res: Response) => {
//   try {
//     const { signerId } = req.params;

//     // Validate admin role
//     if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     const signer = await MultiSigSigner.findByPk(signerId);
//     if (!signer) {
//       return res.status(404).json({ error: 'Signer not found' });
//     }

//     await signer.update({ status: 'revoked' });

//     res.json({
//       message: 'Signer removed successfully',
//       note: 'Manual Stellar transaction required to deactivate signer',
//     });
//   } catch (error) {
//     logger.error('Remove signer error:', error);
//     res.status(500).json({ error: 'Failed to remove signer' });
//   }
// };