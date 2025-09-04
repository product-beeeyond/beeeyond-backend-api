// /* eslint-disable @typescript-eslint/no-unused-vars */
// /* eslint-disable unused-imports/no-unused-imports */
// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { Response } from "express";
// import { AuthRequest } from "../middleware/auth";
// import Property from "../models/Property";
// import MultiSigWallet from "../models/MultiSigWallet";
// import { stellarService } from "../services/stellarService";
// import logger from "../utils/logger";
// import { sequelize } from "../config/database";
// import { Op, Transaction } from "sequelize";
// // import { validate, propertySchema } from "../middleware/validation";
// import MultiSigTransaction from '../models/MultiSigTransaction';

// // ===========================================
// // CREATE PROPERTY WITH FULL TOKENIZATION FLOW
// // ===========================================

// export const CreateProperty = async (req: AuthRequest, res: Response) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const {
//       title,
//       description,
//       location,
//       propertyType,
//       totalTokens,
//       tokenPrice,
//       totalValue,
//       expectedAnnualReturn,
//       minimumInvestment,
//       images,
//       amenities,
//       documents,
//       locationDetails,
//       rentalIncomeMonthly,
//       propertyManager,
//       featured,
//     } = req.body;

//     // Validate required fields
//     if (!title || !location || !propertyType || !totalTokens || !tokenPrice) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         error:
//           "Missing required fields: title, location, propertyType, totalTokens, tokenPrice",
//       });
//     }

//     // Calculate total value if not provided
//     const calculatedTotalValue = totalValue || totalTokens * tokenPrice;

//     // Step 1: Create the property record
//     const property = await Property.create(
//       {
//         title,
//         description,
//         location,
//         propertyType,
//         totalTokens,
//         availableTokens: totalTokens, // Initially all tokens are available
//         tokenPrice,
//         totalValue: calculatedTotalValue,
//         expectedAnnualReturn,
//         minimumInvestment: minimumInvestment || 10000,
//         images: images || [],
//         amenities: amenities || [],
//         documents,
//         locationDetails,
//         rentalIncomeMonthly,
//         propertyManager,
//         status: "coming_soon", // Start as coming_soon until fully set up
//         featured: featured || false,
//       },
//       { transaction: dbTransaction }
//     );

//     logger.info(`Property created: ${property.id} - ${title}`);

//     // Step 2: Create property wallets (distribution & governance)
//     const walletResult = await stellarService.createPropertyWallets({
//       propertyId: property.id,
//       propertyTitle: property.title,
//       propertyManager: property.propertyManager,
//       createdBy: req.user!.id,
//     });

//     logger.info(
//       `Property wallets created for ${property.title}: Distribution ${walletResult.distributionWallet.publicKey}`
//     );

//     // Step 3: Fund distribution wallet with minimum XLM for operations
//     await stellarService.fundWalletFromTreasury(
//       walletResult.distributionWallet.publicKey,
//       "2" // 2 XLM for operations
//     );

//     // Step 4: Create and issue property tokens
//     const assetCode = `PROP${property.id.substring(0, 8).toUpperCase()}`;

//     await stellarService.createAndIssuePropertyToken({
//       propertyId: property.id,
//       totalSupply: totalTokens,
//       distributionWalletPublicKey: walletResult.distributionWallet.publicKey,
//     });

//     // Step 5: Update property with Stellar asset information
//     await property.update(
//       {
//         stellarAssetCode: assetCode,
//         stellarAssetIssuer: walletResult.distributionWallet.publicKey,
//         status: "active", // Now fully set up and ready for investment
//       },
//       { transaction: dbTransaction }
//     );

//     // Commit the transaction
//     await dbTransaction.commit();

//     logger.info(
//       `Property ${property.title} fully tokenized with ${totalTokens} ${assetCode} tokens`
//     );

//     // Return comprehensive response
//     res.status(201).json({
//       message: "Property created and tokenized successfully",
//       property: {
//         id: property.id,
//         title: property.title,
//         description: property.description,
//         location: property.location,
//         propertyType: property.propertyType,
//         totalTokens: property.totalTokens,
//         availableTokens: property.availableTokens,
//         tokenPrice: property.tokenPrice,
//         totalValue: property.totalValue,
//         expectedAnnualReturn: property.expectedAnnualReturn,
//         minimumInvestment: property.minimumInvestment,
//         status: property.status,
//         stellarAssetCode: property.stellarAssetCode,
//         stellarAssetIssuer: property.stellarAssetIssuer,
//         featured: property.featured,
//         createdAt: property.createdAt,
//       },
//       tokenization: {
//         assetCode: assetCode,
//         assetIssuer: walletResult.distributionWallet.publicKey,
//         totalSupply: totalTokens,
//         distributionWallet: walletResult.distributionWallet.publicKey,
//         tokensIssued: true,
//         walletFunded: true,
//       },
//       wallets: {
//         distribution: {
//           publicKey: walletResult.distributionWallet.publicKey,
//           purpose: "Holds property tokens for sale to investors",
//           funded: true,
//           balance: "2 XLM",
//         },
//         governance: walletResult.governanceWallet
//           ? {
//               publicKey: walletResult.governanceWallet.publicKey,
//               purpose: "Property governance and major decisions",
//               funded: true,
//             }
//           : null,
//       },
//     });
//   } catch (error) {
//     await dbTransaction.rollback();
//     logger.error("Create property error:", error);

