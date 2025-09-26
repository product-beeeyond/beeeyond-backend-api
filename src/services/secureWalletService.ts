import { Keypair } from "@stellar/stellar-sdk";
import { kmsManager } from "../utils/secureKMSCrypto";
import EncryptedSecret from "../models/EncryptedSecret";
// import MultiSigWallet from '../models/MultiSigWallet';
// import MultiSigSigner from '../models/MultiSigSigner';
// import { v4 as uuidv4 } from 'uuid';
import logger from "../utils/logger";
import { Op } from "sequelize";

class SecureWalletService {
  /**
   * Securely store a wallet secret with KMS encryption
   */
  async storeWalletSecret(
    walletId: string,
    secretType: string,
    secret: string,
    additionalContext: Record<string, string> = {}
  ): Promise<string> {
    try {
      // Ensure all context values are strings for KMS compatibility
      const context: Record<string, string> = {
        walletId,
        secretType,
        environment: process.env.NODE_ENV || "development",
        purpose: "stellar-wallet-encryption",
        ...additionalContext,
      };

      const encryptedData = await kmsManager.encryptSecret(secret, context);

      const secretRecord = await EncryptedSecret.create({
        walletId,
        secretType,
        ciphertextBlob: encryptedData.ciphertextBlob,
        dataKeyEncrypted: encryptedData.dataKeyEncrypted,
        iv: encryptedData.iv,
        keyId: encryptedData.keyId,
        version: encryptedData.version,
        encryptionContext: JSON.stringify(context),
      });

      logger.info(`Wallet secret stored securely: ${walletId}/${secretType}`);
      return secretRecord.id;
    } catch (error) {
      logger.error(`Error storing wallet secret: ${error}`);
      throw error;
    }
  }

  /**
   * Securely retrieve a wallet secret with KMS decryption
   */
  async retrieveWalletSecret(
    walletId: string,
    secretType: string
  ): Promise<string> {
    try {
      const secretRecord = await EncryptedSecret.findOne({
        where: { walletId, secretType },
        order: [["createdAt", "DESC"]], // Get latest version
      });

      if (!secretRecord) {
        throw new Error(`Secret not found: ${walletId}/${secretType}`);
      }

      const context: Record<string, string> = JSON.parse(
        secretRecord.encryptionContext
      );
      const encryptedData = {
        ciphertextBlob: secretRecord.ciphertextBlob,
        dataKeyEncrypted: secretRecord.dataKeyEncrypted,
        iv: secretRecord.iv,
        keyId: secretRecord.keyId,
        version: secretRecord.version,
        createdAt: secretRecord.createdAt.toISOString(),
      };

      const secret = await kmsManager.decryptSecret(encryptedData, context);
      logger.info(
        `Wallet secret retrieved securely: ${walletId}/${secretType}`
      );
      return secret;
    } catch (error) {
      logger.error(`Error retrieving wallet secret: ${error}`);
      throw error;
    }
  }

  /**
   * Get Keypair from encrypted storage
   */
  async getKeypairFromStorage(
    walletId: string,
    secretType: string
  ): Promise<Keypair> {
    try {
      const secret = await this.retrieveWalletSecret(walletId, secretType);
      return Keypair.fromSecret(secret);
    } catch (error) {
      logger.error(`Error getting keypair from storage: ${error}`);
      throw error;
    }
  }

  /**
   * Rotate secrets for a wallet (called during key rotation)
   */
  async rotateWalletSecrets(walletId: string): Promise<void> {
    try {
      const secrets = await EncryptedSecret.findAll({
        where: { walletId },
      });

      for (const secret of secrets) {
        const context: Record<string, string> = JSON.parse(
          secret.encryptionContext
        );
        const oldEncryptedData = {
          ciphertextBlob: secret.ciphertextBlob,
          dataKeyEncrypted: secret.dataKeyEncrypted,
          iv: secret.iv,
          keyId: secret.keyId,
          version: secret.version,
          createdAt: secret.createdAt.toISOString(),
        };

        const newEncryptedData = await kmsManager.rotateSecretEncryption(
          oldEncryptedData,
          context
        );

        await secret.update({
          ciphertextBlob: newEncryptedData.ciphertextBlob,
          dataKeyEncrypted: newEncryptedData.dataKeyEncrypted,
          iv: newEncryptedData.iv,
          keyId: newEncryptedData.keyId,
          version: newEncryptedData.version,
          rotatedAt: new Date(),
        });
      }

      logger.info(`Rotated ${secrets.length} secrets for wallet: ${walletId}`);
    } catch (error) {
      logger.error(`Error rotating wallet secrets: ${error}`);
      throw error;
    }
  }

  /**
   * Clean up old secret versions after successful rotation
   */
  async cleanupOldSecrets(retentionDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deletedCount = await EncryptedSecret.destroy({
        where: {
          rotatedAt: {
            [Op.lt]: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned up ${deletedCount} old secret versions`);
    } catch (error) {
      logger.error(`Error cleaning up old secrets: ${error}`);
      throw error;
    }
  }
}

export const secureWalletService = new SecureWalletService();
