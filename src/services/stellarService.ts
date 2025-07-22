import Server, {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
  ServerApi,
} from 'stellar-sdk';
import logger from '../utils/logger';
import { encrypt, decrypt } from '../utils/crypto';
import  Wallet  from '../models/Wallet';

interface CreateWalletResponse {
  publicKey: string;
  walletId: number;
}

interface CreateAccountResponse {
  publicKey: string;
  secretKey: string;
}

interface CreatePropertyTokenResponse {
  assetCode: string;
  assetIssuer: string;
  transactionHash: string;
}

interface AccountBalance {
  asset_code: string;
  balance: string;
  asset_issuer?: string;
}

class StellarService {
  private server: Server;
  private network: string;
  private issuerKeypair: Keypair;
  private distributionKeypair: Keypair;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor() {
    this.validateEnvironmentVariables();

    this.network = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new Server(process.env.STELLAR_HORIZON_URL!);

    try {
      this.issuerKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET!);
      this.distributionKeypair = Keypair.fromSecret(process.env.STELLAR_DISTRIBUTION_SECRET!);
    } catch (error) {
      logger.error('Invalid Stellar keypairs in environment variables:', error);
      throw new Error('Invalid Stellar keypairs configuration');
    }
  }

  private validateEnvironmentVariables(): void {
    const requiredEnvVars = [
      'STELLAR_NETWORK',
      'STELLAR_HORIZON_URL',
      'STELLAR_ISSUER_SECRET',
      'STELLAR_DISTRIBUTION_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === retries) {
          logger.error(`${operationName} failed after ${retries} attempts:`, error);
          throw error;
        }

        logger.warn(`${operationName} attempt ${attempt} failed, retrying...`, error);
        await this.sleep(this.RETRY_DELAY * attempt);
      }
    }

    throw new Error(`${operationName} failed after ${retries} attempts`);
  }

  // Create wallet for user with proper error handling and validation
  async createWalletForUser(userId: string, userPassword: string): Promise<CreateWalletResponse> {
    try {
      // Validate inputs
      // if (!userId || userId <= 0) {
      //   throw new Error('Invalid user ID provided');
      // }

      if (!userPassword || userPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Check if user already has a wallet
      const existingWallet = await Wallet.findOne({ where: { userId } });
      if (existingWallet) {
        throw new Error('User already has a wallet');
      }

      // Generate new keypair
      const keypair = Keypair.random();

      // Encrypt the secret key
      const encryptedSecret = encrypt(keypair.secret(), userPassword);

      // Create wallet record in database
      const wallet = await Wallet.create({
        userId,
        publicKey: keypair.publicKey(),
        encryptedSecretKey: encryptedSecret,
        currency: '',
        availableBalance: 0,
        lockedBalance: 0,
        totalBalance: 0
      });

      logger.info(`Wallet created for user ${userId} with public key: ${keypair.publicKey()}`);

      return {
        publicKey: keypair.publicKey(),
        walletId: wallet.id,
      };
    } catch (error) {
      logger.error('Error creating wallet for user:', error);
      throw new Error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get user's decrypted secret key
  async getUserSecretKey(userId: number, userPassword: string): Promise<string> {
    try {
      const wallet = await Wallet.findOne({ where: { userId } });
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      const decryptedSecret = decrypt(wallet.encryptedSecretKey, userPassword);

      // Validate the decrypted secret
      try {
        Keypair.fromSecret(decryptedSecret);
      } catch {
        throw new Error('Invalid password or corrupted wallet');
      }

      return decryptedSecret;
    } catch (error) {
      logger.error('Error retrieving user secret key:', error);
      throw new Error(`Failed to retrieve secret key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create a new Stellar account with funding
  async createAccount(): Promise<CreateAccountResponse> {
    return this.retryOperation(async () => {
      const newKeypair = Keypair.random();

      // Fund the account (testnet only)
      if (process.env.STELLAR_NETWORK === 'testnet') {
        try {
          await this.server.friendbot(newKeypair.publicKey()).call();
          logger.info(`Testnet account funded: ${newKeypair.publicKey()}`);
        } catch (error) {
          logger.warn('Friendbot funding failed:', error);
          // Continue without funding - account can be funded later
        }
      }

      return {
        publicKey: newKeypair.publicKey(),
        secretKey: newKeypair.secret(),
      };
    }, 'Create Account');
  }

  // Create property token (asset) with improved validation
  async createPropertyToken(propertyId: string, totalSupply: number): Promise<CreatePropertyTokenResponse> {
    try {
      // Validate inputs
      if (!propertyId || propertyId.length < 1) {
        throw new Error('Invalid property ID provided');
      }

      if (!totalSupply || totalSupply <= 0) {
        throw new Error('Total supply must be greater than 0');
      }

      // Create asset code (max 12 characters for custom assets)
      const assetCode = `PROP${propertyId.substring(0, 8).toUpperCase()}`;
      const asset = new Asset(assetCode, this.issuerKeypair.publicKey());

      return this.retryOperation(async () => {
        // Load issuer account
        const issuerAccount = await this.server.loadAccount(this.issuerKeypair.publicKey());

        // Create transaction to establish trustline and mint tokens
        const transaction = new TransactionBuilder(issuerAccount, {
          fee: BASE_FEE,
          networkPassphrase: this.network,
        })
          .addOperation(
            Operation.changeTrust({
              asset: asset,
              source: this.distributionKeypair.publicKey(),
            })
          )
          .addOperation(
            Operation.payment({
              destination: this.distributionKeypair.publicKey(),
              asset: asset,
              amount: totalSupply.toString(),
            })
          )
          .setTimeout(180)
          .build();

        // Sign transaction
        transaction.sign(this.issuerKeypair);
        transaction.sign(this.distributionKeypair);

        // Submit transaction
        const result = await this.server.submitTransaction(transaction);

        logger.info(`Property token created: ${assetCode}, Hash: ${result.hash}`);

        return {
          assetCode,
          assetIssuer: this.issuerKeypair.publicKey(),
          transactionHash: result.hash,
        };
      }, 'Create Property Token');
    } catch (error) {
      logger.error('Error creating property token:', error);
      throw new Error(`Failed to create property token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Transfer tokens with enhanced validation
  async transferTokens(
    fromSecret: string,
    toPublicKey: string,
    assetCode: string,
    assetIssuer: string,
    amount: string
  ): Promise<string> {
    try {
      // Validate inputs
      if (!fromSecret || !toPublicKey || !assetCode || !assetIssuer || !amount) {
        throw new Error('All parameters are required for token transfer');
      }

      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      let fromKeypair: Keypair;
      try {
        fromKeypair = Keypair.fromSecret(fromSecret);
      } catch {
        throw new Error('Invalid source secret key');
      }

      try {
        Keypair.fromPublicKey(toPublicKey);
      } catch {
        throw new Error('Invalid destination public key');
      }

      const asset = new Asset(assetCode, assetIssuer);

      return this.retryOperation(async () => {
        // Load source account
        const sourceAccount = await this.server.loadAccount(fromKeypair.publicKey());

        // Check if source has sufficient balance
        const balances = await this.getAccountBalance(fromKeypair.publicKey());
        const assetBalance = balances.find(b =>
          b.asset_code === assetCode && b.asset_issuer === assetIssuer
        );

        if (!assetBalance || parseFloat(assetBalance.balance) < numericAmount) {
          throw new Error('Insufficient balance for transfer');
        }

        // Create payment transaction
        const transaction = new TransactionBuilder(sourceAccount, {
          fee: BASE_FEE,
          networkPassphrase: this.network,
        })
          .addOperation(
            Operation.payment({
              destination: toPublicKey,
              asset: asset,
              amount: amount,
            })
          )
          .setTimeout(180)
          .build();

        // Sign and submit
        transaction.sign(fromKeypair);
        const result = await this.server.submitTransaction(transaction);

        logger.info(`Tokens transferred: ${amount} ${assetCode} from ${fromKeypair.publicKey()} to ${toPublicKey}`);

        return result.hash;
      }, 'Transfer Tokens');
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      throw new Error(`Failed to transfer tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get account balance with better error handling
  async getAccountBalance(publicKey: string): Promise<AccountBalance[]> {
    try {
      if (!publicKey) {
        throw new Error('Public key is required');
      }

      try {
        Keypair.fromPublicKey(publicKey);
      } catch {
        throw new Error('Invalid public key format');
      }

      return this.retryOperation(async () => {
        const account = await this.server.loadAccount(publicKey);
        return account.balances.map((balance: any) => ({
          asset_code: balance.asset_code || 'XLM',
          balance: balance.balance,
          asset_issuer: balance.asset_issuer,
        }));
      }, 'Get Account Balance');
    } catch (error) {
      logger.error('Error getting account balance:', error);
      throw new Error(`Failed to get account balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create trustline for asset with validation
  async createTrustline(
    userSecret: string,
    assetCode: string,
    assetIssuer: string,
    limit?: string
  ): Promise<string> {
    try {
      // Validate inputs
      if (!userSecret || !assetCode || !assetIssuer) {
        throw new Error('User secret, asset code, and asset issuer are required');
      }

      let userKeypair: Keypair;
      try {
        userKeypair = Keypair.fromSecret(userSecret);
      } catch {
        throw new Error('Invalid user secret key');
      }

      const asset = new Asset(assetCode, assetIssuer);

      return this.retryOperation(async () => {
        // Load user account
        const userAccount = await this.server.loadAccount(userKeypair.publicKey());

        // Check if trustline already exists
        const existingTrustline = userAccount.balances.find((balance: any) =>
          balance.asset_code === assetCode && balance.asset_issuer === assetIssuer
        );

        if (existingTrustline) {
          throw new Error('Trustline already exists for this asset');
        }

        // Create trustline transaction
        const transaction = new TransactionBuilder(userAccount, {
          fee: BASE_FEE,
          networkPassphrase: this.network,
        })
          .addOperation(
            Operation.changeTrust({
              asset: asset,
              limit: limit,
            })
          )
          .setTimeout(180)
          .build();

        // Sign and submit
        transaction.sign(userKeypair);
        const result = await this.server.submitTransaction(transaction);

        logger.info(`Trustline created for ${assetCode} by ${userKeypair.publicKey()}`);

        return result.hash;
      }, 'Create Trustline');
    } catch (error) {
      logger.error('Error creating trustline:', error);
      throw new Error(`Failed to create trustline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Check if account exists
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get transaction history
  async getTransactionHistory(publicKey: string, limit: number = 10): Promise<ServerApi.TransactionRecord[]> {
    try {
      if (!publicKey) {
        throw new Error('Public key is required');
      }

      return this.retryOperation(async () => {
        const transactions = await this.server
          .transactions()
          .forAccount(publicKey)
          .limit(limit)
          .order('desc')
          .call();

        return transactions.records;
      }, 'Get Transaction History');
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw new Error(`Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const stellarService = new StellarService();
