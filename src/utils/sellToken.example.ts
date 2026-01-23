// //routes.ts
// /**
//  * Sell property tokens
//  * POST /api/investments/sell
//  */
// router.post('/sell',
//   authenticate,
//   requireKYC,
//   validateSaleTransaction,
//   SellPropertyToken
// ); 

// //controllers/investmentController.ts
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
//         transaction: dbTransaction,
//       }),
//     ]);

//     if (!property || !property.stellarAssetCode || !property.stellarAssetIssuer) {
//       await dbTransaction.rollback();
//       return res.status(404).json({ error: "Property not found or missing asset details" });
//     }

//     if (!holding || holding.tokensOwned < quantity) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: "Insufficient tokens to sell" });
//     }

//     // Get user's multisig wallet
//     const userWallet = await MultiSigWallet.findOne({
//       where: { userId, walletType: "user", status: "active" },
//       transaction: dbTransaction,
//     });

//     if (!userWallet) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ error: "User wallet not found" });
//     }

//     // Get property distribution wallet
//     const propertyWallet = await MultiSigWallet.findOne({
//       where: {
//         propertyId,
//         walletType: "property_distribution",
//         status: "active",
//       },
//       transaction: dbTransaction,
//     });

//     if (!propertyWallet) {
//       await dbTransaction.rollback();
//       return res
//         .status(400)
//         .json({ error: "Property distribution wallet not found" });
//     }

//     // Calculate proceeds
//     const pricePerToken = property.tokenPrice;
//     const totalAmount = quantity * pricePerToken;
//     const platformFee = totalAmount * 0.025; // 2.5% platform fee
//     const netAmount = totalAmount - platformFee;

//     // Create multisig transaction for the sale
//     const multisigTransaction = await MultiSigTransaction.create(
//       {
//         multiSigWalletId: userWallet.id,
//         transactionXDR: "", // Will be populated by stellar service
//         description: `Sell ${quantity} tokens of ${property.title}`,
//         category: "fund_management",
//         requiredSignatures: 1,
//         status: "pending",
//         proposedBy: userId,
//         metadata: {
//           transactionType: "sell",
//           propertyId,
//           quantity,
//           pricePerToken,
//           totalAmount,
//           platformFee,
//           netAmount,
//           sessionId: req.headers["x-session-id"] as string,
//           ipAddress: req.ip,
//         },
//         expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
//       },
//       { transaction: dbTransaction }
//     );

//     // Execute the sale on Stellar network
//     try {
//       const stellarTxHash = await stellarService.executeTokenSale({
//         userWalletPublicKey: userWallet.stellarPublicKey,
//         propertyWalletPublicKey: propertyWallet.stellarPublicKey,
//         assetCode: property.stellarAssetCode,
//         assetIssuer: property.stellarAssetIssuer,
//         amount: quantity.toString(),
//         proceedsAmount: netAmount.toString(),
//       });

//       // Update multisig transaction
//       await multisigTransaction.update(
//         {
//           status: "executed",
//           executedBy: userId,
//           executedAt: new Date(),
//           executionTxHash: stellarTxHash,
//         },
//         { transaction: dbTransaction }
//       );
//     } catch (stellarError) {
//       await multisigTransaction.update(
//         {
//           status: "failed",
//           failureReason:
//             stellarError instanceof Error
//               ? stellarError.message
//               : "Unknown Stellar error",
//         },
//         { transaction: dbTransaction }
//       );

//       await dbTransaction.rollback();
//       return res.status(500).json({
//         error: "Sale processing failed",
//         details:
//           stellarError instanceof Error
//             ? stellarError.message
//             : "Unknown error",
//       });
//     }

//     // Update property available tokens
//     await property.update(
//       {
//         availableTokens: property.availableTokens + quantity,
//       },
//       { transaction: dbTransaction }
//     );

//     // Update holding
//     const newTokensOwned = holding.tokensOwned - quantity;
//     const proportionalInvestment =
//       (quantity / holding.tokensOwned) * holding.totalInvested;
//     const newTotalInvested = holding.totalInvested - proportionalInvestment;

