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

import { Response } from "express";
import { Op } from "sequelize";
import { sequelize } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import Property from "../models/Property";
import PropertyHolding from "../models/PropertyHolding";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigTransaction from "../models/MultiSigTransaction";
import MultiSigSigner from "../models/MultiSigSigner";
import { stellarService } from "../services/stellarService";
import { emailService } from "../services/emailService";
import logger from "../utils/logger";
import { redisClient } from "../config/redis";
import { v4 as uuidv4 } from "uuid";
import {
  creatorPaymentSchema,
  liquidatePropertySchema,
} from "../middleware/validation";

// Fee calculation constants
const PLATFORM_FEE_PERCENTAGE = 0.03; // 3% platform fee
const CACHE_EXPIRY_SECONDS = 300; // 5 minutes

// interface FeeBreakdown {
//   quantity: number;
//   pricePerToken: number;
//   subtotal: number;
//   platformFee: number;
//   networkFee: number;
//   totalAmount: number;
// }

/**
 * Get buy fee breakdown and cache payment intent
 * POST /api/investments/fees
 */
export const GetBuyFee = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, quantity } = req.body;
    const userId = req.user!.id;

    // Validate inputs
    if (!propertyId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid property ID or quantity",
      });
    }

    // Get property details
    const property = await Property.findByPk(propertyId);
    if (
      !property ||
      !property.stellarAssetCode ||
      !property.stellarAssetIssuer
    ) {
      return res.status(404).json({
        success: false,
        error: "Property not found or lacking asset details",
      });
    }

    if (property.status !== "property_tokenised") {
      return res.status(400).json({
        success: false,
        error: "Property is not available for investment",
      });
    }

    if (quantity > property.availableTokens) {
      return res.status(400).json({
        success: false,
        error: "Insufficient tokens available",
      });
    }

    // Calculate costs
    const pricePerToken = property.tokenPrice;
    const subtotal = quantity * pricePerToken;
    const platformFee = subtotal * PLATFORM_FEE_PERCENTAGE;

    // Estimate network fee (this will be paid via fee bump)
    const networkFee = await stellarService.estimateNetworkFee(2); // 2 operations

    const totalAmount = subtotal + platformFee + networkFee;

    // Check minimum investment
    if (subtotal < property.minimumInvestment) {
      return res.status(400).json({
        success: false,
        error: `Minimum investment is ₦${property.minimumInvestment}`,
      });
    }

    // Create payment intent
    const cacheId = uuidv4();
    const paymentIntent = {
      userId,
      propertyId,
      quantity,
      pricePerToken,
      subtotal,
      platformFee,
      networkFee,
      totalAmount,
      timestamp: new Date().toISOString(),
      sessionId: (req.headers["x-session-id"] as string) || undefined,
      ipAddress: req.ip,
    };

    // Cache the payment intent in Redis
    const cacheKey = `payment_intent:${cacheId}`;
    await redisClient.setEx(
      cacheKey,
      CACHE_EXPIRY_SECONDS,
      JSON.stringify(paymentIntent)
    );

    logger.info(`Payment intent cached: ${cacheId} for user ${userId}`);

    res.status(200).json({
      success: true,
      data: {
        cacheId,
        expiresIn: CACHE_EXPIRY_SECONDS,
        expiresAt: new Date(
          Date.now() + CACHE_EXPIRY_SECONDS * 1000
        ).toISOString(),
        feeBreakdown: {
          quantity,
          pricePerToken,
          subtotal,
          platformFee,
          platformFeePercentage: PLATFORM_FEE_PERCENTAGE * 100,
          networkFee,
          totalAmount,
        },
        property: {
          id: property.id,
          title: property.title,
          availableTokens: property.availableTokens,
        },
      },
    });
  } catch (error) {
    logger.error("Get buy fee error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to calculate fees",
    });
  }
};

export const BuyPropertyToken = async (req: AuthRequest, res: Response) => {
  const dbTransaction = await sequelize.transaction();

  try {
    // const { propertyId, quantity } = req.body;
    const { cacheId } = req.body;
    const userId = req.user!.id;

    if (!cacheId) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Cache ID is required",
      });
    }

    // Retrieve cached payment intent
    const cacheKey = `payment_intent:${cacheId}`;
    const cachedData = await redisClient.get(cacheKey);

    if (!cachedData) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error:
          "Payment intent expired or not found. Please request fees again.",
      });
    }
    const paymentIntent = JSON.parse(cachedData);

    // Verify user owns this payment intent
    if (paymentIntent.userId !== userId) {
      await dbTransaction.rollback();
      return res.status(403).json({
        success: false,
        error: "Unauthorized payment",
      });
    }
    const { propertyId, quantity, totalAmount, platformFee, subtotal } =
      paymentIntent;

    // Re-validate property (in case status changed)
    const property = await Property.findByPk(propertyId, {
      transaction: dbTransaction,
    });

    if (!property || property.status !== "property_tokenised") {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property is no longer available",
      });
    }
    if (
      !property ||
      !property.stellarAssetCode ||
      !property.stellarAssetIssuer
    ) {
      await dbTransaction.rollback();
      return res
        .status(404)
        .json({ error: "Property not found or lacking asset code/issuer" });
    }
    if (property.availableTokens < 1) {
      await property.update(
        { status: "token_sold_out", stage: 2 },
        { transaction: dbTransaction }
      );
      await dbTransaction.commit();
      logger.info(
        `Property status updated. Status: token_sold_out  propertyId: ${property.id} updatedBy: ${userId}`
      );
      return res.status(400).json({
        error: "Property tokens sold out already",
      });
    }
    if (quantity > property.availableTokens) {
      await dbTransaction.rollback();
      return res.status(400).json({
        error:
          "Insufficient tokens available, please check property's available tokens",
      });
    }
    // Check 15% ownership limit
    const maxAllowedTokens = Math.floor(property.totalTokens * 0.15);
    const currentHolding = await PropertyHolding.findOne({
      where: { userId, propertyId },
      transaction: dbTransaction,
    });

    const currentlyOwnedTokens = currentHolding?.tokensOwned || 0;
    const tokensAfterPurchase = currentlyOwnedTokens + quantity;

    if (tokensAfterPurchase > maxAllowedTokens) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot purchase more than 15% of property tokens. Maximum allowed: ${maxAllowedTokens}, currently owned: ${currentlyOwnedTokens}, attempting to own: ${tokensAfterPurchase}`,
      });
    }

    // Get user's multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: "user", status: "active" },
      include: [{ model: MultiSigSigner, as: "signers" }],
      transaction: dbTransaction,
    });

    if (!userWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        error: "User wallet not found. Please create a user wallet first.",
      });
    }

    // Check wallet balance (would need to implement balance checking via Stellar)
    const walletBalances = await stellarService.getAccountBalance(
      userWallet.stellarPublicKey
    );
    const bngnBalance = walletBalances.find((b) => b.asset_code === "bNGN");

    if (!bngnBalance || parseFloat(bngnBalance.balance) < totalAmount) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: {
        propertyId,
        walletType: "property_distribution",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res
        .status(400)
        .json({ error: "Property distribution wallet not found" });
    }
    //Get platform primary account (for fee collection)
    const platformWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_primary", status: "active" },
      transaction: dbTransaction,
    });

    if (!platformWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform wallet not found",
      });
    }
    // Create multisig transaction for the purchase
    const multisigTransaction = await MultiSigTransaction.create(
      {
        multiSigWalletId: userWallet.id,
        transactionXDR: "", // Will be populated by stellar service
        description: `Purchase ${quantity} tokens of ${property.stellarAssetCode} ${property.title}`,
        category: "fund_management",
        requiredSignatures: 1, // User wallet needs 1 signature
        status: "pending",
        proposedBy: userId,
        metadata: {
          transactionType: "buy",
          propertyId,
          quantity,
          pricePerToken: paymentIntent.pricePerToken,
          subtotal,
          totalAmount,
          platformFee,
          sessionId: paymentIntent.sessionId,
          ipAddress: paymentIntent.ipAddress,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
      { transaction: dbTransaction }
    );

    // Update property available tokens (reserve them)
    await property.update(
      {
        availableTokens: property.availableTokens - quantity,
      },
      { transaction: dbTransaction }
    );

    // Update or create property holding
    const [holding] = await PropertyHolding.findOrCreate({
      where: { userId, propertyId },
      defaults: {
        userId,
        propertyId,
        tokensRedeemed: 0,
        tokensOwned: 0,
        totalInvested: 0,
        currentValue: 0,
        averagePrice: 0,
      },
      transaction: dbTransaction,
    });

    const newTotalTokens = holding.tokensOwned + quantity;
    const newTotalInvested = holding.totalInvested + subtotal;
    const newAveragePrice = newTotalInvested / newTotalTokens;
    const newCurrentValue = newTotalTokens * paymentIntent.pricePerToken;

    await holding.update(
      {
        tokensOwned: newTotalTokens,
        totalInvested: newTotalInvested,
        averagePrice: newAveragePrice,
        currentValue: newCurrentValue,
      },
      { transaction: dbTransaction }
    );

    try {
      const stellarTxHash = await stellarService.executeTokenPurchase({
        userWalletPublicKey: userWallet.stellarPublicKey,
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        platformWalletPublicKey: platformWallet.stellarPublicKey,
        assetCode: property.stellarAssetCode,
        assetIssuer: property.stellarAssetIssuer,
        tokenAmount: quantity.toString(),
        buyAmount: subtotal.toString(),
        platformFee: platformFee.toString(),
      });

      // Update multisig transaction status
      await multisigTransaction.update(
        {
          status: "executed",
          executedBy: userId,
          executedAt: new Date(),
          executionTxHash: stellarTxHash,
        },
        { transaction: dbTransaction }
      );
    } catch (stellarError) {
      // If Stellar transaction fails, rollback everything
      await multisigTransaction.update(
        {
          status: "failed",
          failureReason:
            stellarError instanceof Error
              ? stellarError.message
              : "Unknown Stellar error",
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.rollback();
      return res.status(500).json({
        error: "Payment processing failed",
        details:
          stellarError instanceof Error
            ? stellarError.message
            : "Unknown error",
      });
    }

    await dbTransaction.commit();

    // Send notifications
    try {
      await emailService.sendTransactionConfirmation(
        req.user!.email,
        req.user!.firstName || "User",
        {
          type: "Purchase",
          propertyTitle: property.title,
          quantity,
          amount: totalAmount,
        }
      );

      // if (req.user!.phone) {
      //   await smsService.sendTransactionAlert(req.user!.phone, {
      //     type: 'purchase',
      //     quantity,
      //     amount: totalAmount,
      //   });
      // }
    } catch (notificationError) {
      logger.error("Failed to send notifications:", notificationError);
    }

    res.status(201).json({
      message: "Investment successful",
      transaction: {
        id: multisigTransaction.id,
        multisigTransactionId: multisigTransaction.id,
        stellarTxHash: multisigTransaction.executionTxHash,
        quantity,
        subtotal,
        platformFee,
        totalAmount,
        status: "executed",
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
    logger.error("Investment purchase error:", error);
    res.status(500).json({ error: "Investment purchase failed" });
  }
};

export const PayCreator = async (req: AuthRequest, res: Response) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { error } = creatorPaymentSchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      return res.status(400).json({
        error: `Validation error`,
        details: error,
      });
    }
    const { propertyId, amount } = req.body;
    const userId = req.user!.id;

    // Validate inputs
    if (!propertyId || !amount || amount <= 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Invalid property ID or amount",
      });
    }

    // Get property details
    const property = await Property.findByPk(propertyId, {
      transaction: dbTransaction,
    });

    if (
      !property ||
      !property.stellarAssetCode ||
      !property.stellarAssetIssuer
    ) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Property not found or lacking asset details",
      });
    }

    if (property.status !== "token_sold_out") {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property tokens must be sold out before paying creator",
      });
    }

    if (property.stage !== 2) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property is not at the correct stage for creator payment",
      });
    }

    // Calculate platform fee (3%)
    const platformFee = amount * 0.03;
    const creatorAmount = amount - platformFee;

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: {
        propertyId,
        walletType: "property_distribution",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property distribution wallet not found",
      });
    }

    // Get creator wallet
    const creatorWallet = await MultiSigWallet.findOne({
      where: {
        userId: property.creatorId,
        walletType: "user",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!creatorWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Creator wallet not found",
      });
    }

    // Get platform primary wallet
    const platformWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_primary", status: "active" },
      transaction: dbTransaction,
    });

    if (!platformWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform wallet not found",
      });
    }

    // Check property wallet has sufficient bNGN
    const issuerWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_issuer", status: "active" },
      transaction: dbTransaction,
    });

    if (!issuerWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform issuer wallet not found",
      });
    }

    const walletBalances = await stellarService.getAccountBalance(
      propertyWallet.stellarPublicKey
    );
    const bNGNBalance = walletBalances.find(
      (b) =>
        b.asset_code === "bNGN" &&
        b.asset_issuer === issuerWallet.stellarPublicKey
    );

    if (!bNGNBalance || parseFloat(bNGNBalance.balance) < amount) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Insufficient bNGN in distribution wallet",
      });
    }

    // Create multisig transaction
    const multisigTransaction = await MultiSigTransaction.create(
      {
        multiSigWalletId: propertyWallet.id,
        transactionXDR: "",
        description: `Pay creator ${creatorAmount} bNGN for ${property.title}`,
        category: "fund_management",
        requiredSignatures: 1,
        status: "pending",
        proposedBy: userId,
        metadata: {
          transactionType: "creator_payment",
          propertyId,
          amount,
          creatorAmount,
          platformFee,
          creatorId: property.creatorId,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { transaction: dbTransaction }
    );

    try {
      const stellarTxHash = await stellarService.executeCreatorPayment({
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        creatorWalletPublicKey: creatorWallet.stellarPublicKey,
        platformWalletPublicKey: platformWallet.stellarPublicKey,
        creatorAmount: creatorAmount.toString(),
        platformFee: platformFee.toString(),
      });

      // Update multisig transaction
      await multisigTransaction.update(
        {
          status: "executed",
          executedBy: userId,
          executedAt: new Date(),
          executionTxHash: stellarTxHash,
        },
        { transaction: dbTransaction }
      );

      // Update property stage to creator_paid
      await property.update({ stage: 3 }, { transaction: dbTransaction });

      await dbTransaction.commit();

      logger.info(
        `Creator payment executed: ${creatorAmount} bNGN to creator, ${platformFee} bNGN platform fee. Property: ${propertyId}, Stage updated to: 3`
      );

      res.status(200).json({
        success: true,
        message: "Creator payment successful",
        transaction: {
          id: multisigTransaction.id,
          stellarTxHash: multisigTransaction.executionTxHash,
          totalAmount: amount,
          creatorAmount,
          platformFee,
          status: "executed",
        },
        property: {
          id: property.id,
          title: property.title,
          stage: 3,
        },
      });
    } catch (stellarError) {
      await multisigTransaction.update(
        {
          status: "failed",
          failureReason:
            stellarError instanceof Error
              ? stellarError.message
              : "Unknown Stellar error",
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.rollback();
      logger.error("Creator payment Stellar error:", stellarError);
      return res.status(500).json({
        success: false,
        error: "Payment processing failed",
        details:
          stellarError instanceof Error
            ? stellarError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    await dbTransaction.rollback();
    logger.error("Creator payment error:", error);
    res.status(500).json({
      success: false,
      error: "Creator payment failed",
    });
  }
};

export const LiquidateProperty = async (req: AuthRequest, res: Response) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { error } = liquidatePropertySchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      return res.status(400).json({
        error: `Validation error`,
        details: error,
      });
    }
    const { propertyId, saleAmount } = req.body;
    const userId = req.user!.id;

    // Validate inputs
    if (!propertyId || !saleAmount || saleAmount <= 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Invalid property ID or sale amount",
      });
    }

    // Get property details
    const property = await Property.findByPk(propertyId, {
      transaction: dbTransaction,
    });

    if (
      !property ||
      !property.stellarAssetCode ||
      !property.stellarAssetIssuer
    ) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Property not found or lacking asset details",
      });
    }

    if (!property.propertyManagerPublicKey) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property does not have a designated property manager",
      });
    }

    if (property.status !== "token_sold_out") {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property must be in token_sold_out status to liquidate",
      });
    }

    if (property.stage !== 3) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error:
          "Property is not at the correct stage for liquidation (must be stage 3: creator_paid)",
      });
    }

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: {
        propertyId,
        walletType: "property_distribution",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property distribution wallet not found",
      });
    }

    // Get property manager's wallet
    const managerWallet = await MultiSigWallet.findOne({
      where: {
        userId,
        walletType: "user",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!managerWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property manager wallet not found",
      });
    }

    // Verify the requesting user is the designated property manager
    if (managerWallet.stellarPublicKey !== property.propertyManagerPublicKey) {
      await dbTransaction.rollback();
      return res.status(403).json({
        success: false,
        error:
          "Only the designated property manager can liquidate this property",
      });
    }

    const issuerWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_issuer", status: "active" },
      transaction: dbTransaction,
    });

    if (!issuerWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform issuer wallet not found",
      });
    }
    // Check property manager wallet has sufficient bNGN
    const walletBalances = await stellarService.getAccountBalance(
      managerWallet.stellarPublicKey
    );
    const bNGNBalance = walletBalances.find(
      (b) =>
        b.asset_code === "bNGN" &&
        b.asset_issuer === issuerWallet.stellarPublicKey
    );

    if (!bNGNBalance || parseFloat(bNGNBalance.balance) < saleAmount) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Insufficient bNGN in buyer wallet",
      });
    }

    // Calculate new price per token
    const newPricePerToken = saleAmount / property.totalTokens;

    // Create multisig transaction
    const multisigTransaction = await MultiSigTransaction.create(
      {
        multiSigWalletId: managerWallet.id,
        transactionXDR: "",
        description: `Liquidate property ${property.title} - ${saleAmount} bNGN payment`,
        category: "fund_management",
        requiredSignatures: 1,
        status: "pending",
        proposedBy: userId,
        metadata: {
          transactionType: "property_liquidation",
          propertyId,
          saleAmount,
          oldPricePerToken: property.tokenPrice,
          newPricePerToken,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { transaction: dbTransaction }
    );

    try {
      const stellarTxHash = await stellarService.executePropertyLiquidation({
        managerWallet,
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        saleAmount: saleAmount.toString(),
      });

      // Update multisig transaction
      await multisigTransaction.update(
        {
          status: "executed",
          executedBy: userId,
          executedAt: new Date(),
          executionTxHash: stellarTxHash,
        },
        { transaction: dbTransaction }
      );

      // Update property status, stage, and price per token
      await property.update(
        {
          status: "property_liquidated",
          stage: 4,
          tokenPrice: newPricePerToken,
        },
        { transaction: dbTransaction }
      );

      // Update all property holdings with new current value based on new price
      await PropertyHolding.update(
        {
          currentValue: sequelize.literal(
            `"tokensOwned" * ${newPricePerToken}`
          ),
        },
        {
          where: { propertyId },
          transaction: dbTransaction,
        }
      );

      await dbTransaction.commit();

      logger.info(
        `Property liquidation executed: ${saleAmount} bNGN paid. Property: ${propertyId}, Status: property_liquidated, Stage: 4, New price per token: ${newPricePerToken}`
      );

      res.status(200).json({
        success: true,
        message: "Property liquidation successful",
        transaction: {
          id: multisigTransaction.id,
          stellarTxHash: multisigTransaction.executionTxHash,
          saleAmount,
          status: "executed",
        },
        property: {
          id: property.id,
          title: property.title,
          status: "property_liquidated",
          stage: 4,
          oldPricePerToken: property.tokenPrice,
          newPricePerToken,
        },
      });
    } catch (stellarError) {
      await multisigTransaction.update(
        {
          status: "failed",
          failureReason:
            stellarError instanceof Error
              ? stellarError.message
              : "Unknown Stellar error",
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.rollback();
      logger.error("Property liquidation Stellar error:", stellarError);
      return res.status(500).json({
        success: false,
        error: "Liquidation processing failed",
        details:
          stellarError instanceof Error
            ? stellarError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    await dbTransaction.rollback();
    logger.error("Property liquidation error:", error);
    res.status(500).json({
      success: false,
      error: "Property liquidation failed",
    });
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
        transaction: dbTransaction,
      }),
    ]);

    if (
      !property ||
      !property.stellarAssetCode ||
      !property.stellarAssetIssuer
    ) {
      await dbTransaction.rollback();
      return res
        .status(404)
        .json({ error: "Property not found or missing asset details" });
    }

    // Property must be liquidated before redemption
    if (property.status !== "property_liquidated") {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Property must be liquidated before tokens can be redeemed",
      });
    }

    if (property.stage !== 4) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error:
          "Property tokens cannot be redeemed yet as property has not been liquidated",
      });
    }

    if (!holding || holding.tokensOwned < quantity) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: "Insufficient tokens to sell" });
    }

    // Get user's multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: "user", status: "active" },
      transaction: dbTransaction,
    });

    if (!userWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: "User wallet not found" });
    }

    // Get property distribution wallet
    const propertyWallet = await MultiSigWallet.findOne({
      where: {
        propertyId,
        walletType: "property_distribution",
        status: "active",
      },
      transaction: dbTransaction,
    });

    if (!propertyWallet) {
      await dbTransaction.rollback();
      return res
        .status(400)
        .json({ error: "Property distribution wallet not found" });
    }

    // Calculate proceeds
    const pricePerToken = property.tokenPrice;
    const totalAmount = quantity * pricePerToken;
    const platformFee = totalAmount * 0.025; // 2.5% platform fee
    const netAmount = totalAmount - platformFee;

    const issuerWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_issuer", status: "active" },
      transaction: dbTransaction,
    });

    if (!issuerWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform issuer wallet not found",
      });
    }

    const walletBalances = await stellarService.getAccountBalance(
      propertyWallet.stellarPublicKey
    );

    const bNGNBalance = walletBalances.find(
      (b) =>
        b.asset_code === "bNGN" &&
        b.asset_issuer === issuerWallet.stellarPublicKey
    );

    if (!bNGNBalance || parseFloat(bNGNBalance.balance) < totalAmount) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error:
          "Insufficient bNGN in property distribution wallet for redemption",
      });
    }
    // Get platform primary wallet for fee collection
    const platformWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_primary", status: "active" },
      transaction: dbTransaction,
    });

    if (!platformWallet) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        error: "Platform wallet not found",
      });
    }
    // Create multisig transaction for the sale
    const multisigTransaction = await MultiSigTransaction.create(
      {
        multiSigWalletId: userWallet.id,
        transactionXDR: "", // Will be populated by stellar service
        description: `Sell ${quantity} tokens of ${property.title}`,
        category: "fund_management",
        requiredSignatures: 1,
        status: "pending",
        proposedBy: userId,
        metadata: {
          transactionType: "sell",
          propertyId,
          quantity,
          pricePerToken,
          totalAmount,
          platformFee,
          netAmount,
          sessionId: req.headers["x-session-id"] as string,
          ipAddress: req.ip,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { transaction: dbTransaction }
    );

    // Execute the sale on Stellar network
    try {
      const stellarTxHash = await stellarService.executeTokenSale({
        userWalletPublicKey: userWallet.stellarPublicKey,
        propertyWalletPublicKey: propertyWallet.stellarPublicKey,
        platformWalletPublicKey: platformWallet.stellarPublicKey,
        assetCode: property.stellarAssetCode,
        assetIssuer: property.stellarAssetIssuer,
        amount: quantity.toString(),
        proceedsAmount: netAmount.toString(),
        platformFee: platformFee.toString(),
      });

      // Update multisig transaction
      await multisigTransaction.update(
        {
          status: "executed",
          executedBy: userId,
          executedAt: new Date(),
          executionTxHash: stellarTxHash,
        },
        { transaction: dbTransaction }
      );
    } catch (stellarError) {
      await multisigTransaction.update(
        {
          status: "failed",
          failureReason:
            stellarError instanceof Error
              ? stellarError.message
              : "Unknown Stellar error",
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.rollback();
      return res.status(500).json({
        error: "Sale processing failed",
        details:
          stellarError instanceof Error
            ? stellarError.message
            : "Unknown error",
      });
    }

    // // Update property available tokens
    // await property.update(
    //   {
    //     availableTokens: property.availableTokens + quantity,
    //   },
    //   { transaction: dbTransaction }
    // );

    // Update holding
    const newTokensOwned = holding.tokensOwned - quantity;
    const proportionalInvestment =
      (quantity / holding.tokensOwned) * holding.totalInvested;
    const newTotalInvested = holding.totalInvested - proportionalInvestment;
    const tokensRedeemed = (holding.tokensRedeemed || 0) + quantity;

    if (newTokensOwned > 0) {
      await holding.update(
        {
          tokensOwned: newTokensOwned,
          tokensRedeemed,
          totalInvested: newTotalInvested,
          currentValue: newTokensOwned * pricePerToken,
          averagePrice: newTotalInvested / newTokensOwned,
        },
        { transaction: dbTransaction }
      );
    } else {
      // Update with final redeemed count before destroying
      await holding.update(
        {
          tokensOwned: 0,
          tokensRedeemed,
          currentValue: 0,
        },
        { transaction: dbTransaction }
      );
      // Remove holding if no tokens left
      await holding.destroy({ transaction: dbTransaction });
    }

    // Check if all tokens have been redeemed across all holders
    const totalTokensRedeemed =
      (await PropertyHolding.sum("tokensRedeemed", {
        where: { propertyId },
        transaction: dbTransaction,
      })) || 0;

    // If all tokens redeemed, update to stage 5
    if (totalTokensRedeemed >= property.totalTokens) {
      await property.update(
        {
          stage: 5,
          status: "token_fully_redeemed",
        },
        { transaction: dbTransaction }
      );

      logger.info(
        `All tokens redeemed for property ${propertyId}. Status: token_fully_redeemed, Stage: 5`
      );
    }
    await dbTransaction.commit();

    // Send notifications
    try {
      await emailService.sendTransactionConfirmation(
        req.user!.email,
        req.user!.firstName || "User",
        {
          type: "Sale",
          propertyTitle: property.title,
          quantity,
          amount: netAmount,
        }
      );

      // if (req.user!.phone) {
      //   await smsService.sendTransactionAlert(req.user!.phone, {
      //     type: 'sale',
      //     quantity,
      //     amount: netAmount,
      //   });
      // }
    } catch (notificationError) {
      logger.error("Failed to send sell notification:", notificationError);
    }

    res.json({
      message: "Sale successful",
      transaction: {
        id: multisigTransaction.id,
        multisigTransactionId: multisigTransaction.id,
        stellarTxHash: multisigTransaction.executionTxHash,
        quantity,
        pricePerToken,
        totalAmount,
        platformFee,
        netAmount,
        status: "executed",
      },
      holding: {
        tokensOwned: newTokensOwned,
        tokensRedeemed,
      },
    });
  } catch (error) {
    await dbTransaction.rollback();
    logger.error("Investment sale error:", error);
    res.status(500).json({ error: "Investment sale failed" });
  }
};

export const GetUserPortfolio = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all holdings with property details
    const holdings = await PropertyHolding.findAll({
      where: { userId, tokensOwned: { [Op.gt]: 0 } },
      include: [
        {
          model: Property,
          as: "property",
          attributes: [
            "id",
            "title",
            "location",
            "propertyType",
            "tokenPrice",
            "expectedAnnualReturn",
            "images",
          ],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    // Calculate portfolio summary
    const portfolioSummary = holdings.reduce(
      (acc, holding) => {
        acc.totalProperties += 1;
        acc.totalTokens += holding.tokensOwned;
        acc.totalInvested += holding.totalInvested;
        acc.currentValue += holding.currentValue;
        return acc;
      },
      {
        totalProperties: 0,
        totalTokens: 0,
        totalInvested: 0,
        currentValue: 0,
      }
    );

    const totalReturn =
      portfolioSummary.currentValue - portfolioSummary.totalInvested;
    const returnPercentage =
      portfolioSummary.totalInvested > 0
        ? (totalReturn / portfolioSummary.totalInvested) * 100
        : 0;

    // Get user's wallet balance from multisig wallet
    const userWallet = await MultiSigWallet.findOne({
      where: { userId, walletType: "user_recovery", status: "active" },
    });

    let availableBalance = 0;
    if (userWallet) {
      try {
        const balances = await stellarService.getAccountBalance(
          userWallet.stellarPublicKey
        );
        const ngnBalance = balances.find((b) => b.asset_code === "NGN");
        availableBalance = ngnBalance ? parseFloat(ngnBalance.balance) : 0;
      } catch (error) {
        logger.error("Failed to fetch wallet balance:", error);
      }
    }

    res.json({
      summary: {
        ...portfolioSummary,
        totalReturn,
        returnPercentage,
        availableBalance,
      },
      holdings: holdings.map((holding) => ({
        ...holding.toJSON(),
        performance: {
          gainLoss: holding.currentValue - holding.totalInvested,
          gainLossPercentage:
            holding.totalInvested > 0
              ? ((holding.currentValue - holding.totalInvested) /
                  holding.totalInvested) *
                100
              : 0,
        },
      })),
      wallet: userWallet
        ? {
            publicKey: userWallet.stellarPublicKey,
            walletType: userWallet.walletType,
            status: userWallet.status,
          }
        : null,
    });
  } catch (error) {
    logger.error("Portfolio fetch error:", error);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
};

export const GetTransactionHistory = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Get user's multisig wallets
    const userWallets = await MultiSigWallet.findAll({
      where: { userId, status: "active" },
      attributes: ["id", "stellarPublicKey", "walletType"],
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

    const walletIds = userWallets.map((w) => w.id);

    // Get multisig transactions
    const { count, rows: transactions } =
      await MultiSigTransaction.findAndCountAll({
        where: {
          multiSigWalletId: { [Op.in]: walletIds },
          status: { [Op.in]: ["executed", "failed"] },
        },
        include: [
          {
            model: MultiSigWallet,
            as: "wallet",
            attributes: ["stellarPublicKey", "walletType"],
          },
        ],
        order: [["createdAt", "DESC"]],
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
              attributes: ["id", "title", "location", "images"],
            });
          } catch (error) {
            logger.error(
              "Failed to fetch property data for transaction:",
              error
            );
          }
        }

        return {
          id: transaction.id,
          type: metadata?.transactionType || "unknown",
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
    logger.error("Transaction history fetch error:", error);
    res.status(500).json({ error: "Failed to fetch transaction history" });
  }
};

// New function to get pending multisig transactions
export const GetPendingTransactions = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    // Get user's multisig wallets
    const userWallets = await MultiSigWallet.findAll({
      where: { userId, status: "active" },
      attributes: ["id"],
    });

    if (userWallets.length === 0) {
      return res.json({ pendingTransactions: [] });
    }

    const walletIds = userWallets.map((w) => w.id);

    // Get pending multisig transactions
    const pendingTransactions = await MultiSigTransaction.findAll({
      where: {
        multiSigWalletId: { [Op.in]: walletIds },
        status: "pending",
        expiresAt: { [Op.gt]: new Date() },
      },
      include: [
        {
          model: MultiSigWallet,
          as: "wallet",
          attributes: ["stellarPublicKey", "walletType"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json({
      pendingTransactions: pendingTransactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        category: tx.category,
        requiredSignatures: tx.requiredSignatures,
        currentSignatures: Array.isArray(tx.signatures)
          ? tx.signatures.length
          : 0,
        expiresAt: tx.expiresAt,
        createdAt: tx.createdAt,
        metadata: tx.metadata,
        wallet: tx.wallet,
      })),
    });
  } catch (error) {
    logger.error("Pending transactions fetch error:", error);
    res.status(500).json({ error: "Failed to fetch pending transactions" });
  }
};
