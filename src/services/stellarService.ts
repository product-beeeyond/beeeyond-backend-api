/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Horizon,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import logger from "../utils/logger";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigSigner, {
  MultiSigSignerAttributes,
} from "../models/MultiSigSigner";
import { Op } from "sequelize";
import {
  STELLAR_NETWORK,
  STELLAR_HORIZON_URL,
  MULTISIG_CONFIG,
  STELLAR_RESERVES,
} from "../config";
import { sequelize } from "../config/database";
import { secureWalletService } from "./secureWalletService";
import EncryptedSecret from "../models/EncryptedSecret";
import Property from "../models/Property";

// Reserve calculation constants
// const BASE_RESERVE = 0.5; // XLM per account
// const ENTRY_RESERVE = 0.5; // XLM per entry (signer, trustline, offer, data)

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
  propertyManagerPublicKey?: string;
  createdBy: string;
}

interface TokenPurchaseParams {
  userWalletPublicKey: string;
  propertyWalletPublicKey: string;
  platformWalletPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  tokenAmount: string;
  buyAmount: string;
  platformFee: string;
}
interface CreatorPaymentParams {
  propertyWalletPublicKey: string;
  creatorWalletPublicKey: string;
  platformWalletPublicKey: string;
  creatorAmount: string;
  platformFee: string;
}

interface PropertyLiquidationParams {
  managerWallet: MultiSigWallet;
  propertyWalletPublicKey: string;
  saleAmount: string;
}
interface TokenSaleParams {
  userWalletPublicKey: string;
  propertyWalletPublicKey: string;
  platformWalletPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  proceedsAmount: string;
  platformFee: string;
}
class StellarService {
  private server: Horizon.Server;
  private network: string;
  // private platformKeypair: Keypair;
  // private recoveryKeypair: Keypair;
  // private treasuryKeypair: Keypair;
  private _platformKeypairs: Map<string, Keypair> = new Map();