//     if (newTokensOwned > 0) {
//       await holding.update(
//         {
//           tokensOwned: newTokensOwned,
//           totalInvested: newTotalInvested,
//           currentValue: newTokensOwned * pricePerToken,
//           averagePrice: newTotalInvested / newTokensOwned,
//         },
//         { transaction: dbTransaction }
//       );
//     } else {
//       // Remove holding if no tokens left
//       await holding.destroy({ transaction: dbTransaction });
//     }

//     await dbTransaction.commit();

//     // Send notifications
//     try {
//       await emailService.sendTransactionConfirmation(
//         req.user!.email,
//         req.user!.firstName || "User",
//         {
//           type: "Sale",
//           propertyTitle: property.title,
//           quantity,
//           amount: netAmount,
//         }
//       );

//       // if (req.user!.phone) {
//       //   await smsService.sendTransactionAlert(req.user!.phone, {
//       //     type: 'sale',
//       //     quantity,
//       //     amount: netAmount,
//       //   });
//       // }
//     } catch (notificationError) {
//       logger.error("Failed to send sell notification:", notificationError);
//     }

//     res.json({
//       message: "Sale successful",
//       transaction: {
//         id: multisigTransaction.id,
//         multisigTransactionId: multisigTransaction.id,
//         stellarTxHash: multisigTransaction.executionTxHash,
//         quantity,
//         totalAmount,
//         platformFee,
//         netAmount,
//         status: "executed",
//       },
//     });
//   } catch (error) {
//     await dbTransaction.rollback();
//     logger.error("Investment sale error:", error);
//     res.status(500).json({ error: "Investment sale failed" });
//   }
// };

// // //stellarService.ts
//  async executeTokenSale(params: TokenSaleParams): Promise<string> {
//     try {
//       const {
//         userWalletPublicKey,
//         propertyWalletPublicKey,
//         assetCode,
//         assetIssuer,
//         amount,
//         proceedsAmount,
//       } = params;
//       if (
//         !userWalletPublicKey ||
//         !propertyWalletPublicKey ||
//         !assetCode ||
//         !assetIssuer ||
//         !amount ||
//         !proceedsAmount
//       ) {
//         throw new Error("All parameters are required for token sale");
//       }

//       // Get issuer wallet to determine bNGN issuer
//       const issuerWallet = await MultiSigWallet.findOne({
//         where: { walletType: "platform_issuer", status: "active" },
//       });

//       if (!issuerWallet) {
//         throw new Error("Platform issuer wallet not found");
//       }
//       const propertyAsset = new Asset(assetCode, assetIssuer);
//       const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

//       // Ensure user wallet has trustline for bNGN
//       await this.ensureTrustlines(userWalletPublicKey, [
//         { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
//       ]);

//       // Get user wallet to retrieve user signer
//       const userWallet = await MultiSigWallet.findOne({
//         where: { stellarPublicKey: userWalletPublicKey, status: "active" },
//       });

//       if (!userWallet) {
//         throw new Error("User wallet not found");
//       }
//       // let signerKeypair: Keypair;

//       // Get user's signer keypair
//       const signerKeypair = await secureWalletService.getKeypairFromStorage(
//         userWallet.id,
//         "user"
//       );
//       const userAccount = await this.server.loadAccount(userWalletPublicKey);

//       const transaction = new TransactionBuilder(userAccount, {
//         fee: BASE_FEE,
//         networkPassphrase: this.network,
//       })
//         .addOperation(
//           Operation.payment({
//             destination: propertyWalletPublicKey,
//             asset: propertyAsset,
//             amount: amount,
//           })
//         )
//         .addOperation(
//           Operation.payment({
//             destination: userWalletPublicKey,
//             asset: bNGNAsset,
//             amount: proceedsAmount,
//             source: propertyWalletPublicKey,
//           })
//         )
//         .setTimeout(180)
//         .build();

//       transaction.sign(signerKeypair);
//       transaction.sign(await this.getPlatformKeypair("platform"));

//       const result = await this.submitTransactionWithFeeBump(
//         transaction,
//         signerKeypair
//       );

//       logger.info(
//         `Token sale executed: ${amount} ${assetCode} from ${userWalletPublicKey}`
//       );
//       return result.hash;
//     } catch (error) {
//       logger.error("Error executing token sale:", error);
//       throw new Error(
//         `Failed to execute token sale: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`
//       );
//     }
//   }