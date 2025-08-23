/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import { authenticate, requireKYC } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { 
  BuyPropertyToken, 
  GetTransactionHistory, 
  GetUserPortfolio, 
  SellPropertyToken,
  GetPendingTransactions
} from '../controllers/investmentController';
import { Op } from 'sequelize';
import MultiSigTransaction from '../models/MultiSigTransaction';
import MultiSigWallet from '../models/MultiSigWallet';
import Property from '../models/Property';
import PropertyHolding from '../models/PropertyHolding';
import logger from '../utils/logger';

const router = Router();

// ===========================================
// VALIDATION MIDDLEWARE
// ===========================================

const validateInvestmentTransaction = (req: any, res: any, next: any) => {
  const { propertyId, quantity, paymentMethod } = req.body;
  
  if (!propertyId || propertyId.trim().length === 0) {
    return res.status(400).json({ error: 'Property ID is required' });
  }
  
  if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }
  
  if (!paymentMethod || !['wallet', 'stellar', 'bank_transfer'].includes(paymentMethod)) {
    return res.status(400).json({ 
      error: 'Payment method must be one of: wallet, stellar, bank_transfer' 
    });
  }
  
  next();
};

const validateSaleTransaction = (req: any, res: any, next: any) => {
  const { propertyId, quantity } = req.body;
  
  if (!propertyId || propertyId.trim().length === 0) {
    return res.status(400).json({ error: 'Property ID is required' });
  }
  
  if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
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
// CORE INVESTMENT ROUTES
// ===========================================

/**
 * Buy property tokens
 * POST /api/investments/buy
 */
router.post('/buy', 
  authenticate, 
  requireKYC, 
  validateInvestmentTransaction,
  BuyPropertyToken
);

/**
 * Sell property tokens
 * POST /api/investments/sell
 */
router.post('/sell', 
  authenticate, 
  requireKYC,
  validateSaleTransaction,
  SellPropertyToken
);

/**
 * Get user's investment portfolio
 * GET /api/investments/portfolio
 */
router.get('/portfolio', 
  authenticate, 
  GetUserPortfolio
);

/**
 * Get user's transaction history
 * GET /api/investments/transactions
 */
router.get('/transactions', 
  authenticate,
  validatePaginationParams,
  GetTransactionHistory
);

/**
 * Get pending multisig transactions
 * GET /api/investments/transactions/pending
 */
router.get('/transactions/pending',
  authenticate,
  GetPendingTransactions
);

// ===========================================
// PORTFOLIO ANALYTICS ROUTES
// ===========================================

/**
 * Get detailed portfolio analytics
 * GET /api/investments/portfolio/analytics
 */
router.get('/portfolio/analytics',
  authenticate,
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const userId = req.user!.id;

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

      // Get user's multisig wallets
      const userWallets = await MultiSigWallet.findAll({
        where: { userId, status: 'active' },
        attributes: ['id']
      });

      const walletIds = userWallets.map(w => w.id);

      // Get portfolio performance over time
      const transactions = await MultiSigTransaction.findAll({
        where: {
          multiSigWalletId: { [Op.in]: walletIds },
          status: 'executed',
          executedAt: { [Op.gte]: startDate }
        },
        include: [
          {
            model: MultiSigWallet,
            as: 'wallet',
            attributes: ['walletType']
          }
        ],
        order: [['executedAt', 'ASC']]
      });

      // Get current holdings
      const holdings = await PropertyHolding.findAll({
        where: { userId, tokensOwned: { [Op.gt]: 0 } },
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'title', 'tokenPrice', 'propertyType', 'location']
          }
        ]
      });

      // Process daily portfolio value
      const dailyValues = new Map();
      let runningInvestment = 0;
      let runningTokens = 0;

      transactions.forEach(tx => {
        const metadata = tx.metadata as any;
        if (!metadata || !tx.executedAt) return;

        const date = tx.executedAt.toISOString().split('T')[0];
        const quantity = metadata.quantity || 0;
        const totalAmount = metadata.totalAmount || 0;
        const pricePerToken = metadata.pricePerToken || 0;

        if (metadata.transactionType === 'buy') {
          runningInvestment += totalAmount;
          runningTokens += quantity;
        } else if (metadata.transactionType === 'sell') {
          runningInvestment -= (quantity / runningTokens) * runningInvestment;
          runningTokens -= quantity;
        }

        dailyValues.set(date, {
          date,
          totalInvested: runningInvestment,
          totalTokens: runningTokens,
          estimatedValue: runningTokens * pricePerToken,
          gain: (runningTokens * pricePerToken) - runningInvestment
        });
      });

      // Calculate asset allocation
      const assetAllocation = holdings.reduce((acc, holding) => {
        const propertyType = holding.property?.propertyType || 'Unknown';
        const location = holding.property?.location || 'Unknown';
        
        if (!acc.byType[propertyType]) {
          acc.byType[propertyType] = { value: 0, percentage: 0, count: 0 };
        }
        if (!acc.byLocation[location]) {
          acc.byLocation[location] = { value: 0, percentage: 0, count: 0 };
        }

        acc.byType[propertyType].value += holding.currentValue;
        acc.byType[propertyType].count += 1;
        acc.byLocation[location].value += holding.currentValue;
        acc.byLocation[location].count += 1;

        acc.totalValue += holding.currentValue;
        return acc;
      }, {
        byType: {} as any,
        byLocation: {} as any,
        totalValue: 0
      });

      // Calculate percentages
      Object.keys(assetAllocation.byType).forEach(type => {
        assetAllocation.byType[type].percentage = 
          (assetAllocation.byType[type].value / assetAllocation.totalValue) * 100;
      });

      Object.keys(assetAllocation.byLocation).forEach(location => {
        assetAllocation.byLocation[location].percentage = 
          (assetAllocation.byLocation[location].value / assetAllocation.totalValue) * 100;
      });

      // Risk analysis
      const riskMetrics = holdings.map(holding => {
        const property = holding.property;
        const concentration = (holding.currentValue / assetAllocation.totalValue) * 100;
        
        return {
          propertyId: property?.id,
          propertyTitle: property?.title,
          concentration,
          allocation: holding.currentValue,
          performance: holding.currentValue - holding.totalInvested,
          performancePercentage: holding.totalInvested > 0 ? 
            ((holding.currentValue - holding.totalInvested) / holding.totalInvested) * 100 : 0
        };
      });

      res.json({
        period,
        performanceHistory: Array.from(dailyValues.values()),
        currentPortfolio: {
          totalValue: assetAllocation.totalValue,
          totalInvested: holdings.reduce((sum, h) => sum + h.totalInvested, 0),
          totalReturn: assetAllocation.totalValue - holdings.reduce((sum, h) => sum + h.totalInvested, 0),
          returnPercentage: holdings.reduce((sum, h) => sum + h.totalInvested, 0) > 0 ?
            ((assetAllocation.totalValue - holdings.reduce((sum, h) => sum + h.totalInvested, 0)) / 
             holdings.reduce((sum, h) => sum + h.totalInvested, 0)) * 100 : 0,
          propertyCount: holdings.length,
          totalTokens: holdings.reduce((sum, h) => sum + h.tokensOwned, 0)
        },
        assetAllocation,
        riskAnalysis: {
          maxConcentration: Math.max(...riskMetrics.map(r => r.concentration), 0),
          diversificationScore: holdings.length > 1 ? 
            100 - Math.max(...riskMetrics.map(r => r.concentration), 0) : 0,
          topHoldings: riskMetrics.sort((a, b) => b.concentration - a.concentration).slice(0, 5),
          riskLevel: (() => {
            const maxConc = Math.max(...riskMetrics.map(r => r.concentration), 0);
            if (maxConc > 50) return 'High';
            if (maxConc > 25) return 'Medium';
            return 'Low';
          })()
        },
        tradingActivity: {
          totalTransactions: transactions.length,
          buyCount: transactions.filter(tx => (tx.metadata as any)?.transactionType === 'buy').length,
          sellCount: transactions.filter(tx => (tx.metadata as any)?.transactionType === 'sell').length,
          avgTransactionSize: transactions.length > 0 ?
            transactions.reduce((sum, tx) => sum + ((tx.metadata as any)?.totalAmount || 0), 0) / transactions.length : 0
        }
      });

    } catch (error) {
      logger.error('Portfolio analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio analytics' });
    }
  }
);