//     // Handle specific error types
//     if (error instanceof Error) {
//       if (error.message.includes("Validation error")) {
//         return res.status(400).json({
//           error: "Property validation failed",
//           details: error.message,
//         });
//       }

//       if (error.message.includes("Stellar")) {
//         return res.status(500).json({
//           error: "Blockchain tokenization failed",
//           details: "Failed to create Stellar assets or wallets",
//         });
//       }
//     }

//     res.status(500).json({
//       error: "Failed to create property",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // UPDATE PROPERTY (ADMIN ONLY)
// // ===========================================

// export const UpdateProperty = async (req: AuthRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const updates = req.body;

//     const property = await Property.findByPk(id);
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     // Prevent updating certain fields that affect tokenization
//     const restrictedFields = [
//       "totalTokens",
//       "stellarAssetCode",
//       "stellarAssetIssuer",
//     ];
//     const hasRestrictedUpdates = restrictedFields.some(
//       (field) => field in updates
//     );

//     if (hasRestrictedUpdates) {
//       return res.status(400).json({
//         error: "Cannot update tokenization-related fields",
//         restrictedFields,
//       });
//     }

//     // Update the property
//     await property.update(updates);

//     logger.info(`Property updated: ${property.id} - ${property.title}`);

//     res.json({
//       message: "Property updated successfully",
//       property: property.toJSON(),
//     });
//   } catch (error) {
//     logger.error("Update property error:", error);
//     res.status(500).json({
//       error: "Failed to update property",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // GET ALL PROPERTIES (WITH FILTERING)
// // ===========================================

// export const GetAllProperties = async (req: AuthRequest, res: Response) => {
//   try {
//     const {
//       page = 1,
//       limit = 20,
//       location,
//       propertyType,
//       status = "active",
//       featured,
//       minPrice,
//       maxPrice,
//       sortBy = "createdAt",
//       sortOrder = "DESC",
//     } = req.query;

//     const offset = (Number(page) - 1) * Number(limit);
//     const whereClause: any = {};

//     // Apply filters
//     if (location) whereClause.location = { [Op.iLike]: `%${location}%` };
//     if (propertyType) whereClause.propertyType = propertyType;
//     if (status) whereClause.status = status;
//     if (featured) whereClause.featured = featured === "true";
//     if (minPrice) whereClause.tokenPrice = { [Op.gte]: minPrice };
//     if (maxPrice) {
//       whereClause.tokenPrice = {
//         ...whereClause.tokenPrice,
//         [Op.lte]: maxPrice,
//       };
//     }

//     const { count, rows: properties } = await Property.findAndCountAll({
//       where: whereClause,
//       limit: Number(limit),
//       offset,
//       order: [[sortBy as string, sortOrder as string]],
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
//       pagination: {
//         total: count,
//         page: Number(page),
//         pages: Math.ceil(count / Number(limit)),
//         limit: Number(limit),
//       },
//     });
//   } catch (error) {
//     logger.error("Get properties error:", error);
//     res.status(500).json({
//       error: "Failed to fetch properties",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // GET SINGLE PROPERTY WITH DETAILS
// // ===========================================

// export const GetSingleProperty = async (req: AuthRequest, res: Response) => {
//   try {
//     const { id } = req.params;

//     const property = await Property.findByPk(id, {
//       include: [
//         {
//           model: MultiSigWallet,
//           as: "wallets",
//           where: { status: "active" },
//           required: false,
//           attributes: [
//             "stellarPublicKey",
//             "walletType",
//             "status",
//             "initialBalance",
//           ],
//         },
//       ],
//     });

//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     // Get wallet balances if wallets exist
//     const walletsWithBalances = await Promise.all(
//       (property as any).wallets?.map(async (wallet: any) => {
//         try {
//           const balances = await stellarService.getAccountBalance(
//             wallet.stellarPublicKey
//           );
//           return {
//             ...wallet.toJSON(),
//             balances,
//           };
//         } catch (error) {
//           logger.warn(
//             `Failed to get balance for wallet ${wallet.stellarPublicKey}:`,
//             error
//           );
//           return wallet.toJSON();
//         }
//       }) || []
//     );

//     res.json({
//       property: {
//         ...property.toJSON(),
//         wallets: walletsWithBalances,
//       },
//     });
//   } catch (error) {
//     logger.error("Get single property error:", error);
//     res.status(500).json({
//       error: "Failed to fetch property",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // DEACTIVATE PROPERTY (ADMIN ONLY)
// // ===========================================

// export const DeactivateProperty = async (req: AuthRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { reason } = req.body;

