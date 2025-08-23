/* eslint-disable @typescript-eslint/no-explicit-any */
// import { Response, } from 'express';
// import { Op } from 'sequelize';
// import { sequelize } from '../config/database';
// import { AuthRequest } from '../middleware/auth';
// import Property from '../models/Property';
// import Transaction from '../models/Transaction';
// import PropertyHolding from '../models/PropertyHolding';
// import Wallet from '../models/Wallet';
// // import { stellarService } from '../services/stellarService';
// import { emailService } from '../services/emailService';
// // import { smsService } from '../services/smsService';
// import logger from '../utils/logger';

// export const BuyPropertyToken = async (req: AuthRequest, res: Response) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { propertyId, quantity, paymentMethod } = req.body;
//     const userId = req.user!.id;

//     // Get property details
//     const property = await Property.findByPk(propertyId, { transaction: dbTransaction });
//     if (!property) {
//       await dbTransaction.rollback();
//       return res.status(404).json({ error: 'Property not found' });
//     }

//     if (property.status !== 'active') {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: 'Property is not available for investment' });
//     }

//     if (quantity > property.availableTokens) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: 'Insufficient tokens available' });
//     }

//     // Calculate costs
//     const pricePerToken = property.tokenPrice;
//     const totalAmount = quantity * pricePerToken;
//     const platformFee = totalAmount * 0.025; // 2.5% platform fee
//     const netAmount = totalAmount + platformFee;

//     // Check minimum investment
//     if (totalAmount < property.minimumInvestment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         error: `Minimum investment is ₦${property.minimumInvestment} `
//       });
//     }

//     // Check user wallet balance
//     const wallet = await Wallet.findOne({
//       where: { userId, currency: 'NGN' },
//       transaction: dbTransaction
//     });

//     if (!wallet || wallet.availableBalance < netAmount) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: 'Insufficient wallet balance' });
//     }

//     // Create transaction record
//     const transaction = await Transaction.create({
//       userId,
//       propertyId,
//       transactionType: 'buy',
//       orderType: 'market',
//       quantity,
//       pricePerToken,
//       totalAmount,
//       platformFee,
//       netAmount,
//       status: 'processing',
//       paymentMethod,
//       sessionId: req.headers['x-session-id'] as string,
//       ipAddress: req.ip,
//     }, { transaction: dbTransaction });

//     // Update wallet balances
//     await wallet.update({
//       availableBalance: wallet.availableBalance - netAmount,
//       lockedBalance: wallet.lockedBalance + netAmount,
//     }, { transaction: dbTransaction });

//     // Update property available tokens
//     await property.update({
//       availableTokens: property.availableTokens - quantity,
//     }, { transaction: dbTransaction });

//     // Update or create property holding
//     const [holding] = await PropertyHolding.findOrCreate({
//       where: { userId, propertyId },
//       // defaults: {
//       //   tokensOwned: 0,
//       //   totalInvested: 0,
//       //   currentValue: 0,
//       //   averagePrice: 0,
//       // },
//       transaction: dbTransaction,
//     });

//     const newTotalTokens = holding.tokensOwned + quantity;
//     const newTotalInvested = holding.totalInvested + totalAmount;
//     const newAveragePrice = newTotalInvested / newTotalTokens;
//     const newCurrentValue = newTotalTokens * pricePerToken;

//     await holding.update({
//       tokensOwned: newTotalTokens,
//       totalInvested: newTotalInvested,
//       averagePrice: newAveragePrice,
//       currentValue: newCurrentValue,
//     }, { transaction: dbTransaction });

//     // Process Stellar transaction if needed
//     let stellarTxHash = "";
//     if (paymentMethod === 'stellar' && property.stellarAssetCode) {
//       try {
//         // This would require user's Stellar wallet integration
//         // For now, we'll simulate the transaction
//         stellarTxHash = 'simulated_stellar_hash_' + Date.now();
//       } catch (stellarError) {
//         logger.error('Stellar transaction failed:', stellarError);
//         // Continue with the transaction but log the error
//       }
//     }