  // private async getPlatformKeypair(
  //   keyType: "platform" | "recovery" | "treasury"
  // ): Promise<Keypair> {
  //   if (!this._platformKeypairs.has(keyType)) {
  //     // const secretType = `${keyType}_primary`;
  //     const secret = await secureWalletService.retrieveWalletSecret(
  //       "platform",
  //       keyType
  //     );
  //     const keypair = Keypair.fromSecret(secret);
  //     this._platformKeypairs.set(keyType, keypair);
  //   }
  //   return this._platformKeypairs.get(keyType)!;
  // }
  private async getPlatformKeypair(
    keyType: "platform" | "treasury"
  ): Promise<Keypair> {
    if (!this._platformKeypairs.has(keyType)) {
      // const secretType = `${keyType}_primary`;
      const secret = await secureWalletService.retrieveWalletSecret(
        keyType,
        keyType
      );
      const keypair = Keypair.fromSecret(secret);
      this._platformKeypairs.set(keyType, keypair);
    }
    return this._platformKeypairs.get(keyType)!;
  }
  /**
   * Get or generate batched platform recovery key (1000 wallets per batch)
   * This method manages recovery keys in batches to balance security and operational complexity
   */
  private async getBatchedRecoveryKey(): Promise<{
    keypair: Keypair;
    publicKey: () => string;
    secret: () => string;
    batchId: string;
  }> {
    try {
      const totalUserWallets = await MultiSigWallet.count({
        where: {
          walletType: "user",
          status: "active",
        },
      });

      const currentBatch = Math.floor(totalUserWallets / 1000);
      const batchId = `recovery_batch_${currentBatch}`;

      // Find existing batch wallet using createdTxHash
      let batchWallet = await MultiSigWallet.findOne({
        where: {
          walletType: "platform_recovery_batch",
          status: "active",
          createdTxHash: batchId, // Use createdTxHash to store batch identifier
        },
      });

      // Create batch wallet if it doesn't exist
      if (!batchWallet) {
        // Generate a temporary keypair just for the public key
        const tempKeypair = Keypair.random();

        batchWallet = await MultiSigWallet.create({
          stellarPublicKey: tempKeypair.publicKey(), // Placeholder, will be updated
          walletType: "platform_recovery_batch",
          status: "active",
          lowThreshold: 0,
          mediumThreshold: 0,
          highThreshold: 0,
          masterWeight: 0,
          createdTxHash: batchId, // Store batch identifier here
          metadata: {
            description: `Platform recovery key batch for wallets ${
              currentBatch * 1000
            } to ${(currentBatch + 1) * 1000 - 1}`,
            createdAt: new Date().toISOString(),
            phase: "recovery_batch",
          },
        });

        logger.info(
          `Created batch wallet record ${batchId} with ID ${batchWallet.id}`
        );
      }

      // Try to retrieve existing keypair using the wallet's UUID
      try {
        const existingKeypair = await secureWalletService.retrieveWalletSecret(
          batchWallet.id,
          "platform_recovery_batch"
        );

        if (existingKeypair) {
          const keypair = Keypair.fromSecret(existingKeypair);
          logger.info(
            `Using existing recovery batch ${currentBatch} for wallet ${
              totalUserWallets + 1
            }`
          );
          return {
            keypair,
            publicKey: () => keypair.publicKey(),
            secret: () => keypair.secret(),
            batchId,
          };
        }
      } catch (error) {
        logger.info(
          `Recovery batch ${currentBatch} not found, creating new batch key`
        );
      }

      // Generate new recovery key for this batch
      const newBatchKeypair = Keypair.random();

      // Update the wallet with the actual public key
      await batchWallet.update({
        stellarPublicKey: newBatchKeypair.publicKey(),
      });

      // Store using the wallet's UUID
      await secureWalletService.storeWalletSecret(
        batchWallet.id,
        "platform_recovery_batch",
        newBatchKeypair.secret(),
        {
          publicKey: newBatchKeypair.publicKey(),
          role: "platform_recovery_batch",
          batchNumber: String(currentBatch),
          batchSize: String(1000),
          batchIdentifier: batchId,
          createdAt: new Date().toISOString(),
          description: `Platform recovery key for wallets ${
            currentBatch * 1000
          } to ${(currentBatch + 1) * 1000 - 1}`,
        }
      );

      logger.info(
        `Created new recovery keypair batch ${currentBatch} for wallets ${
          currentBatch * 1000
        }-${(currentBatch + 1) * 1000 - 1}`
      );

      return {
        keypair: newBatchKeypair,
        publicKey: () => newBatchKeypair.publicKey(),
        secret: () => newBatchKeypair.secret(),
        batchId,
      };
    } catch (error) {
      logger.error("Error managing batched recovery key:", error);
      throw new Error(
        `Failed to get/create batched recovery key: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  constructor() {
    this.validateEnvironmentVariables();
    this.network =
      STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new Horizon.Server(STELLAR_HORIZON_URL!);

    // try {
    //   // (await this.getPlatformKeypair('platform')) = Keypair.fromSecret(STELLAR_PLATFORM_SECRET!);
    //   // (await this.getPlatformKeypair('recovery')) = Keypair.fromSecret(STELLAR_RECOVERY_SECRET!);
    //   // (await this.getPlatformKeypair('treasury')) = Keypair.fromSecret(STELLAR_TREASURY_SECRET!);
    // } catch (error) {
    //   logger.error("Invalid Stellar keypairs in environment variables:", error);
    //   throw new Error("Invalid Stellar keypairs configuration");
    // }
  }

  private validateEnvironmentVariables(): void {
    const requiredEnvVars = [
      "STELLAR_NETWORK",
      "STELLAR_HORIZON_URL",
      // "STELLAR_PLATFORM_SECRET",
      // "STELLAR_RECOVERY_SECRET",
      // "STELLAR_TREASURY_SECRET",
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
  // RESERVE CALCULATION UTILITIES
  // ===========================================

  /**
   * Calculate minimum balance required for an account based on entries
   */
  private calculateMinimumBalance(params: {
    additionalSigners: number;
    trustlines: number;
    offers?: number;
    dataEntries?: number;
  }): string {
    const {
      additionalSigners,
      trustlines,
      offers = 0,
      dataEntries = 0,
    } = params;

    const totalEntries = additionalSigners + trustlines + offers + dataEntries;
    const minimumBalance =
      STELLAR_RESERVES.BASE_RESERVE +
      totalEntries * STELLAR_RESERVES.ENTRY_RESERVE;

    // Add 10% buffer for safety
    const bufferedBalance = minimumBalance * 1.1;

    logger.info(
      `Calculated minimum balance: ${bufferedBalance} XLM (base: ${STELLAR_RESERVES.BASE_RESERVE}, entries: ${totalEntries})`
    );

    return bufferedBalance.toFixed(7);
  }

  /**
   * Get current base reserve from network
   */
  private async getNetworkReserves(): Promise<{
    baseReserve: number;
    entryReserve: number;
  }> {
    try {
      // Get network info from Horizon
      const ledgerInfo = await this.server
        .ledgers()
        .order("desc")
        .limit(1)
        .call();
      const latestLedger = ledgerInfo.records[0];

      return {
        baseReserve: latestLedger.base_reserve_in_stroops,
        entryReserve: latestLedger.base_reserve_in_stroops, // On Stellar, entry reserve = base reserve
      };
    } catch (error) {
      logger.warn("Failed to get network reserves, using defaults:", error);
      return {
        baseReserve: STELLAR_RESERVES.BASE_RESERVE,
        entryReserve: STELLAR_RESERVES.ENTRY_RESERVE,
      };
    }
  }

  /**
   * Check if account has sufficient balance for new entries
   */
  private async validateAccountReserves(
    publicKey: string,
    newEntries: number = 0
  ): Promise<boolean> {
    try {
      const account = await this.server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );

      if (!xlmBalance) {
        return false;
      }

      const currentBalance = parseFloat(xlmBalance.balance);
      const currentEntries =
        account.signers.length - 1 + account.balances.length - 1; // Subtract master key and XLM balance
      const requiredBalance =
        STELLAR_RESERVES.BASE_RESERVE +
        (currentEntries + newEntries) * STELLAR_RESERVES.ENTRY_RESERVE;

      logger.info(
        `Account ${publicKey}: Balance ${currentBalance} XLM, Required: ${requiredBalance} XLM`
      );

      return currentBalance >= requiredBalance;
    } catch (error) {
      logger.error("Error validating account reserves:", error);
      return false;
    }
  }

  // ===========================================
  // FEE BUMP WRAPPER UTILITY
  // ===========================================

  /**
   * Wraps any transaction in a fee bump sponsored by platform treasury
   */
  private async wrapWithFeeBump(
    innerTransaction: any,
    feeSource?: Keypair
  ): Promise<FeeBumpTransaction> {
    try {
      const feeSourceKeypair =
        feeSource || (await this.getPlatformKeypair("treasury"));

      // Load fee source account
      const feeSourceAccount = await this.server.loadAccount(
        feeSourceKeypair.publicKey()
      );

      // Create fee bump transaction with higher fee
      const feeBumpTransaction = TransactionBuilder.buildFeeBumpTransaction(
        feeSourceKeypair,
        String(parseInt(BASE_FEE) * MULTISIG_CONFIG.FEE_BUMP.FEE_MULTIPLIER), // Use 2x base fee to ensure inclusion
        innerTransaction,
        this.network
      );

      // Sign fee bump with treasury account
      feeBumpTransaction.sign(feeSourceKeypair);

      logger.info(
        `Transaction wrapped with fee bump by ${feeSourceKeypair.publicKey()}`
      );

      return feeBumpTransaction;
    } catch (error) {
      logger.error("Error wrapping transaction with fee bump:", error);
      throw new Error(
        `Failed to wrap transaction with fee bump: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Submits a transaction with automatic fee bump wrapping
   */
  private async submitTransactionWithFeeBump(
    transaction: any,
    originalSigner?: Keypair
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    try {
      // First, try to submit the original transaction
      try {
        const result = await this.server.submitTransaction(transaction);
        logger.info("Transaction submitted successfully without fee bump");
        return result;
      } catch (error: any) {
        // If transaction fails due to insufficient fee, wrap with fee bump
        if (
          error?.response?.data?.extras?.result_codes?.transaction ===
          "tx_insufficient_fee"
        ) {
          logger.info(
            "Transaction failed due to insufficient fee, wrapping with fee bump"
          );

          const feeBumpTransaction = await this.wrapWithFeeBump(transaction);
          const result = await this.server.submitTransaction(
            feeBumpTransaction
          );
          logger.info("Fee bump transaction submitted successfully");
          return result;
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error("Error submitting transaction with fee bump:", error);
      throw error;
    }
  }

  // ===========================================
  // ENHANCED WALLET CREATION WITH PROPER RESERVES
  // ===========================================
  /**
   * Get recovery keypair for a specific wallet (helper for recovery operations)
   */
  async getRecoveryKeypairForWallet(walletPublicKey: string): Promise<Keypair> {
    try {
      // Find the wallet and its recovery signer
      const wallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: walletPublicKey },
      });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // const recoverySignerSecretId = wallet.signers[0].encryptedSecretId;
      // if (!recoverySignerSecretId) {
      //   throw new Error("Recovery signer secret ID not found");
      // }

      // Retrieve the recovery keypair
      const secret = await secureWalletService.retrieveWalletSecret(
        wallet.id,
        "platform_recovery_batch"
      );

      return Keypair.fromSecret(secret);
    } catch (error) {
      logger.error("Error getting recovery keypair for wallet:", error);
      throw error;
    }
  }

  /**
   * Get statistics about recovery key batches
   */
  async getRecoveryBatchStats(): Promise<{
    totalBatches: number;
    currentBatch: number;
    walletsInCurrentBatch: number;
    walletsUntilNextBatch: number;
  }> {
    try {
      const totalUserWallets = await MultiSigWallet.count({
        where: {
          walletType: "user",
          status: "active",
        },
      });

      const currentBatch = Math.floor(totalUserWallets / 1000);
      const walletsInCurrentBatch = totalUserWallets % 1000;
      const walletsUntilNextBatch = 1000 - walletsInCurrentBatch;
      const totalBatches = currentBatch + 1;

      return {
        totalBatches,
        currentBatch,
        walletsInCurrentBatch: walletsInCurrentBatch || 1000, // If exactly 1000, show 1000 not 0
        walletsUntilNextBatch:
          walletsUntilNextBatch === 1000 ? 0 : walletsUntilNextBatch,
      };
    } catch (error) {
      logger.error("Error getting recovery batch stats:", error);
      throw error;
    }
  }
  /**
   * Create a 2-of-3 multisig wallet for user
   */
  async createUserMultiSigWallet(params: UserWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const { userId, userEmail, userName } = params;

      // Generate new keypair for user
      const userKeypair = Keypair.random();
      const walletKeypair = Keypair.random();

      // Calculate required balance for user wallet
      // Base + 3 additional signers (user + 2 platform keys)
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 3,
        trustlines: 0, // Will add trustlines later as needed
      });

      // Fund account with proper reserves
      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        // Check if friendbot provided enough, if not, fund additional
        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          const additionalFunding = (
            parseFloat(requiredBalance) -
            currentBalance +
            1
          ).toFixed(7);
          await this.fundWalletFromTreasury(
            walletKeypair.publicKey(),
            additionalFunding
          );
        }
      } else {
        await this.fundWalletFromTreasury(
          walletKeypair.publicKey(),
          requiredBalance
        );
      }

      // Load the account
      const account = await this.server.loadAccount(walletKeypair.publicKey());

      // Get or generate batched platform recovery key (1000 wallets per batch)
      const batchRecoveryInfo = await this.getBatchedRecoveryKey();
      const currentBatchRecoveryKey = batchRecoveryInfo.keypair;

      // Create multisig transaction with 2-of-3 setup
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Add user as primary signer (weight 2)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: userKeypair.publicKey(),
              weight: 2, // User can make payments alone
            },
          })
        )
        // Add platform primary key as signer (weight 1)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: (
                await this.getPlatformKeypair("platform")
              ).publicKey(),
              weight: 1, // Platform key 1
            },
          })
        )
        // Add platform recovery key as second platform signer (weight 1)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: currentBatchRecoveryKey.publicKey(),
              weight: 1, // Platform key 2
            },
          })
        )
        // Set thresholds for 2-of-3 control
        .addOperation(
          Operation.setOptions({
            lowThreshold: 2, // User alone (weight 2) can make payments
            medThreshold: 2, // User alone OR two platform keys (1+1=2) for account changes
            highThreshold: 2, // User alone OR two platform keys for critical operations
            masterWeight: 0, // Disable master key
          })
        )
        .setTimeout(180)
        .build();

      // Sign with master key (this disables it due to masterWeight: 0)
      transaction.sign(walletKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        walletKeypair
      );

      // Store wallet in database
      multiSigWallet = await MultiSigWallet.create({
        userId,
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "user",
        lowThreshold: 2,
        mediumThreshold: 2,
        highThreshold: 2,
        masterWeight: 0,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          userEmail,
          userName,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
        },
      });

      const userSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "user",
        userKeypair.secret(),
        {
          publicKey: userKeypair.publicKey(),
          role: "user",
          walletType: "user",
          userId: userId,
          userEmail: userEmail,
        }
      );
      createdSecrets.push(userSecretId);

      // Store platform primary key in KMS
      const platformSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_primary",
        (await this.getPlatformKeypair("platform")).secret(),
        {
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          role: "platform_primary",
          walletType: "user",
        }
      );
      createdSecrets.push(platformSecretId);

      // Store batched platform recovery key reference for this user wallet
      const platformRecoverySecretId =
        await secureWalletService.storeWalletSecret(
          multiSigWallet.id,
          "platform_recovery_batch",
          currentBatchRecoveryKey.secret(),
          {
            publicKey: currentBatchRecoveryKey.publicKey(),
            role: "platform_recovery",
            walletType: "user",
            batchId: batchRecoveryInfo.batchId,
          }
        );
      createdSecrets.push(platformRecoverySecretId);

      // Store signers
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          userId: userId,
          publicKey: userKeypair.publicKey(),
          weight: 2, // User can make payments alone
          role: "user",
          status: "active",
          encryptedSecretId: userSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          encryptedSecretId: platformSecretId,
          weight: 1, // Platform key 1
          role: "platform_primary",
          status: "active",
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: currentBatchRecoveryKey.publicKey(),
          encryptedSecretId: platformRecoverySecretId,
          weight: 1, // Platform key 2
          role: "platform_recovery",
          status: "active",
        }),
      ]);

      logger.info(
        `User wallet created: ${walletKeypair.publicKey()} for user ${userId} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        userKeypair: {
          publicKey: userKeypair.publicKey(),
          secretKey: userKeypair.secret(),
        },
        canRecover: true,
        thresholds: {
          low: 2,
          medium: 2,
          high: 2,
        },
      };
    } catch (error) {
      logger.error("Error creating user wallet:", error);

      // Clean up created records if wallet creation failed
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          if (createdSecrets.length > 0) {
            await EncryptedSecret.destroy({
              where: { id: { [Op.in]: createdSecrets } },
            });
          }

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed user wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error("Error during user wallet cleanup:", cleanupError);
        }
      }

      throw new Error(
        `Failed to create user wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  // ===========================================
  // PHASE 1: INITIAL TREASURY WALLET CREATION
  // ===========================================

  /**
   * Phase 1: Create platform treasury wallet and store in DB with "awaiting_funding" status
   * This phase creates the wallet structure without multisig setup to avoid circular dependency
   */
  async createPlatformTreasuryWallet(params: PlatformWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const walletKeypair = Keypair.random();
      const platformKey1 = Keypair.random();
      const platformKey2 = Keypair.random();
      const platformKey3 = Keypair.random();

      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 3,
        trustlines: 0,
      });

      let fundingRequired = false;

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          await this.server.friendbot(walletKeypair.publicKey()).call();
          await this.sleep(2000);
        }
      } else {
        fundingRequired = true;
        logger.warn(
          `Treasury wallet ${walletKeypair.publicKey()} requires at least ${requiredBalance} XLM funding before finalization.`
        );
      }

      // Create DB record without any secret keys
      multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_treasury",
        lowThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PLATFORM_TREASURY.MASTER_WEIGHT,
        status: fundingRequired ? "awaiting_funding" : "awaiting_finalization",
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
          phase: "initial_creation",
        },
      });

      // Store encrypted secrets using KMS
      const secrets = [
        {
          secret: platformKey1.secret(),
          secretType: "platform_primary",
          publicKey: platformKey1.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.PRIMARY_WEIGHT,
        },
        {
          secret: platformKey2.secret(),
          secretType: "platform_secondary",
          publicKey: platformKey2.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.SECONDARY_WEIGHT,
        },
        {
          secret: platformKey3.secret(),
          secretType: "platform_tertiary",
          publicKey: platformKey3.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.RECOVERY_WEIGHT,
        },
        {
          secret: walletKeypair.secret(),
          secretType: "master_key",
          publicKey: walletKeypair.publicKey(),
          weight: 0,
        },
      ];

      // Store encrypted secrets and create signer records
      for (const secretInfo of secrets) {
        const secretId = await secureWalletService.storeWalletSecret(
          multiSigWallet.id,
          secretInfo.secretType,
          secretInfo.secret,
          {
            publicKey: secretInfo.publicKey,
            role: secretInfo.secretType,
            walletType: "platform_treasury",
          }
        );

        createdSecrets.push(secretId);

        // Create signer record (no secrets here)
        if (secretInfo.secretType !== "master_key") {
          await MultiSigSigner.create({
            multiSigWalletId: multiSigWallet.id,
            publicKey: secretInfo.publicKey,
            weight: secretInfo.weight,
            role: secretInfo.secretType as MultiSigSignerAttributes["role"],
            status: "pending",
            encryptedSecretId: secretId, // Reference to encrypted secret
          });
        } else {
          // Store master secret reference in wallet
          await multiSigWallet.update({
            masterSecretId: secretId,
          });
        }
      }

      logger.info(
        `Platform treasury wallet created (Phase 1): ${walletKeypair.publicKey()}`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        requiredBalance,
        fundingRequired,
        status: multiSigWallet.status,
        nextSteps: fundingRequired
          ? `Fund wallet with ${requiredBalance} XLM then call finalizeTreasuryWalletSetup()`
          : "Call finalizeTreasuryWalletSetup() to complete multisig setup",
      };
    } catch (error) {
      logger.error("Error creating platform treasury wallet (Phase 1):", error);

      // Clean up created records
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          await EncryptedSecret.destroy({
            where: { id: { [Op.in]: createdSecrets } },
          });

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed treasury wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error("Error during cleanup:", cleanupError);
        }
      }

      throw error;
    }
  }

  // ===========================================
  // PHASE 2: FINALIZE MULTISIG SETUP
  // ===========================================

  /**
   * Phase 2: Finalize treasury wallet setup with multisig configuration
   * Called after wallet has been manually funded (on mainnet) or automatically funded (testnet)
   */
  async finalizeTreasuryWalletSetup(publicKey: string) {
    try {
      // Find wallet in DB
      const wallet = await MultiSigWallet.findOne({
        where: {
          stellarPublicKey: publicKey,
          walletType: "platform_treasury",
          status: ["awaiting_funding", "awaiting_finalization", "inactive"],
        },
        include: [
          {
            model: MultiSigSigner,
            as: "signers",
            where: { status: "pending" },
          },
        ],
      });

      if (!wallet) {
        throw new Error("Treasury wallet not found or already finalized");
      }

      // Verify wallet is funded
      const account = await this.server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );
      const currentBalance = parseFloat(xlmBalance?.balance || "0");
      const requiredBalance = parseFloat(
        wallet.metadata?.initialBalance || "0"
      );

      if (currentBalance < requiredBalance) {
        throw new Error(
          `Insufficient balance. Current: ${currentBalance} XLM, Required: ${requiredBalance} XLM`
        );
      }

      // Get master keypair from secure storage
      const walletKeypair = await secureWalletService.getKeypairFromStorage(
        wallet.id,
        "master_key"
      );
      console.log("walletKeypair--------:  ", walletKeypair);
      // Get signer public keys from signers
      const signers = wallet.signers || [];
      console.log("signers-------:  ", signers);

      const primarySigner = signers.find((s) => s.role === "platform_primary");
      const secondarySigner = signers.find(
        (s) => s.role === "platform_secondary"
      );
      const tertiarySigner = signers.find(
        (s) => s.role === "platform_tertiary"
      );

      if (!secondarySigner || !tertiarySigner || !primarySigner) {
        throw new Error("Required signers not found in database");
      }

      // Build multisig setup transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: primarySigner.publicKey,
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.PRIMARY_WEIGHT,
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: secondarySigner.publicKey,
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.SECONDARY_WEIGHT,
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: tertiarySigner.publicKey,
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.RECOVERY_WEIGHT,
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD,
            medThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD,
            highThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD,
            masterWeight: MULTISIG_CONFIG.PLATFORM_TREASURY.MASTER_WEIGHT,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with master keypair
      transaction.sign(walletKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      // Update DB records to active status
      await Promise.all([
        wallet.update({
          status: "active",
          createdTxHash: result.hash,
          metadata: {
            ...wallet.metadata,
            finalizedAt: new Date().toISOString(),
            phase: "completed",
          },
        }),
        // Update all signers to active
        MultiSigSigner.update(
          { status: "active" },
          {
            where: {
              multiSigWalletId: wallet.id,
              status: "pending",
            },
          }
        ),
      ]);

      // Remove master key secret after successful setup (master weight is now 0)
      await EncryptedSecret.destroy({
        where: {
          walletId: wallet.id,
          secretType: "master_key",
        },
      });

      logger.info(
        `Treasury wallet ${publicKey} finalized with multisig setup. TxHash: ${result.hash}`
      );

      return {
        success: true,
        transactionHash: result.hash,
        status: "active",
        multisigConfig: {
          lowThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD,
          mediumThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD,
          highThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD,
          masterWeight: MULTISIG_CONFIG.PLATFORM_TREASURY.MASTER_WEIGHT,
        },
        signers: signers.map((s) => ({
          publicKey: s.publicKey,
          role: s.role,
          weight: s.weight,
        })),
      };
    } catch (error: any) {
      logger.error("Error finalizing treasury wallet setup:", error);

      // Update status to failed for debugging
      await MultiSigWallet.update(
        {
          status: "inactive",
          metadata: sequelize.literal(
            `metadata || '{"finalizationError": "${
              error.message
            }", "failedAt": "${new Date().toISOString()}"}'`
          ),
        },
        { where: { stellarPublicKey: publicKey } }
      );

      throw error;
    }
  }

  // ===========================================
  // HELPER METHOD: CHECK FUNDING STATUS
  // ===========================================

  /**
   * Helper method to check if a treasury wallet is ready for finalization
   */
  async checkTreasuryFundingStatus(publicKey: string) {
    try {
      const wallet = await MultiSigWallet.findOne({
        where: {
          stellarPublicKey: publicKey,
          walletType: "platform_treasury",
        },
      });

      if (!wallet) {
        throw new Error("Treasury wallet not found");
      }

      const account = await this.server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );
      const currentBalance = parseFloat(xlmBalance?.balance || "0");
      const requiredBalance = parseFloat(
        wallet.metadata?.initialBalance || "0"
      );

      return {
        publicKey,
        status: wallet.status,
        currentBalance,
        requiredBalance,
        isSufficientlyFunded: currentBalance >= requiredBalance,
        readyForFinalization:
          wallet.status === "awaiting_funding" &&
          currentBalance >= requiredBalance,
      };
    } catch (error) {
      logger.error("Error checking treasury funding status:", error);
      throw error;
    }
  }
  /**
   * Create platform asset issuer wallet (1-of-2 for operational efficiency) with fee bump sponsorship
   */
  async createPlatformIssuerWallet(params: PlatformWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const walletKeypair = Keypair.random();
      const backupKey = Keypair.random();

      // Calculate required balance: Base + 2 signers + expected trustlines
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 2,
        trustlines: 5, // Multiple assets for issuing operations
      });

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          const additionalFunding = (
            parseFloat(requiredBalance) -
            currentBalance +
            1
          ).toFixed(7);
          await this.fundWalletFromTreasury(
            walletKeypair.publicKey(),
            additionalFunding
          );
        }
      } else {
        await this.fundWalletFromTreasury(
          walletKeypair.publicKey(),
          requiredBalance
        );
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
              ed25519PublicKey: (
                await this.getPlatformKeypair("platform")
              ).publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_ISSUER.PRIMARY_WEIGHT, // 2
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: backupKey.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_ISSUER.BACKUP_WEIGHT, // 1
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.LOW_THRESHOLD, // 1  1-of-2 for routine issuance
            medThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.MEDIUM_THRESHOLD, // 2  2-of-2 for account changes
            highThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.HIGH_THRESHOLD, // 2  2-of-2 for auth flags
            masterWeight: MULTISIG_CONFIG.PLATFORM_ISSUER.MASTER_WEIGHT, // 0
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(walletKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        walletKeypair
      );

      // Create wallet record
      multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_issuer",
        lowThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PLATFORM_ISSUER.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform primary key in KMS
      const platformSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_primary",
        (await this.getPlatformKeypair("platform")).secret(),
        {
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          role: "platform_issuer",
          walletType: "platform_issuer",
        }
      );
      createdSecrets.push(platformSecretId);

      // Store backup key in KMS
      const backupSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "issuer_backup",
        backupKey.secret(),
        {
          publicKey: backupKey.publicKey(),
          role: "issuer_backup",
          walletType: "platform_issuer",
        }
      );
      createdSecrets.push(backupSecretId);

      // Create signer records
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_ISSUER.PRIMARY_WEIGHT, // 2
          role: "platform_issuer",
          status: "active",
          encryptedSecretId: platformSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: backupKey.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_ISSUER.BACKUP_WEIGHT, // 1
          role: "issuer_backup",
          status: "active",
          encryptedSecretId: backupSecretId,
        }),
      ]);

      logger.info(
        `Platform issuer wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
            role: "platform_issuer",
          },
          { publicKey: backupKey.publicKey(), role: "issuer_backup" },
        ],
        thresholds: {
          low: MULTISIG_CONFIG.PLATFORM_ISSUER.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.PLATFORM_ISSUER.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.PLATFORM_ISSUER.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating platform issuer wallet:", error);

      // Clean up created records if wallet creation failed
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          if (createdSecrets.length > 0) {
            await EncryptedSecret.destroy({
              where: { id: { [Op.in]: createdSecrets } },
            });
          }

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed platform issuer wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error(
            "Error during platform issuer wallet cleanup:",
            cleanupError
          );
        }
      }

      throw new Error(
        `Failed to create platform issuer wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  /**
   * Create platform primary wallet (1-of-2 for operational efficiency) with fee bump sponsorship
   */
  async createPlatformPrimaryWallet(params: PlatformWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const walletKeypair = Keypair.random();
      const backupKey = Keypair.random();
      const backupKey2 = Keypair.random();

      // Calculate required balance: Base + 2 signers + expected trustlines
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 2,
        trustlines: 5, // Multiple assets for issuing operations
      });

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          const additionalFunding = (
            parseFloat(requiredBalance) -
            currentBalance +
            1
          ).toFixed(7);
          await this.fundWalletFromTreasury(
            walletKeypair.publicKey(),
            additionalFunding
          );
        }
      } else {
        await this.fundWalletFromTreasury(
          walletKeypair.publicKey(),
          requiredBalance
        );
      }

      const account = await this.server.loadAccount(walletKeypair.publicKey());

      // 1-of-2 can make payment, 2-of-2 needed for account changes
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: backupKey.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_PRIMARY.BACKUP1_WEIGHT, // 2
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: backupKey2.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_PRIMARY.BACKUP2_WEIGHT, // 2
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.LOW_THRESHOLD, // 1 - 1-of-2 for routine issuance
            medThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.MEDIUM_THRESHOLD, // 2 - 2-of-2 for account changes
            highThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.HIGH_THRESHOLD, // 2 - 2-of-2 for auth flags
            masterWeight: MULTISIG_CONFIG.PLATFORM_PRIMARY.MASTER_WEIGHT, // 0
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(walletKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        walletKeypair
      );

      // Create wallet record
      multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_primary",
        lowThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PLATFORM_PRIMARY.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PLATFORM_PRIMARY.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform primary key in KMS
      const platformSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform",
        walletKeypair.secret(),
        {
          publicKey: walletKeypair.publicKey(),
          role: "platform_primary",
          walletType: "platform",
        }
      );
      createdSecrets.push(platformSecretId);

      // Store backup key in KMS
      const backupSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_backup",
        backupKey.secret(),
        {
          publicKey: backupKey.publicKey(),
          role: "platform_backup",
          walletType: "platform_primary",
        }
      );
      createdSecrets.push(backupSecretId);
      // Store backup key in KMS
      const backupSecretId2 = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_backup_2",
        backupKey2.secret(),
        {
          publicKey: backupKey2.publicKey(),
          role: "platform_backup2",
          walletType: "platform_primary",
        }
      );
      createdSecrets.push(backupSecretId);
      // Create signer records
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: backupKey.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_PRIMARY.BACKUP1_WEIGHT, // 2
          role: "platform_backup",
          status: "active",
          encryptedSecretId: backupSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: backupKey2.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_PRIMARY.BACKUP2_WEIGHT, // 1
          role: "platform_backup_2",
          status: "active",
          encryptedSecretId: backupSecretId2,
        }),
      ]);

      logger.info(
        `Platform primary wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: backupKey.publicKey(),
            role: "platform_backup",
          },
          { publicKey: backupKey2.publicKey(), role: "platform_backup_2" },
        ],
        thresholds: {
          low: MULTISIG_CONFIG.PLATFORM_PRIMARY.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.PLATFORM_PRIMARY.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.PLATFORM_PRIMARY.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating platform primary wallet:", error);

      // Clean up created records if wallet creation failed
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          if (createdSecrets.length > 0) {
            await EncryptedSecret.destroy({
              where: { id: { [Op.in]: createdSecrets } },
            });
          }

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed platform primary wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error(
            "Error during platform primary wallet cleanup:",
            cleanupError
          );
        }
      }

      throw new Error(
        `Failed to create platform primary wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Add trustline to an account with proper reserve checking
   */
  async addTrustline(params: {
    accountPublicKey: string;
    assetCode: string;
    assetIssuer: string;
    signerKeypair?: Keypair;
    limit?: string;
  }): Promise<string> {
    try {
      const { accountPublicKey, assetCode, assetIssuer, signerKeypair, limit } =
        params;

      // Check if account has sufficient reserves for new trustline
      const hasReserves = await this.validateAccountReserves(
        accountPublicKey,
        1
      );
      if (!hasReserves) {
        // Fund additional reserve if needed
        const additionalFunding = (
          STELLAR_RESERVES.ENTRY_RESERVE * 1.1
        ).toFixed(7); // 10% buffer
        await this.fundWalletFromTreasury(accountPublicKey, additionalFunding);
        logger.info(
          `Added ${additionalFunding} XLM to ${accountPublicKey} for trustline reserve`
        );
      }

      const account = await this.server.loadAccount(accountPublicKey);
      const asset = new Asset(assetCode, assetIssuer);

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.changeTrust({
            asset,
            limit,
          })
        )
        .setTimeout(180)
        .build();

      if (signerKeypair) {
        transaction.sign(signerKeypair);
      }

      const result = await this.submitTransactionWithFeeBump(
        transaction,
        signerKeypair
      );

      logger.info(
        `Trustline added: ${assetCode} from ${assetIssuer} to ${accountPublicKey}`
      );
      return result.hash;
    } catch (error) {
      logger.error("Error adding trustline:", error);
      throw error;
    }
  }

  /**
   * Enhanced property wallet creation with trustline reserves
   */
  private async createPropertyDistributionWallet(params: PropertyWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const walletKeypair = Keypair.random();
      // Get property manager keypair from database
      if (!params.propertyManagerPublicKey) {
        throw new Error("propertyManagerPublicKey is required");
      }
      // Find the property manager's wallet in the database
      const propertyManagerWallet = await MultiSigWallet.findOne({
        where: {
          stellarPublicKey: params.propertyManagerPublicKey,
          status: "active",
        },
      });
      if (!propertyManagerWallet) {
        throw new Error("Property manager wallet not found");
      }

      const propertyManagerKey =
        await secureWalletService.getKeypairFromStorage(
          propertyManagerWallet.id,
          "user"
        );

      // Calculate reserves: Base + signers + expected trustlines
      const additionalSigners = 2;
      const expectedTrustlines = 2; // Property token + NGN

      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners,
        trustlines: expectedTrustlines,
      });

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        // Ensure sufficient balance
        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          const additionalFunding = (
            parseFloat(requiredBalance) -
            currentBalance +
            1
          ).toFixed(7);
          await this.fundWalletFromTreasury(
            walletKeypair.publicKey(),
            additionalFunding
          );
        }
      } else {
        await this.fundWalletFromTreasury(
          walletKeypair.publicKey(),
          requiredBalance
        );
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
            ed25519PublicKey: (
              await this.getPlatformKeypair("platform")
            ).publicKey(),
            weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PLATFORM_WEIGHT, // 2
          },
        })
      );

      // Add property manager
      transactionBuilder.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: propertyManagerKey.publicKey(),
            weight:
              MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PROPERTY_MANAGER_WEIGHT, // 1
          },
        })
      );

      // Set thresholds
      transactionBuilder.addOperation(
        Operation.setOptions({
          lowThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.LOW_THRESHOLD, // 1 - either platform or property manager
          medThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MEDIUM_THRESHOLD, // 2 - both required for account changes
          highThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.HIGH_THRESHOLD, // 2 - both required for critical ops
          masterWeight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MASTER_WEIGHT, // 0
        })
      );

      const transaction = transactionBuilder.setTimeout(180).build();
      transaction.sign(walletKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        walletKeypair
      );

      // Create wallet record
      multiSigWallet = await MultiSigWallet.create({
        propertyId: params.propertyId,
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "property_distribution",
        lowThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          propertyTitle: params.propertyTitle,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          purpose: "Holds property tokens for distribution to investors",
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform primary key in KMS
      const platformSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_primary",
        (await this.getPlatformKeypair("platform")).secret(),
        {
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          role: "platform_distribution",
          walletType: "property_distribution",
          propertyId: params.propertyId,
        }
      );
      createdSecrets.push(platformSecretId);

      // Store property manager key in KMS
      const propertyManagerSecretId =
        await secureWalletService.storeWalletSecret(
          multiSigWallet.id,
          "property_manager",
          propertyManagerKey.secret(),
          {
            publicKey: propertyManagerKey.publicKey(),
            role: "property_manager",
            walletType: "property_distribution",
            propertyId: params.propertyId,
            propertyTitle: params.propertyTitle,
          }
        );
      createdSecrets.push(propertyManagerSecretId);

      // Store signers
      const signerPromises = [
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PLATFORM_WEIGHT, // 2
          role: "property_distribution",
          status: "active",
          encryptedSecretId: platformSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: propertyManagerKey.publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PROPERTY_MANAGER_WEIGHT, // 1
          role: "property_manager",
          status: "active",
          encryptedSecretId: propertyManagerSecretId,
        }),
      ];

      await Promise.all(signerPromises);

      logger.info(
        `Property distribution wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
            role: "property_distribution",
          },
          {
            publicKey: propertyManagerKey.publicKey(),
            role: "property_manager",
          },
        ],
        thresholds: {
          low: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating property distribution wallet:", error);

      // Clean up created records if wallet creation failed
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          if (createdSecrets.length > 0) {
            await EncryptedSecret.destroy({
              where: { id: { [Op.in]: createdSecrets } },
            });
          }

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed property distribution wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error(
            "Error during property distribution wallet cleanup:",
            cleanupError
          );
        }
      }

      throw new Error(
        `Failed to create property distribution wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  /**
   * Create property governance wallet with proper reserves
   */
  private async createPropertyGovernanceWallet(params: PropertyWalletParams) {
    let multiSigWallet: any = null;
    const createdSecrets: string[] = [];

    try {
      const walletKeypair = Keypair.random();
      const governanceKey = Keypair.random();
      const governanceKey2 = Keypair.random(); // Second governance key instead of recovery

      // Calculate reserves: Base + 3 signers + potential trustlines
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 3,
        trustlines: 1,
      });

      if (STELLAR_NETWORK === "testnet") {
        await this.server.friendbot(walletKeypair.publicKey()).call();
        await this.sleep(2000);

        const account = await this.server.loadAccount(
          walletKeypair.publicKey()
        );
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const currentBalance = parseFloat(xlmBalance?.balance || "0");

        if (currentBalance < parseFloat(requiredBalance)) {
          const additionalFunding = (
            parseFloat(requiredBalance) -
            currentBalance +
            1
          ).toFixed(7);
          await this.fundWalletFromTreasury(
            walletKeypair.publicKey(),
            additionalFunding
          );
        }
      } else {
        await this.fundWalletFromTreasury(
          walletKeypair.publicKey(),
          requiredBalance
        );
      }

      const account = await this.server.loadAccount(walletKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: (
                await this.getPlatformKeypair("platform")
              ).publicKey(),
              weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.PLATFORM_WEIGHT, // 1
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: governanceKey.publicKey(),
              weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.GOVERNANCE_WEIGHT, // 1
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: governanceKey2.publicKey(),
              weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.RECOVERY_WEIGHT, // 1 (reusing config weight)
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.LOW_THRESHOLD, // 2, 2-of-3 for routine decisions
            medThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MEDIUM_THRESHOLD, // 2, 2-of-3 for governance changes
            highThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.HIGH_THRESHOLD, // 3, 3-of-3 for critical decisions
            masterWeight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MASTER_WEIGHT, // 0
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(walletKeypair);
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        walletKeypair
      );

      // Create wallet record
      multiSigWallet = await MultiSigWallet.create({
        propertyId: params.propertyId,
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "property_governance",
        lowThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          propertyTitle: params.propertyTitle,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          purpose: "Property governance and major decision making",
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform primary key in KMS
      const platformSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "platform_primary",
        (await this.getPlatformKeypair("platform")).secret(),
        {
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          role: "platform_governance",
          walletType: "property_governance",
          propertyId: params.propertyId,
        }
      );
      createdSecrets.push(platformSecretId);

      // Store governance key in KMS
      const governanceSecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "governance_primary",
        governanceKey.secret(),
        {
          publicKey: governanceKey.publicKey(),
          role: "governance_key",
          walletType: "property_governance",
          propertyId: params.propertyId,
          propertyTitle: params.propertyTitle,
        }
      );
      createdSecrets.push(governanceSecretId);

      // Store second governance key in KMS
      const governance2SecretId = await secureWalletService.storeWalletSecret(
        multiSigWallet.id,
        "governance_secondary",
        governanceKey2.secret(),
        {
          publicKey: governanceKey2.publicKey(),
          role: "governance_key_2",
          walletType: "property_governance",
          propertyId: params.propertyId,
          propertyTitle: params.propertyTitle,
        }
      );
      createdSecrets.push(governance2SecretId);

      // Create signer records
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.PLATFORM_WEIGHT, // 1
          role: "property_governance",
          status: "active",
          encryptedSecretId: platformSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: governanceKey.publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.GOVERNANCE_WEIGHT, // 1
          role: "property_governance",
          status: "active",
          encryptedSecretId: governanceSecretId,
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: governanceKey2.publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.RECOVERY_WEIGHT, // 1
          role: "property_governance",
          status: "active",
          encryptedSecretId: governance2SecretId,
        }),
      ]);

      logger.info(
        `Property governance wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: (await this.getPlatformKeypair("platform")).publicKey(),
            role: "platform_governance",
          },
          { publicKey: governanceKey.publicKey(), role: "governance_key" },
          { publicKey: governanceKey2.publicKey(), role: "governance_key_2" },
        ],
        thresholds: {
          low: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating property governance wallet:", error);

      // Clean up created records if wallet creation failed
      if (multiSigWallet?.id) {
        try {
          // Delete signers
          await MultiSigSigner.destroy({
            where: { multiSigWalletId: multiSigWallet.id },
          });

          // Delete encrypted secrets
          if (createdSecrets.length > 0) {
            await EncryptedSecret.destroy({
              where: { id: { [Op.in]: createdSecrets } },
            });
          }

          // Delete wallet record
          await multiSigWallet.destroy();

          logger.info(
            `Cleaned up failed property governance wallet creation: ${multiSigWallet.id}`
          );
        } catch (cleanupError) {
          logger.error(
            "Error during property governance wallet cleanup:",
            cleanupError
          );
        }
      }

      throw new Error(
        `Failed to create property governance wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  /**
   * Fund wallet from platform treasury with fee bump sponsorship
   */
  async fundWalletFromTreasury(destinationPublicKey: string, amount: string) {
    try {
      // Load treasury account
      const treasuryAccount = await this.server.loadAccount(
        (await this.getPlatformKeypair("treasury")).publicKey()
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
      transaction.sign(await this.getPlatformKeypair("treasury"));

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        await this.getPlatformKeypair("treasury")
      );

      logger.info(`Wallet funded: ${destinationPublicKey} with ${amount} XLM`);
      return result.hash;
    } catch (error) {
      logger.error("Error funding wallet from treasury:", error);
      throw error;
    }
  }

  // ===========================================
  // MULTISIG TRANSACTION OPERATIONS
  // ===========================================

  /**
   * Create and propose a multisig transaction with fee bump support
   */
  async proposeMultiSigTransaction(params: {
    walletPublicKey: string;
    operations: any[];
    description: string;
    category: string;
    proposedBy: string;
  }): Promise<string> {
    try {
      const { walletPublicKey, operations, description, category, proposedBy } =
        params;

      // Load wallet account
      const account = await this.server.loadAccount(walletPublicKey);

      // Build transaction
      const transactionBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      });

      // Add operations
      operations.forEach((op) => {
        transactionBuilder.addOperation(op);
      });

      const transaction = transactionBuilder.setTimeout(180).build();

      // Get wallet info to determine required signatures
      const wallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: walletPublicKey },
        include: [
          { model: MultiSigSigner, as: "signers", where: { status: "active" } },
        ],
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
      const transaction = TransactionBuilder.fromXDR(
        transactionXDR,
        this.network
      );

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
   * Execute a fully signed multisig transaction with fee bump sponsorship
   */
  async executeMultiSigTransaction(
    signedTransactionXDR: string
  ): Promise<string> {
    try {
      // Recreate transaction from signed XDR
      const transaction = TransactionBuilder.fromXDR(
        signedTransactionXDR,
        this.network
      );

      // Submit to Stellar network with automatic fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(transaction);

      logger.info(`Multisig transaction executed: ${result.hash}`);
      return result.hash;
    } catch (error) {
      logger.error("Error executing multisig transaction:", error);
      throw error;
    }
  }
  // ===========================================
  // WALLET RECOVERY OPERATIONS
  // ===========================================

  /**
   * Perform wallet recovery using platform recovery key with fee bump sponsorship
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
        include: [{ model: MultiSigSigner, as: "signers" }],
      });
      if (!wallet || !wallet.signers) {
        throw new Error("User signers not found");
      }
      // const userSigner = wallet.signers.find((s) => s.role === "user");
      // const platformSigner = wallet.signers.find(
      //   (s) => s.role === "platform_primary"
      // );
      // const recoverySigner = wallet.signers.find(
      //   (s) => s.role === "platform_recovery"
      // );
      // if (!recoverySigner) {
      //   throw new Error("recoverySigner not found");
      // }
      const recoveryKeypair = await this.getRecoveryKeypairForWallet(
        walletPublicKey
      );
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
              weight: 2,
            },
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform recovery key
      transaction.sign(recoveryKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        recoveryKeypair
      );

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
  // TOKEN OPERATIONS
  // ===========================================

  /**
   * Create property token and issue to distribution wallet with fee bump sponsorship
   */
  async createAndIssuePropertyToken(params: {
    propertyId: string;
    totalSupply: number;
    distributionWalletPublicKey: string;
  }) {
    const transaction = await sequelize.transaction();

    try {
      const { propertyId, totalSupply, distributionWalletPublicKey } = params;
      await Property.findOne({ transaction, lock: transaction.LOCK.UPDATE });

      const propertyCount = await Property.count({
        transaction,
      });
      const nextNumber = propertyCount + 1;
      const assetCode = `BRKL${String(nextNumber).padStart(5, "0")}`; //
      // Create asset code (max 12 characters for custom assets)
      // const assetCode = `BRIKL${propertyId.substring(0, 8).toUpperCase()}`;

      // Get platform issuer wallet
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer" },
        transaction,
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
      await Property.update(
        { stellarAssetCode: assetCode },
        {
          where: { id: propertyId },
          transaction,
        }
      );

      await transaction.commit();
      // Ensure distribution wallet has trustline for the new asset
      await this.ensureTrustlines(distributionWalletPublicKey, [
        { assetCode, assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Load issuer account
      const issuerAccount = await this.server.loadAccount(
        issuerWallet.stellarPublicKey
      );

      // Create transaction to mint tokens
      const mintTransaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
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
      mintTransaction.sign(await this.getPlatformKeypair("platform"));

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        mintTransaction,
        await this.getPlatformKeypair("platform")
      );

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

  /**
   * Issue bNGN tokens on demand to a destination wallet
   */
  async issueBNGN(params: {
    destinationPublicKey: string;
    amount: string;
    issuedBy: string;
  }): Promise<{
    transactionHash: string;
    issuerPublicKey: string;
    amount: string;
  }> {
    try {
      const { destinationPublicKey, amount, issuedBy } = params;

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount: must be a positive number");
      }
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer", status: "active" },
      });

      if (!issuerWallet) {
        throw new Error("Platform issuer wallet not found or not active");
      }
      const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

      // Ensure destination wallet has trustline for bNGN
      await this.ensureTrustlines(destinationPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);
      console.log("got here xx---------------------------------------");
      const issuerAccount = await this.server.loadAccount(
        issuerWallet.stellarPublicKey
      );

      const transaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.payment({
            destination: destinationPublicKey,
            asset: bNGNAsset,
            amount: parsedAmount.toFixed(7),
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(await this.getPlatformKeypair("platform"));

      const result = await this.submitTransactionWithFeeBump(
        transaction,
        await this.getPlatformKeypair("platform")
      );

      logger.info(
        `bNGN issued: ${parsedAmount.toFixed(
          7
        )} bNGN to ${destinationPublicKey}, Hash: ${
          result.hash
        }, Issued by: ${issuedBy}`
      );

      return {
        transactionHash: result.hash,
        issuerPublicKey: issuerWallet.stellarPublicKey,
        amount: parsedAmount.toFixed(7),
      };
    } catch (error: any) {
      logger.error("Error issuing bNGN:", error?.data);
      throw new Error(
        `Failed to issue bNGN: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  // ===========================================
  // REVENUE DISTRIBUTION
  // ===========================================

  /**
   * Create revenue distribution to token holders with fee bump sponsorship
   */
  async createRevenueDistribution(params: {
    propertyId: string;
    totalRevenue: number;
    distributionData: Array<{
      userId: string;
      publicKey: string;
      tokenBalance: number;
      percentage: number;
    }>;
    platformFeePercentage: number;
  }): Promise<string> {
    try {
      const {
        propertyId,
        totalRevenue,
        distributionData,
        platformFeePercentage,
      } = params;

      // Get property governance wallet for revenue distribution
      const governanceWallet = await MultiSigWallet.findOne({
        where: {
          propertyId,
          walletType: "property_governance",
          status: "active",
        },
        include: [
          { model: MultiSigSigner, as: "signers", where: { status: "active" } },
        ],
      });

      if (!governanceWallet) {
        throw new Error("Property governance wallet not found");
      }

      // Calculate platform fee and net distribution
      const platformFee = totalRevenue * (platformFeePercentage / 100);
      const netDistribution = totalRevenue - platformFee;

      // Ensure governance wallet has NGN trustline
      await this.ensureTrustlines(governanceWallet.stellarPublicKey, [
        {
          assetCode: "NGN",
          assetIssuer: (await this.getPlatformKeypair("platform")).publicKey(),
        },
      ]);

      // Load governance account
      const governanceAccount = await this.server.loadAccount(
        governanceWallet.stellarPublicKey
      );

      // Build distribution transaction
      const transactionBuilder = new TransactionBuilder(governanceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      });

      const ngnAsset = new Asset(
        "NGN",
        (await this.getPlatformKeypair("platform")).publicKey()
      );

      // Add payment operations for each token holder
      distributionData.forEach((holder) => {
        const userShare = netDistribution * (holder.percentage / 100);
        if (userShare > 0) {
          transactionBuilder.addOperation(
            Operation.payment({
              destination: holder.publicKey,
              asset: ngnAsset,
              amount: userShare.toFixed(2),
            })
          );
        }
      });

      // Send platform fee to fee collection wallet
      const feeWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_fee_collection", status: "active" },
      });

      if (feeWallet && platformFee > 0) {
        transactionBuilder.addOperation(
          Operation.payment({
            destination: feeWallet.stellarPublicKey,
            asset: ngnAsset,
            amount: platformFee.toFixed(2),
          })
        );
      }

      const transaction = transactionBuilder.setTimeout(180).build();

      // Sign with platform governance key
      transaction.sign(await this.getPlatformKeypair("platform"));

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        await this.getPlatformKeypair("platform")
      );

      logger.info(
        `Revenue distribution executed for property ${propertyId}: ${result.hash}`
      );
      return result.hash;
    } catch (error) {
      logger.error("Error creating revenue distribution:", error);
      throw error;
    }
  }
  async estimateNetworkFee(operationCount: number): Promise<number> {
    try {
      // Base fee is typically 100 stroops per operation
      // 1 XLM = 10,000,000 stroops
      const baseFeeStroops = 100;
      const totalStroops = baseFeeStroops * operationCount;
      // Add buffer for fee bump (typically 10x base fee for guaranteed inclusion)
      const feeBumpMultiplier = 10;
      const estimatedStroops = totalStroops * feeBumpMultiplier;
      const xlmFee = estimatedStroops / 10000000;

      // Convert XLM to bNGN at approximate rate
      // This is a placeholder calculation(todo: integrate exchange rate from an exchange)
      const xlmToBngnRate = 483; // Example: 1 XLM = 1500 bNGN
      const bngnFee = xlmFee * xlmToBngnRate;

      return parseFloat(bngnFee.toFixed(2));
    } catch (error) {
      logger.error("Error estimating network fee:", error);
      return 0.05; // Small default fee in bNGN
    }
  }
  /**
   * Execute token purchase with fee distribution
   * - Sends platform fee (3%) to platform primary account
   * - Sends buy amount to distribution wallet
   * - Sends property tokens to user wallet
   * - Network fees paid by fee bump
   */
  async executeTokenPurchase(params: TokenPurchaseParams): Promise<string> {
    try {
      const {
        userWalletPublicKey,
        propertyWalletPublicKey,
        platformWalletPublicKey,
        assetCode,
        assetIssuer,
        tokenAmount,
        buyAmount,
        platformFee,
      } = params;

      // Validate all required parameters
      if (
        !userWalletPublicKey ||
        !propertyWalletPublicKey ||
        !platformWalletPublicKey ||
        !assetCode ||
        !assetIssuer ||
        !tokenAmount ||
        !buyAmount ||
        !platformFee
      ) {
        throw new Error("All parameters are required for token purchase");
      }

      // Get issuer wallet to determine bNGN issuer
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer", status: "active" },
      });

      if (!issuerWallet) {
        throw new Error("Platform issuer wallet not found");
      }

      const propertyAsset = new Asset(assetCode, assetIssuer);
      const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

      // Ensure user has trustline for property token
      await this.ensureTrustlines(userWalletPublicKey, [
        { assetCode, assetIssuer },
      ]);

      // Ensure property wallet has trustline for bNGN
      await this.ensureTrustlines(propertyWalletPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Ensure platform wallet has trustline for bNGN
      await this.ensureTrustlines(platformWalletPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Get user wallet to retrieve user signer
      const userWallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: userWalletPublicKey, status: "active" },
      });

      if (!userWallet) {
        throw new Error("User wallet not found");
      }

      // Get user's signer keypair
      const userSignerKeypair = await secureWalletService.getKeypairFromStorage(
        userWallet.id,
        "user"
      );

      // Load user account (source account for the transaction)
      const userAccount = await this.server.loadAccount(userWalletPublicKey);

      // Build transaction from user's account
      const transaction = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Operation 1: User sends platform fee (3%) to platform primary account
        .addOperation(
          Operation.payment({
            destination: platformWalletPublicKey,
            asset: bNGNAsset,
            amount: platformFee,
          })
        )
        // Operation 2: User sends buy amount to property distribution wallet
        .addOperation(
          Operation.payment({
            destination: propertyWalletPublicKey,
            asset: bNGNAsset,
            amount: buyAmount,
          })
        )
        // Operation 3: Property wallet sends property tokens to user
        .addOperation(
          Operation.payment({
            destination: userWalletPublicKey,
            asset: propertyAsset,
            amount: tokenAmount,
            source: propertyWalletPublicKey,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with user's key (for bNGN payments)
      transaction.sign(userSignerKeypair);

      // Sign with platform key (for property token payment from property wallet)
      transaction.sign(await this.getPlatformKeypair("platform"));

      // Submit transaction with fee bump sponsorship
      // Network fees are paid by the fee bump sponsor
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        userSignerKeypair
      );

      logger.info(
        `Token purchase executed: ${tokenAmount} ${assetCode} to ${userWalletPublicKey}, ` +
          `${buyAmount} bNGN to ${propertyWalletPublicKey}, ` +
          `${platformFee} bNGN fee to ${platformWalletPublicKey}, ` +
          `Hash: ${result.hash}`
      );

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

  async executeCreatorPayment(params: CreatorPaymentParams): Promise<string> {
    try {
      const {
        propertyWalletPublicKey,
        creatorWalletPublicKey,
        platformWalletPublicKey,
        creatorAmount,
        platformFee,
      } = params;

      if (
        !propertyWalletPublicKey ||
        !creatorWalletPublicKey ||
        !platformWalletPublicKey ||
        !creatorAmount ||
        !platformFee
      ) {
        throw new Error("All parameters are required for creator payment");
      }

      // Get issuer wallet for bNGN
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer", status: "active" },
      });

      if (!issuerWallet) {
        throw new Error("Platform issuer wallet not found");
      }

      const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

      // Ensure creator has trustline for bNGN
      await this.ensureTrustlines(creatorWalletPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Ensure platform wallet has trustline for bNGN
      await this.ensureTrustlines(platformWalletPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Load property distribution account
      const propertyAccount = await this.server.loadAccount(
        propertyWalletPublicKey
      );

      // Build transaction from property wallet
      const transaction = new TransactionBuilder(propertyAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Send bNGN to creator
        .addOperation(
          Operation.payment({
            destination: creatorWalletPublicKey,
            asset: bNGNAsset,
            amount: creatorAmount,
          })
        )
        // Send platform fee to platform wallet
        .addOperation(
          Operation.payment({
            destination: platformWalletPublicKey,
            asset: bNGNAsset,
            amount: platformFee,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform key
      transaction.sign(await this.getPlatformKeypair("platform"));

      // Submit transaction with fee bump
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        await this.getPlatformKeypair("platform")
      );

      logger.info(
        `Creator payment executed: ${creatorAmount} bNGN to creator, ${platformFee} bNGN to platform. Hash: ${result.hash}`
      );

      return result.hash;
    } catch (error) {
      logger.error("Error executing creator payment:", error);
      throw new Error(
        `Failed to execute creator payment: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async executePropertyLiquidation(
    params: PropertyLiquidationParams
  ): Promise<string> {
    try {
      const { managerWallet, propertyWalletPublicKey, saleAmount } = params;

      if (!managerWallet || !propertyWalletPublicKey || !saleAmount) {
        throw new Error("All parameters are required for property liquidation");
      }

      // Get issuer wallet for bNGN
      const issuerWallet = await MultiSigWallet.findOne({
        where: { walletType: "platform_issuer", status: "active" },
      });

      if (!issuerWallet) {
        throw new Error("Platform issuer wallet not found");
      }

      const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

      // Ensure property wallet has trustline for bNGN
      await this.ensureTrustlines(propertyWalletPublicKey, [
        { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Get manager wallet to retrieve manager's signer
      // const managerWallet = await MultiSigWallet.findOne({
      //   where: { stellarPublicKey: managerWalletPublicKey, status: "active" },
      // });

      if (!managerWallet) {
        throw new Error("Property manager's wallet not found");
      }

      // Get manager's signer keypair
      const managerSignerKeypair =
        await secureWalletService.getKeypairFromStorage(
          managerWallet.id,
          "user"
        );

      // Load buyer account
      const managerAccount = await this.server.loadAccount(
        managerWallet.stellarPublicKey
      );

      // Build transaction from buyer's account
      const transaction = new TransactionBuilder(managerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Send bNGN from manager to property distribution wallet
        .addOperation(
          Operation.payment({
            destination: propertyWalletPublicKey,
            asset: bNGNAsset,
            amount: saleAmount,
          })
        )
        .setTimeout(180)
        .build();

      // Sign with buyer's key
      transaction.sign(managerSignerKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        managerSignerKeypair
      );

      logger.info(
        `Property liquidation executed: ${saleAmount} bNGN from ${managerWallet.stellarPublicKey} to ${propertyWalletPublicKey}. Hash: ${result.hash}`
      );

      return result.hash;
    } catch (error) {
      logger.error("Error executing property liquidation:", error);
      throw new Error(
        `Failed to execute property liquidation: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  /**
   * Token sale
   */
  async executeTokenSale(params: TokenSaleParams): Promise<string> {
    try {
      const {
        userWalletPublicKey,
        propertyWalletPublicKey,
        platformWalletPublicKey,
        assetCode,
        assetIssuer,
        amount,
        proceedsAmount,
        platformFee,
      } = params;
   if (
      !userWalletPublicKey ||
      !propertyWalletPublicKey ||
      !platformWalletPublicKey ||
      !assetCode ||
      !assetIssuer ||
      !amount ||
      !proceedsAmount ||
      !platformFee
    ) {
      throw new Error("All parameters are required for token redemption");
    }

    // Get issuer wallet to determine bNGN issuer
    const issuerWallet = await MultiSigWallet.findOne({
      where: { walletType: "platform_issuer", status: "active" },
    });

    if (!issuerWallet) {
      throw new Error("Platform issuer wallet not found");
    }

    const propertyAsset = new Asset(assetCode, assetIssuer);
    const bNGNAsset = new Asset("bNGN", issuerWallet.stellarPublicKey);

    // Ensure user wallet has trustline for bNGN
    await this.ensureTrustlines(userWalletPublicKey, [
      { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
    ]);

    // Ensure platform wallet has trustline for bNGN
    await this.ensureTrustlines(platformWalletPublicKey, [
      { assetCode: "bNGN", assetIssuer: issuerWallet.stellarPublicKey },
    ]);

    // Get user wallet to retrieve user signer
    const userWallet = await MultiSigWallet.findOne({
      where: { stellarPublicKey: userWalletPublicKey, status: "active" },
    });

    if (!userWallet) {
      throw new Error("User wallet not found");
    }

    // Get user's signer keypair
    const signerKeypair = await secureWalletService.getKeypairFromStorage(
      userWallet.id,
      "user"
    );

    const userAccount = await this.server.loadAccount(userWalletPublicKey);

    const transaction = new TransactionBuilder(userAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      // 1. User sends property tokens to issuer (burns them)
      .addOperation(
        Operation.payment({
          destination: assetIssuer, // Send to issuer = burn
          asset: propertyAsset,
          amount: amount,
        })
      )
      // 2. Property distribution wallet sends net bNGN to user
      .addOperation(
        Operation.payment({
          destination: userWalletPublicKey,
          asset: bNGNAsset,
          amount: proceedsAmount,
          source: propertyWalletPublicKey,
        })
      )
      // 3. Property distribution wallet sends platform fee to platform wallet
      .addOperation(
        Operation.payment({
          destination: platformWalletPublicKey,
          asset: bNGNAsset,
          amount: platformFee,
          source: propertyWalletPublicKey,
        })
      )
      .setTimeout(180)
      .build();

    // Sign with user key (for token burn)
    transaction.sign(signerKeypair);
    
    // Sign with platform key (for bNGN payments from property wallet)
    transaction.sign(await this.getPlatformKeypair("platform"));

    const result = await this.submitTransactionWithFeeBump(
      transaction,
      signerKeypair
    );

    logger.info(
      `Token redemption executed: ${amount} ${assetCode} burned from ${userWalletPublicKey}, ${proceedsAmount} bNGN paid to user, ${platformFee} bNGN platform fee. Hash: ${result.hash}`
    );

    return result.hash;
  } catch (error) {
    logger.error("Error executing token redemption:", error);
    throw new Error(
      `Failed to execute token redemption: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  }

  /**
   * Ensure account has required trustlines, adding them if needed
   */
  private async ensureTrustlines(
    accountPublicKey: string,
    assets: Array<{ assetCode: string; assetIssuer: string }>
  ): Promise<void> {
    try {
      const account = await this.server.loadAccount(accountPublicKey);
      const existingTrustlines = account.balances
        .filter((b) => b.asset_type !== "native")
        .filter((b) => b.asset_type !== "liquidity_pool_shares") // Filter out liquidity pools
        .map((b) => {
          // Type guard to ensure we have asset_code and asset_issuer
          if ("asset_code" in b && "asset_issuer" in b) {
            return `${b.asset_code}:${b.asset_issuer}`;
          }
          return null;
        })
        .filter((trustline): trustline is string => trustline !== null); // Remove null values

      const neededTrustlines = assets.filter(
        (asset) =>
          !existingTrustlines.includes(
            `${asset.assetCode}:${asset.assetIssuer}`
          )
      );

      if (neededTrustlines.length === 0) {
        return; // All trustlines already exist
      }

      // Check if account has sufficient reserves for new trustlines
      const hasReserves = await this.validateAccountReserves(
        accountPublicKey,
        neededTrustlines.length
      );
      if (!hasReserves) {
        const additionalFunding = (
          STELLAR_RESERVES.ENTRY_RESERVE *
          neededTrustlines.length *
          1.1
        ).toFixed(7);
        await this.fundWalletFromTreasury(accountPublicKey, additionalFunding);
        logger.info(
          `Added ${additionalFunding} XLM to ${accountPublicKey} for ${neededTrustlines.length} trustlines`
        );
      }

      // Get signer for the account
      const wallet = await MultiSigWallet.findOne({
        where: { stellarPublicKey: accountPublicKey },
      });

      let signerKeypair: Keypair | null = null;
      if (wallet && wallet.walletType === "user") {
        const userSecret = await secureWalletService.retrieveWalletSecret(
          wallet.id,
          "user"
        );
        signerKeypair = Keypair.fromSecret(userSecret);
      } else if (wallet && wallet.walletType === "platform_primary") {
        const platformSecret = await secureWalletService.retrieveWalletSecret(
          wallet.id,
          "platform_backup"
        );
        signerKeypair = Keypair.fromSecret(platformSecret);
      } else if (wallet) {
        // Try to get platform recovery signer first
        const recoverySigner = await MultiSigSigner.findOne({
          where: {
            multiSigWalletId: wallet.id,
            role: "platform_recovery",
            status: "active",
          },
        });
        if (recoverySigner) {
          signerKeypair = await this.getRecoveryKeypairForWallet(
            accountPublicKey
          );
        } else {
          // Try other platform signers
          const platformSigner = await MultiSigSigner.findOne({
            where: {
              multiSigWalletId: wallet.id,
              role: {
                [Op.in]: [
                  "property_distribution",
                  "platform_issuer",
                  "platform_primary",
                ],
              },
              status: "active",
            },
          });

          if (platformSigner) {
            signerKeypair = await this.getPlatformKeypair("platform");
          }
        }
      }

      if (!signerKeypair) {
        throw new Error(
          `No valid signer found for account ${accountPublicKey}`
        );
      }

      // Add trustlines in batches to avoid transaction size limits
      const batchSize = 10; // Stellar allows up to ~100 operations per transaction

      for (let i = 0; i < neededTrustlines.length; i += batchSize) {
        const batch = neededTrustlines.slice(i, i + batchSize);

        const updatedAccount = await this.server.loadAccount(accountPublicKey);
        const transactionBuilder = new TransactionBuilder(updatedAccount, {
          fee: BASE_FEE,
          networkPassphrase: this.network,
        });

        batch.forEach((asset) => {
          transactionBuilder.addOperation(
            Operation.changeTrust({
              asset: new Asset(asset.assetCode, asset.assetIssuer),
            })
          );
        });

        const transaction = transactionBuilder.setTimeout(180).build();
        transaction.sign(signerKeypair);

        const result = await this.submitTransactionWithFeeBump(
          transaction,
          signerKeypair
        );
        logger.info(
          `Added ${batch.length} trustlines to ${accountPublicKey}: ${result.hash}`
        );
      }
    } catch (error) {
      logger.error("Error ensuring trustlines:", error);
      throw error;
    }
  }

  /**
   * Create property-specific wallets with proper reserves
   */
  async createPropertyWallets(params: PropertyWalletParams) {
    try {
      const { propertyId, propertyTitle } = params;

      const distributionResult = await this.createPropertyDistributionWallet(
        params
      );

      let governanceResult = null;
      try {
        governanceResult = await this.createPropertyGovernanceWallet(params);
      } catch (error) {
        logger.warn(
          `Governance wallet creation failed for property ${propertyId}:`,
          error
        );
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

  /**
   * Get signer keypair from encrypted storage
   */
  // async getSignerKeypair(
  //   walletId: string,
  //   role: string
  // ): Promise<Keypair | null> {
  //   try {
  //     const signer = await MultiSigSigner.findOne({
  //       where: {
  //         multiSigWalletId: walletId,
  //         role,
  //         status: "active",
  //         encryptedPrivateKey: { [Op.not]: "" },
  //       },
  //     });

  //     if (!signer || !signer.encryptedPrivateKey) {
  //       return null;
  //     }

  //     const decryptionKey = `${role}_${walletId}`;
  //     const privateKey = decrypt(signer.encryptedPrivateKey, decryptionKey);

  //     return Keypair.fromSecret(privateKey);
  //   } catch (error) {
  //     logger.error(`Error getting signer keypair for role ${role}:`, error);
  //     return null;
  //   }
  // }

  /**
   * Create time-locked recovery transaction
   */
  async createRecoveryTransaction(params: {
    walletPublicKey: string;
    oldUserPublicKey: string;
    newUserPublicKey: string;
    recoveryRequestId: string;
  }): Promise<{ recoveryKeypair: Keypair; transaction: any; xdr: string }> {
    try {
      const account = await this.server.loadAccount(params.walletPublicKey);
      const recoveryKeypair = await this.getRecoveryKeypairForWallet(
        params.walletPublicKey
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Remove old user signer
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: params.oldUserPublicKey,
              weight: 0, // Setting weight to 0 removes the signer
            },
          })
        )
        // Add new user signer
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: params.newUserPublicKey,
              weight: 2,
            },
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform recovery key
      transaction.sign(recoveryKeypair);

      logger.info(
        `Recovery transaction created for request: ${params.recoveryRequestId}`
      );

      return {
        recoveryKeypair,
        transaction,
        xdr: transaction.toXDR(),
      };
    } catch (error) {
      logger.error("Error creating recovery transaction:", error);
      throw error;
    }
  }

  /**
   * Execute recovery transaction with retry logic
   */
  async executeRecoveryTransaction(params: {
    walletPublicKey: string;
    oldUserPublicKey: string;
    newUserPublicKey: string;
    recoveryRequestId: string;
    retryCount?: number;
  }): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
  }> {
    try {
      const { recoveryKeypair, transaction } =
        await this.createRecoveryTransaction(params);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        recoveryKeypair
      );

      logger.info(`Recovery transaction executed successfully: ${result.hash}`);

      return {
        success: true,
        transactionHash: result.hash,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `Recovery transaction failed (attempt ${
          (params.retryCount || 0) + 1
        }):`,
        error
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const stellarService = new StellarService();
