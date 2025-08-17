// /* eslint-disable @typescript-eslint/no-explicit-any */
// import Server, {
//   Keypair,
//   Asset,
//   Operation,
//   TransactionBuilder,
//   Networks,
//   BASE_FEE,
//   Horizon,
//   xdr,
// } from "@stellar/stellar-sdk";
// import logger from "../utils/logger";
// import { encrypt } from "../utils/cypher";
// import Wallet from "../models/Wallet";
// import MultiSigWallet from "../models/MultiSigWallet";
// import MultiSigTransaction from "../models/MultiSigTransaction";
// import MultiSigSigner from "../models/MultiSigSigner";
// import {
//   STELLAR_NETWORK,
//   STELLAR_HORIZON_URL,
//   STELLAR_ISSUER_SECRET,
//   STELLAR_DISTRIBUTION_SECRET,
// } from "../config";

// interface CreateWalletResponse {
//   publicKey: string;
//   walletId: string;
// }

// interface CreateMultiSigWalletResponse {
//   publicKey: string;
//   walletId: string;
//   signers: Array<{
//     publicKey: string;
//     weight: number;
//     role: string;
//   }>;
//   thresholds: {
//     low: number;
//     medium: number;
//     high: number;
//   };
// }

// interface CreateAccountResponse {
//   publicKey: string;
//   secretKey: string;
// }

// interface CreatePropertyTokenResponse {
//   assetCode: string;
//   assetIssuer: string;
//   transactionHash: string;
// }

// interface AccountBalance {
//   asset_code: string;
//   balance: string;
//   asset_issuer?: string;
// }

// interface MultisigTransactionProposal {
//   id: string;
//   transactionXDR: string;
//   description: string;
//   requiredSignatures: number;
//   currentSignatures: number;
//   status: "pending" | "approved" | "rejected" | "executed";
//   createdBy: string;
//   expiresAt: Date;
// }

// interface PropertyGovernanceConfig {
//   proposalThreshold: number; // Minimum tokens to create proposal
//   votingPeriod: number; // Hours
//   quorumThreshold: number; // Percentage of total tokens needed
//   executionDelay: number; // Hours after approval before execution
// }

// class StellarService {
//   private server: Horizon.Server;
//   private network: string;
//   private issuerKeypair: Keypair;
//   private distributionKeypair: Keypair;
//   private readonly MAX_RETRIES = 3;
//   private readonly RETRY_DELAY = 1000; // 1 second

//   constructor() {
//     this.validateEnvironmentVariables();

//     this.network =
//       STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
//     this.server = new Server(STELLAR_HORIZON_URL!);

//     try {
//       this.issuerKeypair = Keypair.fromSecret(STELLAR_ISSUER_SECRET!);
//       this.distributionKeypair = Keypair.fromSecret(
//         STELLAR_DISTRIBUTION_SECRET!
//       );
//     } catch (error) {
//       logger.error("Invalid Stellar keypairs in environment variables:", error);
//       throw new Error("Invalid Stellar keypairs configuration");
//     }
//   }

//   private validateEnvironmentVariables(): void {
//     const requiredEnvVars = [
//       "STELLAR_NETWORK",
//       "STELLAR_HORIZON_URL",
//       "STELLAR_ISSUER_SECRET",
//       "STELLAR_DISTRIBUTION_SECRET",
//     ];

//     const missingVars = requiredEnvVars.filter(
//       (varName) => !process.env[varName]
//     );

//     if (missingVars.length > 0) {
//       throw new Error(
//         `Missing required environment variables: ${missingVars.join(", ")}`
//       );
//     }
//   }

//   private async sleep(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   private async retryOperation<T>(
//     operation: () => Promise<T>,
//     operationName: string,
//     retries: number = this.MAX_RETRIES
//   ): Promise<T> {
//     for (let attempt = 1; attempt <= retries; attempt++) {
//       try {
//         return await operation();
//       } catch (error) {
//         if (attempt === retries) {
//           logger.error(
//             `${operationName} failed after ${retries} attempts:`,
//             error
//           );
//           throw error;
//         }

//         logger.warn(
//           `${operationName} attempt ${attempt} failed, retrying...`,
//           error
//         );
//         await this.sleep(this.RETRY_DELAY * attempt);
//       }
//     }

//     throw new Error(`${operationName} failed after ${retries} attempts`);
//   }

//   // ===========================================
//   // ENHANCED MULTISIG WALLET CREATION
//   // ===========================================

//   /**
//    * Create a multisig wallet for property management
//    * Different configurations based on property type and governance requirements
//    */
//   async createMultiSigWallet(
//     propertyId: string,
//     walletType:
//       | "property_fund"
//       | "governance"
//       | "escrow"
//       | "revenue_distribution",
//     signers: Array<{
//       publicKey: string;
//       weight: number;
//       role: string;
//       userId?: string;
//     }>,
//     thresholds: { low: number; medium: number; high: number },
//     masterWeight: number = 0 // Remove master key by default
//   ): Promise<CreateMultiSigWalletResponse> {
//     try {
//       // Validate inputs
//       if (!propertyId || signers.length === 0) {
//         throw new Error("Property ID and signers are required");
//       }

//       // Validate signer weights and thresholds
//       const totalWeight = signers.reduce(
//         (sum, signer) => sum + signer.weight,
//         0
//       );
//       if (
//         totalWeight <
//         Math.max(thresholds.low, thresholds.medium, thresholds.high)
//       ) {
//         throw new Error("Total signer weight must meet threshold requirements");
//       }

//       return this.retryOperation(async () => {
//         // Generate new keypair for multisig wallet
//         const walletKeypair = Keypair.random();

//         // Load wallet account (needs to be funded first)
//         let walletAccount;
//         try {
//           walletAccount = await this.server.loadAccount(
//             walletKeypair.publicKey()
//           );
//         } catch {
//           // Account doesn't exist, create and fund it
//           if (STELLAR_NETWORK === "testnet") {
//             await this.server.friendbot(walletKeypair.publicKey()).call();
//             await this.sleep(2000); // Wait for account creation
//             walletAccount = await this.server.loadAccount(
//               walletKeypair.publicKey()
//             );
//           } else {
//             throw new Error("Account must be funded on mainnet before setup");
//           }
//         }

//         // Create multisig configuration transaction
//         const transactionBuilder = new TransactionBuilder(walletAccount, {
//           fee: BASE_FEE,
//           networkPassphrase: this.network,
//         });

//         // Add all signers
//         signers.forEach((signer) => {
//           transactionBuilder.addOperation(
//             Operation.setOptions({
//               signer: {
//                 ed25519PublicKey: signer.publicKey,
//                 weight: signer.weight,
//               },
//             })
//           );
//         });

