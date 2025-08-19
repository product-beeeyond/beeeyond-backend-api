
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Property from '../models/Property';
import PropertyHolding from '../models/PropertyHolding';
import MultiSigTransaction from '../models/MultiSigTransaction';
import MultiSigWallet from '../models/MultiSigWallet';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { STELLAR_NETWORK } from '../config';

export const GetAllProperties = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      location,
      propertyType,
      minPrice,
      maxPrice,
      minReturn,
      status = 'active',
      featured,
      search
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Build where conditions
    const whereConditions: any = {};

    if (status) {
      whereConditions.status = status;
    }

    if (location) {
      whereConditions.location = {
        [Op.iLike]: `%${location}%`
      };
    }

    if (propertyType) {
      whereConditions.propertyType = propertyType;
    }

    if (minPrice || maxPrice) {
      whereConditions.tokenPrice = {};
      if (minPrice) whereConditions.tokenPrice[Op.gte] = Number(minPrice);
      if (maxPrice) whereConditions.tokenPrice[Op.lte] = Number(maxPrice);
    }

    if (minReturn) {
      whereConditions.expectedAnnualReturn = {
        [Op.gte]: Number(minReturn)
      };
    }

    if (featured === 'true') {
      whereConditions.featured = true;
    }

    if (search) {
      whereConditions[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: properties } = await Property.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: MultiSigWallet,
          as: 'multiSigWallets',
          attributes: ['stellarPublicKey', 'walletType', 'status'],
          required: false,
        }
      ],
      order: [
        ['featured', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: Number(limit),
      offset,
      attributes: {
        exclude: ['documents'] // Exclude heavy documents field from listing
      }
    });

    const propertiesWithMetrics = await Promise.all(
      properties.map(async (property) => {
        const [investorCount, transactionCount, totalInvested] = await Promise.all([
          PropertyHolding.count({
            where: {
              propertyId: property.id,
              tokensOwned: { [Op.gt]: 0 }
            }
          }),
          // Count executed multisig transactions for this property
          MultiSigTransaction.count({
            where: {
              '$wallet.propertyId$': property.id,
              status: 'executed',
              '$metadata.transactionType$': 'buy'
            },
            include: [
              {
                model: MultiSigWallet,
                as: 'wallet',
                attributes: [],
                where: { propertyId: property.id }
              }
            ]
          }),
          // Sum total invested from completed buy transactions
          MultiSigTransaction.sum('metadata.totalAmount', {
            where: {
              '$wallet.propertyId$': property.id,
              status: 'executed',
              '$metadata.transactionType$': 'buy'
            },
            include: [
              {
                model: MultiSigWallet,
                as: 'wallet',
                attributes: [],
                where: { propertyId: property.id }
              }
            ]
          }) as Promise<number>
        ]);

        const fundingProgress = ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100;

        // Get wallet information
        const distributionWallet = property.multiSigWallets?.find(w => w.walletType === 'property_distribution');
        const governanceWallet = property.multiSigWallets?.find(w => w.walletType === 'property_governance');

        return {
          ...property.toJSON(),
          metrics: {
            investorCount,
            transactionCount,
            fundingProgress: Math.round(fundingProgress),
            tokensSold: property.totalTokens - property.availableTokens,
            totalInvested: totalInvested || 0,
          },
          wallets: {
            distribution: distributionWallet ? {
              publicKey: distributionWallet.stellarPublicKey,
              status: distributionWallet.status
            } : null,
            governance: governanceWallet ? {
              publicKey: governanceWallet.stellarPublicKey,
              status: governanceWallet.status
            } : null
          }
        };
      })
    );

    res.json({
      properties: propertiesWithMetrics,
      pagination: {
        total: count,
        page: Number(page),
        pages: Math.ceil(count / Number(limit)),
        limit: Number(limit),
      },
    });

  } catch (error) {
    logger.error('Properties fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
}

export const GetSingleProperty = async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id, {
      include: [
        {
          model: MultiSigWallet,
          as: 'multiSigWallets',
          attributes: ['id', 'stellarPublicKey', 'walletType', 'status'],
          required: false,
        }
      ]
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get additional metrics using multisig transactions
    const [investorCount, recentTransactions, totalInvested] = await Promise.all([
      PropertyHolding.count({
        where: {
          propertyId: property.id,
          tokensOwned: { [Op.gt]: 0 }
        }
      }),
      // Get recent multisig transactions for this property
      MultiSigTransaction.findAll({
        where: {
          status: 'executed'
        },
        include: [
          {
            model: MultiSigWallet,
            as: 'wallet',
            where: { propertyId: property.id },
            attributes: ['walletType']
          }
        ],
        order: [['executedAt', 'DESC']],
        limit: 5,
      }),
      // Sum total invested from completed buy transactions
      MultiSigTransaction.sum('metadata.totalAmount', {
        where: {
          status: 'executed',
          '$metadata.transactionType$': 'buy'
        },
        include: [
          {
            model: MultiSigWallet,
            as: 'wallet',
            attributes: [],
            where: { propertyId: property.id }
          }
        ]
      }) as Promise<number>
    ]);

    const fundingProgress = ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100;

    // Process recent transactions to show activity
    const processedTransactions = recentTransactions.map(tx => {
      const metadata = tx.metadata as any;
      return {
        type: metadata?.transactionType || 'unknown',
        quantity: metadata?.quantity || 0,
        pricePerToken: metadata?.pricePerToken || 0,
        executedAt: tx.executedAt,
        stellarTxHash: tx.executionTxHash
      };
    });

    // Get wallet information
    const distributionWallet = property.multiSigWallets?.find(w => w.walletType === 'property_distribution');
    const governanceWallet = property.multiSigWallets?.find(w => w.walletType === 'property_governance');

    res.json({
      ...property.toJSON(),
      metrics: {
        investorCount,
        fundingProgress: Math.round(fundingProgress),
        tokensSold: property.totalTokens - property.availableTokens,
        totalInvested: totalInvested || 0,
        recentTransactions: processedTransactions,
      },
      wallets: {
        distribution: distributionWallet ? {
          id: distributionWallet.id,
          publicKey: distributionWallet.stellarPublicKey,
          status: distributionWallet.status
        } : null,
        governance: governanceWallet ? {
          id: governanceWallet.id,
          publicKey: governanceWallet.stellarPublicKey,
          status: governanceWallet.status
        } : null
      },
      blockchain: {
        assetCode: property.stellarAssetCode,
        assetIssuer: property.stellarAssetIssuer,
        networkType: STELLAR_NETWORK
      }
    });

  } catch (error) {
    logger.error('Property fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch property details' });
  }
}

