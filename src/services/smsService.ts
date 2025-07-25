import twilio from 'twilio';
import logger from '../utils/logger';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '../config';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

enum TwilioErrorCode {
  INVALID_PHONE_NUMBER = 21211,
  UNVERIFIED_PHONE_NUMBER = 21408,
  INSUFFICIENT_BALANCE = 20003,
  RATE_LIMIT_EXCEEDED = 20429,
  INVALID_FROM_NUMBER = 21212,
  MESSAGE_TOO_LONG = 21617
}

class SMSService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    this.client = twilio(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN
    );
    this.fromNumber = TWILIO_PHONE_NUMBER!;
  }

  // Enhanced error handling method
  private handleTwilioError(error: any): never {
    const errorCode = error.code;
    const errorMessage = error.message;

    switch (errorCode) {
      case TwilioErrorCode.INVALID_PHONE_NUMBER:
        logger.error(`Invalid phone number: ${errorMessage}`);
        throw new Error('Invalid phone number format');

      case TwilioErrorCode.INSUFFICIENT_BALANCE:
        logger.error('Insufficient Twilio balance');
        throw new Error('SMS service temporarily unavailable');

      case TwilioErrorCode.RATE_LIMIT_EXCEEDED:
        logger.error('Twilio rate limit exceeded');
        throw new Error('Too many SMS requests. Please try again later');

      case TwilioErrorCode.MESSAGE_TOO_LONG:
        logger.error('SMS message too long');
        throw new Error('Message content too long for SMS');

      default:
        logger.error(`Twilio error: ${errorCode} - ${errorMessage}`);
        throw error;
    }
  }

  // Retry mechanism with exponential backoff
  private async sendWithRetry(
    messageData: any,
    retryConfig: RetryConfig = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }
  ): Promise<void> {
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        await this.client.messages.create(messageData);
        return;
      } catch (error: any) {
        if (attempt === retryConfig.maxRetries) {
          this.handleTwilioError(error);
        }

        // Don't retry on certain errors
        if (error.code === TwilioErrorCode.INVALID_PHONE_NUMBER ||
          error.code === TwilioErrorCode.INSUFFICIENT_BALANCE ||
          error.code === TwilioErrorCode.MESSAGE_TOO_LONG) {
          this.handleTwilioError(error);
        }

        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(2, attempt),
          retryConfig.maxDelay
        );

        logger.warn(`SMS send attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<void> {
    try {
      await this.sendWithRetry({
        body: `Your Beeeyond verification code is: ${otp}. This code expires in 10 minutes.`,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`OTP sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending OTP:', error);
      throw error;
    }
  }

  async sendTransactionAlert(phoneNumber: string, transactionDetails: any): Promise<void> {
    try {
      const message = `Beeeyond: Your ${transactionDetails.type} of ${transactionDetails.quantity} tokens for ₦${transactionDetails.amount} has been completed.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Transaction alert sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending transaction alert:', error);
      throw error;
    }
  }

  async sendKYCUpdate(phoneNumber: string, status: string): Promise<void> {
    try {
      const message = status === 'verified'
        ? 'Beeeyond: Your KYC verification has been approved! You can now invest in properties.'
        : 'Beeeyond: Your KYC verification needs attention. Please check your dashboard.';

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`KYC update SMS sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending KYC update SMS:', error);
      throw error;
    }
  }

  async sendWelcomeSMS(phoneNumber: string, firstName: string): Promise<void> {
    try {
      const message = `Welcome to Beeeyond, ${firstName}! Start investing in real estate from ₦10,000. Complete your KYC to begin. Reply STOP to opt out.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Welcome SMS sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending welcome SMS:', error);
      throw error;
    }
  }

  async sendPasswordResetAlert(phoneNumber: string, firstName: string): Promise<void> {
    try {
      const message = `Hi ${firstName}, your Beeeyond password was reset successfully. If this wasn't you, contact support immediately.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Password reset alert sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending password reset alert:', error);
      throw error;
    }
  }

  async sendLoginAlert(phoneNumber: string, firstName: string, location?: string): Promise<void> {
    try {
      const locationText = location ? ` from ${location}` : '';
      const message = `Beeeyond login detected${locationText}. If this wasn't you, secure your account immediately.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Login alert sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending login alert:', error);
      throw error;
    }
  }

  async sendInvestmentReminder(phoneNumber: string, firstName: string, propertyName: string): Promise<void> {
    try {
      const message = `Hi ${firstName}, ${propertyName} tokens are still available for investment. Don't miss out! View details in your app.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Investment reminder sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending investment reminder:', error);
      throw error;
    }
  }

  async sendMaintenanceNotification(phoneNumber: string, maintenanceWindow: string): Promise<void> {
    try {
      const message = `Beeeyond maintenance scheduled: ${maintenanceWindow}. Some features may be temporarily unavailable. We'll notify you when complete.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Maintenance notification sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending maintenance notification:', error);
      throw error;
    }
  }

  async sendPromotionalMessage(phoneNumber: string, firstName: string, offer: string): Promise<void> {
    try {
      const message = `${firstName}, ${offer} Limited time offer on Beeeyond! Reply STOP to opt out of promotions.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Promotional message sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending promotional message:', error);
      throw error;
    }
  }

  async sendAccountSuspensionAlert(phoneNumber: string, firstName: string, reason: string): Promise<void> {
    try {
      const message = `${firstName}, your Beeeyond account has been suspended: ${reason}. Contact support to resolve this issue.`;

      await this.sendWithRetry({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Account suspension alert sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('Error sending account suspension alert:', error);
      throw error;
    }
  }
}

export const smsService = new SMSService();
// import twilio from 'twilio';
// import logger from '../utils/logger';
// import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '../config';

// class SMSService {
//   private client: twilio.Twilio;
//   private fromNumber: string;

//   constructor() {
//     this.client = twilio(
//       TWILIO_ACCOUNT_SID,
//       TWILIO_AUTH_TOKEN
//     );
//     this.fromNumber = TWILIO_PHONE_NUMBER!;
//   }

//   async sendOTP(phoneNumber: string, otp: string): Promise<void> {
//     try {
//       await this.client.messages.create({
//         body: `Your Beeeyond verification code is: ${otp}. This code expires in 10 minutes.`,
//         from: this.fromNumber,
//         to: phoneNumber,
//       });

//       logger.info(`OTP sent to ${phoneNumber} `);
//     } catch (error) {
//       logger.error('Error sending OTP:', error);
//       throw error;
//     }
//   }

//   async sendTransactionAlert(phoneNumber: string, transactionDetails: any): Promise<void> {
//     try {
//       const message = `Beeeyond: Your ${transactionDetails.type} of ${transactionDetails.quantity} tokens for ₦${transactionDetails.amount} has been completed.`;

//       await this.client.messages.create({
//         body: message,
//         from: this.fromNumber,
//         to: phoneNumber,
//       });

//       logger.info(`Transaction alert sent to ${phoneNumber} `);
//     } catch (error) {
//       logger.error('Error sending transaction alert:', error);
//       throw error;
//     }
//   }

//   async sendKYCUpdate(phoneNumber: string, status: string): Promise<void> {
//     try {
//       const message = status === 'verified'
//         ? 'Beeeyond: Your KYC verification has been approved! You can now invest in properties.'
//         : 'Beeeyond: Your KYC verification needs attention. Please check your dashboard.';

//       await this.client.messages.create({
//         body: message,
//         from: this.fromNumber,
//         to: phoneNumber,
//       });

//       logger.info(`KYC update SMS sent to ${phoneNumber} `);
//     } catch (error) {
//       logger.error('Error sending KYC update SMS:', error);
//       throw error;
//     }
//   }
// }

// export const smsService = new SMSService();
