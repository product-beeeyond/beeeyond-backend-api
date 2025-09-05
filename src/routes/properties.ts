// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { Router, Request, Response } from "express";
// import {
//   authenticate,
//   requireAdmin,
//   requireKYC,
//   requireSuperAdmin,
// } from "../middleware/auth";
// import { validate, propertySchema, validatePropertyCreation, validatePropertyUpdate } from "../middleware/validation";
// import {
//   // New comprehensive methods
//   CreateProperty,
//   UpdateProperty,
//   GetAllProperties,
//   GetSingleProperty,
//   DeactivateProperty,
//   GetPropertyAnalytics,
//   CreatePropertyWallets,
//   // // Existing methods
//   // GetPropertyTransactions,
//   // GetPropertyWalletStatus,
// } from "../controllers/propertyController";
// import Property from "../models/Property";
// import MultiSigWallet from "../models/MultiSigWallet";
// import MultiSigTransaction from "../models/MultiSigTransaction";
// import PropertyHolding from "../models/PropertyHolding";
// import logger from "../utils/logger";
// import { Op } from "sequelize";
// import sequelize from "sequelize/types/sequelize";
// import { stellarService } from "../services/stellarService";

// const router = Router();

// // ===========================================
// // VALIDATION MIDDLEWARE
// // ===========================================

// const validatePropertyId = (req: any, res: any, next: any) => {
//   const { id } = req.params;
//   if (!id || id.length < 1) {
//     return res.status(400).json({ error: "Valid property ID is required" });
//   }
//   next();
// };

// const validateCreateProperty = [
//   validate(propertySchema),
//   (req: any, res: any, next: any) => {
//     const { totalTokens, tokenPrice } = req.body;

//     // Additional business logic validations
//     if (totalTokens < 100 || totalTokens > 10000000) {
//       return res.status(400).json({
//         error: "Total tokens must be between 100 and 10,000,000",
//       });
//     }

//     if (tokenPrice < 100 || tokenPrice > 1000000) {
//       return res.status(400).json({
//         error: "Token price must be between ₦100 and ₦1,000,000",
//       });
//     }

//     next();
//   },
// ];

// // const validateUpdateProperty = (req: any, res: any, next: any) => {
// //   const updates = req.body;
// //   const allowedUpdates = [
// //     "title",
// //     "description",
// //     "location",
// //     "expectedAnnualReturn",
// //     "minimumInvestment",
// //     "images",
// //     "amenities",
// //     "documents",
// //     "locationDetails",
// //     "rentalIncomeMonthly",
// //     "propertyManager",
// //     "status",
// //     "featured",
// //   ];

// //   const isValidUpdate = Object.keys(updates).every((key) =>
// //     allowedUpdates.includes(key)
// //   );

// //   if (!isValidUpdate) {
// //     return res.status(400).json({
// //       error: "Invalid update fields",
// //       allowedFields: allowedUpdates,
// //     });
// //   }

// //   next();
// // };

// // const validateAnalyticsParams = (req: any, res: any, next: any) => {
// //   const { period } = req.query;
// //   const validPeriods = ["7d", "30d", "90d", "1y"];

// //   if (period && !validPeriods.includes(period)) {
// //     return res.status(400).json({
// //       error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
// //     });
// //   }

// //   next();
// // };

// // const validatePaginationParams = (req: any, res: any, next: any) => {
// //   const { page, limit } = req.query;

// //   if (page && (isNaN(Number(page)) || Number(page) < 1)) {
// //     return res.status(400).json({ error: "Page must be a positive number" });
// //   }

// //   if (
// //     limit &&
// //     (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)
// //   ) {
// //     return res.status(400).json({ error: "Limit must be between 1 and 100" });
// //   }

// //   next();
// // };

// // const validateSearchParams = (req: any, res: any, next: any) => {
// //   const { sortBy } = req.body;
// //   const validSortFields = [
// //     "createdAt",
// //     "updatedAt",
// //     "title",
// //     "location",
// //     "tokenPrice",
// //     "totalValue",
// //     "expectedAnnualReturn",
// //     "totalTokens",
// //     "availableTokens",
// //   ];

// //   if (sortBy && !validSortFields.includes(sortBy)) {
// //     return res.status(400).json({
// //       error: "Invalid sort field",
// //       validFields: validSortFields,
// //     });
// //   }

// //   next();
// // };

// // ===========================================
// // PUBLIC PROPERTY ROUTES
// // ===========================================

// /**
//  * Get all properties with filtering and pagination
//  * GET /api/properties
//  * Query params: page, limit, location, propertyType, status, featured, minPrice, maxPrice, sortBy, sortOrder
//  */
// router.get("/", validatePaginationParams, GetAllProperties);

// /**
//  * Get single property details
//  * GET /api/properties/:id
//  */
// router.get("/:id", validatePropertyId, GetSingleProperty);

// /**
//  * Advanced property search
//  * POST /api/properties/search
//  */
// router.post("/search", validateSearchParams, async (req, res) => {
//   try {
//     const {
//       query,
//       filters = {},
//       sortBy = "createdAt",
//       sortOrder = "DESC",
//       page = 1,
//       limit = 20,
//     } = req.body;

//     const searchConditions: any = { status: "active" };
//     const offset = (Number(page) - 1) * Number(limit);

//     // Text search
//     if (query && query.trim()) {
//       searchConditions[Op.or] = [
//         { title: { [Op.iLike]: `%${query}%` } },
//         { description: { [Op.iLike]: `%${query}%` } },
//         { location: { [Op.iLike]: `%${query}%` } },
//         { propertyType: { [Op.iLike]: `%${query}%` } },
//       ];
//     }

//     // Apply filters
//     if (filters.location)
//       searchConditions.location = { [Op.iLike]: `%${filters.location}%` };
//     if (filters.propertyType)
//       searchConditions.propertyType = filters.propertyType;
//     if (filters.minPrice)
//       searchConditions.tokenPrice = { [Op.gte]: filters.minPrice };
//     if (filters.maxPrice) {
//       searchConditions.tokenPrice = {
//         ...searchConditions.tokenPrice,
//         [Op.lte]: filters.maxPrice,
//       };
//     }
//     if (filters.minReturn)
//       searchConditions.expectedAnnualReturn = { [Op.gte]: filters.minReturn };
//     if (filters.featured !== undefined)
//       searchConditions.featured = filters.featured;

//     const { count, rows: properties } = await Property.findAndCountAll({
//       where: searchConditions,
//       limit: Number(limit),
//       offset,
//       order: [[sortBy, sortOrder]],
//       include: [
//         {
//           model: MultiSigWallet,
//           as: "wallets",
//           where: { status: "active" },
//           required: false,
//           attributes: ["stellarPublicKey", "walletType", "status"],
//         },
//       ],
//     });

//     res.json({
//       properties,
//       searchQuery: query,
//       filters,
//       pagination: {
//         total: count,
//         page: Number(page),
//         pages: Math.ceil(count / Number(limit)),
//         limit: Number(limit),
//       },
//     });
//   } catch (error) {
//     logger.error("Property search error:", error);
//     res.status(500).json({ error: "Failed to search properties" });
//   }
// });

// // ===========================================
// // AUTHENTICATED PROPERTY ROUTES
// // ===========================================

// /**
//  * Get property analytics (price history, volume, etc.)
//  * GET /api/properties/:id/analytics
//  */
// router.get(
//   "/:id/analytics",
//   authenticate,
//   validatePropertyId,
//   validateAnalyticsParams,
//   GetPropertyAnalytics
// );

// /**
//  * Get property transaction history
//  * GET /api/properties/:id/transactions
//  */
// // router.get(
// //   "/:id/transactions",
// //   authenticate,
// //   validatePropertyId,
// //   validatePaginationParams,
// //   GetPropertyTransactions
// // );

// /**
//  * Get property wallet status and balances
//  * GET /api/properties/:id/wallets
//  */
// // router.get(
// //   "/:id/wallets",
// //   authenticate,
// //   validatePropertyId,
// //   GetPropertyWalletStatus
// // );

// /**
//  * Get user's holdings in a specific property
//  * GET /api/properties/:id/my-holdings
//  */
// router.get(
//   "/:id/my-holdings",
//   authenticate,
//   requireKYC,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const propertyId = req.params.id;
//       const userId = req.user!.id;

//       const holding = await PropertyHolding.findOne({
//         where: { userId, propertyId },
//         include: [
//           {
//             model: Property,
//             as: "property",
//             attributes: [
//               "title",
//               "tokenPrice",
//               "totalTokens",
//               "availableTokens",
//             ],
//           },
//         ],
//       });

//       if (!holding) {
//         return res.json({
//           propertyId,
//           tokensOwned: 0,
//           totalInvested: 0,
//           currentValue: 0,
//           unrealizedGain: 0,
//           percentageOwnership: 0,
//         });
//       }

