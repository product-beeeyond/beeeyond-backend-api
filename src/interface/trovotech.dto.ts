import { Keypair } from '@stellar/stellar-sdk';

// ==========================================
// COMPANY PROFILE TYPES
// ==========================================

export interface CompanyProfileParams {
  email: string;
  firstName: string; // Company name
  lastName?: string; // Optional for corporate
  mobile: string;
  mobileCountryCode: string;
  publicKey: string;
  primarySigner: string;
  referrer?: string;
  corporate: 1; // Always 1 for company
}

export interface CompanyProfileResponse {
  username: string;
  email: string;
  firstName: string;
  lastName?: string;
  mobile: string;
  mobileCountryCode: string;
  publicKey: string;
  primarySigner: string;
  referrer?: string;
  corporate: number;
}

// ==========================================
// SUBWALLET TYPES
// ==========================================

export interface SubwalletCreationParams {
  walletType: 0 | 1; // 0 = normal, 1 = issuing
  subwalletPublicKey: string;
  walletTag: string;
  alias?: string;
  linkedWalletPublicKey?: string; // Required if walletType = 1
}

export interface SubwalletCreationResponse {
  walletType: number;
  subwalletPublicKey: string;
  walletTag: string;
  alias: string;
  transaction: string; // Base64 XDR
  primarySignature?: string;
  subWalletMustSign: number;
  subWalletSignature?: string;
  linkedWalletMustSign: number;
  linkedWalletPublicKey?: string;
  linkedWalletSignature?: string;
  transactionId?: string;
  networkPassPhrase: string;
  messages: string[];
  feeAmount: string;
  feeCode: string;
}

// ==========================================
// TOKEN MINTING TYPES
// ==========================================

export interface MintTokenParams {
  destination: string; // Public key or Trovotech username
  memo?: string;
  assetIssuer: string;
  assetCode: string;
  amount: string;
}

export interface MintTokenResponse {
  destination: string;
  memo?: string;
  assetIssuer: string;
  assetCode: string;
  amount: string;
  transaction: string; // Base64 XDR
  transactionSignature?: string;
  transactionId?: string;
  networkPassPhrase: string;
  destinationFirstName?: string;
  destinationLastName?: string;
  destinationThumbnail?: string;
  signatureRequired: number;
  commit: number;
  messages: string[];
}

// ==========================================
// PAYMENT TYPES
// ==========================================

export interface PaymentParams {
  destination: string;
  memo?: string;
  assetIssuer: string;
  assetCode: string;
  amount: string;
}

export interface PaymentResponse {
  destination: string;
  memo?: string;
  assetIssuer: string;
  assetCode: string;
  amount: string;
  transaction: string;
  transactionSignature?: string;
  transactionId?: string;
  networkPassPhrase: string;
  destinationFirstName?: string;
  destinationLastName?: string;
  destinationThumbnail?: string;
  destinationVerified: number;
  signatureRequired: number;
  commit: number;
  fee: string;
  feeAmount: string;
  amountToPay: string;
  messages: string[];
}

// ==========================================
// BALANCE TYPES
// ==========================================

export interface BalanceAsset {
  assetIssuer: string;
  assetCode: string;
  amount: string;
  inTrade: {
    sellingLiabilities: string;
    buyingLiabilities: string;
  };
  qrCode: string;
  imageUrl: string;
  usdPrice: string;
  nativePrice: string;
  cryptoWalletDepositAddresses: CryptoDepositAddress[];
  closedGroup: string;
  quoteCurrency: string;
  tokenizedAsset: number;
}

export interface CryptoDepositAddress {
  id: string;
  createdAt: string;
  trovoWalletPublicKey: string;
  currency: string;
  depositAddress: string;
  network: string;
  qrCode: string | null;
}

export interface WalletBalance {
  claimed: BalanceAsset[];
  unclaimed: BalanceAsset[];
}

// ==========================================
// PAYMENT HISTORY TYPES
// ==========================================

export interface PaymentHistoryRecord {
  transactionDate: string;
  transactionType: string;
  from: string; // Trovotech alias and name
  fromPublicKey: string;
  to: string; // Trovotech alias and name
  toPublicKey: string;
  memo: string;
  assetIssuer: string;
  assetCode: string;
  amount: string;
  transactionId: string;
}

export interface PaymentHistoryParams {
  page?: number;
  limit?: number;
  transactionType?: 'payment' | 'swap' | 'burn token' | 'mint token';
  fromPublicKey?: string;
  toPublicKey?: string;
  assetIssuer?: string;
  assetCode?: string;
  name?: string;
  memo?: string;
  dateBetween?: string; // Format: "2020-01-01|2020-02-31"
  amount?: string; // Format: "8|2900" (range)
  transactionId?: string;
}

export interface PaymentHistoryResponse {
  pages: number;
  currentPage: number;
  totalRecords: number;
  limit: number;
  records: PaymentHistoryRecord[];
}

// ==========================================
// KYC TYPES
// ==========================================

export interface UpdateKYCParams {
  targetTrovoUsername: string;
  kycStatus: 1 | 2 | 3 | 4; // Trovotech KYC levels
  kycJsonData: string; // JSON string of raw KYC data
}

export interface UpdateKYCResponse {
  targetTrovoUsername: string;
  kycStatus: number;
  kycJsonData: string;
}

// ==========================================
// ERROR TYPES
// ==========================================

export interface TrovotechError {
  error: string;
  data?: string;
  message: string;
}

// ==========================================
// TRANSACTION SIGNING TYPES
// ==========================================

export interface TransactionSignatures {
  primarySignature?: string;
  subWalletSignature?: string;
  linkedWalletSignature?: string;
}

export interface SignTransactionParams {
  base64Txn: string;
  networkPassPhrase: string;
  signers: {
    primary?: Keypair;
    subwallet?: Keypair;
    linked?: Keypair;
  };
}