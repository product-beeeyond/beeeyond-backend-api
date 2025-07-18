import { Resend } from 'resend';
import logger from '../utils/logger';

class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'Beeeyond <noreply@beeeyond.com>',
        to: [email],
        subject: 'Welcome to Beeeyond - Start Your Real Estate Investment Journey',
        html: this.getWelcomeEmailTemplate(firstName),
      });

      logger.info(`Welcome email sent to ${email} `);
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw error;
    }
  }

  async sendKYCStatusEmail(email: string, firstName: string, status: string): Promise<void> {
    try {
      const subject = status === 'verified'
        ? 'KYC Verification Approved'
        : 'KYC Verification Update';

      await this.resend.emails.send({
        from: 'Beeeyond <noreply@beeeyond.com>',
        to: [email],
        subject,
        html: this.getKYCStatusEmailTemplate(firstName, status),
      });

      logger.info(`KYC status email sent to ${email} `);
    } catch (error) {
      logger.error('Error sending KYC status email:', error);
      throw error;
    }
  }

  async sendTransactionConfirmation(
    email: string,
    firstName: string,
    transactionDetails: any
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'Beeeyond <noreply@beeeyond.com>',
        to: [email],
        subject: 'Transaction Confirmation',
        html: this.getTransactionEmailTemplate(firstName, transactionDetails),
      });

      logger.info(`Transaction confirmation email sent to ${email} `);
    } catch (error) {
      logger.error('Error sending transaction confirmation email:', error);
      throw error;
    }
  }

  private getWelcomeEmailTemplate(firstName: string): string {
    return `
  < !DOCTYPE html >
    <html>
    <head>
    <style>
    body { font - family: Arial, sans - serif; line - height: 1.6; color: #333; }
            .container { max - width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text - align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { background: #2563eb; color: white; padding: 12px 24px; text - decoration: none; border - radius: 5px; display: inline - block; margin: 10px 0; }
</style>
  </head>
  < body >
  <div class="container" >
    <div class="header" >
      <h1>Welcome to Beeeyond! </h1>
        </div>
        < div class="content" >
          <h2>Hello ${firstName}, </h2>
            < p > Thank you for joining Beeeyond, Nigeria's premier real estate tokenization platform.</p>
              < p > With Beeeyond, you can: </p>
                < ul >
                <li>Invest in premium real estate from just ₦10,000 </li>
                  < li > Earn passive income through rental yields </li>
                    < li > Trade property tokens on our marketplace </li>
                      < li > Build a diversified real estate portfolio </li>
                        </ul>
                        < p > To get started, complete your KYC verification to unlock all features.</p>
                          < a href = "${process.env.FRONTEND_URL}/kyc" class="button" > Complete KYC Verification </a>
                            < p > If you have any questions, our support team is here to help.</p>
                              < p > Best regards, <br>The Beeeyond Team </p>
                                </div>
                                </div>
                                </body>
                                </html>
                                  `;
  }

  private getKYCStatusEmailTemplate(firstName: string, status: string): string {
    const isApproved = status === 'verified';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const statusText = isApproved ? 'Approved' : 'Requires Attention';

    return `
                                < !DOCTYPE html >
                                  <html>
                                  <head>
                                  <style>
                                  body { font - family: Arial, sans - serif; line - height: 1.6; color: #333; }
            .container { max - width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${statusColor}; color: white; padding: 20px; text - align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { background: #2563eb; color: white; padding: 12px 24px; text - decoration: none; border - radius: 5px; display: inline - block; margin: 10px 0; }
</style>
  </head>
  < body >
  <div class="container" >
    <div class="header" >
      <h1>KYC Verification ${statusText} </h1>
        </div>
        < div class="content" >
          <h2>Hello ${firstName}, </h2>
              ${isApproved
        ? `<p>Congratulations! Your KYC verification has been approved. You can now access all Beeeyond features including property investments and withdrawals.</p>
                   <a href="${process.env.FRONTEND_URL}/properties" class="button">Start Investing</a>`
        : `<p>Your KYC verification requires additional information. Please check your dashboard for details on what's needed.</p>
                   <a href="${process.env.FRONTEND_URL}/kyc" class="button">Update KYC Information</a>`
      }
<p>Best regards, <br>The Beeeyond Team </p>
  </div>
  </div>
  </body>
  </html>
    `;
  }

  private getTransactionEmailTemplate(firstName: string, transactionDetails: any): string {
    return `
  < !DOCTYPE html >
    <html>
    <head>
    <style>
    body { font - family: Arial, sans - serif; line - height: 1.6; color: #333; }
            .container { max - width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; text - align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .transaction - details { background: white; padding: 15px; border - radius: 5px; margin: 15px 0; }
</style>
  </head>
  < body >
  <div class="container" >
    <div class="header" >
      <h1>Transaction Successful </h1>
        </div>
        < div class="content" >
          <h2>Hello ${firstName}, </h2>
            < p > Your transaction has been processed successfully.</p>
              < div class="transaction-details" >
                <h3>Transaction Details: </h3>
                  < p > <strong>Type: </strong> ${transactionDetails.type}</p >
                    <p><strong>Property: </strong> ${transactionDetails.propertyTitle}</p >
                      <p><strong>Quantity: </strong> ${transactionDetails.quantity} tokens</p >
                        <p><strong>Amount: </strong> ₦${transactionDetails.amount}</p >
                          <p><strong>Date: </strong> ${new Date().toLocaleDateString()}</p >
                            </div>
                            < p > You can view your complete portfolio and transaction history in your dashboard.</p>
                              < p > Best regards, <br>The Beeeyond Team </p>
                                </div>
                                </div>
                                </body>
                                </html>
                                  `;
  }
}

export const emailService = new EmailService();