//         // Set thresholds
//         transactionBuilder.addOperation(
//           Operation.setOptions({
//             lowThreshold: thresholds.low,
//             medThreshold: thresholds.medium,
//             highThreshold: thresholds.high,
//             masterWeight: masterWeight,
//           })
//         );

//         const transaction = transactionBuilder.setTimeout(180).build();

//         // Sign with master key (will be disabled after this transaction if masterWeight = 0)
//         transaction.sign(walletKeypair);

//         // Submit transaction
//         const result = await this.server.submitTransaction(transaction);

//         // Create database record
//         const multiSigWallet = await MultiSigWallet.create({
//           propertyId,
//           stellarPublicKey: walletKeypair.publicKey(),
//           walletType,
//           lowThreshold: thresholds.low,
//           mediumThreshold: thresholds.medium,
//           highThreshold: thresholds.high,
//           masterWeight,
//           status: "active",
//           createdTxHash: result.hash,
//         });

//         // Add signers to database
//         const signerPromises = signers.map((signer) =>
//           MultiSigSigner.create({
//             multiSigWalletId: multiSigWallet.id,
//             userId: signer.userId,
//             publicKey: signer.publicKey,
//             weight: signer.weight,
//             role: signer.role,
//             status: "active",
//           })
//         );

//         await Promise.all(signerPromises);

//         logger.info(
//           `Multisig wallet created for property ${propertyId}: ${walletKeypair.publicKey()}`
//         );

//         return {
//           publicKey: walletKeypair.publicKey(),
//           walletId: multiSigWallet.id,
//           signers: signers.map((s) => ({
//             publicKey: s.publicKey,
//             weight: s.weight,
//             role: s.role,
//           })),
//           thresholds,
//         };
//       }, "Create MultiSig Wallet");
//     } catch (error) {
//       logger.error("Error creating multisig wallet:", error);
//       throw new Error(
//         `Failed to create multisig wallet: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`
//       );
//     }
//   }

//   /**
//    * Create property-specific multisig wallets with predefined configurations
//    */
//   async createPropertyMultiSigWallets(
//     propertyId: string,
//     propertyManager: string,
//     adminPublicKeys: string[],
//     platformPublicKey: string
//   ): Promise<{
//     fundWallet: CreateMultiSigWalletResponse;
//     governanceWallet: CreateMultiSigWalletResponse;
//     revenueWallet: CreateMultiSigWalletResponse;
//   }> {
//     try {
//       // Property Fund Wallet (2-of-3: Property Manager + 2 Admins)
//       const fundSigners = [
//         { publicKey: propertyManager, weight: 1, role: "property_manager" },
//         { publicKey: adminPublicKeys[0], weight: 1, role: "admin" },
//         { publicKey: adminPublicKeys[1], weight: 1, role: "admin" },
//       ];

//       const fundWallet = await this.createMultiSigWallet(
//         propertyId,
//         "property_fund",
//         fundSigners,
//         { low: 1, medium: 2, high: 2 }
//       );

//       // Governance Wallet (3-of-5: Enhanced security for major decisions)
//       const governanceSigners = [
//         { publicKey: propertyManager, weight: 1, role: "property_manager" },
//         { publicKey: platformPublicKey, weight: 1, role: "platform" },
//         ...adminPublicKeys
//           .slice(0, 3)
//           .map((key) => ({ publicKey: key, weight: 1, role: "admin" })),
//       ];

//       const governanceWallet = await this.createMultiSigWallet(
//         propertyId,
//         "governance",
//         governanceSigners,
//         { low: 2, medium: 3, high: 3 }
//       );

//       // Revenue Distribution Wallet (2-of-3: Automated + oversight)
//       const revenueSigners = [
//         { publicKey: propertyManager, weight: 1, role: "property_manager" },
//         { publicKey: platformPublicKey, weight: 1, role: "platform_automated" },
//         { publicKey: adminPublicKeys[0], weight: 1, role: "admin_oversight" },
//       ];

//       const revenueWallet = await this.createMultiSigWallet(
//         propertyId,
//         "revenue_distribution",
//         revenueSigners,
//         { low: 1, medium: 2, high: 2 }
//       );

//       return {
//         fundWallet,
//         governanceWallet,
//         revenueWallet,
//       };
//     } catch (error) {
//       logger.error("Error creating property multisig wallets:", error);
//       throw error;
//     }
//   }

//   // ===========================================
//   // MULTISIG TRANSACTION MANAGEMENT
//   // ===========================================

//   /**
//    * Propose a multisig transaction
//    */
//   async proposeMultiSigTransaction(
//     walletPublicKey: string,
//     proposedBy: string,
//     transactionXDR: string,
//     description: string,
//     category:
//       | "fund_management"
//       | "governance"
//       | "revenue_distribution"
//       | "emergency",
//     expirationHours: number = 168 // 7 days default
//   ): Promise<string> {
//     try {
//       const multiSigWallet = await MultiSigWallet.findOne({
//         where: { stellarPublicKey: walletPublicKey },
//       });

//       if (!multiSigWallet) {
//         throw new Error("Multisig wallet not found");
//       }

//       // Determine required signatures based on transaction category
//       let requiredThreshold;
//       switch (category) {
//         case "fund_management":
//           requiredThreshold = multiSigWallet.mediumThreshold;
//           break;
//         case "governance":
//           requiredThreshold = multiSigWallet.highThreshold;
//           break;
//         case "revenue_distribution":
//           requiredThreshold = multiSigWallet.lowThreshold;
//           break;
//         case "emergency":
//           requiredThreshold = multiSigWallet.highThreshold;
//           break;
//         default:
//           requiredThreshold = multiSigWallet.mediumThreshold;
//       }

//       const expiresAt = new Date();
//       expiresAt.setHours(expiresAt.getHours() + expirationHours);

//       const proposal = await MultiSigTransaction.create({
//         multiSigWalletId: multiSigWallet.id,
//         transactionXDR,
//         description,
//         category,
//         requiredSignatures: requiredThreshold,
//         status: "pending",
//         proposedBy,
//         expiresAt,
//       });

//       logger.info(`Multisig transaction proposed: ${proposal.id}`);
//       return proposal.id;
//     } catch (error) {
//       logger.error("Error proposing multisig transaction:", error);
//       throw error;
//     }
//   }