export const GetPropertyAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.params.id;
    const { period = '30d' } = req.query;

    // Calculate date range based on period
    const startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get multisig transactions for the property in the period
    const transactions = await MultiSigTransaction.findAll({
      where: {
        status: 'executed',
        executedAt: { [Op.gte]: startDate }
      },
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          where: { propertyId },
          attributes: ['walletType']
        }
      ],
      order: [['executedAt', 'ASC']]
    });

    // Calculate price history and volume from multisig transactions
    const priceHistory: any[] = [];
    const volumeHistory: any[] = [];
    let currentPrice = 0;

    transactions.forEach((tx) => {
      const metadata = tx.metadata as any;
      if (!metadata || !tx.executedAt) return;

      const date = tx.executedAt.toISOString().split('T')[0];
      const transactionType = metadata.transactionType;
      const quantity = metadata.quantity || 0;
      const pricePerToken = metadata.pricePerToken || 0;
      const totalAmount = metadata.totalAmount || 0;

      if (pricePerToken > 0) {
        currentPrice = pricePerToken;

        // Update price history
        const existingPricePoint = priceHistory.find(p => p.date === date);
        if (existingPricePoint) {
          existingPricePoint.price = pricePerToken;
        } else {
          priceHistory.push({ date, price: pricePerToken });
        }
      }

      // Update volume history
      const existingVolumePoint = volumeHistory.find(v => v.date === date);
      if (existingVolumePoint) {
        if (transactionType === 'buy') {
          existingVolumePoint.buyVolume += quantity;
          existingVolumePoint.buyValue += totalAmount;
        } else if (transactionType === 'sell') {
          existingVolumePoint.sellVolume += quantity;
          existingVolumePoint.sellValue += totalAmount;
        }
        existingVolumePoint.totalVolume = existingVolumePoint.buyVolume + existingVolumePoint.sellVolume;
      } else {
        volumeHistory.push({
          date,
          buyVolume: transactionType === 'buy' ? quantity : 0,
          sellVolume: transactionType === 'sell' ? quantity : 0,
          totalVolume: quantity,
          buyValue: transactionType === 'buy' ? totalAmount : 0,
          sellValue: transactionType === 'sell' ? totalAmount : 0,
        });
      }
    });

    // Calculate summary metrics
    const buyTransactions = transactions.filter(tx => {
      const metadata = tx.metadata as any;
      return metadata?.transactionType === 'buy';
    });
    
    const sellTransactions = transactions.filter(tx => {
      const metadata = tx.metadata as any;
      return metadata?.transactionType === 'sell';
    });

    const totalBuyVolume = buyTransactions.reduce((sum, tx) => {
      const metadata = tx.metadata as any;
      return sum + (metadata?.quantity || 0);
    }, 0);

    const totalSellVolume = sellTransactions.reduce((sum, tx) => {
      const metadata = tx.metadata as any;
      return sum + (metadata?.quantity || 0);
    }, 0);

    const averageBuyPrice = buyTransactions.length > 0
      ? buyTransactions.reduce((sum, tx) => {
          const metadata = tx.metadata as any;
          return sum + (metadata?.pricePerToken || 0);
        }, 0) / buyTransactions.length
      : 0;

    const averageSellPrice = sellTransactions.length > 0
      ? sellTransactions.reduce((sum, tx) => {
          const metadata = tx.metadata as any;
          return sum + (metadata?.pricePerToken || 0);
        }, 0) / sellTransactions.length
      : 0;

    // Get wallet balances if available
    const distributionWallet = await MultiSigWallet.findOne({
      where: { propertyId, walletType: 'property_distribution', status: 'active' }
    });

    let walletBalance = null;
    if (distributionWallet) {
      try {
        const { stellarService } = await import('../services/stellarService');
        const balances = await stellarService.getAccountBalance(distributionWallet.stellarPublicKey);
        walletBalance = balances;
      } catch (error) {
        logger.warn('Failed to fetch wallet balance:', error);
      }
    }

    res.json({
      priceHistory,
      volumeHistory,
      summary: {
        currentPrice,
        averageBuyPrice,
        averageSellPrice,
        totalBuyVolume,
        totalSellVolume,
        netVolume: totalBuyVolume - totalSellVolume,
        priceChange: averageBuyPrice > 0 ? ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100 : 0,
        transactionCount: transactions.length,
        period,
      },
      walletInfo: distributionWallet ? {
        publicKey: distributionWallet.stellarPublicKey,
        balances: walletBalance,
      } : null
    });

  } catch (error) {
    logger.error('Property analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch property analytics' });
  }
}

