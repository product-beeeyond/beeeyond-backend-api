/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/trovoTechService.ts

import axios, { AxiosInstance, AxiosError } from "axios";
import { Keypair } from "@stellar/stellar-sdk";
import logger from "../utils/logger";
import { TROVOTECH_CONFIG } from "../config/trovotech";
import {
  CompanyProfileParams,
  CompanyProfileResponse,
  SubwalletCreationParams,
  SubwalletCreationResponse,
  MintTokenParams,
  MintTokenResponse,
  PaymentParams,
  PaymentResponse,
  TrovotechError,
  TransactionSignatures,
} from "../interface/trovotech.dto";
import {
  signTrovotechTransaction,
  isValidStellarPublicKey,
  sleep,
  calculateBackoffDelay,
  formatTrovotechError,
} from "../utils/trovotechHelpers";

class TrovotechService {
  private client: AxiosInstance;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor() {
    this.maxRetries = TROVOTECH_CONFIG.MAX_RETRIES;
    this.retryDelay = TROVOTECH_CONFIG.RETRY_DELAY_MS;

    // Initialize axios client
    this.client = axios.create({
      baseURL: TROVOTECH_CONFIG.API_URL,
      timeout: TROVOTECH_CONFIG.TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug("Trovotech API Request", {
          method: config.method?.toUpperCase(),
          url: config.url,
          hasApiKey: !!config.headers["X-TW-SERVICE-LINK-API-KEY"],
        });
        return config;
      },
      (error) => {
        logger.error("Trovotech request interceptor error:", error);
        return Promise.reject(error);
      },
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug("Trovotech API Response", {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        this.handleAxiosError(error);
        return Promise.reject(error);
      },
    );
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Build headers for Trovotech API requests
   */
  private buildHeaders(
    publicKey?: string,
    signer?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "X-TW-SERVICE-LINK-API-KEY": TROVOTECH_CONFIG.SERVICE_LINK_API_KEY,
    };

    if (publicKey) {
      headers["X-TW-PUBLIC-KEY"] = publicKey;
    }

    if (signer) {
      headers["X-TW-SIGNER"] = signer;
    }

    return headers;
  }

  /**
   * Handle axios errors and format them appropriately
   */
  private handleAxiosError(error: AxiosError): void {
    if (error.response) {
      // Server responded with error status
      const trovotechError = error.response.data as TrovotechError;
      logger.error("Trovotech API error:", {
        status: error.response.status,
        error: trovotechError,
      });
    } else if (error.request) {
      // Request made but no response
      logger.error("Trovotech API no response:", {
        message: error.message,
      });
    } else {
      // Error in request setup
      logger.error("Trovotech API request setup error:", {
        message: error.message,
      });
    }
  }

  /**
   * Execute API call with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        if (attempt === this.maxRetries || !isRetryable) {
          logger.error(`${operationName} failed after ${attempt} attempts`, {
            error: formatTrovotechError(error),
          });
          throw error;
        }

        const delay = calculateBackoffDelay(attempt, this.retryDelay);
        logger.warn(
          `${operationName} failed, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
          { error: formatTrovotechError(error) },
        );

        await sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors
    if (
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ENOTFOUND"
    ) {
      return true;
    }

    // HTTP errors that are retryable
    if (error.response) {
      const status = error.response.status;
      // Retry on 5xx server errors and 429 rate limit
      return status >= 500 || status === 429;
    }

    return false;
  }

  // ==========================================
  // COMPANY PROFILE OPERATIONS
  // ==========================================

  /**
   * Create company profile on Trovotech
   */
  async createCompanyProfile(
    params: CompanyProfileParams,
  ): Promise<CompanyProfileResponse> {
    return this.executeWithRetry(async () => {
      logger.info("Creating Trovotech company profile", {
        email: params.email,
        publicKey: params.publicKey,
      });

      const response = await this.client.post<CompanyProfileResponse>(
        "/v1/trovo-api/users/onboard",
        {
          email: params.email,
          firstName: params.firstName,
          lastName: params.lastName || "",
          mobile: params.mobile,
          mobileCountryCode: params.mobileCountryCode,
          publicKey: params.publicKey,
          primarySigner: params.primarySigner,
          referrer: params.referrer || "",
          corporate: 1, // Always 1 for company
        },
        {
          headers: this.buildHeaders(),
        },
      );

      logger.info("Company profile created successfully", {
        username: response.data.username,
        publicKey: response.data.publicKey,
      });

      return response.data;
    }, "createCompanyProfile");
  }

  // ==========================================
  // SUBWALLET OPERATIONS
  // ==========================================

  /**
   * Phase 1: Initiate subwallet creation (gets unsigned transaction)
   */
  async initiateSubwalletCreation(
    params: SubwalletCreationParams,
  ): Promise<SubwalletCreationResponse> {
    return this.executeWithRetry(async () => {
      if (!isValidStellarPublicKey(params.subwalletPublicKey)) {
        throw new Error("Invalid subwallet public key");
      }

      if (params.walletType === 1 && !params.linkedWalletPublicKey) {
        throw new Error("Linked wallet public key required for issuing wallet");
      }

      logger.info("Initiating subwallet creation", {
        walletType: params.walletType,
        walletTag: params.walletTag,
      });

      const response = await this.client.post<SubwalletCreationResponse>(
        "/v1/trovo-api/users/subwallet",
        {
          walletType: params.walletType,
          subwalletPublicKey: params.subwalletPublicKey,
          walletTag: params.walletTag,
          linkedWalletPublicKey: params.linkedWalletPublicKey,
        },
        {
          headers: this.buildHeaders(),
        },
      );

      logger.info(
        "Subwallet creation initiated, unsigned transaction received",
        {
          walletTag: params.walletTag,
          signatureRequired: response.data.subWalletMustSign,
          linkedRequired: response.data.linkedWalletMustSign,
        },
      );

      return response.data;
    }, "initiateSubwalletCreation");
  }

  /**
   * Phase 2: Submit signed subwallet creation transaction
   */
  async submitSubwalletCreation(
    unsignedResponse: SubwalletCreationResponse,
    signatures: TransactionSignatures,
  ): Promise<SubwalletCreationResponse> {
    return this.executeWithRetry(async () => {
      logger.info("Submitting signed subwallet creation", {
        walletTag: unsignedResponse.walletTag,
      });

      const response = await this.client.post<SubwalletCreationResponse>(
        "/v1/trovo-api/users/subwallet",
        {
          ...unsignedResponse,
          primarySignature: signatures.primarySignature,
          subWalletSignature: signatures.subWalletSignature,
          linkedWalletSignature: signatures.linkedWalletSignature,
        },
        {
          headers: this.buildHeaders(),
        },
      );

      logger.info("Subwallet created successfully", {
        walletTag: unsignedResponse.walletTag,
        alias: response.data.alias,
        transactionId: response.data.transactionId,
      });

      return response.data;
    }, "submitSubwalletCreation");
  }

  /**
   * Complete subwallet creation (both phases)
   */
  async createSubwallet(
    params: SubwalletCreationParams,
    signers: {
      primary: Keypair;
      subwallet?: Keypair;
      linked?: Keypair;
    },
  ): Promise<SubwalletCreationResponse> {
    // Phase 1: Get unsigned transaction
    const unsignedResponse = await this.initiateSubwalletCreation(params);

    // Sign the transaction
    const signatures = await signTrovotechTransaction(
      unsignedResponse.transaction,
      unsignedResponse.networkPassPhrase,
      signers,
    );

    // Phase 2: Submit signed transaction
    const finalResponse = await this.submitSubwalletCreation(
      unsignedResponse,
      signatures,
    );

    return finalResponse;
  }

  // ==========================================
  // TOKEN MINTING OPERATIONS
  // ==========================================

  /**
   * Phase 1: Initiate token minting (gets unsigned transaction)
   */
  async initiateMint(
    params: MintTokenParams,
    issuerPublicKey: string,
  ): Promise<MintTokenResponse> {
    return this.executeWithRetry(async () => {
      if (!isValidStellarPublicKey(params.assetIssuer)) {
        throw new Error("Invalid asset issuer public key");
      }

      logger.info("Initiating token mint", {
        assetCode: params.assetCode,
        amount: params.amount,
        destination: params.destination,
      });

      const response = await this.client.post<MintTokenResponse>(
        "/v1/trovo-api/tokens/mint",
        {
          destination: params.destination,
          memo: params.memo || "",
          assetIssuer: params.assetIssuer,
          assetCode: params.assetCode,
          amount: params.amount,
        },
        {
          headers: this.buildHeaders(issuerPublicKey, issuerPublicKey),
        },
      );

      logger.info("Mint initiated, unsigned transaction received", {
        assetCode: params.assetCode,
        signatureRequired: response.data.signatureRequired,
      });

      return response.data;
    }, "initiateMint");
  }

  /**
   * Phase 2: Submit signed mint transaction
   */
  async submitMint(
    unsignedResponse: MintTokenResponse,
    signature: string,
    issuerPublicKey: string,
    commit: number = 0,
  ): Promise<MintTokenResponse> {
    return this.executeWithRetry(async () => {
      logger.info("Submitting signed mint transaction", {
        assetCode: unsignedResponse.assetCode,
        commit,
      });

      const response = await this.client.post<MintTokenResponse>(
        "/v1/trovo-api/tokens/mint",
        {
          ...unsignedResponse,
          transactionSignature: signature,
          commit,
        },
        {
          headers: this.buildHeaders(issuerPublicKey, issuerPublicKey),
        },
      );

      logger.info("Mint completed successfully", {
        assetCode: unsignedResponse.assetCode,
        transactionId: response.data.transactionId,
      });

      return response.data;
    }, "submitMint");
  }

  /**
   * Complete token minting (both phases)
   */
  async mintTokens(
    params: MintTokenParams,
    issuerKeypair: Keypair,
    commit: number = 0,
  ): Promise<MintTokenResponse> {
    const issuerPublicKey = issuerKeypair.publicKey();

    // Phase 1: Get unsigned transaction
    const unsignedResponse = await this.initiateMint(params, issuerPublicKey);

    // Sign the transaction
    const signatures = await signTrovotechTransaction(
      unsignedResponse.transaction,
      unsignedResponse.networkPassPhrase,
      { primary: issuerKeypair },
    );

    if (!signatures.primarySignature) {
      throw new Error("Failed to generate primary signature for mint");
    }

    // Phase 2: Submit signed transaction
    const finalResponse = await this.submitMint(
      unsignedResponse,
      signatures.primarySignature,
      issuerPublicKey,
      commit,
    );

    return finalResponse;
  }

  // ==========================================
  // PAYMENT OPERATIONS
  // ==========================================

  /**
   * Phase 1: Initiate payment (gets unsigned transaction)
   */
  async initiatePayment(
    params: PaymentParams,
    senderPublicKey: string,
    signerPublicKey: string,
  ): Promise<PaymentResponse> {
    return this.executeWithRetry(async () => {
      if (!isValidStellarPublicKey(senderPublicKey)) {
        throw new Error("Invalid sender public key");
      }

      logger.info("Initiating payment", {
        assetCode: params.assetCode,
        amount: params.amount,
        destination: params.destination,
      });

      const response = await this.client.post<PaymentResponse>(
        "/v1/trovo-api/users/payment",
        {
          destination: params.destination,
          memo: params.memo || "",
          assetIssuer: params.assetIssuer,
          assetCode: params.assetCode,
          amount: params.amount,
        },
        {
          headers: this.buildHeaders(senderPublicKey, signerPublicKey),
        },
      );

      logger.info("Payment initiated, unsigned transaction received", {
        assetCode: params.assetCode,
        signatureRequired: response.data.signatureRequired,
        fee: response.data.feeAmount,
      });

      return response.data;
    }, "initiatePayment");
  }

  /**
   * Phase 2: Submit signed payment transaction
   */
  async submitPayment(
    unsignedResponse: PaymentResponse,
    signature: string,
    senderPublicKey: string,
    signerPublicKey: string,
    commit: number = 0,
  ): Promise<PaymentResponse> {
    return this.executeWithRetry(async () => {
      logger.info("Submitting signed payment", {
        assetCode: unsignedResponse.assetCode,
        commit,
      });

      const response = await this.client.post<PaymentResponse>(
        "/v1/trovo-api/users/payment",
        {
          ...unsignedResponse,
          transactionSignature: signature,
          commit,
        },
        {
          headers: this.buildHeaders(senderPublicKey, signerPublicKey),
        },
      );

      logger.info("Payment completed successfully", {
        assetCode: unsignedResponse.assetCode,
        transactionId: response.data.transactionId,
      });

      return response.data;
    }, "submitPayment");
  }

  /**
   * Complete payment (both phases)
   */
  async sendPayment(
    params: PaymentParams,
    senderPublicKey: string,
    signerKeypair: Keypair,
    commit: number = 0,
  ): Promise<PaymentResponse> {
    const signerPublicKey = signerKeypair.publicKey();

    // Phase 1: Get unsigned transaction
    const unsignedResponse = await this.initiatePayment(
      params,
      senderPublicKey,
      signerPublicKey,
    );

    // Sign the transaction
    const signatures = await signTrovotechTransaction(
      unsignedResponse.transaction,
      unsignedResponse.networkPassPhrase,
      { primary: signerKeypair },
    );

    if (!signatures.primarySignature) {
      throw new Error("Failed to generate signature for payment");
    }

    // Phase 2: Submit signed transaction
    const finalResponse = await this.submitPayment(
      unsignedResponse,
      signatures.primarySignature,
      senderPublicKey,
      signerPublicKey,
      commit,
    );

    return finalResponse;
  }
}

export const trovotechService = new TrovotechService();