/**
 * Get investment performance comparison
 * GET /api/investments/performance/comparison
 */
router.get('/performance/comparison',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const { compareWith = 'market', period = '30d' } = req.query;

      // Get user's holdings and transactions
      const [holdings, userWallets] = await Promise.all([
        PropertyHolding.findAll({
          where: { userId, tokensOwned: { [Op.gt]: 0 } },
          include: [
            {
              model: Property,
              as: 'property',
              attributes: ['id', 'title', 'tokenPrice', 'expectedAnnualReturn']
            }
          ]
        }),
        MultiSigWallet.findAll({
          where: { userId, status: 'active' },
          attributes: ['id']
        })
      ]);

      // Calculate user performance
      const userMetrics = holdings.reduce((acc, holding) => {
        acc.totalInvested += holding.totalInvested;
        acc.currentValue += holding.currentValue;
        acc.expectedReturn += (holding.property?.expectedAnnualReturn || 0) * 
          (holding.currentValue / holdings.reduce((sum, h) => sum + h.currentValue, 0));
        return acc;
      }, {
        totalInvested: 0,
        currentValue: 0,
        expectedReturn: 0
      });

      const userReturn = userMetrics.totalInvested > 0 ?
        ((userMetrics.currentValue - userMetrics.totalInvested) / userMetrics.totalInvested) * 100 : 0;

      // Get market comparison data
      let comparisonData = null;

      if (compareWith === 'market') {
        // Calculate overall market performance
        const allProperties = await Property.findAll({
          where: { status: 'active' },
          attributes: ['tokenPrice', 'expectedAnnualReturn']
        });

        const marketReturn = allProperties.length > 0 ?
          allProperties.reduce((sum, p) => sum + p.expectedAnnualReturn, 0) / allProperties.length : 0;

        comparisonData = {
          type: 'market',
          name: 'Market Average',
          return: marketReturn,
          comparison: userReturn - marketReturn
        };
      } else if (compareWith === 'conservative') {
        // Compare with conservative 5% return
        comparisonData = {
          type: 'conservative',
          name: 'Conservative Portfolio (5%)',
          return: 5,
          comparison: userReturn - 5
        };
      }

      // Get peer comparison (users with similar portfolio size)
      const portfolioValue = userMetrics.currentValue;
      const portfolioRange = {
        min: portfolioValue * 0.5,
        max: portfolioValue * 2
      };

      res.json({
        userPerformance: {
          totalInvested: userMetrics.totalInvested,
          currentValue: userMetrics.currentValue,
          absoluteReturn: userMetrics.currentValue - userMetrics.totalInvested,
          percentageReturn: userReturn,
          expectedAnnualReturn: userMetrics.expectedReturn,
          portfolioSize: portfolioValue,
          diversification: holdings.length
        },
        comparison: comparisonData,
        insights: {
          performanceRating: (() => {
            if (userReturn > 15) return 'Excellent';
            if (userReturn > 10) return 'Good';
            if (userReturn > 5) return 'Average';
            if (userReturn > 0) return 'Below Average';
            return 'Poor';
          })(),
          recommendations: (() => {
            const recommendations = [];
            
            if (holdings.length < 3) {
              recommendations.push('Consider diversifying across more properties');
            }
            
            if (userReturn < 5) {
              recommendations.push('Review property selection criteria');
            }
            
            const maxHolding = Math.max(...holdings.map(h => h.currentValue));
            const concentration = (maxHolding / portfolioValue) * 100;
            
            if (concentration > 40) {
              recommendations.push('Consider reducing concentration in top holding');
            }
            
            return recommendations;
          })()
        }
      });

    } catch (error) {
      logger.error('Performance comparison error:', error);
      res.status(500).json({ error: 'Failed to fetch performance comparison' });
    }
  }
);

// ===========================================
// INVESTMENT TOOLS AND UTILITIES
// ===========================================

/**
 * Get investment calculator results
 * POST /api/investments/calculate
 */
router.post('/calculate',
  authenticate,
  async (req, res) => {
    try {
      const {
        propertyId,
        investmentAmount,
        holdingPeriod = 12, // months
        reinvestDividends = false
      } = req.body;

      if (!propertyId || !investmentAmount || investmentAmount <= 0) {
        return res.status(400).json({
          error: 'Property ID and valid investment amount are required'
        });
      }

      const property = await Property.findByPk(propertyId);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Calculate investment details
      const tokenPrice = property.tokenPrice;
      const expectedReturn = property.expectedAnnualReturn;
      const tokensReceived = Math.floor(investmentAmount / tokenPrice);
      const actualInvestment = tokensReceived * tokenPrice;
      const platformFee = actualInvestment * 0.025; // 2.5%
      const totalCost = actualInvestment + platformFee;

      // Calculate projected returns
      const monthlyReturn = expectedReturn / 12 / 100;
      const projectedReturns = [];

      let currentValue = actualInvestment;
      let totalDividends = 0;

      for (let month = 1; month <= holdingPeriod; month++) {
        const monthlyDividend = currentValue * monthlyReturn;
        totalDividends += monthlyDividend;

        if (reinvestDividends) {
          currentValue += monthlyDividend;
        }

        projectedReturns.push({
          month,
          value: currentValue,
          dividends: totalDividends,
          totalReturn: currentValue + (reinvestDividends ? 0 : totalDividends) - actualInvestment,
          returnPercentage: ((currentValue + (reinvestDividends ? 0 : totalDividends) - actualInvestment) / actualInvestment) * 100
        });
      }

      const finalProjection = projectedReturns[projectedReturns.length - 1];

      res.json({
        property: {
          id: property.id,
          title: property.title,
          tokenPrice,
          expectedReturn,
          minimumInvestment: property.minimumInvestment
        },
        calculation: {
          investmentAmount,
          tokensReceived,
          actualInvestment,
          platformFee,
          totalCost,
          holdingPeriod,
          reinvestDividends
        },
        projections: {
          monthly: projectedReturns,
          summary: {
            finalValue: finalProjection.value,
            totalDividends: finalProjection.dividends,
            totalReturn: finalProjection.totalReturn,
            totalReturnPercentage: finalProjection.returnPercentage,
            annualizedReturn: (finalProjection.returnPercentage / holdingPeriod) * 12,
            breakEvenMonths: projectedReturns.findIndex(p => p.totalReturn >= 0) + 1
          }
        },
        risks: {
          liquidityRisk: 'Medium - Property tokens may have limited secondary market',
          marketRisk: 'Property values can fluctuate based on real estate market conditions',
          concentrationRisk: tokensReceived / property.totalTokens > 0.1 ? 
            'High - Large position relative to total supply' : 'Low',
          regulatoryRisk: 'Property investments are subject to regulatory changes'
        },
        recommendations: {
          suitability: investmentAmount < property.minimumInvestment ? 
            'Below minimum investment threshold' :
            investmentAmount > actualInvestment * 0.2 ? 
            'Consider smaller initial position for diversification' : 
            'Suitable investment size',
          diversification: 'Consider spreading investment across multiple properties',
          timeHorizon: holdingPeriod < 12 ? 
            'Consider longer holding period for better returns' :
            'Good holding period for real estate investment'
        }
      });

    } catch (error) {
      logger.error('Investment calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate investment projections' });
    }
  }
);

/**
 * Get investment opportunities (personalized recommendations)
 * GET /api/investments/opportunities
 */
router.get('/opportunities',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const { limit = 10, riskTolerance = 'medium' } = req.query;

      // Get user's current holdings to understand preferences
      const currentHoldings = await PropertyHolding.findAll({
        where: { userId, tokensOwned: { [Op.gt]: 0 } },
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['propertyType', 'location', 'expectedAnnualReturn']
          }
        ]
      });

      // Get user's wallet balance
      const userWallets = await MultiSigWallet.findAll({
        where: { userId, status: 'active' },
        attributes: ['stellarPublicKey']
      });

      let availableBalance = 0;
      if (userWallets.length > 0) {
        try {
          const { stellarService } = await import('../services/stellarService');
          const balances = await stellarService.getAccountBalance(userWallets[0].stellarPublicKey);
          const ngnBalance = balances.find(b => b.asset_code === 'NGN');
          availableBalance = ngnBalance ? parseFloat(ngnBalance.balance) : 0;
        } catch (error) {
          logger.warn('Failed to fetch wallet balance:', error);
        }
      }

      // Analyze user preferences
      const userPreferences = currentHoldings.reduce((acc, holding) => {
        const property = holding.property;
        if (property) {
          acc.propertyTypes[property.propertyType] = (acc.propertyTypes[property.propertyType] || 0) + 1;
          acc.locations[property.location] = (acc.locations[property.location] || 0) + 1;
          acc.avgExpectedReturn += property.expectedAnnualReturn;
        }
        return acc;
      }, {
        propertyTypes: {} as any,
        locations: {} as any,
        avgExpectedReturn: 0
      });

      if (currentHoldings.length > 0) {
        userPreferences.avgExpectedReturn /= currentHoldings.length;
      }

      // Build recommendation criteria
      const whereConditions: any = {
        status: 'active',
        availableTokens: { [Op.gt]: 0 }
      };

      // Filter by risk tolerance
      if (riskTolerance === 'conservative') {
        whereConditions.expectedAnnualReturn = { [Op.between]: [5, 12] };
      } else if (riskTolerance === 'medium') {
        whereConditions.expectedAnnualReturn = { [Op.between]: [8, 18] };
      } else if (riskTolerance === 'aggressive') {
        whereConditions.expectedAnnualReturn = { [Op.gte]: 15 };
      }

      // Filter by affordability
      if (availableBalance > 0) {
        whereConditions.minimumInvestment = { [Op.lte]: availableBalance * 0.8 };
      }

      // Get potential opportunities
      const opportunities = await Property.findAll({
        where: whereConditions,
        include: [
          {
            model: MultiSigWallet,
            as: 'multiSigWallets',
            attributes: ['stellarPublicKey', 'walletType'],
            required: false
          }
        ],
        limit: Number(limit) * 2, // Get more to filter and rank
        order: [['createdAt', 'DESC']]
      });

      // Score and rank opportunities
      const scoredOpportunities = await Promise.all(
        opportunities.map(async (property) => {
          let score = 0;
          let reasons = [];

          // Base score from expected return
          score += Math.min(property.expectedAnnualReturn, 25);

          // Boost for preferred property types
          if (userPreferences.propertyTypes[property.propertyType]) {
            score += 10;
            reasons.push('Matches your property type preference');
          }

          // Boost for preferred locations
          if (userPreferences.locations[property.location]) {
            score += 8;
            reasons.push('Matches your location preference');
          }

          // Boost for diversification (different from current holdings)
          const alreadyHoldsType = currentHoldings.some(h => 
            h.property?.propertyType === property.propertyType
          );
          if (!alreadyHoldsType && currentHoldings.length > 0) {
            score += 15;
            reasons.push('Adds diversification to your portfolio');
          }

          // Funding progress bonus
          const fundingProgress = ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100;
          if (fundingProgress > 50 && fundingProgress < 90) {
            score += 5;
            reasons.push('Good funding momentum');
          }

          // Get additional metrics
          const [investorCount, avgRating] = await Promise.all([
            PropertyHolding.count({
              where: { propertyId: property.id, tokensOwned: { [Op.gt]: 0 } }
            }),
            // If you have a property rating system, calculate average rating here
            Promise.resolve(0)
          ]);

          // Investor count bonus
          if (investorCount > 10) {
            score += 3;
            reasons.push('Popular with other investors');
          }

          // Affordability check
          const affordable = availableBalance >= property.minimumInvestment;
          if (!affordable) {
            score -= 20; // Heavy penalty for unaffordable properties
          }

          return {
            ...property.toJSON(),
            recommendationScore: score,
            recommendationReasons: reasons,
            metrics: {
              investorCount,
              fundingProgress: Math.round(fundingProgress),
              affordability: affordable ? 'Affordable' : 'Above budget'
            },
            estimatedTokens: affordable ? 
              Math.floor((availableBalance * 0.8) / property.tokenPrice) : 0
          };
        })
      );

      // Filter out properties user already holds and sort by score
      const currentPropertyIds = currentHoldings.map(h => h.propertyId);
      const filteredOpportunities = scoredOpportunities
        .filter(opp => !currentPropertyIds.includes(opp.id) && opp.recommendationScore > 0)
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, Number(limit));

      res.json({
        userContext: {
          currentHoldings: currentHoldings.length,
          availableBalance,
          riskTolerance,
          preferredTypes: Object.keys(userPreferences.propertyTypes),
          preferredLocations: Object.keys(userPreferences.locations),
          avgExpectedReturn: userPreferences.avgExpectedReturn
        },
        opportunities: filteredOpportunities,
        summary: {
          totalFound: filteredOpportunities.length,
          avgRecommendationScore: filteredOpportunities.length > 0 ? 
            filteredOpportunities.reduce((sum, opp) => sum + opp.recommendationScore, 0) / filteredOpportunities.length : 0,
          affordableCount: filteredOpportunities.filter(opp => opp.metrics.affordability === 'Affordable').length
        },
        insights: {
          diversificationOpportunities: filteredOpportunities.filter(opp => 
            opp.recommendationReasons.includes('Adds diversification to your portfolio')
          ).length,
          highYieldOpportunities: filteredOpportunities.filter(opp => 
            opp.expectedAnnualReturn > (userPreferences.avgExpectedReturn || 10)
          ).length,
          emergingMarkets: filteredOpportunities.filter(opp => 
            opp.metrics.fundingProgress < 50
          ).length
        }
      });

    } catch (error) {
      logger.error('Investment opportunities error:', error);
      res.status(500).json({ error: 'Failed to fetch investment opportunities' });
    }
  }
);

/**
 * Get investment alerts and notifications
 * GET /api/investments/alerts
 */
router.get('/alerts',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user!.id;

      // Get user's current holdings
      const holdings = await PropertyHolding.findAll({
        where: { userId, tokensOwned: { [Op.gt]: 0 } },
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'title', 'tokenPrice', 'status', 'expectedAnnualReturn']
          }
        ]
      });

      // Get user's wallets and recent transactions
      const userWallets = await MultiSigWallet.findAll({
        where: { userId, status: 'active' },
        attributes: ['id', 'stellarPublicKey']
      });

      const recentTransactions = await MultiSigTransaction.findAll({
        where: {
          multiSigWalletId: { [Op.in]: userWallets.map(w => w.id) },
          status: { [Op.in]: ['pending', 'failed'] },
          createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        },
        order: [['createdAt', 'DESC']]
      });

      const alerts = [];

      // Check for pending transactions
      const pendingTransactions = recentTransactions.filter(tx => tx.status === 'pending');
      if (pendingTransactions.length > 0) {
        alerts.push({
          type: 'pending_transaction',
          severity: 'warning',
          title: `${pendingTransactions.length} Pending Transaction${pendingTransactions.length > 1 ? 's' : ''}`,
          message: 'You have pending transactions that may require your attention',
          actionRequired: true,
          data: { count: pendingTransactions.length }
        });
      }

      // Check for failed transactions
      const failedTransactions = recentTransactions.filter(tx => tx.status === 'failed');
      if (failedTransactions.length > 0) {
        alerts.push({
          type: 'failed_transaction',
          severity: 'error',
          title: `${failedTransactions.length} Failed Transaction${failedTransactions.length > 1 ? 's' : ''}`,
          message: 'Some of your recent transactions have failed and may need retry',
          actionRequired: true,
          data: { count: failedTransactions.length }
        });
      }

      // Check portfolio performance
      const portfolioValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
      const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
      const overallReturn = totalInvested > 0 ? ((portfolioValue - totalInvested) / totalInvested) * 100 : 0;

      if (overallReturn < -10) {
        alerts.push({
          type: 'portfolio_performance',
          severity: 'warning',
          title: 'Portfolio Performance Alert',
          message: `Your portfolio is down ${Math.abs(overallReturn).toFixed(2)}%. Consider reviewing your holdings.`,
          actionRequired: false,
          data: { returnPercentage: overallReturn }
        });
      }

      // Check for properties with status changes
      const inactiveProperties = holdings.filter(h => h.property?.status !== 'active');
      if (inactiveProperties.length > 0) {
        alerts.push({
          type: 'property_status',
          severity: 'info',
          title: 'Property Status Update',
          message: `${inactiveProperties.length} of your properties have status updates`,
          actionRequired: false,
          data: { properties: inactiveProperties.map(h => h.property?.title) }
        });
      }

      // Check wallet balance
      let lowBalance = false;
      if (userWallets.length > 0) {
        try {
          const { stellarService } = await import('../services/stellarService');
          const balances = await stellarService.getAccountBalance(userWallets[0].stellarPublicKey);
          const ngnBalance = balances.find(b => b.asset_code === 'NGN');
          const balance = ngnBalance ? parseFloat(ngnBalance.balance) : 0;
          
          if (balance < 1000) { // Less than 1000 NGN
            lowBalance = true;
            alerts.push({
              type: 'low_balance',
              severity: 'info',
              title: 'Low Wallet Balance',
              message: `Your wallet balance is ${balance.toFixed(2)} NGN. Consider adding funds for new investments.`,
              actionRequired: false,
              data: { balance }
            });
          }
        } catch (error) {
          logger.warn('Failed to check wallet balance:', error);
        }
      }

      // Investment opportunities alerts
      if (holdings.length < 3 && !lowBalance) {
        alerts.push({
          type: 'diversification',
          severity: 'info',
          title: 'Diversification Opportunity',
          message: 'Consider diversifying your portfolio across more properties to reduce risk.',
          actionRequired: false,
          data: { currentHoldings: holdings.length }
        });
      }

      res.json({
        alerts: alerts.sort((a, b) => {
          const severityOrder = { error: 3, warning: 2, info: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        }),
        summary: {
          total: alerts.length,
          error: alerts.filter(a => a.severity === 'error').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
          info: alerts.filter(a => a.severity === 'info').length,
          actionRequired: alerts.filter(a => a.actionRequired).length
        },
        lastUpdated: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Investment alerts error:', error);
      res.status(500).json({ error: 'Failed to fetch investment alerts' });
    }
  }
);

export default router;