//     // Complete the transaction
//     await transaction.update({
//       status: 'completed',
//       stellarTxHash,
//     }, { transaction: dbTransaction });

//     // Update wallet - move from locked to completed
//     await wallet.update({
//       lockedBalance: wallet.lockedBalance - netAmount,
//     }, { transaction: dbTransaction });

//     await dbTransaction.commit();

//     // Send notifications
//     try {
//       await emailService.sendTransactionConfirmation(req.user!.email, req.user!.firstName || 'User', {
//         type: 'Purchase',
//         propertyTitle: property.title,
//         quantity,
//         amount: totalAmount,
//       });

//       // if (req.user!.phone) {
//       //   await smsService.sendTransactionAlert(req.user!.phone, {
//       //     type: 'purchase',
//       //     quantity,
//       //     amount: totalAmount,
//       //   });
//       // }
//     } catch (notificationError) {
//       logger.error('Failed to send notifications:', notificationError);
//     }

//     res.status(201).json({
//       message: 'Investment successful',
//       transaction: {
//         id: transaction.id,
//         quantity,
//         totalAmount,
//         platformFee,
//         netAmount,
//         status: 'completed',
//       },
//       holding: {
//         tokensOwned: newTotalTokens,
//         totalInvested: newTotalInvested,
//         currentValue: newCurrentValue,
//         averagePrice: newAveragePrice,
//       },
//     });

//   } catch (error) {
//     await dbTransaction.rollback();
//     logger.error('Investment purchase error:', error);
//     res.status(500).json({ error: 'Investment purchase failed' });
//   }
// }

// export const SellPropertyToken = async (req: AuthRequest, res: Response) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { propertyId, quantity } = req.body;
//     const userId = req.user!.id;

//     // Get property and holding details
//     const [property, holding] = await Promise.all([
//       Property.findByPk(propertyId, { transaction: dbTransaction }),
//       PropertyHolding.findOne({
//         where: { userId, propertyId },
//         transaction: dbTransaction
//       })
//     ]);

//     if (!property) {
//       await dbTransaction.rollback();
//       return res.status(404).json({ error: 'Property not found' });
//     }

//     if (!holding || holding.tokensOwned < quantity) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: 'Insufficient tokens to sell' });
//     }

//     // Calculate proceeds
//     const pricePerToken = property.tokenPrice;
//     const totalAmount = quantity * pricePerToken;
//     const platformFee = totalAmount * 0.025; // 2.5% platform fee
//     const netAmount = totalAmount - platformFee;

//     // Create transaction record
//     const transaction = await Transaction.create({
//       userId,
//       propertyId,
//       transactionType: 'sell',
//       orderType: 'market',
//       quantity,
//       pricePerToken,
//       totalAmount,
//       platformFee,
//       netAmount,
//       status: 'completed',
//       sessionId: req.headers['x-session-id'] as string,
//       ipAddress: req.ip,
//     }, { transaction: dbTransaction });

//     // Update property available tokens
//     await property.update({
//       availableTokens: property.availableTokens + quantity,
//     }, { transaction: dbTransaction });

//     // Update holding
//     const newTokensOwned = holding.tokensOwned - quantity;
//     const proportionalInvestment = (quantity / holding.tokensOwned) * holding.totalInvested;
//     const newTotalInvested = holding.totalInvested - proportionalInvestment;

//     if (newTokensOwned > 0) {
//       await holding.update({
//         tokensOwned: newTokensOwned,
//         totalInvested: newTotalInvested,
//         currentValue: newTokensOwned * pricePerToken,
//         averagePrice: newTotalInvested / newTokensOwned,
//       }, { transaction: dbTransaction });
//     } else {
//       // Remove holding if no tokens left
//       await holding.destroy({ transaction: dbTransaction });
//     }

//     // Update user wallet
//     const wallet = await Wallet.findOne({
//       where: { userId, currency: 'NGN' },
//       transaction: dbTransaction
//     });

//     if (wallet) {
//       await wallet.update({
//         availableBalance: wallet.availableBalance + netAmount,
//       }, { transaction: dbTransaction });
//     }

//     await dbTransaction.commit();

//     // Send notifications
//     try {
//       await emailService.sendTransactionConfirmation(req.user!.email, req.user!.firstName || 'User', {
//         type: 'Sale',
//         propertyTitle: property.title,
//         quantity,
//         amount: netAmount,
//       });

//       // if (req.user!.phone) {
//       //   await smsService.sendTransactionAlert(req.user!.phone, {
//       //     type: 'sale',
//       //     quantity,
//       //     amount: netAmount,
//       //   });
//       // }
//     } catch (notificationError) {
//       logger.error('Failed to send notifications:', notificationError);
//     }

//     res.json({
//       message: 'Sale successful',
//       transaction: {
//         id: transaction.id,
//         quantity,
//         totalAmount,
//         platformFee,
//         netAmount,
//         status: 'completed',
//       },
//     });

//   } catch (error) {
//     await dbTransaction.rollback();
//     logger.error('Investment sale error:', error);
//     res.status(500).json({ error: 'Investment sale failed' });
//   }
// }

// export const GetUserPortfolio = async (req: AuthRequest, res: Response) => {
//   try {
//     const userId = req.user!.id;

//     // Get all holdings with property details
//     const holdings = await PropertyHolding.findAll({
//       where: { userId, tokensOwned: { [Op.gt]: 0 } },
//       include: [{
//         model: Property,
//         as: 'property',
//         attributes: ['id', 'title', 'location', 'propertyType', 'tokenPrice', 'expectedAnnualReturn', 'images']
//       }],
//       order: [['updatedAt', 'DESC']]
//     });

//     // Calculate portfolio summary
//     const portfolioSummary = holdings.reduce((acc, holding) => {
//       acc.totalProperties += 1;
//       acc.totalTokens += holding.tokensOwned;
//       acc.totalInvested += holding.totalInvested;
//       acc.currentValue += holding.currentValue;
//       return acc;
//     }, {
//       totalProperties: 0,
//       totalTokens: 0,
//       totalInvested: 0,
//       currentValue: 0,
//     });

//     const totalReturn = portfolioSummary.currentValue - portfolioSummary.totalInvested;
//     const returnPercentage = portfolioSummary.totalInvested > 0
//       ? (totalReturn / portfolioSummary.totalInvested) * 100
//       : 0;

//     // Get wallet balance
//     const wallet = await Wallet.findOne({
//       where: { userId, currency: 'NGN' }
//     });

//     res.json({
//       summary: {
//         ...portfolioSummary,
//         totalReturn,
//         returnPercentage,
//         availableBalance: wallet?.availableBalance || 0,
//       },
//       holdings: holdings.map(holding => ({
//         ...holding.toJSON(),
//         performance: {
//           gainLoss: holding.currentValue - holding.totalInvested,
//           gainLossPercentage: holding.totalInvested > 0
//             ? ((holding.currentValue - holding.totalInvested) / holding.totalInvested) * 100
//             : 0,
//         }
//       }))
//     });

//   } catch (error) {
//     logger.error('Portfolio fetch error:', error);
//     res.status(500).json({ error: 'Failed to fetch portfolio' });
//   }
// }

// export const GetTransactionHistory = async (req: AuthRequest, res: Response) => {
//   try {
//     const userId = req.user!.id;
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 20;
//     const offset = (page - 1) * limit;

//     const { count, rows: transactions } = await Transaction.findAndCountAll({
//       where: { userId },
//       include: [{
//         model: Property,
//         as: 'property',
//         attributes: ['id', 'title', 'location', 'images']
//       }],
//       order: [['createdAt', 'DESC']],
//       limit,
//       offset,
//     });

//     res.json({
//       transactions,
//       pagination: {
//         total: count,
//         page,
//         pages: Math.ceil(count / limit),
//         limit,
//       },
//     });

//   } catch (error) {
//     logger.error('Transaction history fetch error:', error);
//     res.status(500).json({ error: 'Failed to fetch transaction history' });
//   }
// }
 
import { Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import Property from '../models/Property';
import PropertyHolding from '../models/PropertyHolding';
import MultiSigWallet from '../models/MultiSigWallet';
import MultiSigTransaction from '../models/MultiSigTransaction';
import MultiSigSigner from '../models/MultiSigSigner';
import { stellarService } from '../services/stellarService';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';

export const BuyPropertyToken = async (req: AuthRequest, res: Response) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { propertyId, quantity, paymentMethod } = req.body;
    const userId = req.user!.id;

    // Get property details
    const property = await Property.findByPk(propertyId, { transaction: dbTransaction });
    if (!property) {
      await dbTransaction.rollback();
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.status !== 'active') {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Property is not available for investment' });
    }

    if (quantity > property.availableTokens) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Insufficient tokens available' });
    }

    // Calculate costs
    const pricePerToken = property.tokenPrice;
    const totalAmount = quantity * pricePerToken;
    const platformFee = totalAmount * 0.025; // 2.5% platform fee
    const netAmount = totalAmount + platformFee;

    // Check minimum investment
    if (totalAmount < property.minimumInvestment) {
      await dbTransaction.rollback();
      return res.status(400).json({
        error: `Minimum investment is ₦${property.minimumInvestment}`
      });
    }

    // Get user's multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: 'user_recovery', status: 'active' },
      include: [{ model: MultiSigSigner, as: 'signers' }],
      transaction: dbTransaction
    });

    if (!userWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({ 
        error: 'User wallet not found. Please create a recovery wallet first.' 
      });
    }

    // Check wallet balance (would need to implement balance checking via Stellar)
    const walletBalances = await stellarService.getAccountBalance(userWallet.stellarPublicKey);
    const bngnBalance = walletBalances.find(b => b.asset_code === 'bNGN');
    
    if (!bngnBalance || parseFloat(bngnBalance.balance) < netAmount) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: { propertyId, walletType: 'property_distribution', status: 'active' },
      transaction: dbTransaction
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Property distribution wallet not found' });
    }

    // Create multisig transaction for the purchase
    const multisigTransaction = await MultiSigTransaction.create({
      multiSigWalletId: userWallet.id,
      transactionXDR: '', // Will be populated by stellar service
      description: `Purchase ${quantity} tokens of ${property.title}`,
      category: 'fund_management',
      requiredSignatures: 1, // User recovery wallet needs 1 signature
      status: 'pending',
      proposedBy: userId,
      metadata: {
        transactionType: 'buy',
        propertyId,
        quantity,
        pricePerToken,
        totalAmount,
        platformFee,
        netAmount,
        paymentMethod,
        sessionId: req.headers['x-session-id'] as string,
        ipAddress: req.ip,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    }, { transaction: dbTransaction });

    // Update property available tokens (reserve them)
    await property.update({
      availableTokens: property.availableTokens - quantity,
    }, { transaction: dbTransaction });

    // Update or create property holding
    const [holding] = await PropertyHolding.findOrCreate({
      where: { userId, propertyId },
      defaults: {
        tokensOwned: 0,
        totalInvested: 0,
        currentValue: 0,
        averagePrice: 0,
      },
      transaction: dbTransaction,
    });

    const newTotalTokens = holding.tokensOwned + quantity;
    const newTotalInvested = holding.totalInvested + totalAmount;
    const newAveragePrice = newTotalInvested / newTotalTokens;
    const newCurrentValue = newTotalTokens * pricePerToken;

    await holding.update({
      tokensOwned: newTotalTokens,
      totalInvested: newTotalInvested,
      averagePrice: newAveragePrice,
      currentValue: newCurrentValue,
    }, { transaction: dbTransaction });

    // Simulate payment processing and auto-execute transaction
    try {
      // In a real implementation, this would involve:
      // 1. Creating the actual Stellar transaction XDR
      // 2. Getting user signature (or using platform recovery key)
      // 3. Executing the transaction on Stellar network
      
      const stellarTxHash = await stellarService.executeTokenPurchase({
        userWalletPublicKey: userWallet.stellarPublicKey,
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        assetCode: property.stellarAssetCode || `PROP${propertyId.substring(0, 8).toUpperCase()}`,
        assetIssuer: property.stellarAssetIssuer || propertyWallet.stellarPublicKey,
        amount: quantity.toString(),
        paymentAmount: netAmount.toString(),
      });

      // Update multisig transaction status
      await multisigTransaction.update({
        status: 'executed',
        executedBy: userId,
        executedAt: new Date(),
        executionTxHash: stellarTxHash,
      }, { transaction: dbTransaction });

    } catch (stellarError) {
      // If Stellar transaction fails, rollback everything
      await multisigTransaction.update({
        status: 'failed',
        failureReason: stellarError instanceof Error ? stellarError.message : 'Unknown Stellar error',
      }, { transaction: dbTransaction });
      
      await dbTransaction.rollback();
      return res.status(500).json({ 
        error: 'Payment processing failed',
        details: stellarError instanceof Error ? stellarError.message : 'Unknown error'
      });
    }

    await dbTransaction.commit();

    // Send notifications
    try {
      await emailService.sendTransactionConfirmation(req.user!.email, req.user!.firstName || 'User', {
        type: 'Purchase',
        propertyTitle: property.title,
        quantity,
        amount: totalAmount,
      });

      // if (req.user!.phone) {
      //   await smsService.sendTransactionAlert(req.user!.phone, {
      //     type: 'purchase',
      //     quantity,
      //     amount: totalAmount,
      //   });
      // }
    } catch (notificationError) {
      logger.error('Failed to send notifications:', notificationError);
    }

    res.status(201).json({
      message: 'Investment successful',
      transaction: {
        id: multisigTransaction.id,
        multisigTransactionId: multisigTransaction.id,
        stellarTxHash: multisigTransaction.executionTxHash,
        quantity,
        totalAmount,
        platformFee,
        netAmount,
        status: 'executed',
      },
      holding: {
        tokensOwned: newTotalTokens,
        totalInvested: newTotalInvested,
        currentValue: newCurrentValue,
        averagePrice: newAveragePrice,
      },
    });

  } catch (error) {
    await dbTransaction.rollback();
    logger.error('Investment purchase error:', error);
    res.status(500).json({ error: 'Investment purchase failed' });
  }
};

export const SellPropertyToken = async (req: AuthRequest, res: Response) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { propertyId, quantity } = req.body;
    const userId = req.user!.id;

    // Get property and holding details
    const [property, holding] = await Promise.all([
      Property.findByPk(propertyId, { transaction: dbTransaction }),
      PropertyHolding.findOne({
        where: { userId, propertyId },
        transaction: dbTransaction
      })
    ]);

    if (!property) {
      await dbTransaction.rollback();
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!holding || holding.tokensOwned < quantity) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Insufficient tokens to sell' });
    }

    // Get user's multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: 'user_recovery', status: 'active' },
      transaction: dbTransaction
    });

    if (!userWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'User wallet not found' });
    }

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: { propertyId, walletType: 'property_distribution', status: 'active' },
      transaction: dbTransaction
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Property distribution wallet not found' });
    }

    // Calculate proceeds
    const pricePerToken = property.tokenPrice;
    const totalAmount = quantity * pricePerToken;
    const platformFee = totalAmount * 0.025; // 2.5% platform fee
    const netAmount = totalAmount - platformFee;

    // Create multisig transaction for the sale
    const multisigTransaction = await MultiSigTransaction.create({
      multiSigWalletId: userWallet.id,
      transactionXDR: '', // Will be populated by stellar service
      description: `Sell ${quantity} tokens of ${property.title}`,
      category: 'fund_management',
      requiredSignatures: 1,
      status: 'pending',
      proposedBy: userId,
      metadata: {
        transactionType: 'sell',
        propertyId,
        quantity,
        pricePerToken,
        totalAmount,
        platformFee,
        netAmount,
        sessionId: req.headers['x-session-id'] as string,
        ipAddress: req.ip,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }, { transaction: dbTransaction });

    // Execute the sale on Stellar network
    try {
      const stellarTxHash = await stellarService.executeTokenSale({
        userWalletPublicKey: userWallet.stellarPublicKey,
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        assetCode: property.stellarAssetCode || `PROP${propertyId.substring(0, 8).toUpperCase()}`,
        assetIssuer: property.stellarAssetIssuer || propertyWallet.stellarPublicKey,
        amount: quantity.toString(),
        proceedsAmount: netAmount.toString(),
      });

      // Update multisig transaction
      await multisigTransaction.update({
        status: 'executed',
        executedBy: userId,
        executedAt: new Date(),
        executionTxHash: stellarTxHash,
      }, { transaction: dbTransaction });

    } catch (stellarError) {
      await multisigTransaction.update({
        status: 'failed',
        failureReason: stellarError instanceof Error ? stellarError.message : 'Unknown Stellar error',
      }, { transaction: dbTransaction });
      
      await dbTransaction.rollback();
      return res.status(500).json({ 
        error: 'Sale processing failed',
        details: stellarError instanceof Error ? stellarError.message : 'Unknown error'
      });
    }

    // Update property available tokens
    await property.update({
      availableTokens: property.availableTokens + quantity,
    }, { transaction: dbTransaction });

    // Update holding
    const newTokensOwned = holding.tokensOwned - quantity;
    const proportionalInvestment = (quantity / holding.tokensOwned) * holding.totalInvested;
    const newTotalInvested = holding.totalInvested - proportionalInvestment;

    if (newTokensOwned > 0) {
      await holding.update({
        tokensOwned: newTokensOwned,
        totalInvested: newTotalInvested,
        currentValue: newTokensOwned * pricePerToken,
        averagePrice: newTotalInvested / newTokensOwned,
      }, { transaction: dbTransaction });
    } else {
      // Remove holding if no tokens left
      await holding.destroy({ transaction: dbTransaction });
    }

    await dbTransaction.commit();

    // Send notifications
    try {
      await emailService.sendTransactionConfirmation(req.user!.email, req.user!.firstName || 'User', {
        type: 'Sale',
        propertyTitle: property.title,
        quantity,
        amount: netAmount,
      });

      // if (req.user!.phone) {
      //   await smsService.sendTransactionAlert(req.user!.phone, {
      //     type: 'sale',
      //     quantity,
      //     amount: netAmount,
      //   });
      // }
    } catch (notificationError) {
      logger.error('Failed to send notifications:', notificationError);
    }

    res.json({
      message: 'Sale successful',
      transaction: {
        id: multisigTransaction.id,
        multisigTransactionId: multisigTransaction.id,
        stellarTxHash: multisigTransaction.executionTxHash,
        quantity,
        totalAmount,
        platformFee,
        netAmount,
        status: 'executed',
      },
    });

  } catch (error) {
    await dbTransaction.rollback();
    logger.error('Investment sale error:', error);
    res.status(500).json({ error: 'Investment sale failed' });
  }
};

export const GetUserPortfolio = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all holdings with property details
    const holdings = await PropertyHolding.findAll({
      where: { userId, tokensOwned: { [Op.gt]: 0 } },
      include: [{
        model: Property,
        as: 'property',
        attributes: ['id', 'title', 'location', 'propertyType', 'tokenPrice', 'expectedAnnualReturn', 'images']
      }],
      order: [['updatedAt', 'DESC']]
    });

    // Calculate portfolio summary
    const portfolioSummary = holdings.reduce((acc, holding) => {
      acc.totalProperties += 1;
      acc.totalTokens += holding.tokensOwned;
      acc.totalInvested += holding.totalInvested;
      acc.currentValue += holding.currentValue;
      return acc;
    }, {
      totalProperties: 0,
      totalTokens: 0,
      totalInvested: 0,
      currentValue: 0,
    });

    const totalReturn = portfolioSummary.currentValue - portfolioSummary.totalInvested;
    const returnPercentage = portfolioSummary.totalInvested > 0
      ? (totalReturn / portfolioSummary.totalInvested) * 100
      : 0;

    // Get user's wallet balance from multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: 'user_recovery', status: 'active' }
    });

    let availableBalance = 0;
    if (userWallet) {
      try {
        const balances = await stellarService.getAccountBalance(userWallet.stellarPublicKey);
        const ngnBalance = balances.find(b => b.asset_code === 'NGN');
        availableBalance = ngnBalance ? parseFloat(ngnBalance.balance) : 0;
      } catch (error) {
        logger.error('Failed to fetch wallet balance:', error);
      }
    }

    res.json({
      summary: {
        ...portfolioSummary,
        totalReturn,
        returnPercentage,
        availableBalance,
      },
      holdings: holdings.map(holding => ({
        ...holding.toJSON(),
        performance: {
          gainLoss: holding.currentValue - holding.totalInvested,
          gainLossPercentage: holding.totalInvested > 0
            ? ((holding.currentValue - holding.totalInvested) / holding.totalInvested) * 100
            : 0,
        }
      })),
      wallet: userWallet ? {
        publicKey: userWallet.stellarPublicKey,
        walletType: userWallet.walletType,
        status: userWallet.status,
      } : null
    });

  } catch (error) {
    logger.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
};

export const GetTransactionHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Get user's multisig wallets
    const userWallets = await MultiSigWallet.findAll({
      where: { userId, status: 'active' },
      attributes: ['id', 'stellarPublicKey', 'walletType']
    });

    if (userWallets.length === 0) {
      return res.json({
        transactions: [],
        pagination: {
          total: 0,
          page,
          pages: 0,
          limit,
        },
      });
    }

    const walletIds = userWallets.map(w => w.id);

    // Get multisig transactions
    const { count, rows: transactions } = await MultiSigTransaction.findAndCountAll({
      where: { 
        multiSigWalletId: { [Op.in]: walletIds },
        status: { [Op.in]: ['executed', 'failed'] }
      },
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          attributes: ['stellarPublicKey', 'walletType'],
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    // Enrich transactions with property data where applicable
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const metadata = transaction.metadata as any;
        let propertyData = null;

        if (metadata?.propertyId) {
          try {
            propertyData = await Property.findByPk(metadata.propertyId, {
              attributes: ['id', 'title', 'location', 'images']
            });
          } catch (error) {
            logger.error('Failed to fetch property data for transaction:', error);
          }
        }

        return {
          id: transaction.id,
          type: metadata?.transactionType || 'unknown',
          status: transaction.status,
          stellarTxHash: transaction.executionTxHash,
          description: transaction.description,
          category: transaction.category,
          amount: metadata?.totalAmount || 0,
          quantity: metadata?.quantity || 0,
          pricePerToken: metadata?.pricePerToken || 0,
          platformFee: metadata?.platformFee || 0,
          netAmount: metadata?.netAmount || 0,
          executedAt: transaction.executedAt,
          createdAt: transaction.createdAt,
          property: propertyData,
          wallet: transaction.wallet,
          failureReason: transaction.failureReason,
        };
      })
    );

    res.json({
      transactions: enrichedTransactions,
      pagination: {
        total: count,
        page,
        pages: Math.ceil(count / limit),
        limit,
      },
    });

  } catch (error) {
    logger.error('Transaction history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
};

// New function to get pending multisig transactions
export const GetPendingTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get user's multisig wallets
    const userWallets = await MultiSigWallet.findAll({
      where: { userId, status: 'active' },
      attributes: ['id']
    });

    if (userWallets.length === 0) {
      return res.json({ pendingTransactions: [] });
    }

    const walletIds = userWallets.map(w => w.id);

    // Get pending multisig transactions
    const pendingTransactions = await MultiSigTransaction.findAll({
      where: {
        multiSigWalletId: { [Op.in]: walletIds },
        status: 'pending',
        expiresAt: { [Op.gt]: new Date() }
      },
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          attributes: ['stellarPublicKey', 'walletType'],
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      pendingTransactions: pendingTransactions.map(tx => ({
        id: tx.id,
        description: tx.description,
        category: tx.category,
        requiredSignatures: tx.requiredSignatures,
        currentSignatures: Array.isArray(tx.signatures) ? tx.signatures.length : 0,
        expiresAt: tx.expiresAt,
        createdAt: tx.createdAt,
        metadata: tx.metadata,
        wallet: tx.wallet,
      }))
    });

  } catch (error) {
    logger.error('Pending transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
};