//   /**
//    * Sign a multisig transaction proposal
//    */
//   async signMultiSigTransaction(
//     proposalId: string,
//     signerPublicKey: string,
//     signerSecretKey: string
//   ): Promise<{
//     signed: boolean;
//     readyForExecution: boolean;
//     currentSignatures: number;
//     requiredSignatures: number;
//   }> {
//     try {
//       const proposal = await MultiSigTransaction.findByPk(proposalId, {
//         include: [{ model: MultiSigWallet, as: "wallet" }],
//       });

//       if (!proposal) {
//         throw new Error("Proposal not found");
//       }

//       if (proposal.status !== "pending") {
//         throw new Error("Proposal is not in pending status");
//       }

//       if (new Date() > proposal.expiresAt) {
//         await proposal.update({ status: "expired" });
//         throw new Error("Proposal has expired");
//       }

//       // Check if signer is authorized
//       const signer = await MultiSigSigner.findOne({
//         where: {
//           multiSigWalletId: proposal.multiSigWalletId,
//           publicKey: signerPublicKey,
//           status: "active",
//         },
//       });

//       if (!signer) {
//         throw new Error("Unauthorized signer");
//       }

//       // Check if already signed
//       const existingSignatures = proposal.signatures || [];
//       if (
//         existingSignatures.some((sig: any) => sig.publicKey === signerPublicKey)
//       ) {
//         throw new Error("Already signed by this signer");
//       }

//       // Verify the signature
//       const transaction = new TransactionBuilder.fromXDR(
//         proposal.transactionXDR,
//         this.network
//       );
//       const keypair = Keypair.fromSecret(signerSecretKey);

//       // Add signature
//       transaction.sign(keypair);

//       // Store signature
//       const newSignatures = [
//         ...existingSignatures,
//         {
//           publicKey: signerPublicKey,
//           signature: transaction.signatures[transaction.signatures.length - 1]
//             .signature()
//             .toString("base64"),
//           signedAt: new Date().toISOString(),
//         },
//       ];

//       await proposal.update({
//         signatures: newSignatures,
//         signedTransactionXDR: transaction.toXDR(),
//       });

//       const currentSignatures = newSignatures.length;
//       const readyForExecution =
//         currentSignatures >= proposal.requiredSignatures;

//       if (readyForExecution) {
//         await proposal.update({ status: "approved" });
//       }

//       logger.info(`Transaction ${proposalId} signed by ${signerPublicKey}`);

//       return {
//         signed: true,
//         readyForExecution,
//         currentSignatures,
//         requiredSignatures: proposal.requiredSignatures,
//       };
//     } catch (error) {
//       logger.error("Error signing multisig transaction:", error);
//       throw error;
//     }
//   }

//   /**
//    * Execute an approved multisig transaction
//    */
//   async executeMultiSigTransaction(
//     proposalId: string,
//     executedBy: string
//   ): Promise<string> {
//     try {
//       const proposal = await MultiSigTransaction.findByPk(proposalId);

//       if (!proposal) {
//         throw new Error("Proposal not found");
//       }

//       if (proposal.status !== "approved") {
//         throw new Error("Proposal is not approved for execution");
//       }

//       if (!proposal.signedTransactionXDR) {
//         throw new Error("No signed transaction available");
//       }

//       // Submit the fully signed transaction
//       const transaction = TransactionBuilder.fromXDR(
//         proposal.signedTransactionXDR,
//         this.network
//       );
//       const result = await this.server.submitTransaction(transaction);

//       await proposal.update({
//         status: "executed",
//         executedBy,
//         executedAt: new Date(),
//         executionTxHash: result.hash,
//       });

//       logger.info(
//         `Multisig transaction executed: ${proposalId}, Hash: ${result.hash}`
//       );
//       return result.hash;
//     } catch (error) {
//       logger.error("Error executing multisig transaction:", error);
//       await MultiSigTransaction.findByPk(proposalId).then((p) =>
//         p?.update({
//           status: "failed",
//           failureReason:
//             error instanceof Error ? error.message : "Unknown error",
//         })
//       );
//       throw error;
//     }
//   }

//   // ===========================================
//   // PROPERTY GOVERNANCE FUNCTIONS
//   // ===========================================

//   /**
//    * Create a property governance proposal
//    */
//   async createPropertyGovernanceProposal(
//     propertyId: string,
//     proposalType:
//       | "property_sale"
//       | "major_renovation"
//       | "management_change"
//       | "rent_adjustment",
//     proposalData: any,
//     proposerTokenBalance: number,
//     governanceConfig: PropertyGovernanceConfig
//   ): Promise<string> {
//     try {
//       // Check if proposer meets threshold
//       if (proposerTokenBalance < governanceConfig.proposalThreshold) {
//         throw new Error("Insufficient tokens to create proposal");
//       }

//       // Get governance wallet
//       const governanceWallet = await MultiSigWallet.findOne({
//         where: { propertyId, walletType: "governance" },
//       });

//       if (!governanceWallet) {
//         throw new Error("Governance wallet not found");
//       }

//       // Create governance transaction based on proposal type
//       let operationDescription = "";
//       const transactionOperations: xdr.Operation<Operation>[] = [];

//       switch (proposalType) {
//         case "property_sale":
//           operationDescription = `Proposal to sell property for ${proposalData.salePrice}`;
//           // This would involve complex operations to transfer property ownership
//           break;
//         case "major_renovation":
//           operationDescription = `Proposal for renovation: ${proposalData.description} - Cost: ${proposalData.cost}`;
//           break;
//         case "management_change":
//           operationDescription = `Proposal to change property manager to ${proposalData.newManager}`;
//           break;
//         case "rent_adjustment":
//           operationDescription = `Proposal to adjust rent from ${proposalData.currentRent} to ${proposalData.newRent}`;
//           break;
//       }

//       // For now, create a simple payment operation as placeholder
//       // In real implementation, this would be replaced with appropriate operations
//       const account = await this.server.loadAccount(
//         governanceWallet.stellarPublicKey
//       );
//       const transaction = new TransactionBuilder(account, {
//         fee: BASE_FEE,
//         networkPassphrase: this.network,
//       })
//         .addOperation(
//           Operation.manageData({
//             name: `gov_proposal_${Date.now()}`,
//             value: JSON.stringify({ proposalType, proposalData }),
//           })
//         )
//         .setTimeout(0) // No timeout for governance proposals
//         .build();

//       const expirationHours = governanceConfig.votingPeriod;
//       const proposalId = await this.proposeMultiSigTransaction(
//         governanceWallet.stellarPublicKey,
//         proposalData.proposerId,
//         transaction.toXDR(),
//         operationDescription,
//         "governance",
//         expirationHours
//       );

//       logger.info(
//         `Governance proposal created: ${proposalId} for property ${propertyId}`
//       );
//       return proposalId;
//     } catch (error) {
//       logger.error("Error creating governance proposal:", error);
//       throw error;
//     }
//   }

//   /**
//    * Vote on a governance proposal (token-weighted voting)
//    */
//   async voteOnGovernanceProposal(
//     proposalId: string,
//     voterPublicKey: string,
//     voterTokenBalance: number,
//     vote: "for" | "against" | "abstain"
//   ): Promise<void> {
//     try {
//       const proposal = await MultiSigTransaction.findByPk(proposalId);
//       if (!proposal) {
//         throw new Error("Proposal not found");
//       }

//       // Store vote (in real implementation, this would be more sophisticated)
//       const votes = proposal.metadata?.votes || [];
//       votes.push({
//         voter: voterPublicKey,
//         vote,
//         weight: voterTokenBalance,
//         timestamp: new Date().toISOString(),
//       });

//       await proposal.update({
//         metadata: { ...proposal.metadata, votes },
//       });

//       logger.info(
//         `Vote recorded for proposal ${proposalId}: ${vote} with weight ${voterTokenBalance}`
//       );
//     } catch (error) {
//       logger.error("Error voting on governance proposal:", error);
//       throw error;
//     }
//   }

//   // ===========================================
//   // AUTOMATED REVENUE DISTRIBUTION
//   // ===========================================

//   /**
//    * Create automated revenue distribution transaction
//    */
//   async createRevenueDistribution(
//     propertyId: string,
//     totalRevenue: number,
//     tokenHolders: Array<{
//       publicKey: string;
//       tokenBalance: number;
//       percentage: number;
//     }>,
//     platformFeePercentage: number = 2.5
//   ): Promise<string> {
//     try {
//       const revenueWallet = await MultiSigWallet.findOne({
//         where: { propertyId, walletType: "revenue_distribution" },
//       });

//       if (!revenueWallet) {
//         throw new Error("Revenue distribution wallet not found");
//       }

//       // Calculate distributions
//       const platformFee = totalRevenue * (platformFeePercentage / 100);
//       const distributionAmount = totalRevenue - platformFee;

//       // Build transaction with multiple payment operations
//       const account = await this.server.loadAccount(
//         revenueWallet.stellarPublicKey
//       );
//       const transactionBuilder = new TransactionBuilder(account, {
//         fee: BASE_FEE,
//         networkPassphrase: this.network,
//       });

//       // Add payment operations for each token holder
//       tokenHolders.forEach((holder) => {
//         const paymentAmount = (
//           (distributionAmount * holder.percentage) /
//           100
//         ).toFixed(2);
//         transactionBuilder.addOperation(
//           Operation.payment({
//             destination: holder.publicKey,
//             asset: Asset.native(), // XLM for now, could be property token or stablecoin
//             amount: paymentAmount,
//           })
//         );
//       });

//       const transaction = transactionBuilder.setTimeout(180).build();

//       const proposalId = await this.proposeMultiSigTransaction(
//         revenueWallet.stellarPublicKey,
//         "automated_system",
//         transaction.toXDR(),
//         `Revenue distribution: ${distributionAmount} XLM to ${tokenHolders.length} token holders`,
//         "revenue_distribution",
//         24 // 24 hours for revenue distribution approval
//       );

//       logger.info(
//         `Revenue distribution proposed: ${proposalId} for property ${propertyId}`
//       );
//       return proposalId;
//     } catch (error) {
//       logger.error("Error creating revenue distribution:", error);
//       throw error;
//     }
//   }

//   // ===========================================
//   // UTILITY FUNCTIONS
//   // ===========================================

//   /**
//    * Get multisig wallet details
//    */
//   async getMultiSigWalletDetails(walletPublicKey: string): Promise<any> {
//     try {
//       const account = await this.server.loadAccount(walletPublicKey);
//       const wallet = await MultiSigWallet.findOne({
//         where: { stellarPublicKey: walletPublicKey },
//         include: [{ model: MultiSigSigner, as: "signers" }],
//       });

//       return {
//         account,
//         wallet,
//         signers: account.signers,
//         thresholds: account.thresholds,
//       };
//     } catch (error) {
//       logger.error("Error getting multisig wallet details:", error);
//       throw error;
//     }
//   }

//   /**
//    * Get pending proposals for a wallet
//    */
//   async getPendingProposals(
//     walletPublicKey: string
//   ): Promise<MultisigTransactionProposal[]> {
//     try {
//       const wallet = await MultiSigWallet.findOne({
//         where: { stellarPublicKey: walletPublicKey },
//       });

//       if (!wallet) {
//         throw new Error("Wallet not found");
//       }

//       const proposals = await MultiSigTransaction.findAll({
//         where: {
//           multiSigWalletId: wallet.id,
//           status: "pending",
//         },
//         order: [["createdAt", "DESC"]],
//       });

//       return proposals.map(
//         (p) => ({
//           id: p.id,
//           transactionXDR: p.transactionXDR,
//           description: p.description,
//           requiredSignatures: p.requiredSignatures,
//           currentSignatures: p.signatures?.length || 0,
//           status: p.status as "pending" | "approved" | "rejected" | "executed",
//           createdBy: p.proposedBy,
//           expiresAt: p.expiresAt,
//         })
//       );
//     } catch (error) {
//       logger.error("Error getting pending proposals:", error);
//       throw error;
//     }
//   }

//   // Keep existing methods for backwards compatibility
//   async createWalletForUser(
//     userId: string,
//     userPassword: string
//   ): Promise<CreateWalletResponse> {
//     // Implementation stays the same as in original code
//     try {
//       if (!userPassword || userPassword.length < 8) {
//         throw new Error("Password must be at least 8 characters long");
//       }

//       // Check if user already has a wallet
//       const existingWallet = await Wallet.findOne({ where: { userId } });
//       if (existingWallet) {
//         throw new Error("User already has a wallet");
//       }

//       // Generate new keypair
//       const keypair = Keypair.random();

//       // Encrypt the secret key
//       const encryptedSecret = encrypt(keypair.secret(), userPassword);

//       // Create wallet record in database
//       const wallet = await Wallet.create({
//         userId,
//         publicKey: keypair.publicKey(),
//         encryptedSecretKey: encryptedSecret,
//         currency: "",
//         availableBalance: 0,
//         lockedBalance: 0,
//         totalBalance: 0,
//       });

//       logger.info(
//         `Wallet created for user ${userId} with public key: ${keypair.publicKey()}`
//       );