//     const property = await Property.findByPk(id);
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     await property.update({
//       status: "inactive",
//       // Store deactivation reason in documents field
//       documents: {
//         ...property.documents,
//         deactivation: {
//           reason,
//           deactivatedAt: new Date(),
//           deactivatedBy: req.user!.id,
//         },
//       },
//     });

//     logger.info(`Property deactivated: ${property.id} - ${property.title}`);

//     res.json({
//       message: "Property deactivated successfully",
//       property: {
//         id: property.id,
//         title: property.title,
//         status: property.status,
//       },
//     });
//   } catch (error) {
//     logger.error("Deactivate property error:", error);
//     res.status(500).json({
//       error: "Failed to deactivate property",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // GET PROPERTY ANALYTICS
// // ===========================================

// export const GetPropertyAnalytics = async (req: AuthRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { period = "30d" } = req.query;

//     const property = await Property.findByPk(id);
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     // Calculate date range based on period
//     const now = new Date();
//     const periodMap = {
//       "7d": 7,
//       "30d": 30,
//       "90d": 90,
//       "1y": 365,
//     };
//     const days = periodMap[period as keyof typeof periodMap] || 30;
//     const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

//     // Get investment transactions for analytics
//     const transactions = await MultiSigTransaction.findAll({
//       where: {
//         "metadata.propertyId": property.id,
//         createdAt: {
//           [Op.gte]: startDate,
//         },
//         status: "executed",
//       },
//       order: [["createdAt", "ASC"]],
//     });

//     // Calculate analytics
//     const totalInvestmentVolume = transactions.reduce((sum, tx) => {
//       const metadata = tx.metadata as any;
//       return sum + (metadata?.totalAmount || 0);
//     }, 0);

//     const totalTokensSold = transactions.reduce((sum, tx) => {
//       const metadata = tx.metadata as any;
//       return sum + (metadata?.quantity || 0);
//     }, 0);

//     const averageInvestmentSize =
//       transactions.length > 0 ? totalInvestmentVolume / transactions.length : 0;

//     res.json({
//       property: {
//         id: property.id,
//         title: property.title,
//         totalTokens: property.totalTokens,
//         availableTokens: property.availableTokens,
//         tokenPrice: property.tokenPrice,
//       },
//       analytics: {
//         period,
//         totalInvestmentVolume,
//         totalTokensSold,
//         availableTokens: property.availableTokens,
//         occupancyRate: ((totalTokensSold / property.totalTokens) * 100).toFixed(
//           2
//         ),
//         averageInvestmentSize: averageInvestmentSize.toFixed(2),
//         totalTransactions: transactions.length,
//         priceHistory: [], // Could be enhanced with price tracking
//       },
//       transactions: transactions.slice(-10), // Last 10 transactions
//     });
//   } catch (error) {
//     logger.error("Property analytics error:", error);
//     res.status(500).json({
//       error: "Failed to fetch property analytics",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ===========================================
// // CREATE PROPERTY WALLETS (STANDALONE - FOR EXISTING PROPERTIES)
// // ===========================================

// export const CreatePropertyWallets = async (
//   req: AuthRequest,
//   res: Response
// ) => {
//   try {
//     const { id } = req.params;

//     const property = await Property.findByPk(id);
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     // Check if property wallets already exist
//     const existingWallet = await MultiSigWallet.findOne({
//       where: { propertyId: property.id, walletType: "property_distribution" },
//     });

//     if (existingWallet) {
//       return res.status(400).json({
//         error: "Property wallets already exist",
//         distributionWallet: existingWallet.stellarPublicKey,
//       });
//     }

//     // Create property wallets
//     const walletResult = await stellarService.createPropertyWallets({
//       propertyId: property.id,
//       propertyTitle: property.title,
//       propertyManager: property.propertyManager,
//       createdBy: req.user!.id,
//     });

//     // Fund distribution wallet
//     await stellarService.fundWalletFromTreasury(
//       walletResult.distributionWallet.publicKey,
//       "2"
//     );

//     // Update property with wallet information
//     await property.update({
//       stellarAssetCode: `PROP${property.id.substring(0, 8).toUpperCase()}`,
//       stellarAssetIssuer: walletResult.distributionWallet.publicKey,
//     });

//     logger.info(`Standalone property wallets created for ${property.title}`);

//     res.status(201).json({
//       message: "Property wallets created successfully",
//       property: {
//         id: property.id,
//         title: property.title,
//       },
//       wallets: {
//         distribution: {
//           publicKey: walletResult.distributionWallet.publicKey,
//           purpose: "Holds property tokens for sale to investors",
//           funded: true,
//         },
//         governance: walletResult.governanceWallet
//           ? {
//               publicKey: walletResult.governanceWallet.publicKey,
//               purpose: "Property governance and major decisions",
//             }
//           : null,
//       },
//     });
//   } catch (error) {
//     logger.error("Create property wallets error:", error);
//     res.status(500).json({
//       error: "Failed to create property wallets",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };
