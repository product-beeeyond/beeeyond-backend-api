import Server, {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
} from 'stellar-sdk';
import logger from '../utils/logger';

class StellarService {
  private server: Server;
  private network: string;
  private issuerKeypair: Keypair;
  private distributionKeypair: Keypair;

  constructor() {
    this.network = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new Server(process.env.STELLAR_HORIZON_URL!);
    this.issuerKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET!);
    this.distributionKeypair = Keypair.fromSecret(process.env.STELLAR_DISTRIBUTION_SECRET!);
  }

  // Create a new Stellar account
  async createAccount(): Promise<{ publicKey: string; secretKey: string }> {
    try {
      const newKeypair = Keypair.random();

      // Fund the account (testnet only)
      if (process.env.STELLAR_NETWORK === 'testnet') {
        await this.server.friendbot(newKeypair.publicKey()).call();
      }

      return {
        publicKey: newKeypair.publicKey(),
        secretKey: newKeypair.secret(),
      };
    } catch (error) {
      logger.error('Error creating Stellar account:', error);
      throw new Error('Failed to create Stellar account');
    }
  }

  // Create property token (asset)
  async createPropertyToken(propertyId: string, totalSupply: number): Promise<{
    assetCode: string;
    assetIssuer: string;
    transactionHash: string;
  }> {
    try {
      const assetCode = `PROP${propertyId.substring(0, 8).toUpperCase()} `;
      const asset = new Asset(assetCode, this.issuerKeypair.publicKey());

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

      return {
        assetCode,
        assetIssuer: this.issuerKeypair.publicKey(),
        transactionHash: result.hash,
      };
    } catch (error) {
      logger.error('Error creating property token:', error);
      throw new Error('Failed to create property token');
    }
  }

  // Transfer tokens
  async transferTokens(
    fromSecret: string,
    toPublicKey: string,
    assetCode: string,
    assetIssuer: string,
    amount: string
  ): Promise<string> {
    try {
      const fromKeypair = Keypair.fromSecret(fromSecret);
      const asset = new Asset(assetCode, assetIssuer);

      // Load source account
      const sourceAccount = await this.server.loadAccount(fromKeypair.publicKey());

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

      return result.hash;
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      throw new Error('Failed to transfer tokens');
    }
  }

  // Get account balance
  async getAccountBalance(publicKey: string): Promise<Array<{ asset_code: string; balance: string }>> {
    try {
      const account = await this.server.loadAccount(publicKey);
      return account.balances.map((balance: any) => ({
        asset_code: balance.asset_code || 'XLM',
        balance: balance.balance,
      }));
    } catch (error) {
      logger.error('Error getting account balance:', error);
      throw new Error('Failed to get account balance');
    }
  }

  // Create trustline for asset
  async createTrustline(
    userSecret: string,
    assetCode: string,
    assetIssuer: string
  ): Promise<string> {
    try {
      const userKeypair = Keypair.fromSecret(userSecret);
      const asset = new Asset(assetCode, assetIssuer);

      // Load user account
      const userAccount = await this.server.loadAccount(userKeypair.publicKey());

      // Create trustline transaction
      const transaction = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.network,
      })
        .addOperation(
          Operation.changeTrust({
            asset: asset,
          })
        )
        .setTimeout(180)
        .build();

      // Sign and submit
      transaction.sign(userKeypair);
      const result = await this.server.submitTransaction(transaction);

      return result.hash;
    } catch (error) {
      logger.error('Error creating trustline:', error);
      throw new Error('Failed to create trustline');
    }
  }
}

export const stellarService = new StellarService();