//       const property = holding.property as any;
//       const currentTokenValue = property.tokenPrice;
//       const currentValue = holding.tokensOwned * currentTokenValue;
//       const unrealizedGain = currentValue - holding.totalInvested;
//       const percentageOwnership =
//         (holding.tokensOwned / property.totalTokens) * 100;

//       res.json({
//         propertyId,
//         tokensOwned: holding.tokensOwned,
//         totalInvested: holding.totalInvested,
//         averagePrice: holding.averagePrice,
//         currentValue,
//         unrealizedGain,
//         percentageOwnership: percentageOwnership.toFixed(4),
//         property: {
//           title: property.title,
//           currentTokenPrice: currentTokenValue,
//           totalTokens: property.totalTokens,
//           availableTokens: property.availableTokens,
//         },
//       });
//     } catch (error) {
//       logger.error("Get user holdings error:", error);
//       res.status(500).json({ error: "Failed to fetch holdings" });
//     }
//   }
// );

// // ===========================================
// // ADMIN PROPERTY MANAGEMENT ROUTES
// // ===========================================

// /**
//  * Create new property with full tokenization
//  * POST /api/properties
//  * Requires: Admin access
//  */
// router.post(
//   "/",
//   authenticate,
//   requireAdmin,
//   validatePropertyCreation,
//   CreateProperty
// );

// /**
//  * Update existing property (Admin only)
//  * PUT /api/properties/:id
//  */
// router.put(
//   "/:id",
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   validatePropertyUpdate,
//   UpdateProperty
// );

// /**
//  * Deactivate property (Admin only)
//  * PATCH /api/properties/:id/deactivate
//  */
// router.patch(
//   "/:id/deactivate",
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   DeactivateProperty
// );

// /**
//  * Create wallets for existing property (Admin only)
//  * POST /api/properties/:id/wallets
//  */
// router.post(
//   "/:id/wallets",
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   CreatePropertyWallets
// );

// /**
//  * Tokenize existing property (Admin only)
//  * POST /api/properties/:id/tokenize
//  */
// router.post(
//   "/:id/tokenize",
//   authenticate,
//   requireAdmin,
//   validatePropertyId,
//   async (request: Request, response: Response) => {
//     try {
//       const { id } = request.params;
//       const { totalTokens, tokenPrice } = request.body;

//       if (!totalTokens || !tokenPrice) {
//         return response.status(400).json({
//           error: "totalTokens and tokenPrice are required for tokenization",
//         });
//       }

//       const property = await Property.findByPk(id);
//       if (!property) {
//         return response.status(404).json({ error: "Property not found" });
//       }

//       if (property.stellarAssetCode) {
//         return response.status(400).json({
//           error: "Property is already tokenized",
//           assetCode: property.stellarAssetCode,
//         });
//       }

//       // Get property distribution wallet
//       const distributionWallet = await MultiSigWallet.findOne({
//         where: {
//           propertyId: id,
//           walletType: "property_distribution",
//           status: "active",
//         },
//       });

//       if (!distributionWallet) {
//         return response.status(400).json({
//           error:
//             "Property distribution wallet not found. Create wallets first.",
//         });
//       }

//       // Create and issue property tokens
//       const assetCode = `PROP${property.id.substring(0, 8).toUpperCase()}`;

//       await stellarService.createAndIssuePropertyToken({
//         propertyId: property.id,
//         totalSupply: totalTokens,
//         distributionWalletPublicKey: distributionWallet.stellarPublicKey,
//       });

//       // Update property with tokenization info
//       await property.update({
//         totalTokens,
//         availableTokens: totalTokens,
//         tokenPrice,
//         totalValue: totalTokens * tokenPrice,
//         stellarAssetCode: assetCode,
//         stellarAssetIssuer: distributionWallet.stellarPublicKey,
//         status: "active",
//       });

//       logger.info(
//         `Property ${property.title} tokenized with ${totalTokens} ${assetCode} tokens`
//       );

//       response.json({
//         message: "Property tokenized successfully",
//         property: {
//           id: property.id,
//           title: property.title,
//           stellarAssetCode: assetCode,
//           stellarAssetIssuer: distributionWallet.stellarPublicKey,
//           totalTokens,
//           tokenPrice,
//           totalValue: totalTokens * tokenPrice,
//         },
//       });
//     } catch (error) {
//       logger.error("Tokenize property error:", error);
//       response.status(500).json({
//         error: "Failed to tokenize property",
//         details: error instanceof Error ? error.message : "Unknown error",
//       });
//     }
//   }
// );

// // ===========================================
// // SUPER ADMIN ROUTES
// // ===========================================

// /**
//  * Get all properties (including inactive) - Super Admin only
//  * GET /api/properties/admin/all
//  */
// router.get(
//   "/admin/all",
//   authenticate,
//   requireSuperAdmin,
//   validatePaginationParams,
//   async (request: Request, response: Response) => {
//     try {
//       const {
//         page = 1,
//         limit = 50,
//         status,
//         sortBy = "createdAt",
//         sortOrder = "DESC",
//       } = request.query;

//       const offset = (Number(page) - 1) * Number(limit);
//       const whereClause: any = {};

//       if (status) whereClause.status = status;

//       const { count, rows: properties } = await Property.findAndCountAll({
//         where: whereClause,
//         limit: Number(limit),
//         offset,
//         order: [[sortBy as string, sortOrder as string]],
//         include: [
//           {
//             model: MultiSigWallet,
//             as: "wallets",
//             required: false,
//             attributes: [
//               "stellarPublicKey",
//               "walletType",
//               "status",
//               "initialBalance",
//             ],
//           },
//         ],
//       });

//       // Get additional statistics
//       const stats = await Property.findAll({
//         attributes: [
//           "status",
//           [sequelize.fn("COUNT", sequelize.col("id")), "count"],
//           [sequelize.fn("SUM", sequelize.col("totalValue")), "totalValue"],
//           [sequelize.fn("SUM", sequelize.col("totalTokens")), "totalTokens"],
//         ],
//         group: ["status"],
//       });

//       response.json({
//         properties,
//         pagination: {
//           total: count,
//           page: Number(page),
//           pages: Math.ceil(count / Number(limit)),
//           limit: Number(limit),
//         },
//         statistics: stats,
//       });
//     } catch (error) {
//       logger.error("Get all properties (admin) error:", error);
//       response.status(500).json({ error: "Failed to fetch properties" });
//     }
//   }
// );

// /**
//  * Force delete property (Super Admin only) - DANGEROUS
//  * DELETE /api/properties/:id/force-delete
//  */
// router.delete(
//   "/:id/force-delete",
//   authenticate,
//   requireSuperAdmin,
//   validatePropertyId,
// async (request: Request, response: Response) => {
//     try {
//       const { id } = request.params;
//       const { confirmDelete } = request.body;

//       if (confirmDelete !== "CONFIRM_DELETE_PROPERTY") {
//         return response.status(400).json({
//           error: "Confirmation required",
//           requiredConfirmation: "CONFIRM_DELETE_PROPERTY",
//         });
//       }

//       const property = await Property.findByPk(id);
//       if (!property) {
//         return response.status(404).json({ error: "Property not found" });
//       }

//       // Check if property has active investments
//       const activeHoldings = await PropertyHolding.count({
//         where: {
//           propertyId: id,
//           tokensOwned: { [Op.gt]: 0 },
//         },
//       });

//       if (activeHoldings > 0) {
//         return response.status(400).json({
//           error: "Cannot delete property with active investments",
//           activeHoldings,
//         });
//       }

//       // Delete related records (wallets will be handled separately)
//       await PropertyHolding.destroy({ where: { propertyId: id } });
//       await MultiSigTransaction.destroy({
//         where: { "metadata.propertyId": id },
//       });

//       // Archive property instead of hard delete
//       await property.update({
//         status: "deleted",
//         title: `[DELETED] ${property.title}`,
//         documents: {
//           ...property.documents,
//           deletion: {
//             deletedAt: new Date(),
//             deletedBy: request.user.id,
//             reason: "Super admin force delete",
//           },
//         },
//       });

//       logger.warn(
//         `Property force deleted by super admin: ${property.id} - ${property.title}`
//       );

//       response.json({
//         message: "Property archived successfully",
//         property: {
//           id: property.id,
//           title: property.title,
//           status: property.status,
//         },
//       });
//     } catch (error) {
//       logger.error("Force delete property error:", error);
//       response.status(500).json({
//         error: "Failed to delete property",
//         details: error instanceof Error ? error.message : "Unknown error",
//       });
//     }
//   }
// );

// // ===========================================
// // UTILITY ROUTES
// // ===========================================

// /**
//  * Get property investment summary
//  * GET /api/properties/:id/summary
//  */
// router.get(
//   "/:id/summary",
//   authenticate,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const propertyId = req.params.id;

//       const property = await Property.findByPk(propertyId);
//       if (!property) {
//         return res.status(404).json({ error: "Property not found" });
//       }

//       // Get investment statistics
//       const totalInvestors = await PropertyHolding.count({
//         where: {
//           propertyId,
//           tokensOwned: { [Op.gt]: 0 },
//         },
//       });

//       const investmentStats = await PropertyHolding.findAll({
//         where: { propertyId },
//         attributes: [
//           [
//             sequelize.fn("SUM", sequelize.col("tokensOwned")),
//             "totalTokensSold",
//           ],
//           [
//             sequelize.fn("SUM", sequelize.col("totalInvested")),
//             "totalInvestmentAmount",
//           ],
//           [
//             sequelize.fn("AVG", sequelize.col("averagePrice")),
//             "averageTokenPrice",
//           ],
//         ],
//       });

//       const stats = investmentStats[0] as any;
//       const tokensSold = parseInt(stats.dataValues.totalTokensSold) || 0;
//       const occupancyRate = ((tokensSold / property.totalTokens) * 100).toFixed(
//         2
//       );

//       res.json({
//         property: {
//           id: property.id,
//           title: property.title,
//           status: property.status,
//           totalTokens: property.totalTokens,
//           availableTokens: property.availableTokens,
//           tokenPrice: property.tokenPrice,
//           totalValue: property.totalValue,
//         },
//         investment: {
//           totalInvestors,
//           tokensSold,
//           occupancyRate: `${occupancyRate}%`,
//           totalInvestmentAmount:
//             parseFloat(stats.dataValues.totalInvestmentAmount) || 0,
//           averageTokenPrice:
//             parseFloat(stats.dataValues.averageTokenPrice) || 0,
//           fundsRaised: (tokensSold * property.tokenPrice).toFixed(2),
//         },
//       });
//     } catch (error) {
//       logger.error("Property summary error:", error);
//       res.status(500).json({ error: "Failed to fetch property summary" });
//     }
//   }
// );

// /**
//  * Get property performance metrics
//  * GET /api/properties/:id/performance
//  */
// router.get(
//   "/:id/performance",
//   authenticate,
//   requireKYC,
//   validatePropertyId,
//   async (req, res) => {
//     try {
//       const propertyId = req.params.id;
//       const { period = "30d" } = req.query;

//       const property = await Property.findByPk(propertyId);
//       if (!property) {
//         return res.status(404).json({ error: "Property not found" });
//       }

//       // Calculate date range
//       const now = new Date();
//       const periodMap = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
//       const days = periodMap[period as keyof typeof periodMap] || 30;
//       const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

//       // Get transactions in period
//       const transactions = await MultiSigTransaction.findAll({
//         where: {
//           "metadata.propertyId": propertyId,
//           status: "executed",
//           createdAt: { [Op.gte]: startDate },
//         },
//         order: [["createdAt", "ASC"]],
//       });

//       // Calculate performance metrics
//       const totalVolume = transactions.reduce((sum, tx) => {
//         const metadata = tx.metadata as any;
//         return sum + (metadata?.totalAmount || 0);
//       }, 0);

//       const totalTokensTraded = transactions.reduce((sum, tx) => {
//         const metadata = tx.metadata as any;
//         return sum + (metadata?.quantity || 0);
//       }, 0);

//       // Group transactions by day for volume chart
//       const volumeByDay = transactions.reduce((acc, tx) => {
//         const date = tx.createdAt.toISOString().split("T")[0];
//         const metadata = tx.metadata as any;
//         acc[date] = (acc[date] || 0) + (metadata?.totalAmount || 0);
//         return acc;
//       }, {} as Record<string, number>);

//       res.json({
//         property: {
//           id: property.id,
//           title: property.title,
//           currentTokenPrice: property.tokenPrice,
//         },
//         performance: {
//           period,
//           totalVolume,
//           totalTokensTraded,
//           averageTransactionSize:
//             transactions.length > 0 ? totalVolume / transactions.length : 0,
//           transactionCount: transactions.length,
//           volumeByDay,
//           expectedAnnualReturn: property.expectedAnnualReturn,
//           lastUpdated: now,
//         },
//       });
//     } catch (error) {
//       logger.error("Property performance error:", error);
//       res.status(500).json({ error: "Failed to fetch property performance" });
//     }
//   }
// );

// export default router;
