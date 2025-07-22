import twilio from 'twilio';
import logger from '../utils/logger';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '../config';

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

  async sendOTP(phoneNumber: string, otp: string): Promise<void> {
    try {
      await this.client.messages.create({
        body: `Your Beeeyond verification code is: ${otp}. This code expires in 10 minutes.`,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`OTP sent to ${phoneNumber} `);
    } catch (error) {
      logger.error('Error sending OTP:', error);
      throw error;
    }
  }

  async sendTransactionAlert(phoneNumber: string, transactionDetails: any): Promise<void> {
    try {
      const message = `Beeeyond: Your ${transactionDetails.type} of ${transactionDetails.quantity} tokens for ₦${transactionDetails.amount} has been completed.`;

      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`Transaction alert sent to ${phoneNumber} `);
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

      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(`KYC update SMS sent to ${phoneNumber} `);
    } catch (error) {
      logger.error('Error sending KYC update SMS:', error);
      throw error;
    }
  }
}

export const smsService = new SMSService();