//       return {
//         publicKey: keypair.publicKey(),
//         walletId: wallet.id,
//       };
//     } catch (error) {
//       logger.error("Error creating wallet for user:", error);
//       throw new Error(
//         `Failed to create wallet: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`
//       );
//     }
//   }

//   async createAccount(): Promise<CreateAccountResponse> {
//     return this.retryOperation(async () => {
//       const newKeypair = Keypair.random();

//       if (STELLAR_NETWORK === "testnet") {
//         try {
//           await this.server.friendbot(newKeypair.publicKey()).call();
//           logger.info(`Testnet account funded: ${newKeypair.publicKey()}`);
//         } catch (error) {
//           logger.warn("Friendbot funding failed:", error);
//         }
//       }

//       return {
//         publicKey: newKeypair.publicKey(),
//         secretKey: newKeypair.secret(),
//       };
//     }, "Create Account");
//   }

//   // Create property token (asset) with improved validation
//   async createPropertyToken(
//     propertyId: string,
//     totalSupply: number
//   ): Promise<CreatePropertyTokenResponse> {
//     try {
//       // Validate inputs
//       if (!propertyId || propertyId.length < 1) {
//         throw new Error("Invalid property ID provided");
//       }

//       if (!totalSupply || totalSupply <= 0) {
//         throw new Error("Total supply must be greater than 0");
//       }

//       // Create asset code (max 12 characters for custom assets)
//       const assetCode = `PROP${propertyId.substring(0, 8).toUpperCase()}`;
//       const asset = new Asset(assetCode, this.issuerKeypair.publicKey());

//       return this.retryOperation(async () => {
//         // Load issuer account
//         const issuerAccount = await this.server.loadAccount(
//           this.issuerKeypair.publicKey()
//         );

//         // Create transaction to establish trustline and mint tokens
//         const transaction = new TransactionBuilder(issuerAccount, {
//           fee: BASE_FEE,
//           networkPassphrase: this.network,
//         })
//           .addOperation(
//             Operation.changeTrust({
//               asset: asset,
//               source: this.distributionKeypair.publicKey(),
//             })
//           )
//           .addOperation(
//             Operation.payment({
//               destination: this.distributionKeypair.publicKey(),
//               asset: asset,
//               amount: totalSupply.toString(),
//             })
//           )
//           .setTimeout(180)
//           .build();

//         // Sign transaction
//         transaction.sign(this.issuerKeypair);
//         transaction.sign(this.distributionKeypair);

//         // Submit transaction
//         const result = await this.server.submitTransaction(transaction);

//         logger.info(
//           `Property token created: ${assetCode}, Hash: ${result.hash}`
//         );

//         return {
//           assetCode,
//           assetIssuer: this.issuerKeypair.publicKey(),
//           transactionHash: result.hash,
//         };
//       }, "Create Property Token");
//     } catch (error) {
//       logger.error("Error creating property token:", error);
//       throw new Error(
//         `Failed to create property token: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`
//       );
//     }
//   }

//   // Transfer tokens with enhanced validation
//   async transferTokens(
//     fromSecret: string,
//     toPublicKey: string,
//     assetCode: string,
//     assetIssuer: string,
//     amount: string
//   ): Promise<string> {
//     try {
//       // Validate inputs
//       if (
//         !fromSecret ||
//         !toPublicKey ||
//         !assetCode ||
//         !assetIssuer ||
//         !amount
//       ) {
//         throw new Error("All parameters are required for token transfer");
//       }

//       const numericAmount = parseFloat(amount);
//       if (isNaN(numericAmount) || numericAmount <= 0) {
//         throw new Error("Amount must be a positive number");
//       }

//       let fromKeypair: Keypair;
//       try {
//         fromKeypair = Keypair.fromSecret(fromSecret);
//       } catch {
//         throw new Error("Invalid source secret key");
//       }

//       try {
//         Keypair.fromPublicKey(toPublicKey);
//       } catch {
//         throw new Error("Invalid destination public key");
//       }

//       const asset = new Asset(assetCode, assetIssuer);

//       return this.retryOperation(async () => {
//         // Load source account
//         const sourceAccount = await this.server.loadAccount(
//           fromKeypair.publicKey()
//         );

//         // Check if source has sufficient balance
//         const balances = await this.getAccountBalance(fromKeypair.publicKey());
//         const assetBalance = balances.find(
//           (b) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
//         );

//         if (!assetBalance || parseFloat(assetBalance.balance) < numericAmount) {
//           throw new Error("Insufficient balance for transfer");
//         }

//         // Create payment transaction
//         const transaction = new TransactionBuilder(sourceAccount, {
//           fee: BASE_FEE,
//           networkPassphrase: this.network,
//         })
//           .addOperation(
//             Operation.payment({
//               destination: toPublicKey,
//               asset: asset,
//               amount: amount,
//             })
//           )
//           .setTimeout(180)
//           .build();

//         // Sign and submit
//         transaction.sign(fromKeypair);
//         const result = await this.server.submitTransaction(transaction);

//         logger.info(
//           `Tokens transferred: ${amount} ${assetCode} from ${fromKeypair.publicKey()} to ${toPublicKey}`
//         );

//         return result.hash;
//       }, "Transfer Tokens");
//     } catch (error) {
//       logger.error("Error transferring tokens:", error);
//       throw new Error(
//         `Failed to transfer tokens: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`
//       );
//     }
//   }

import Server, {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";
import logger from "../utils/logger";
import { encrypt } from "../utils/cypher";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigSigner from "../models/MultiSigSigner";
import {
  STELLAR_NETWORK,
  STELLAR_HORIZON_URL,
  STELLAR_PLATFORM_SECRET,
  STELLAR_RECOVERY_SECRET,
  STELLAR_TREASURY_SECRET,
} from "../config";

interface UserRecoveryWalletParams {
  userId: string;
  userEmail: string;
  userName: string;
}

interface PlatformWalletParams {
  description: string;
  createdBy: string;
}

interface PropertyWalletParams {
  propertyId: string;
  propertyTitle: string;
  propertyManager?: string;
  createdBy: string;
}

class StellarService {
  private server: Horizon.Server;
  private network: string;
  private platformKeypair: Keypair;
  private recoveryKeypair: Keypair;
  private treasuryKeypair: Keypair;

  constructor() {
    this.validateEnvironmentVariables();
    this.network =
      STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new Server(STELLAR_HORIZON_URL!);

    try {
      this.platformKeypair = Keypair.fromSecret(STELLAR_PLATFORM_SECRET!);
      this.recoveryKeypair = Keypair.fromSecret(STELLAR_RECOVERY_SECRET!);
      this.treasuryKeypair = Keypair.fromSecret(STELLAR_TREASURY_SECRET!);
    } catch (error) {
      logger.error("Invalid Stellar keypairs in environment variables:", error);
      throw new Error("Invalid Stellar keypairs configuration");
    }
  }

  private validateEnvironmentVariables(): void {
    const requiredEnvVars = [
      "STELLAR_NETWORK",
      "STELLAR_HORIZON_URL",
      "STELLAR_PLATFORM_SECRET",
      "STELLAR_RECOVERY_SECRET",
      "STELLAR_TREASURY_SECRET",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  }

  // ===========================================
  // USER RECOVERY WALLET CREATION (SEP-30 Compliant)
  // ===========================================

  /**
   * Create a 1-of-2 multisig wallet for user recovery
   * User OR Platform can sign transactions (recovery-focused)
   */
  async createUserRecoveryWallet(params: UserRecoveryWalletParams) {
    try {
      const { userId, userEmail, userName } = params;

      // Generate new keypair for user
      const userKeypair = Keypair.random();

      // Create the multisig account
      const walletKeypair = Keypair.random();

      // Fund account first (required before setting up multisig)
      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);
      } else {
        // On mainnet, fund from treasury
        await this.fundAccountFromTreasury(walletKeypair.publicKey(), "2");
      }

      // Load the account
      const account = await this.server.loadAccount(walletKeypair.publicKey());

      // Create multisig transaction following SEP-30
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Add user as signer (weight 1)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: userKeypair.publicKey(),
              weight: 1,
            },
          })
        )
        // Add platform recovery key as signer (weight 1)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: this.recoveryKeypair.publicKey(),
              weight: 1,
            },
          })
        )
        // Set thresholds: 1-of-2 (either user OR platform can sign)
        .addOperation(
          Operation.setOptions({
            lowThreshold: 1, // Simple operations
            medThreshold: 1, // Medium operations
            highThreshold: 1, // High operations
            masterWeight: 0, // Disable master key after setup
          })
        )
        .setTimeout(180)
        .build();

      // Sign with master key (this disables it due to masterWeight: 0)
      transaction.sign(walletKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      // Store wallet in database
      const multiSigWallet = await MultiSigWallet.create({
        userId,
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "user_recovery",
        lowThreshold: 1,
        mediumThreshold: 1,
        highThreshold: 1,
        masterWeight: 0,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          userEmail,
          userName,
          createdAt: new Date().toISOString(),
        },
      });

      // Store signers
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          userId: userId,
          publicKey: userKeypair.publicKey(),
          weight: 1,
          role: "user",
          status: "active",
          // Store encrypted private key for user (they can recover with password)
          encryptedPrivateKey: encrypt(
            userKeypair.secret(),
            userEmail + userId
          ),
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: this.recoveryKeypair.publicKey(),
          weight: 1,
          role: "platform_recovery",
          status: "active",
        }),
      ]);

      logger.info(
        `User recovery wallet created: ${walletKeypair.publicKey()} for user ${userId}`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        userKeypair: {
          publicKey: userKeypair.publicKey(),
          // Return secret only during creation - user should store safely
          secretKey: userKeypair.secret(),
        },
        canRecover: true,
        thresholds: { low: 1, medium: 1, high: 1 },
      };
    } catch (error) {
      logger.error("Error creating user recovery wallet:", error);
      throw new Error(
        `Failed to create user recovery wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ===========================================
  // PLATFORM WALLET CREATION
  // ===========================================

  /**
   * Create platform treasury wallet (2-of-3 multisig for security)
   */
  async createPlatformTreasuryWallet(params: PlatformWalletParams) {
    try {
      const walletKeypair = Keypair.random();

      // Generate additional platform keys for security
      const platformKey2 = Keypair.random();
      const platformKey3 = Keypair.random();

      // Fund account
      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);
      }

      const account = await this.server.loadAccount(walletKeypair.publicKey());

      // Create 2-of-3 multisig for treasury (higher security)
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: this.platformKeypair.publicKey(),
              weight: 1,
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: { ed25519PublicKey: platformKey2.publicKey(), weight: 1 },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: { ed25519PublicKey: platformKey3.publicKey(), weight: 1 },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: 2,
            medThreshold: 2,
            highThreshold: 2,
            masterWeight: 0,
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(walletKeypair);
      const result = await this.server.submitTransaction(transaction);

      const multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_treasury",
        lowThreshold: 2,
        mediumThreshold: 2,
        highThreshold: 2,
        masterWeight: 0,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform signers (encrypted keys stored securely)
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: this.platformKeypair.publicKey(),
          weight: 1,
          role: "platform_primary",
          status: "active",
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: platformKey2.publicKey(),
          weight: 1,
          role: "platform_secondary",
          status: "active",
          encryptedPrivateKey: encrypt(
            platformKey2.secret(),
            "platform_treasury_key_2"
          ),
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: platformKey3.publicKey(),
          weight: 1,
          role: "platform_tertiary",
          status: "active",
          encryptedPrivateKey: encrypt(
            platformKey3.secret(),
            "platform_treasury_key_3"
          ),
        }),
      ]);

      logger.info(
        `Platform treasury wallet created: ${walletKeypair.publicKey()}`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        signers: [
          {
            publicKey: this.platformKeypair.publicKey(),
            role: "platform_primary",
          },
          { publicKey: platformKey2.publicKey(), role: "platform_secondary" },
          { publicKey: platformKey3.publicKey(), role: "platform_tertiary" },
        ],
        thresholds: { low: 2, medium: 2, high: 2 },
      };
    } catch (error) {
      logger.error("Error creating platform treasury wallet:", error);
      throw error;
    }
  }

  /**
   * Create platform asset issuer wallet (1-of-2 for operational efficiency)
   */
  async createPlatformIssuerWallet(params: PlatformWalletParams) {
    try {
      const walletKeypair = Keypair.random();
      const backupKey = Keypair.random();

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);
      }

      const account = await this.server.loadAccount(walletKeypair.publicKey());

      // 1-of-2 for issuer (operational efficiency + recovery)
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: this.platformKeypair.publicKey(),
              weight: 1,
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: { ed25519PublicKey: backupKey.publicKey(), weight: 1 },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: 1,
            medThreshold: 1,
            highThreshold: 1,
            masterWeight: 0,
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(walletKeypair);
      const result = await this.server.submitTransaction(transaction);

      const multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_issuer",
        lowThreshold: 1,
        mediumThreshold: 1,
        highThreshold: 1,
        masterWeight: 0,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
        },
      });

      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: this.platformKeypair.publicKey(),
          weight: 1,
          role: "platform_issuer",
          status: "active",
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: backupKey.publicKey(),
          weight: 1,
          role: "issuer_backup",
          status: "active",
          encryptedPrivateKey: encrypt(
            backupKey.secret(),
            "platform_issuer_backup"
          ),
        }),
      ]);

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        signers: [
          {
            publicKey: this.platformKeypair.publicKey(),
            role: "platform_issuer",
          },
          { publicKey: backupKey.publicKey(), role: "issuer_backup" },
        ],
        thresholds: { low: 1, medium: 1, high: 1 },
      };
    } catch (error) {
      logger.error("Error creating platform issuer wallet:", error);
      throw error;
    }
  }

  // /**
  //  * Create platform distribution wallet
  //  */
  // async createPlatformDistributionWallet(params: PlatformWalletParams) {
  //   return this.createPlatformIssuerWallet(params); // Same structure as issuer
  // }

  // /**
  //  * Create platform fee collection wallet
  //  */
  // async createPlatformFeeCollectionWallet(params: PlatformWalletParams) {
  //   return this.createPlatformIssuerWallet(params); // Same structure as issuer
  // }

  // ===========================================
  // PROPERTY-SPECIFIC WALLET CREATION
  // ===========================================

  /**
   * Create property-specific wallets (distribution + optional governance)
   */
  async createPropertyWallets(params: PropertyWalletParams) {
    try {
      const { propertyId, propertyTitle } = params;

      // Create distribution wallet (holds property tokens for sale)
      const distributionResult = await this.createPropertyDistributionWallet(
        params
      );

      // Optionally create governance wallet for major property decisions
      let governanceResult = null;
      try {
        governanceResult = await this.createPropertyGovernanceWallet(params);
      } catch (error) {
        logger.warn(
          `Governance wallet creation failed for property ${propertyId}:`,
          error
        );
        // Continue without governance wallet
      }

      logger.info(
        `Property wallets created for ${propertyTitle}: Distribution ${distributionResult.publicKey}`
      );

      return {
        distributionWallet: distributionResult,
        governanceWallet: governanceResult,
      };
    } catch (error) {
      logger.error("Error creating property wallets:", error);
      throw error;
    }
  }

  private async createPropertyDistributionWallet(params: PropertyWalletParams) {
    const walletKeypair = Keypair.random();
    const propertyManagerKey = params.propertyManager ? Keypair.random() : null;

    if (STELLAR_NETWORK === "testnet") {
      await this.server.friendbot(walletKeypair.publicKey()).call();
      await this.sleep(2000);
    }

    const account = await this.server.loadAccount(walletKeypair.publicKey());

    // Create transaction builder
    const transactionBuilder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    });

    // Add platform as primary signer
    transactionBuilder.addOperation(
      Operation.setOptions({
        signer: {
          ed25519PublicKey: this.platformKeypair.publicKey(),
          weight: 1,
        },
      })
    );

    // Add property manager if provided (1-of-2 or 1-of-1)
    if (propertyManagerKey) {
      transactionBuilder.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: propertyManagerKey.publicKey(),
            weight: 1,
          },
        })
      );
    }

    // Set thresholds - 1 signature required (platform OR property manager)
    transactionBuilder.addOperation(
      Operation.setOptions({
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1,
        masterWeight: 0,
      })
    );

    const transaction = transactionBuilder.setTimeout(180).build();
    transaction.sign(walletKeypair);
    const result = await this.server.submitTransaction(transaction);

    const multiSigWallet = await MultiSigWallet.create({
      propertyId: params.propertyId,
      stellarPublicKey: walletKeypair.publicKey(),
      walletType: "property_distribution",
      lowThreshold: 1,
      mediumThreshold: 1,
      highThreshold: 1,
      masterWeight: 0,
      status: "active",
      createdTxHash: result.hash,
      metadata: {
        propertyTitle: params.propertyTitle,
        createdBy: params.createdBy,
        purpose: "Holds property tokens for distribution to investors",
      },
    });

    // Store signers
    const signerPromises = [
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: this.platformKeypair.publicKey(),
        weight: 1,
        role: "platform_distribution",
        status: "active",
      }),
    ];

    if (propertyManagerKey) {
      signerPromises.push(
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: propertyManagerKey.publicKey(),
          weight: 1,
          role: "property_manager",
          status: "active",
          encryptedPrivateKey: encrypt(
            propertyManagerKey.secret(),
            `prop_${params.propertyId}_mgr`
          ),
        })
      );
    }

    await Promise.all(signerPromises);

    return {
      publicKey: walletKeypair.publicKey(),
      walletId: multiSigWallet.id,
      signers: [
        {
          publicKey: this.platformKeypair.publicKey(),
          role: "platform_distribution",
        },
        ...(propertyManagerKey
          ? [
              {
                publicKey: propertyManagerKey.publicKey(),
                role: "property_manager",
              },
            ]
          : []),
      ],
      thresholds: { low: 1, medium: 1, high: 1 },
    };
  }

  private async createPropertyGovernanceWallet(params: PropertyWalletParams) {
    // Only create governance wallet for properties that need it
    const walletKeypair = Keypair.random();
    const governanceKey = Keypair.random();

    if (STELLAR_NETWORK === "testnet") {
      await this.server.friendbot(walletKeypair.publicKey()).call();
      await this.sleep(2000);
    }

    const account = await this.server.loadAccount(walletKeypair.publicKey());

    // 2-of-3 multisig for governance (higher threshold for major decisions)
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: this.platformKeypair.publicKey(),
            weight: 1,
          },
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: governanceKey.publicKey(), weight: 1 },
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: this.recoveryKeypair.publicKey(),
            weight: 1,
          },
        })
      )
      .addOperation(
        Operation.setOptions({
          lowThreshold: 2,
          medThreshold: 2,
          highThreshold: 2,
          masterWeight: 0,
        })
      )
      .setTimeout(180)
      .build();

    transaction.sign(walletKeypair);
    const result = await this.server.submitTransaction(transaction);

    const multiSigWallet = await MultiSigWallet.create({
      propertyId: params.propertyId,
      stellarPublicKey: walletKeypair.publicKey(),
      walletType: "property_governance",
      lowThreshold: 2,
      mediumThreshold: 2,
      highThreshold: 2,
      masterWeight: 0,
      status: "active",
      createdTxHash: result.hash,
      metadata: {
        propertyTitle: params.propertyTitle,
        createdBy: params.createdBy,
        purpose: "Property governance and major decision making",
      },
    });

    await Promise.all([
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: this.platformKeypair.publicKey(),
        weight: 1,
        role: "platform_governance",
        status: "active",
      }),
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: governanceKey.publicKey(),
        weight: 1,
        role: "governance_key",
        status: "active",
        encryptedPrivateKey: encrypt(
          governanceKey.secret(),
          `prop_${params.propertyId}_gov`
        ),
      }),
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: this.recoveryKeypair.publicKey(),
        weight: 1,
        role: "platform_recovery",
        status: "active",
      }),
    ]);

    return {
      publicKey: walletKeypair.publicKey(),
      walletId: multiSigWallet.id,
      signers: [
        {
          publicKey: this.platformKeypair.publicKey(),
          role: "platform_governance",
        },
        { publicKey: governanceKey.publicKey(), role: "governance_key" },
        {
          publicKey: this.recoveryKeypair.publicKey(),
          role: "platform_recovery",
        },
      ],
      thresholds: { low: 2, medium: 2, high: 2 },
    };
  }

  // ===========================================
  // WALLET RECOVERY OPERATIONS
  // ===========================================

  /**
   * Perform wallet recovery using platform recovery key
   */
  async performWalletRecovery(params: {
    walletPublicKey: string;
    userId: string;
    newUserPublicKey: string;
    recoveryReason: string;
    recoveredBy: string;
  }) {
    try {
      const { walletPublicKey, newUserPublicKey, recoveryReason, recoveredBy } =
        params;

      // Load the wallet account
      const account = await this.server.loadAccount(walletPublicKey);

      // Find old user signer to remove
      const wallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: walletPublicKey },
        include: [
          { model: MultiSigSigner, as: "signers", where: { role: "user" } },
        ],
      });

      if (!wallet || !wallet.signers?.[0]) {
        throw new Error("User signer not found");
      }

      const oldUserPublicKey = wallet.signers[0].publicKey;

      // Create recovery transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Remove old user signer
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: oldUserPublicKey,
              weight: 0, // Setting weight to 0 removes the signer
            },
          })
        )
        // Add new user signer
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: newUserPublicKey,
              weight: 1,
            },
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform recovery key
      transaction.sign(this.recoveryKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      // Update database records
      await wallet.signers[0].update({
        publicKey: newUserPublicKey,
        status: "recovered",
        metadata: {
          oldPublicKey: oldUserPublicKey,
          recoveryReason,
          recoveredBy,
          recoveredAt: new Date().toISOString(),
        },
      });

      logger.info(
        `Wallet recovery completed: ${walletPublicKey}, old key: ${oldUserPublicKey}, new key: ${newUserPublicKey}`
      );

      return {
        transactionHash: result.hash,
        oldUserPublicKey,
        newUserPublicKey,
        recoveryTimestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error performing wallet recovery:", error);
      throw error;
    }
  }

  // ===========================================
  // WALLET FUNDING OPERATIONS
  // ===========================================

  /**
   * Fund wallet from platform treasury
   */
  async fundWalletFromTreasury(destinationPublicKey: string, amount: string) {
    try {
      // Load treasury account
      const treasuryAccount = await this.server.loadAccount(
        this.treasuryKeypair.publicKey()
      );

      // Create funding transaction
      const transaction = new TransactionBuilder(treasuryAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.payment({
            destination: destinationPublicKey,
            asset: Asset.native(),
            amount: amount,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with treasury key
      transaction.sign(this.treasuryKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      logger.info(`Wallet funded: ${destinationPublicKey} with ${amount} XLM`);
      return result.hash;
    } catch (error) {
      logger.error("Error funding wallet from treasury:", error);
      throw error;
    }
  }

  // private async fundAccountFromTreasury(publicKey: string, amount: string) {
  //   return this.fundWalletFromTreasury(publicKey, amount);
  // }

  // ===========================================
  // TOKEN OPERATIONS
  // ===========================================

  /**
   * Create property token and issue to distribution wallet
   */
  async createAndIssuePropertyToken(params: {
    propertyId: string;
    totalSupply: number;
    distributionWalletPublicKey: string;
  }) {
    try {
      const { propertyId, totalSupply, distributionWalletPublicKey } = params;

      // Create asset code
      const assetCode = `PROP${propertyId.substring(0, 8).toUpperCase()}`;

      // Get platform issuer wallet
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer" },
      });

      if (!issuerWallet) {
        throw new Error("Platform issuer wallet not found");
      }
      if (!propertyId || propertyId.length < 1) {
        throw new Error("Invalid property ID provided");
      }

      if (!totalSupply || totalSupply <= 0) {
        throw new Error("Total supply must be greater than 0");
      }

      //       // Create asset code (max 12 characters for custom assets)
      //       const assetCode = `PROP${propertyId.substring(0, 8).toUpperCase()}`;
      //       const asset = new Asset(assetCode, this.issuerKeypair.publicKey());
      const asset = new Asset(assetCode, issuerWallet.stellarPublicKey);

      // Load issuer account
      const issuerAccount = await this.server.loadAccount(
        issuerWallet.stellarPublicKey
      );

      // Create transaction to establish trustline and mint tokens
      const transaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.changeTrust({
            asset: asset,
            source: distributionWalletPublicKey,
          })
        )
        .addOperation(
          Operation.payment({
            destination: distributionWalletPublicKey,
            asset: asset,
            amount: totalSupply.toString(),
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform issuer key
      transaction.sign(this.platformKeypair);

      // Also need to sign with distribution wallet for trustline
      // In practice, you'd need to implement proper multisig signing here

      const result = await this.server.submitTransaction(transaction);

      logger.info(
        `Property token created and issued: ${assetCode}, Supply: ${totalSupply}, Hash: ${result.hash}`
      );

      return {
        assetCode,
        assetIssuer: issuerWallet.stellarPublicKey,
        transactionHash: result.hash,
        totalSupply,
      };
    } catch (error) {
      logger.error("Error creating and issuing property token:", error);
      throw error;
    }
  }

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

  async getWalletDetails(publicKey: string) {
    try {
      const account = await this.server.loadAccount(publicKey);
      const balances = await this.getAccountBalance(publicKey);

      return {
        account,
        signers: account.signers,
        thresholds: account.thresholds,
        balances,
      };
    } catch (error) {
      logger.error("Error getting wallet details:", error);
      throw error;
    }
  }

  async getAccountBalance(publicKey: string) {
    try {
      const account = await this.server.loadAccount(publicKey);
      return account.balances.map((balance: any) => ({
        asset_code: balance.asset_code || "XLM",
        balance: balance.balance,
        asset_issuer: balance.asset_issuer,
      }));
    } catch (error) {
      logger.error("Error getting account balance:", error);
      throw error;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const stellarService = new StellarService();
