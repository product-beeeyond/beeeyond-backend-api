/* eslint-disable @typescript-eslint/no-explicit-any */

import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { TransactionSignatures } from '../interface/trovotech.dto';
import logger from './logger';
/**
 * Sign a Stellar transaction with multiple keypairs
 * Returns base64-encoded signatures for Trovotech submission
 */
export async function signTrovotechTransaction(
  base64Txn: string,
  networkPassPhrase: string,
  signers: {
    primary?: Keypair;
    subwallet?: Keypair;
    linked?: Keypair;
  }
): Promise<TransactionSignatures> {
  try {
    // Parse transaction from base64 XDR
    const transaction = new Transaction(base64Txn, networkPassPhrase);

    // Calculate transaction hash
    const txHash = transaction.hash();

    const signatures: TransactionSignatures = {};

    // Sign with primary keypair if provided
    if (signers.primary) {
      const primarySig = signers.primary.sign(txHash);
      signatures.primarySignature = primarySig.toString('base64');
    }

    // Sign with subwallet keypair if provided
    if (signers.subwallet) {
      const subwalletSig = signers.subwallet.sign(txHash);
      signatures.subWalletSignature = subwalletSig.toString('base64');
    }

    // Sign with linked wallet keypair if provided
    if (signers.linked) {
      const linkedSig = signers.linked.sign(txHash);
      signatures.linkedWalletSignature = linkedSig.toString('base64');
    }

    logger.info('Successfully signed Trovotech transaction', {
      hasPrimary: !!signatures.primarySignature,
      hasSubwallet: !!signatures.subWalletSignature,
      hasLinked: !!signatures.linkedWalletSignature,
    });

    return signatures;
  } catch (error) {
    logger.error('Error signing Trovotech transaction:', error);
    throw new Error(
      `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Build query string from payment history parameters
 */
export function buildPaymentHistoryQuery(
  params: Record<string, string | number | undefined>
): string {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Validate Stellar public key format
 */
export function isValidStellarPublicKey(publicKey: string): boolean {
  if (!publicKey || typeof publicKey !== 'string') {
    return false;
  }

  // Stellar public keys are 56 characters and start with 'G'
  return publicKey.length === 56 && publicKey.startsWith('G');
}

/**
 * Validate Stellar secret key format
 */
export function isValidStellarSecretKey(secretKey: string): boolean {
  if (!secretKey || typeof secretKey !== 'string') {
    return false;
  }

  // Stellar secret keys are 56 characters and start with 'S'
  return secretKey.length === 56 && secretKey.startsWith('S');
}

/**
 * Sleep utility for retry logic
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  // Add jitter (randomness) to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return Math.floor(delay + jitter);
}

/**
 * Format Trovotech error for logging and user display
 */
export function formatTrovotechError(error: any): {
  code: string;
  message: string;
  field?: string;
} {
  if (error.error && error.message) {
    return {
      code: error.error,
      message: error.message,
      field: error.data,
    };
  }

  if (error.response?.data) {
    return formatTrovotechError(error.response.data);
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
  };
}