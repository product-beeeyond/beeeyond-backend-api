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
import { encrypt, decrypt } from "../utils/cypher";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigSigner from "../models/MultiSigSigner";
import { Op } from "sequelize";
import {
  STELLAR_NETWORK,
  STELLAR_HORIZON_URL,
  STELLAR_PLATFORM_SECRET,
  STELLAR_RECOVERY_SECRET,
  STELLAR_TREASURY_SECRET,
  MULTISIG_CONFIG,
} from "../config";

// Reserve calculation constants
const BASE_RESERVE = 0.5; // XLM per account
const ENTRY_RESERVE = 0.5; // XLM per entry (signer, trustline, offer, data)

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
    this.server = new Horizon.Server(STELLAR_HORIZON_URL!);

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
    const minimumBalance = BASE_RESERVE + totalEntries * ENTRY_RESERVE;

    // Add 10% buffer for safety
    const bufferedBalance = minimumBalance * 1.1;

    logger.info(
      `Calculated minimum balance: ${bufferedBalance} XLM (base: ${BASE_RESERVE}, entries: ${totalEntries})`
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
        baseReserve: BASE_RESERVE,
        entryReserve: ENTRY_RESERVE,
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
        BASE_RESERVE + (currentEntries + newEntries) * ENTRY_RESERVE;

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
      const feeSourceKeypair = feeSource || this.treasuryKeypair;

      // Load fee source account
      const feeSourceAccount = await this.server.loadAccount(
        feeSourceKeypair.publicKey()
      );

      // Create fee bump transaction with higher fee
      const feeBumpTransaction = TransactionBuilder.buildFeeBumpTransaction(
        feeSourceKeypair,
        String(parseInt(BASE_FEE) * 2), // Use 2x base fee to ensure inclusion
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
   * Create a 1-of-2 multisig wallet for user with proper reserve calculation
   */
  async createUserMultiSigWallet(params: UserWalletParams) {
    try {
      const { userId, userEmail, userName } = params;

      // Generate new keypair for user
      const userKeypair = Keypair.random();
      const walletKeypair = Keypair.random();

      // Calculate required balance for user wallet
      // Base + 2 additional signers (user + platform recovery)
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 2,
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

      // Create multisig transaction following SEP-30
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        // Add user as signer (weight 2)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: userKeypair.publicKey(),
              weight: MULTISIG_CONFIG.USER_RECOVERY.USER_WEIGHT,
            },
          })
        )
        // Add platform recovery key as signer (weight 1)
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: this.recoveryKeypair.publicKey(),
              weight: MULTISIG_CONFIG.USER_RECOVERY.PLATFORM_WEIGHT,
            },
          })
        )
        // Set thresholds: 1-of-2 (either user OR platform can sign)
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.USER_RECOVERY.LOW_THRESHOLD, // 1 - payments, offers
            medThreshold: MULTISIG_CONFIG.USER_RECOVERY.MEDIUM_THRESHOLD, // 2 - account management
            highThreshold: MULTISIG_CONFIG.USER_RECOVERY.HIGH_THRESHOLD, // 2 - critical operations
            masterWeight: MULTISIG_CONFIG.USER_RECOVERY.MASTER_WEIGHT,
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
      const multiSigWallet = await MultiSigWallet.create({
        userId,
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "user_recovery",
        lowThreshold: MULTISIG_CONFIG.USER_RECOVERY.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.USER_RECOVERY.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.USER_RECOVERY.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.USER_RECOVERY.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          userEmail,
          userName,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
        },
      });

      // Store signers
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          userId: userId,
          publicKey: userKeypair.publicKey(),
          weight: MULTISIG_CONFIG.USER_RECOVERY.USER_WEIGHT, // 2
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
          weight: MULTISIG_CONFIG.USER_RECOVERY.PLATFORM_WEIGHT, // 1
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
          low: MULTISIG_CONFIG.USER_RECOVERY.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.USER_RECOVERY.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.USER_RECOVERY.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating user wallet:", error);
      throw new Error(
        `Failed to create user wallet: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Create platform treasury wallet with proper reserves (2-of-3 multisig)
   */
  async createPlatformTreasuryWallet(params: PlatformWalletParams) {
    try {
      const walletKeypair = Keypair.random();
      const platformKey2 = Keypair.random();
      const platformKey3 = Keypair.random();

      // Calculate required balance: Base + 3 additional signers
      const requiredBalance = this.calculateMinimumBalance({
        additionalSigners: 3,
        trustlines: 0,
      });

      // Fund account
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

      // Create 2-of-3 multisig for treasury (higher security)
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: this.platformKeypair.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.PRIMARY_WEIGHT, // 2
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: platformKey2.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.SECONDARY_WEIGHT, // 1
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: platformKey3.publicKey(),
              weight: MULTISIG_CONFIG.PLATFORM_TREASURY.RECOVERY_WEIGHT, // 1
            },
          })
        )
        .addOperation(
          Operation.setOptions({
            lowThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD, // 2 - 2-of-3 for payments
            medThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD, // 3 - 3-of-3 for account management
            highThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD, // 3 - 3-of-3 for critical ops
            masterWeight: MULTISIG_CONFIG.PLATFORM_TREASURY.MASTER_WEIGHT, // 0
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

      const multiSigWallet = await MultiSigWallet.create({
        stellarPublicKey: walletKeypair.publicKey(),
        walletType: "platform_treasury",
        lowThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD,
        mediumThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD,
        highThreshold: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD,
        masterWeight: MULTISIG_CONFIG.PLATFORM_TREASURY.MASTER_WEIGHT,
        status: "active",
        createdTxHash: result.hash,
        metadata: {
          description: params.description,
          createdBy: params.createdBy,
          initialBalance: requiredBalance,
          createdAt: new Date().toISOString(),
        },
      });

      // Store platform signers
      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: this.platformKeypair.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.PRIMARY_WEIGHT, // 2
          role: "platform_primary",
          status: "active",
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: platformKey2.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.SECONDARY_WEIGHT, // 1
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
          weight: MULTISIG_CONFIG.PLATFORM_TREASURY.RECOVERY_WEIGHT, // 1
          role: "platform_tertiary",
          status: "active",
          encryptedPrivateKey: encrypt(
            platformKey3.secret(),
            "platform_treasury_key_3"
          ),
        }),
      ]);

      logger.info(
        `Platform treasury wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
      );

      return {
        publicKey: walletKeypair.publicKey(),
        walletId: multiSigWallet.id,
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: this.platformKeypair.publicKey(),
            role: "platform_primary",
          },
          { publicKey: platformKey2.publicKey(), role: "platform_secondary" },
          { publicKey: platformKey3.publicKey(), role: "platform_tertiary" },
        ],
        thresholds: {
          low: MULTISIG_CONFIG.PLATFORM_TREASURY.LOW_THRESHOLD,
          medium: MULTISIG_CONFIG.PLATFORM_TREASURY.MEDIUM_THRESHOLD,
          high: MULTISIG_CONFIG.PLATFORM_TREASURY.HIGH_THRESHOLD,
        },
      };
    } catch (error) {
      logger.error("Error creating platform treasury wallet:", error);
      throw error;
    }
  }
  /**
   * Create platform asset issuer wallet (1-of-2 for operational efficiency) with fee bump sponsorship
   */
  async createPlatformIssuerWallet(params: PlatformWalletParams) {
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
              ed25519PublicKey: this.platformKeypair.publicKey(),
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
            lowThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.LOW_THRESHOLD, // 1 - 1-of-2 for routine issuance
            medThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.MEDIUM_THRESHOLD, // 2 - 2-of-2 for account changes
            highThreshold: MULTISIG_CONFIG.PLATFORM_ISSUER.HIGH_THRESHOLD, // 2 - 2-of-2 for auth flags
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

      const multiSigWallet = await MultiSigWallet.create({
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
        },
      });

      await Promise.all([
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: this.platformKeypair.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_ISSUER.PRIMARY_WEIGHT, // 2
          role: "platform_issuer",
          status: "active",
        }),
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: backupKey.publicKey(),
          weight: MULTISIG_CONFIG.PLATFORM_ISSUER.BACKUP_WEIGHT, // 1
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
        initialBalance: requiredBalance,
        signers: [
          {
            publicKey: this.platformKeypair.publicKey(),
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
      throw error;
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
        const additionalFunding = (ENTRY_RESERVE * 1.1).toFixed(7); // 10% buffer
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
    const walletKeypair = Keypair.random();
    const propertyManagerKey = params.propertyManager ? Keypair.random() : null;

    // Calculate reserves: Base + signers + expected trustlines
    const additionalSigners = propertyManagerKey ? 2 : 1; // Platform + optional property manager
    const expectedTrustlines = 2; // Property token + NGN

    const requiredBalance = this.calculateMinimumBalance({
      additionalSigners,
      trustlines: expectedTrustlines,
    });

    if (STELLAR_NETWORK === "testnet") {
      await this.server.friendbot(walletKeypair.publicKey()).call();
      await this.sleep(2000);

      // Ensure sufficient balance
      const account = await this.server.loadAccount(walletKeypair.publicKey());
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
          ed25519PublicKey: this.platformKeypair.publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PLATFORM_WEIGHT, // 2
        },
      })
    );

    // Add property manager if provided
    if (propertyManagerKey) {
      transactionBuilder.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: propertyManagerKey.publicKey(),
            weight:
              MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PROPERTY_MANAGER_WEIGHT, // 1
          },
        })
      );
    }

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

    const multiSigWallet = await MultiSigWallet.create({
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
      },
    });

    // Store signers
    const signerPromises = [
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: this.platformKeypair.publicKey(),
        weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PLATFORM_WEIGHT, // 2
        role: "platform_distribution",
        status: "active",
      }),
    ];

    if (propertyManagerKey) {
      signerPromises.push(
        MultiSigSigner.create({
          multiSigWalletId: multiSigWallet.id,
          publicKey: propertyManagerKey.publicKey(),
          weight: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.PROPERTY_MANAGER_WEIGHT, // 1,
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

    logger.info(
      `Property distribution wallet created: ${walletKeypair.publicKey()} with ${requiredBalance} XLM`
    );

    return {
      publicKey: walletKeypair.publicKey(),
      walletId: multiSigWallet.id,
      initialBalance: requiredBalance,
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
      thresholds: {
        low: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.LOW_THRESHOLD,
        medium: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.MEDIUM_THRESHOLD,
        high: MULTISIG_CONFIG.PROPERTY_DISTRIBUTION.HIGH_THRESHOLD,
      },
    };
  }
  /**
   * Create property governance wallet with proper reserves
   */
  private async createPropertyGovernanceWallet(params: PropertyWalletParams) {
    const walletKeypair = Keypair.random();
    const governanceKey = Keypair.random();

    // Calculate reserves: Base + 3 signers + potential trustlines
    const requiredBalance = this.calculateMinimumBalance({
      additionalSigners: 3,
      trustlines: 1,
    });

    if (STELLAR_NETWORK === "testnet") {
      await this.server.friendbot(walletKeypair.publicKey()).call();
      await this.sleep(2000);

      const account = await this.server.loadAccount(walletKeypair.publicKey());
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
            ed25519PublicKey: this.platformKeypair.publicKey(),
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
            ed25519PublicKey: this.recoveryKeypair.publicKey(),
            weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.RECOVERY_WEIGHT, // 1
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

    const multiSigWallet = await MultiSigWallet.create({
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
      },
    });

    await Promise.all([
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: this.platformKeypair.publicKey(),
        weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.PLATFORM_WEIGHT, // 1
        role: "platform_governance",
        status: "active",
      }),
      MultiSigSigner.create({
        multiSigWalletId: multiSigWallet.id,
        publicKey: governanceKey.publicKey(),
        weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.GOVERNANCE_WEIGHT, // 1
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
        weight: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.RECOVERY_WEIGHT, // 1
        role: "platform_recovery",
        status: "active",
      }),
    ]);

    return {
      publicKey: walletKeypair.publicKey(),
      walletId: multiSigWallet.id,
      initialBalance: requiredBalance,
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
      thresholds: {
        low: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.LOW_THRESHOLD,
        medium: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.MEDIUM_THRESHOLD,
        high: MULTISIG_CONFIG.PROPERTY_GOVERNANCE.HIGH_THRESHOLD,
      },
    };
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

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.treasuryKeypair
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
              weight: 2,
            },
          })
        )
        .setTimeout(180)
        .build();

      // Sign with platform recovery key
      transaction.sign(this.recoveryKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.recoveryKeypair
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

      // Ensure distribution wallet has trustline for the new asset
      await this.ensureTrustlines(distributionWalletPublicKey, [
        { assetCode, assetIssuer: issuerWallet.stellarPublicKey },
      ]);

      // Load issuer account
      const issuerAccount = await this.server.loadAccount(
        issuerWallet.stellarPublicKey
      );

      // Create transaction to mint tokens
      const transaction = new TransactionBuilder(issuerAccount, {
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
      transaction.sign(this.platformKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.platformKeypair
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
        { assetCode: "NGN", assetIssuer: this.platformKeypair.publicKey() },
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

      const ngnAsset = new Asset("NGN", this.platformKeypair.publicKey());

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
      transaction.sign(this.platformKeypair);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.platformKeypair
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

  /**
   * Enhanced token purchase with trustline management
   */
  async executeTokenPurchase(params: TokenPurchaseParams): Promise<string> {
    try {
      const {
        userWalletPublicKey,
        propertyWalletPublicKey,
        assetCode,
        assetIssuer,
        amount,
        paymentAmount,
      } = params;

      if (
        !userWalletPublicKey ||
        !propertyWalletPublicKey ||
        !assetCode ||
        !amount ||
        !paymentAmount
      ) {
        throw new Error("All parameters are required for token purchase");
      }

      const asset = new Asset(assetCode, assetIssuer);
      const ngnAsset = new Asset("NGN", this.platformKeypair.publicKey());

      // Ensure user has trustlines for both assets
      await this.ensureTrustlines(userWalletPublicKey, [
        { assetCode, assetIssuer },
        { assetCode: "NGN", assetIssuer: this.platformKeypair.publicKey() },
      ]);

      // Load property distribution wallet
      const propertyAccount = await this.server.loadAccount(
        propertyWalletPublicKey
      );

      const transaction = new TransactionBuilder(propertyAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.payment({
            destination: userWalletPublicKey,
            asset: asset,
            amount: amount,
          })
        )
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

      transaction.sign(this.platformKeypair);
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.platformKeypair
      );

      logger.info(
        `Token purchase executed: ${amount} ${assetCode} to ${userWalletPublicKey}`
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

  /**
   * Enhanced token sale with trustline management
   */
  // async executeTokenSale(params: TokenSaleParams): Promise<string> {
  //   try {
  //     const {
  //       userWalletPublicKey,
  //       propertyWalletPublicKey,
  //       assetCode,
  //       assetIssuer,
  //       amount,
  //       proceedsAmount,
  //     } = params;

  //     const asset = new Asset(assetCode, assetIssuer);
  //     const ngnAsset = new Asset("NGN", this.platformKeypair.publicKey());

  //     const userAccount = await this.server.loadAccount(userWalletPublicKey);

  //     const userWallet = await MultiSigWallet.findOne({
  //       where: { stellarPublicKey: userWalletPublicKey },
  //       include: [
  //         {
  //           model: MultiSigSigner,
  //           as: "signers",
  //           where: { role: "user", status: "active" },
  //         },
  //       ],
  //     });

  //     if (!userWallet || !userWallet.signers?.[0]) {
  //       throw new Error("User wallet or signer not found");
  //     }

  //     let signerKeypair: Keypair;

  //     const recoverySigner = await MultiSigSigner.findOne({
  //       where: {
  //         multiSigWalletId: userWallet.id,
  //         role: "platform_recovery",
  //         status: "active",
  //       },
  //     });

  //     if (recoverySigner) {
  //       signerKeypair = this.recoveryKeypair;
  //     } else {
  //       throw new Error("No valid signer available for transaction");
  //     }

  //     const transaction = new TransactionBuilder(userAccount, {
  //       fee: BASE_FEE,
  //       networkPassphrase: this.network,
  //     })
  //       .addOperation(
  //         Operation.payment({
  //           destination: propertyWalletPublicKey,
  //           asset: asset,
  //           amount: amount,
  //         })
  //       )
  //       .addOperation(
  //         Operation.payment({
  //           destination: userWalletPublicKey,
  //           asset: ngnAsset,
  //           amount: proceedsAmount,
  //           source: propertyWalletPublicKey,
  //         })
  //       )
  //       .setTimeout(180)
  //       .build();

  //     transaction.sign(signerKeypair);
  //     const result = await this.submitTransactionWithFeeBump(
  //       transaction,
  //       signerKeypair
  //     );

  //     logger.info(
  //       `Token sale executed: ${amount} ${assetCode} from ${userWalletPublicKey}`
  //     );
  //     return result.hash;
  //   } catch (error) {
  //     logger.error("Error executing token sale:", error);
  //     throw new Error(
  //       `Failed to execute token sale: ${
  //         error instanceof Error ? error.message : "Unknown error"
  //       }`
  //     );
  //   }
  // }

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
          ENTRY_RESERVE *
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

      if (wallet) {
        // Try to get platform recovery signer first
        const recoverySigner = await MultiSigSigner.findOne({
          where: {
            multiSigWalletId: wallet.id,
            role: "platform_recovery",
            status: "active",
          },
        });

        if (recoverySigner) {
          signerKeypair = this.recoveryKeypair;
        } else {
          // Try other platform signers
          const platformSigner = await MultiSigSigner.findOne({
            where: {
              multiSigWalletId: wallet.id,
              role: {
                [Op.in]: [
                  "platform_distribution",
                  "platform_issuer",
                  "platform_primary",
                ],
              },
              status: "active",
            },
          });

          if (platformSigner) {
            signerKeypair = this.platformKeypair;
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
  async getSignerKeypair(
    walletId: string,
    role: string
  ): Promise<Keypair | null> {
    try {
      const signer = await MultiSigSigner.findOne({
        where: {
          multiSigWalletId: walletId,
          role,
          status: "active",
          encryptedPrivateKey: { [Op.not]: "" },
        },
      });

      if (!signer || !signer.encryptedPrivateKey) {
        return null;
      }

      const decryptionKey = `${role}_${walletId}`;
      const privateKey = decrypt(signer.encryptedPrivateKey, decryptionKey);

      return Keypair.fromSecret(privateKey);
    } catch (error) {
      logger.error(`Error getting signer keypair for role ${role}:`, error);
      return null;
    }
  }

  /**
   * Create time-locked recovery transaction
   */
  async createRecoveryTransaction(params: {
    walletPublicKey: string;
    oldUserPublicKey: string;
    newUserPublicKey: string;
    recoveryRequestId: string;
  }): Promise<{ transaction: any; xdr: string }> {
    try {
      const account = await this.server.loadAccount(params.walletPublicKey);

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
      transaction.sign(this.recoveryKeypair);

      logger.info(
        `Recovery transaction created for request: ${params.recoveryRequestId}`
      );

      return {
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
      const { transaction } = await this.createRecoveryTransaction(params);

      // Submit transaction with fee bump sponsorship
      const result = await this.submitTransactionWithFeeBump(
        transaction,
        this.recoveryKeypair
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
