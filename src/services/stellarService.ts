/* eslint-disable @typescript-eslint/no-explicit-any */

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

interface UserWalletParams {
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

interface TokenPurchaseParams {
  userWalletPublicKey: string;
  propertyWalletPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  paymentAmount: string;
}

interface TokenSaleParams {
  userWalletPublicKey: string;
  propertyWalletPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  proceedsAmount: string;
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
  // TOKEN PURCHASE/SALE OPERATIONS
  // ===========================================

  /**
   * Execute token purchase transaction
   */
  async executeTokenPurchase(params: TokenPurchaseParams): Promise<string> {
    try {
      const { userWalletPublicKey, propertyWalletPublicKey, assetCode, assetIssuer, amount, paymentAmount } = params;

      // Validate inputs
      if (!userWalletPublicKey || !propertyWalletPublicKey || !assetCode || !amount || !paymentAmount) {
        throw new Error("All parameters are required for token purchase");
      }

      const asset = new Asset(assetCode, assetIssuer);
      const ngnAsset = new Asset('NGN', this.platformKeypair.publicKey()); // Assuming NGN is issued by platform

      // Load property distribution wallet
      const propertyAccount = await this.server.loadAccount(propertyWalletPublicKey);

      // Get platform signer for property wallet
      const propertyWallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: propertyWalletPublicKey },
        include: [{ 
          model: MultiSigSigner, 
          as: 'signers',
          where: { role: 'platform_distribution', status: 'active' }
        }]
      });

      if (!propertyWallet) {
        throw new Error("Property wallet not found");
      }

      // Create transaction: Send tokens to user, receive NGN payment
      const transaction = new TransactionBuilder(propertyAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Send property tokens to user
        .addOperation(
          Operation.payment({
            destination: userWalletPublicKey,
            asset: asset,
            amount: amount,
          })
        )
        // Receive NGN payment from user (this would be in a separate transaction in practice)
        .addOperation(
          Operation.payment({
            destination: propertyWalletPublicKey,
            asset: ngnAsset,
            amount: paymentAmount,
            source: userWalletPublicKey,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform key (property distribution signer)
      transaction.sign(this.platformKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      logger.info(`Token purchase executed: ${amount} ${assetCode} to ${userWalletPublicKey}`);
      return result.hash;

    } catch (error) {
      logger.error("Error executing token purchase:", error);
      throw new Error(
        `Failed to execute token purchase: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Execute token sale transaction
   */
  async executeTokenSale(params: TokenSaleParams): Promise<string> {
    try {
      const { userWalletPublicKey, propertyWalletPublicKey, assetCode, assetIssuer, amount, proceedsAmount } = params;

      const asset = new Asset(assetCode, assetIssuer);
      const ngnAsset = new Asset('NGN', this.platformKeypair.publicKey());

      // Load user account
      const userAccount = await this.server.loadAccount(userWalletPublicKey);

      // Get user's signer (this would require user's signature in practice)
      const userWallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: userWalletPublicKey },
        include: [{ 
          model: MultiSigSigner, 
          as: 'signers',
          where: { role: 'user', status: 'active' }
        }]
      });

      if (!userWallet || !userWallet.signers?.[0]) {
        throw new Error("User wallet or signer not found");
      }

      // In practice, you'd need the user's signature or use recovery key
      // For this example, we'll use the recovery key if available
      let signerKeypair: Keypair;
      
      const recoverySigner = await MultiSigSigner.findOne({
        where: { 
          multiSigWalletId: userWallet.id,
          role: 'platform_recovery',
          status: 'active'
        }
      });

      if (recoverySigner) {
        signerKeypair = this.recoveryKeypair;
      } else {
        throw new Error("No valid signer available for transaction");
      }

      // Create transaction: Send tokens from user to property wallet, receive NGN
      const transaction = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Send property tokens from user to property wallet
        .addOperation(
          Operation.payment({
            destination: propertyWalletPublicKey,
            asset: asset,
            amount: amount,
          })
        )
        // Receive NGN proceeds from property wallet
        .addOperation(
          Operation.payment({
            destination: userWalletPublicKey,
            asset: ngnAsset,
            amount: proceedsAmount,
            source: propertyWalletPublicKey,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with available signer
      transaction.sign(signerKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      logger.info(`Token sale executed: ${amount} ${assetCode} from ${userWalletPublicKey}`);
      return result.hash;

    } catch (error) {
      logger.error("Error executing token sale:", error);
      throw new Error(
        `Failed to execute token sale: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ===========================================
  // MULTISIG TRANSACTION OPERATIONS
  // ===========================================

  /**
   * Create and propose a multisig transaction
   */
  async proposeMultiSigTransaction(params: {
    walletPublicKey: string;
    operations: any[];
    description: string;
    category: string;
    proposedBy: string;
  }): Promise<string> {
    try {
      const { walletPublicKey, operations, description, category, proposedBy } = params;

      // Load wallet account
      const account = await this.server.loadAccount(walletPublicKey);

      // Build transaction
      const transactionBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      });

      // Add operations
      operations.forEach(op => {
        transactionBuilder.addOperation(op);
      });

      const transaction = transactionBuilder.setTimeout(180).build();

      // Get wallet info to determine required signatures
      const wallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: walletPublicKey },
        include: [{ model: MultiSigSigner, as: 'signers', where: { status: 'active' } }]
      });

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Store transaction XDR for signing
      const transactionXDR = transaction.toXDR();

      return transactionXDR;

    } catch (error) {
      logger.error("Error proposing multisig transaction:", error);
      throw error;
    }
  }

  /**
   * Sign a multisig transaction
   */
  async signMultiSigTransaction(params: {
    transactionXDR: string;
    signerSecretKey: string;
  }): Promise<string> {
    try {
      const { transactionXDR, signerSecretKey } = params;

      // Recreate transaction from XDR
      const transaction = TransactionBuilder.fromXDR(transactionXDR, this.network);

      // Sign transaction
      const signerKeypair = Keypair.fromSecret(signerSecretKey);
      transaction.sign(signerKeypair);

      // Return signed XDR
      return transaction.toXDR();

    } catch (error) {
      logger.error("Error signing multisig transaction:", error);
      throw error;
    }
  }

  /**
   * Execute a fully signed multisig transaction
   */
  async executeMultiSigTransaction(signedTransactionXDR: string): Promise<string> {
    try {
      // Recreate transaction from signed XDR
      const transaction = TransactionBuilder.fromXDR(signedTransactionXDR, this.network);

      // Submit to Stellar network
      const result = await this.server.submitTransaction(transaction);

      logger.info(`Multisig transaction executed: ${result.hash}`);
      return result.hash;

    } catch (error) {
      logger.error("Error executing multisig transaction:", error);
      throw error;
    }
  }
  // ===========================================
  // USER  WALLET CREATION (SEP-30 Compliant)
  // ===========================================

  /**
   * Create a 1-of-2 multisig wallet for user
   * User OR Platform can sign transactions
   */
  async createUserMultiSigWallet(params: UserWalletParams) {
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
        await this.fundWalletFromTreasury(walletKeypair.publicKey(), "2");
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
              weight: 2,
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
      logger.error("Error creating user wallet:", error);
      throw new Error(
        `Failed to create user  wallet: ${
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

      // Create asset code (max 12 characters for custom assets)
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
