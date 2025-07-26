import { Response, } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import Property from '../models/Property';
import Transaction from '../models/Transaction';
import PropertyHolding from '../models/PropertyHolding';
import Wallet from '../models/Wallet';
// import { stellarService } from '../services/stellarService';
import { emailService } from '../services/emailService';
// import { smsService } from '../services/smsService';
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
        error: `Minimum investment is ₦${property.minimumInvestment} `
      });
    }

    // Check user wallet balance
    const wallet = await Wallet.findOne({
      where: { userId, currency: 'NGN' },
      transaction: dbTransaction
    });

    if (!wallet || wallet.availableBalance < netAmount) {
      await dbTransaction.rollback();
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Create transaction record
    const transaction = await Transaction.create({
      userId,
      propertyId,
      transactionType: 'buy',
      orderType: 'market',
      quantity,
      pricePerToken,
      totalAmount,
      platformFee,
      netAmount,
      status: 'processing',
      paymentMethod,
      sessionId: req.headers['x-session-id'] as string,
      ipAddress: req.ip,
    }, { transaction: dbTransaction });

    // Update wallet balances
    await wallet.update({
      availableBalance: wallet.availableBalance - netAmount,
      lockedBalance: wallet.lockedBalance + netAmount,
    }, { transaction: dbTransaction });

    // Update property available tokens
    await property.update({
      availableTokens: property.availableTokens - quantity,
    }, { transaction: dbTransaction });

    // Update or create property holding
    const [holding] = await PropertyHolding.findOrCreate({
      where: { userId, propertyId },
      // defaults: {
      //   tokensOwned: 0,
      //   totalInvested: 0,
      //   currentValue: 0,
      //   averagePrice: 0,
      // },
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

    // Process Stellar transaction if needed
    let stellarTxHash = "";
    if (paymentMethod === 'stellar' && property.stellarAssetCode) {
      try {
        // This would require user's Stellar wallet integration
        // For now, we'll simulate the transaction
        stellarTxHash = 'simulated_stellar_hash_' + Date.now();
      } catch (stellarError) {
        logger.error('Stellar transaction failed:', stellarError);
        // Continue with the transaction but log the error
      }
    }

    // Complete the transaction
    await transaction.update({
      status: 'completed',
      stellarTxHash,
    }, { transaction: dbTransaction });

    // Update wallet - move from locked to completed
    await wallet.update({
      lockedBalance: wallet.lockedBalance - netAmount,
    }, { transaction: dbTransaction });

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
        id: transaction.id,
        quantity,
        totalAmount,
        platformFee,
        netAmount,
        status: 'completed',
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
}

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

    // Calculate proceeds
    const pricePerToken = property.tokenPrice;
    const totalAmount = quantity * pricePerToken;
    const platformFee = totalAmount * 0.025; // 2.5% platform fee
    const netAmount = totalAmount - platformFee;

    // Create transaction record
    const transaction = await Transaction.create({
      userId,
      propertyId,
      transactionType: 'sell',
      orderType: 'market',
      quantity,
      pricePerToken,
      totalAmount,
      platformFee,
      netAmount,
      status: 'completed',
      sessionId: req.headers['x-session-id'] as string,
      ipAddress: req.ip,
    }, { transaction: dbTransaction });

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

    // Update user wallet
    const wallet = await Wallet.findOne({
      where: { userId, currency: 'NGN' },
      transaction: dbTransaction
    });

    if (wallet) {
      await wallet.update({
        availableBalance: wallet.availableBalance + netAmount,
      }, { transaction: dbTransaction });
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
        id: transaction.id,
        quantity,
        totalAmount,
        platformFee,
        netAmount,
        status: 'completed',
      },
    });

  } catch (error) {
    await dbTransaction.rollback();
    logger.error('Investment sale error:', error);
    res.status(500).json({ error: 'Investment sale failed' });
  }
}

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

    // Get wallet balance
    const wallet = await Wallet.findOne({
      where: { userId, currency: 'NGN' }
    });

    res.json({
      summary: {
        ...portfolioSummary,
        totalReturn,
        returnPercentage,
        availableBalance: wallet?.availableBalance || 0,
      },
      holdings: holdings.map(holding => ({
        ...holding.toJSON(),
        performance: {
          gainLoss: holding.currentValue - holding.totalInvested,
          gainLossPercentage: holding.totalInvested > 0
            ? ((holding.currentValue - holding.totalInvested) / holding.totalInvested) * 100
            : 0,
        }
      }))
    });

  } catch (error) {
    logger.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
}

export const GetTransactionHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: { userId },
      include: [{
        model: Property,
        as: 'property',
        attributes: ['id', 'title', 'location', 'images']
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      transactions,
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
}
