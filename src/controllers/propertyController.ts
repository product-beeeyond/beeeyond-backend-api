/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, } from 'express';
import { Op } from 'sequelize';
import Property from '../models/Property';
import PropertyHolding from '../models/PropertyHolding';
import Transaction from '../models/Transaction';
import {  AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';


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

    // Calculate additional metrics for each property
    const propertiesWithMetrics = await Promise.all(
      properties.map(async (property) => {
        const [investorCount, transactionCount] = await Promise.all([
          PropertyHolding.count({
            where: {
              propertyId: property.id,
              tokensOwned: { [Op.gt]: 0 }
            }
          }),
          Transaction.count({
            where: {
              propertyId: property.id,
              status: 'completed'
            }
          })
        ]);

        const fundingProgress = ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100;

        return {
          ...property.toJSON(),
          metrics: {
            investorCount,
            transactionCount,
            fundingProgress: Math.round(fundingProgress),
            tokensSold: property.totalTokens - property.availableTokens,
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
    const property = await Property.findByPk(req.params.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get additional metrics
    const [investorCount, recentTransactions, totalInvested] = await Promise.all([
      PropertyHolding.count({
        where: {
          propertyId: property.id,
          tokensOwned: { [Op.gt]: 0 }
        }
      }),
      Transaction.findAll({
        where: {
          propertyId: property.id,
          status: 'completed'
        },
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: ['transactionType', 'quantity', 'pricePerToken', 'createdAt']
      }),
      Transaction.sum('totalAmount', {
        where: {
          propertyId: property.id,
          status: 'completed',
          transactionType: 'buy'
        }
      })
    ]);

    const fundingProgress = ((property.totalTokens - property.availableTokens) / property.totalTokens) * 100;

    res.json({
      ...property.toJSON(),
      metrics: {
        investorCount,
        fundingProgress: Math.round(fundingProgress),
        tokensSold: property.totalTokens - property.availableTokens,
        totalInvested: totalInvested || 0,
        recentTransactions,
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

    // Get transactions in the period
    const transactions = await Transaction.findAll({
      where: {
        propertyId,
        status: 'completed',
        createdAt: { [Op.gte]: startDate }
      },
      order: [['createdAt', 'ASC']],
      attributes: ['transactionType', 'quantity', 'pricePerToken', 'totalAmount', 'createdAt']
    });

    // Calculate price history and volume
    const priceHistory: any[] = [];
    const volumeHistory: any[] = [];
    let currentPrice = 0;

    transactions.forEach((tx) => {
      const date = tx.createdAt.toISOString().split('T')[0];
      currentPrice = tx.pricePerToken;

      // Update price history
      const existingPricePoint = priceHistory.find(p => p.date === date);
      if (existingPricePoint) {
        existingPricePoint.price = currentPrice;
      } else {
        priceHistory.push({ date, price: currentPrice });
      }

      // Update volume history
      const existingVolumePoint = volumeHistory.find(v => v.date === date);
      if (existingVolumePoint) {
        existingVolumePoint.volume += tx.quantity;
        existingVolumePoint.value += tx.totalAmount;
      } else {
        volumeHistory.push({
          date,
          volume: tx.quantity,
          value: tx.totalAmount
        });
      }
    });

    // Calculate returns
    const buyTransactions = transactions.filter(tx => tx.transactionType === 'buy');
    const sellTransactions = transactions.filter(tx => tx.transactionType === 'sell');

    const totalBuyVolume = buyTransactions.reduce((sum, tx) => sum + tx.quantity, 0);
    const totalSellVolume = sellTransactions.reduce((sum, tx) => sum + tx.quantity, 0);
    const averageBuyPrice = buyTransactions.length > 0
      ? buyTransactions.reduce((sum, tx) => sum + tx.pricePerToken, 0) / buyTransactions.length
      : 0;

    res.json({
      priceHistory,
      volumeHistory,
      summary: {
        currentPrice,
        averageBuyPrice,
        totalBuyVolume,
        totalSellVolume,
        netVolume: totalBuyVolume - totalSellVolume,
        priceChange: averageBuyPrice > 0 ? ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100 : 0,
      }
    });

  } catch (error) {
    logger.error('Property analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch property analytics' });
  }
}