// New function to get property transaction history
export const GetPropertyTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Get property wallets
    const propertyWallets = await MultiSigWallet.findAll({
      where: { propertyId, status: 'active' },
      attributes: ['id']
    });

    if (propertyWallets.length === 0) {
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

    const walletIds = propertyWallets.map(w => w.id);

    // Get multisig transactions for the property
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
      order: [['executedAt', 'DESC'], ['createdAt', 'DESC']],
      limit,
      offset,
    });

    // Process transactions to extract relevant information
    const processedTransactions = transactions.map(tx => {
      const metadata = tx.metadata as any;
      return {
        id: tx.id,
        type: metadata?.transactionType || 'unknown',
        description: tx.description,
        category: tx.category,
        status: tx.status,
        stellarTxHash: tx.executionTxHash,
        quantity: metadata?.quantity || 0,
        pricePerToken: metadata?.pricePerToken || 0,
        totalAmount: metadata?.totalAmount || 0,
        platformFee: metadata?.platformFee || 0,
        netAmount: metadata?.netAmount || 0,
        executedAt: tx.executedAt,
        createdAt: tx.createdAt,
        wallet: tx.wallet,
        failureReason: tx.failureReason,
      };
    });

    res.json({
      transactions: processedTransactions,
      pagination: {
        total: count,
        page,
        pages: Math.ceil(count / limit),
        limit,
      },
    });

  } catch (error) {
    logger.error('Property transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch property transactions' });
  }
}

// New function to get property wallet status
export const GetPropertyWalletStatus = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.params.id;

    // Verify property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get all wallets for the property
    const wallets = await MultiSigWallet.findAll({
      where: { propertyId, status: 'active' },
      include: [
        {
          model: MultiSigSigner,
          as: 'signers',
          attributes: ['publicKey', 'weight', 'role', 'status']
        }
      ]
    });

    // Get wallet balances
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const { stellarService } = await import('../services/stellarService');
          const balances = await stellarService.getAccountBalance(wallet.stellarPublicKey);
          return {
            ...wallet.toJSON(),
            balances
          };
        } catch (error) {
          logger.warn(`Failed to get balance for wallet ${wallet.stellarPublicKey}:`, error);
          return {
            ...wallet.toJSON(),
            balances: [],
            balanceError: 'Failed to load balance'
          };
        }
      })
    );

    // Get recent transactions for these wallets
    const recentTransactions = await MultiSigTransaction.findAll({
      where: {
        multiSigWalletId: { [Op.in]: wallets.map(w => w.id) },
        status: { [Op.in]: ['executed', 'pending', 'failed'] }
      },
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'description', 'category', 'status', 'executedAt', 'createdAt', 'metadata']
    });

    res.json({
      property: {
        id: property.id,
        title: property.title,
        stellarAssetCode: property.stellarAssetCode,
        stellarAssetIssuer: property.stellarAssetIssuer,
      },
      wallets: walletsWithBalances,
      recentActivity: recentTransactions.map(tx => {
        const metadata = tx.metadata as any;
        return {
          id: tx.id,
          description: tx.description,
          category: tx.category,
          status: tx.status,
          type: metadata?.transactionType,
          amount: metadata?.totalAmount,
          executedAt: tx.executedAt,
          createdAt: tx.createdAt,
        };
      }),
      summary: {
        totalWallets: wallets.length,
        activeWallets: wallets.filter(w => w.status === 'active').length,
        hasDistributionWallet: wallets.some(w => w.walletType === 'property_distribution'),
        hasGovernanceWallet: wallets.some(w => w.walletType === 'property_governance'),
      }
    });

  } catch (error) {
    logger.error('Property wallet status error:', error);
    res.status(500).json({ error: 'Failed to fetch property wallet status' });
  }
}
