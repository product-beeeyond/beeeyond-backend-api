/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  GetAllProperties, 
  GetPropertyAnalytics, 
  GetSingleProperty,
  GetPropertyTransactions,
  GetPropertyWalletStatus
} from '../controllers/propertyController';
import logger from '../utils/logger';
import PropertyHolding from '../models/PropertyHolding';
import MultiSigWallet from '../models/MultiSigWallet';
import MultiSigTransaction from '../models/MultiSigTransaction';
import Property from '../models/Property';
import { Op } from 'sequelize';

const router = Router();

// ===========================================
// VALIDATION MIDDLEWARE
// ===========================================

const validatePropertyId = (req: any, res: any, next: any) => {
  const { id } = req.params;
  if (!id || id.length < 1) {
    return res.status(400).json({ error: 'Valid property ID is required' });
  }
  next();
};

const validateAnalyticsParams = (req: any, res: any, next: any) => {
  const { period } = req.query;
  const validPeriods = ['7d', '30d', '90d', '1y'];
  
  if (period && !validPeriods.includes(period)) {
    return res.status(400).json({ 
      error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` 
    });
  }
  
  next();
};

const validatePaginationParams = (req: any, res: any, next: any) => {
  const { page, limit } = req.query;
  
  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({ error: 'Page must be a positive number' });
  }
  
  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    return res.status(400).json({ error: 'Limit must be between 1 and 100' });
  }
  
  next();
};

// ===========================================
// PUBLIC PROPERTY ROUTES
// ===========================================

/**
 * Get all properties with filtering and pagination
 * GET /api/properties
 */
router.get('/', 
  validatePaginationParams,
  GetAllProperties
);

/**
 * Get single property details
 * GET /api/properties/:id
 */
router.get('/:id', 
  validatePropertyId,
  GetSingleProperty
);

// ===========================================
// AUTHENTICATED PROPERTY ROUTES
// ===========================================

/**
 * Get property analytics (price history, volume, etc.)
 * GET /api/properties/:id/analytics
 */
router.get('/:id/analytics', 
  authenticate,
  validatePropertyId,
  validateAnalyticsParams,
  GetPropertyAnalytics
);

/**
 * Get property transaction history
 * GET /api/properties/:id/transactions
 */
router.get('/:id/transactions',
  authenticate,
  validatePropertyId,
  validatePaginationParams,
  GetPropertyTransactions
);

/**
 * Get property wallet status and balances
 * GET /api/properties/:id/wallets
 */
router.get('/:id/wallets',
  authenticate,
  validatePropertyId,
  GetPropertyWalletStatus
);

// ===========================================
// PROPERTY SEARCH AND DISCOVERY
// ===========================================

/**
 * Search properties with advanced filters
 * POST /api/properties/search
 */
router.post('/search',
  async (req, res) => {
    try {
      // Advanced search functionality
      const {
        query,
        filters = {},
        sortBy = 'relevance',
        page = 1,
        limit = 20
      } = req.body;

      const searchConditions: any = {};
      
      // Text search
      if (query && query.trim()) {
        searchConditions[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
          { location: { [Op.iLike]: `%${query}%` } },
          { propertyType: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Apply filters
      if (filters.location) searchConditions.location = { [Op.iLike]: `%${filters.location}%` };
      if (filters.propertyType) searchConditions.propertyType = filters.propertyType;
      if (filters.minPrice) searchConditions.tokenPrice = { [Op.gte]: filters.minPrice };
      if (filters.maxPrice) {
        searchConditions.tokenPrice = { 
          ...searchConditions.tokenPrice, 
          [Op.lte]: filters.maxPrice 
        };
      }
      if (filters.minReturn) {
        searchConditions.expectedAnnualReturn = { [Op.gte]: filters.minReturn };
      }
      if (filters.status) searchConditions.status = filters.status;

      // Determine sort order
      let orderBy: any[] = [['createdAt', 'DESC']];
      switch (sortBy) {
        case 'price_low':
          orderBy = [['tokenPrice', 'ASC']];
          break;
        case 'price_high':
          orderBy = [['tokenPrice', 'DESC']];
          break;
        case 'return_high':
          orderBy = [['expectedAnnualReturn', 'DESC']];
          break;
        case 'return_low':
          orderBy = [['expectedAnnualReturn', 'ASC']];
          break;
        case 'newest':
          orderBy = [['createdAt', 'DESC']];
          break;
        case 'oldest':
          orderBy = [['createdAt', 'ASC']];
          break;
        case 'featured':
          orderBy = [['featured', 'DESC'], ['createdAt', 'DESC']];
          break;
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { count, rows: properties } = await Property.findAndCountAll({
        where: searchConditions,
        order: orderBy,
        limit: Number(limit),
        offset,
        include: [
          {
            model: MultiSigWallet,
            as: 'multiSigWallets',
            attributes: ['stellarPublicKey', 'walletType', 'status'],
            required: false,
          }
        ],
        attributes: {
          exclude: ['documents']
        }
      });

      res.json({
        properties,
        searchQuery: query,
        appliedFilters: filters,
        sortBy,
        pagination: {
          total: count,
          page: Number(page),
          pages: Math.ceil(count / Number(limit)),
          limit: Number(limit),
        },
      });

    } catch (error) {
      logger.error('Property search error:', error);
      res.status(500).json({ error: 'Failed to search properties' });
    }
  }
);

// ===========================================
// PROPERTY INVESTMENT METRICS
// ===========================================

/**
 * Get property investment summary
 * GET /api/properties/:id/investment-summary
 */
router.get('/:id/investment-summary',
  authenticate,
  validatePropertyId,
  async (req, res) => {
    try {
      const propertyId = req.params.id;

      const [property, holdings, transactions] = await Promise.all([
        Property.findByPk(propertyId),
        PropertyHolding.findAll({
          where: { propertyId, tokensOwned: { [Op.gt]: 0 } },
          attributes: ['userId', 'tokensOwned', 'totalInvested', 'currentValue', 'averagePrice']
        }),
        MultiSigTransaction.findAll({
          where: {
            status: 'executed'
          },
          include: [
            {
              model: MultiSigWallet,
              as: 'wallet',
              where: { propertyId },
              attributes: ['walletType']
            }
          ]
        })
      ]);

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Calculate investment metrics
      const totalInvestors = holdings.length;
      const totalTokensOwned = holdings.reduce((sum: any, h: { tokensOwned: any; }) => sum + h.tokensOwned, 0);
      const totalInvested = holdings.reduce((sum: any, h: { totalInvested: any; }) => sum + h.totalInvested, 0);
      const totalCurrentValue = holdings.reduce((sum: any, h: { currentValue: any; }) => sum + h.currentValue, 0);

      // Process transactions
      const buyTransactions = transactions.filter((tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return metadata?.transactionType === 'buy';
      });

      const sellTransactions = transactions.filter((tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return metadata?.transactionType === 'sell';
      });

      const totalBuyVolume = buyTransactions.reduce((sum: any, tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return sum + (metadata?.quantity || 0);
      }, 0);

      const totalSellVolume = sellTransactions.reduce((sum: any, tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return sum + (metadata?.quantity || 0);
      }, 0);

      // Calculate distribution breakdown
      const holdingDistribution = holdings.map((holding: { tokensOwned: number; totalInvested: any; }) => ({
        tokensOwned: holding.tokensOwned,
        percentage: (holding.tokensOwned / totalTokensOwned) * 100,
        investmentValue: holding.totalInvested,
      })).sort((a: { tokensOwned: number; }, b: { tokensOwned: number; }) => b.tokensOwned - a.tokensOwned);

      res.json({
        property: {
          id: property.id,
          title: property.title,
          totalTokens: property.totalTokens,
          availableTokens: property.availableTokens,
          tokenPrice: property.tokenPrice,
        },
        investmentSummary: {
          totalInvestors,
          totalTokensOwned,
          totalInvested,
          totalCurrentValue,
          totalReturn: totalCurrentValue - totalInvested,
          returnPercentage: totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0,
          fundingPercentage: ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100,
        },
        tradingActivity: {
          totalTransactions: transactions.length,
          totalBuyVolume,
          totalSellVolume,
          netVolume: totalBuyVolume - totalSellVolume,
          buyTransactionCount: buyTransactions.length,
          sellTransactionCount: sellTransactions.length,
        },
        holdingDistribution: {
          breakdown: holdingDistribution,
          topHolders: holdingDistribution.slice(0, 10),
          concentrationIndex: holdingDistribution.length > 0 ? 
            (holdingDistribution[0].percentage + (holdingDistribution[1]?.percentage || 0)) : 0,
        }
      });

    } catch (error) {
      logger.error('Property investment summary error:', error);
      res.status(500).json({ error: 'Failed to fetch property investment summary' });
    }
  }
);

// ===========================================
// PROPERTY PERFORMANCE TRACKING
// ===========================================

/**
 * Get property performance metrics over time
 * GET /api/properties/:id/performance
 */
router.get('/:id/performance',
  authenticate,
  validatePropertyId,
  validateAnalyticsParams,
  async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { period = '30d' } = req.query;

      // Calculate date range
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
      }

      // Get property and its transactions
      const [property, transactions, currentHoldings] = await Promise.all([
        Property.findByPk(propertyId, {
          include: [
            {
              model: MultiSigWallet,
              as: 'multiSigWallets',
              attributes: ['stellarPublicKey', 'walletType', 'status']
            }
          ]
        }),
        MultiSigTransaction.findAll({
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
        }),
        PropertyHolding.findAll({
          where: { propertyId, tokensOwned: { [Op.gt]: 0 } },
          attributes: ['tokensOwned', 'totalInvested', 'currentValue']
        })
      ]);

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Process daily performance data
      const dailyData = new Map();
      let cumulativeVolume = 0;
      let cumulativeInvestment = 0;

      transactions.forEach((tx: { metadata: any; executedAt: { toISOString: () => string; }; }) => {
        const metadata = tx.metadata as any;
        if (!metadata || !tx.executedAt) return;

        const date = tx.executedAt.toISOString().split('T')[0];
        const quantity = metadata.quantity || 0;
        const totalAmount = metadata.totalAmount || 0;
        const transactionType = metadata.transactionType;

        if (!dailyData.has(date)) {
          dailyData.set(date, {
            date,
            buyVolume: 0,
            sellVolume: 0,
            buyValue: 0,
            sellValue: 0,
            netVolume: 0,
            netValue: 0,
            price: property.tokenPrice,
            cumulativeVolume: cumulativeVolume,
            cumulativeInvestment: cumulativeInvestment
          });
        }

        const dayData = dailyData.get(date);
        
        if (transactionType === 'buy') {
          dayData.buyVolume += quantity;
          dayData.buyValue += totalAmount;
          cumulativeVolume += quantity;
          cumulativeInvestment += totalAmount;
        } else if (transactionType === 'sell') {
          dayData.sellVolume += quantity;
          dayData.sellValue += totalAmount;
          cumulativeVolume -= quantity;
          cumulativeInvestment -= totalAmount;
        }

        dayData.netVolume = dayData.buyVolume - dayData.sellVolume;
        dayData.netValue = dayData.buyValue - dayData.sellValue;
        dayData.cumulativeVolume = cumulativeVolume;
        dayData.cumulativeInvestment = cumulativeInvestment;
      });

      // Convert to array and sort by date
      const performanceData = Array.from(dailyData.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate key performance indicators
      const currentMetrics = currentHoldings.reduce((acc: { totalTokensOwned: any; totalInvested: any; currentValue: any; }, holding: { tokensOwned: any; totalInvested: any; currentValue: any; }) => {
        acc.totalTokensOwned += holding.tokensOwned;
        acc.totalInvested += holding.totalInvested;
        acc.currentValue += holding.currentValue;
        return acc;
      }, { totalTokensOwned: 0, totalInvested: 0, currentValue: 0 });

      const totalReturn = currentMetrics.currentValue - currentMetrics.totalInvested;
      const returnPercentage = currentMetrics.totalInvested > 0 
        ? (totalReturn / currentMetrics.totalInvested) * 100 
        : 0;

      // Calculate period-specific metrics
      const periodBuyVolume = transactions.reduce((sum: any, tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return metadata?.transactionType === 'buy' ? sum + (metadata.quantity || 0) : sum;
      }, 0);

      const periodSellVolume = transactions.reduce((sum: any, tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return metadata?.transactionType === 'sell' ? sum + (metadata.quantity || 0) : sum;
      }, 0);

      // Get wallet balances
      let walletBalances = null;
      const distributionWallet = property.multiSigWallets?.find((w: { walletType: string; }) => w.walletType === 'property_distribution');
      
      if (distributionWallet) {
        try {
          const { stellarService } = await import('../services/stellarService');
          walletBalances = await stellarService.getAccountBalance(distributionWallet.stellarPublicKey);
        } catch (error) {
          logger.warn('Failed to fetch wallet balances:', error);
        }
      }

      res.json({
        property: {
          id: property.id,
          title: property.title,
          tokenPrice: property.tokenPrice,
          totalTokens: property.totalTokens,
          availableTokens: property.availableTokens,
        },
        performanceData,
        currentMetrics: {
          ...currentMetrics,
          totalReturn,
          returnPercentage,
          investorCount: currentHoldings.length,
          fundingPercentage: ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100,
        },
        periodMetrics: {
          period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          transactionCount: transactions.length,
          buyVolume: periodBuyVolume,
          sellVolume: periodSellVolume,
          netVolume: periodBuyVolume - periodSellVolume,
          tradingDays: dailyData.size,
        },
        walletInfo: distributionWallet ? {
          publicKey: distributionWallet.stellarPublicKey,
          status: distributionWallet.status,
          balances: walletBalances,
        } : null
      });

    } catch (error) {
      logger.error('Property performance error:', error);
      res.status(500).json({ error: 'Failed to fetch property performance data' });
    }
  }
);

// ===========================================
// PROPERTY LIQUIDITY ANALYSIS
// ===========================================

/**
 * Get property liquidity metrics
 * GET /api/properties/:id/liquidity
 */
router.get('/:id/liquidity',
  authenticate,
  validatePropertyId,
  async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { days = 30 } = req.query;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));

      const [property, recentTransactions, holdings] = await Promise.all([
        Property.findByPk(propertyId),
        MultiSigTransaction.findAll({
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
          order: [['executedAt', 'DESC']]
        }),
        PropertyHolding.findAll({
          where: { propertyId, tokensOwned: { [Op.gt]: 0 } },
          attributes: ['tokensOwned', 'totalInvested'],
          order: [['tokensOwned', 'DESC']]
        })
      ]);

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Calculate liquidity metrics
      const totalSupply = property.totalTokens - property.availableTokens;
      const tradedVolume = recentTransactions.reduce((sum: any, tx: { metadata: any; }) => {
        const metadata = tx.metadata as any;
        return sum + (metadata?.quantity || 0);
      }, 0);

      // Turnover ratio (volume / circulating supply)
      const turnoverRatio = totalSupply > 0 ? (tradedVolume / totalSupply) * 100 : 0;

      // Trading frequency
      const tradingDays = new Set(
        recentTransactions.map((tx: { executedAt: { toISOString: () => string; }; }) => tx.executedAt?.toISOString().split('T')[0])
      ).size;

      const avgDailyVolume = tradingDays > 0 ? tradedVolume / tradingDays : 0;
      const tradingFrequency = (tradingDays / Number(days)) * 100;

      // Holder concentration (Herfindahl Index)
      const totalTokensHeld = holdings.reduce((sum: any, h: { tokensOwned: any; }) => sum + h.tokensOwned, 0);
      const herfindahlIndex = holdings.reduce((sum: number, holding: { tokensOwned: number; }) => {
        const marketShare = holding.tokensOwned / totalTokensHeld;
        return sum + (marketShare * marketShare);
      }, 0) * 10000; // Scale to 0-10000

      // Liquidity scoring
      const liquidityScore = Math.min(100, (
        (turnoverRatio * 0.4) +
        (tradingFrequency * 0.3) +
        (Math.max(0, 100 - herfindahlIndex / 100) * 0.3)
      ));

      // Recent price volatility
      const prices = recentTransactions
        .map((tx: { metadata: any; }) => (tx.metadata as any)?.pricePerToken)
        .filter((price: number) => price > 0);
      
      let priceVolatility = 0;
      if (prices.length > 1) {
        const avgPrice = prices.reduce((sum: any, p: any) => sum + p, 0) / prices.length;
        const variance = prices.reduce((sum: number, p: number) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
        priceVolatility = Math.sqrt(variance) / avgPrice * 100;
      }

      res.json({
        property: {
          id: property.id,
          title: property.title,
          tokenPrice: property.tokenPrice,
        },
        liquidityMetrics: {
          period: `${days} days`,
          liquidityScore: Math.round(liquidityScore),
          turnoverRatio: Number(turnoverRatio.toFixed(2)),
          tradingFrequency: Number(tradingFrequency.toFixed(2)),
          avgDailyVolume: Math.round(avgDailyVolume),
          totalTradedVolume: tradedVolume,
          tradingDays,
          priceVolatility: Number(priceVolatility.toFixed(2)),
        },
        marketStructure: {
          totalSupply,
          circulatingSupply: totalSupply,
          holderCount: holdings.length,
          herfindahlIndex: Math.round(herfindahlIndex),
          concentrationLevel: herfindahlIndex > 2500 ? 'High' : 
                             herfindahlIndex > 1500 ? 'Medium' : 'Low',
          topHolderPercentage: holdings.length > 0 ? 
            Number(((holdings[0].tokensOwned / totalTokensHeld) * 100).toFixed(2)) : 0,
        },
        recentActivity: recentTransactions.slice(0, 10).map((tx: { metadata: any; executedAt: any; }) => {
          const metadata = tx.metadata as any;
          return {
            type: metadata?.transactionType,
            quantity: metadata?.quantity,
            price: metadata?.pricePerToken,
            timestamp: tx.executedAt,
          };
        })
      });

    } catch (error) {
      logger.error('Property liquidity analysis error:', error);
      res.status(500).json({ error: 'Failed to fetch property liquidity data' });
    }
  }
);

export default router;