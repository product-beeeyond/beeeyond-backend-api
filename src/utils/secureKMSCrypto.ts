/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import {
  KMSClient,
  // EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EnableKeyRotationCommand,
  // GetParametersForImportCommand,
  // PutParameterCommand,
  // GetParameterCommand,
} from '@aws-sdk/client-kms';
import {
  SSMClient,
  PutParameterCommand as SSMPutParameterCommand,
  // GetParameterCommand as SSMGetParameterCommand,
} from '@aws-sdk/client-ssm';
import logger from './logger';

interface EncryptedSecret {
  ciphertextBlob: string;
  dataKeyEncrypted: string;
  iv: string;
  keyId: string;
  version: string;
  createdAt: string;
}

interface KMSConfig {
  region: string;
  keyId?: string;
  keyAlias: string;
}

class SecureKMSManager {
  private kmsClient: KMSClient;
  private ssmClient: SSMClient;
  private config: KMSConfig;
  private readonly CURRENT_VERSION = 'v1';
  private readonly IV_LENGTH = 16;

  constructor(config: KMSConfig) {
    this.config = config;
    this.kmsClient = new KMSClient({ region: config.region });
    this.ssmClient = new SSMClient({ region: config.region });
  }

  /**
   * Initialize KMS key with automatic rotation enabled
   */
  async initializeKMSKey(): Promise<string> {
    try {
      let keyId = this.config.keyId;

      if (!keyId) {
        // Create new KMS key
        const createKeyCommand = new CreateKeyCommand({
          Description: 'Stellar Wallet Secrets Encryption Key',
          KeyUsage: 'ENCRYPT_DECRYPT',
          KeySpec: 'SYMMETRIC_DEFAULT',
          MultiRegion: false,
          Tags: [
            { TagKey: 'Purpose', TagValue: 'StellarWalletEncryption' },
            { TagKey: 'Environment', TagValue: process.env.NODE_ENV || 'development' },
          ],
        });

        const createResult = await this.kmsClient.send(createKeyCommand);
        keyId = createResult.KeyMetadata?.KeyId;

        // Store key ID in SSM Parameter Store
        await this.ssmClient.send(new SSMPutParameterCommand({
          Name: `/stellar-wallet/kms-key-id`,
          Value: keyId,
          Type: 'String',
          Description: 'KMS Key ID for Stellar Wallet Encryption',
          Overwrite: true,
        }));

        logger.info(`Created new KMS key: ${keyId}`);
      }

      // Enable automatic key rotation (yearly)
      const enableRotationCommand = new EnableKeyRotationCommand({
        KeyId: keyId,
      });

      await this.kmsClient.send(enableRotationCommand);
      
      // Store key reference
      this.config.keyId = keyId;

      logger.info(`KMS key initialized with rotation enabled: ${keyId}`);
      return keyId as string;
    } catch (error) {
      logger.error('Error initializing KMS key:', error);
      throw new Error(`KMS initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt wallet secret using KMS with envelope encryption
   */
  async encryptSecret(secret: string, context: Record<string, string>): Promise<EncryptedSecret> {
    try {
      if (!this.config.keyId) {
        await this.initializeKMSKey();
      }

      // Generate data key for envelope encryption
      const generateDataKeyCommand = new GenerateDataKeyCommand({
        KeyId: this.config.keyId,
        KeySpec: 'AES_256',
        EncryptionContext: context,
      });

      const dataKeyResult = await this.kmsClient.send(generateDataKeyCommand);
      
      if (!dataKeyResult.Plaintext || !dataKeyResult.CiphertextBlob) {
        throw new Error('Failed to generate data key');
      }

      // Use the plaintext data key for local encryption
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-gcm', dataKeyResult.Plaintext, iv);
      
      let encrypted = cipher.update(secret, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      const ciphertextBlob = encrypted + ':' + authTag.toString('hex');

      // Clear plaintext data key from memory
      dataKeyResult.Plaintext.fill(0);

      const encryptedSecret: EncryptedSecret = {
        ciphertextBlob,
        dataKeyEncrypted: Buffer.from(dataKeyResult.CiphertextBlob).toString('base64'),
        iv: iv.toString('hex'),
        keyId: this.config.keyId as string,
        version: this.CURRENT_VERSION,
        createdAt: new Date().toISOString(),
      };

      logger.info(`Secret encrypted successfully with context: ${JSON.stringify(context)}`);
      return encryptedSecret;
    } catch (error) {
      logger.error('Error encrypting secret:', error);
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt wallet secret using KMS
   */
  async decryptSecret(encryptedData: EncryptedSecret, context: Record<string, string>): Promise<string> {
    try {
      // Decrypt the data key using KMS
      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedData.dataKeyEncrypted, 'base64'),
        EncryptionContext: context,
      });

      const decryptResult = await this.kmsClient.send(decryptCommand);
      
      if (!decryptResult.Plaintext) {
        throw new Error('Failed to decrypt data key');
      }

      // Parse ciphertext and auth tag
      const [encryptedText, authTagHex] = encryptedData.ciphertextBlob.split(':');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Use the decrypted data key for local decryption
      const decipher = crypto.createDecipheriv('aes-256-gcm', decryptResult.Plaintext, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Clear plaintext data key from memory
      decryptResult.Plaintext.fill(0);

      logger.info(`Secret decrypted successfully with context: ${JSON.stringify(context)}`);
      return decrypted;
    } catch (error) {
      logger.error('Error decrypting secret:', error);
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate encryption for existing secrets (called during key rotation)
   */
  async rotateSecretEncryption(
    oldEncryptedData: EncryptedSecret, 
    context: Record<string, string>
  ): Promise<EncryptedSecret> {
    try {
      // Decrypt with old key
      const plaintext = await this.decryptSecret(oldEncryptedData, context);
      
      // Re-encrypt with current key
      const newEncryptedData = await this.encryptSecret(plaintext, context);
      
      logger.info(`Secret rotation completed for context: ${JSON.stringify(context)}`);
      return newEncryptedData;
    } catch (error) {
      logger.error('Error rotating secret encryption:', error);
      throw new Error(`Secret rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get KMS key information
   */
  async getKeyInfo(): Promise<any> {
    try {
      if (!this.config.keyId) {
        throw new Error('KMS key not initialized');
      }

      const describeKeyCommand = new DescribeKeyCommand({
        KeyId: this.config.keyId,
      });

      const result = await this.kmsClient.send(describeKeyCommand);
      return result.KeyMetadata;
    } catch (error) {
      logger.error('Error getting key info:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const kmsManager = new SecureKMSManager({
  region: process.env.AWS_REGION || 'us-east-1',
  keyId: process.env.KMS_KEY_ID,
  keyAlias: process.env.KMS_KEY_ALIAS || 'alias/stellar-wallet-encryption',
});
