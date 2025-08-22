/* eslint-disable @typescript-eslint/no-explicit-any */
import { Resend } from 'resend';
import logger from '../utils/logger';
import { RESEND_API_KEY, FRONTEND_URL, FROM_EMAIL } from '../config';

interface MultisigNotificationData {
  proposalId: string;
  description: string;
  walletType: string;
  propertyId?: string;
}

interface GovernanceNotificationData {
  proposalId: string;
  title: string;
  propertyTitle: string;
  votingEndAt: Date;
}

interface RevenueDistributionData {
  propertyId: string;
  totalRevenue: number;
  userShare: number;
  distributionPeriod: string;
}

class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(RESEND_API_KEY);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  private getBaseTemplate(content: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Beeeyond Platform</title>
      <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background: #f8f9fa; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .alert { padding: 15px; margin: 15px 0; border-radius: 5px; }
        .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏢 Beeeyond</h1>
          <p>Real Estate Investment Made Simple</p>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>&copy; 2025 Beeeyond. All rights reserved.</p>
          <p><a href="${FRONTEND_URL}" style="color: #2563eb;">Visit Platform</a></p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: FROM_EMAIL as string,
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
        from: FROM_EMAIL as string,
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
        from: FROM_EMAIL as string,
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

  async sendOTP(
    email: string,
    firstName: string | undefined,
    otp: string,
    purpose: 'verification' | 'password_reset' | 'login' = 'verification'
  ): Promise<void> {
    try {
      const subjects = {
        verification: 'Email Verification - OTP Code',
        password_reset: 'Password Reset - OTP Code',
        login: 'Login Verification - OTP Code'
      };

      await this.resend.emails.send({
        from: FROM_EMAIL as string,
        to: [email],
        subject: subjects[purpose],
        html: this.getOTPEmailTemplate(firstName, otp, purpose),
      });

      logger.info(`OTP email sent to ${email} for ${purpose}`);
      return;
    } catch (error) {
      logger.error('Error sending OTP email:', error);
      throw error;
    }
  }

  // ===========================================
  // MULTISIG NOTIFICATIONS
  // ===========================================

  async sendMultisigNotification(
    email: string,
    firstName: string,
    notificationType: 'new_proposal' | 'ready_for_execution' | 'executed' | 'expired',
    data: MultisigNotificationData
  ): Promise<void> {
    try {
      let subject = '';
      let content = '';

      switch (notificationType) {
        case 'new_proposal':
          subject = '🔒 New Multisig Transaction Proposal';
          content = `
            <h2>New Multisig Transaction Proposal</h2>
            <p>Hello ${firstName},</p>
            <p>A new multisig transaction has been proposed that requires your signature:</p>
            
            <div class="alert alert-info">
              <strong>Proposal ID:</strong> ${data.proposalId}<br>
              <strong>Description:</strong> ${data.description}<br>
              <strong>Wallet Type:</strong> ${data.walletType}<br>
              ${data.propertyId ? `<strong>Property ID:</strong> ${data.propertyId}<br>` : ''}
            </div>

            <p>Please review and sign this transaction if you approve.</p>
            <a href="${FRONTEND_URL}/multisig/proposals/${data.proposalId}" class="button">
              Review Proposal
            </a>

            <div class="alert alert-warning">
              <strong>Important:</strong> Only sign transactions you understand and approve of. 
              Verify all details before signing.
            </div>
          `;
          break;

        case 'ready_for_execution':
          subject = '✅ Multisig Transaction Ready for Execution';
          content = `
            <h2>Transaction Ready for Execution</h2>
            <p>Hello ${firstName},</p>
            <p>A multisig transaction has received enough signatures and is ready for execution:</p>
            
            <div class="alert alert-success">
              <strong>Proposal ID:</strong> ${data.proposalId}<br>
              <strong>Description:</strong> ${data.description}<br>
              <strong>Wallet Type:</strong> ${data.walletType}
            </div>

            <a href="${FRONTEND_URL}/multisig/proposals/${data.proposalId}" class="button">
              Execute Transaction
            </a>
          `;
          break;

        case 'executed':
          subject = '🎉 Multisig Transaction Executed';
          content = `
            <h2>Transaction Successfully Executed</h2>
            <p>Hello ${firstName},</p>
            <p>A multisig transaction has been successfully executed:</p>
            
            <div class="alert alert-success">
              <strong>Proposal ID:</strong> ${data.proposalId}<br>
              <strong>Description:</strong> ${data.description}<br>
              <strong>Status:</strong> Completed
            </div>

            <a href="${FRONTEND_URL}/multisig/history" class="button">
              View Transaction History
            </a>
          `;
          break;

        case 'expired':
          subject = '⏰ Multisig Transaction Expired';
          content = `
            <h2>Transaction Proposal Expired</h2>
            <p>Hello ${firstName},</p>
            <p>A multisig transaction proposal has expired without receiving enough signatures:</p>
            
            <div class="alert alert-warning">
              <strong>Proposal ID:</strong> ${data.proposalId}<br>
              <strong>Description:</strong> ${data.description}<br>
              <strong>Status:</strong> Expired
            </div>

            <p>If this transaction is still needed, a new proposal must be created.</p>
          `;
          break;
      }

      const html = this.getBaseTemplate(content);
      
      await this.resend.emails.send({
        from: FROM_EMAIL as string,
        to: [email],
        subject,
        html,
      });

      logger.info(`Multisig notification email sent to ${email}: ${notificationType}`);
    } catch (error) {
      logger.error('Error sending multisig notification email:', error);
      throw error;
    }
  }

  // ===========================================
  // GOVERNANCE NOTIFICATIONS
  // ===========================================

  async sendGovernanceNotification(
    email: string,
    firstName: string,
    notificationType: 'new_proposal' | 'voting_reminder' | 'proposal_passed' | 'proposal_rejected',
    data: GovernanceNotificationData
  ): Promise<void> {
    try {
      let subject = '';
      let content = '';

      switch (notificationType) {
        case 'new_proposal':
          subject = '🗳️ New Governance Proposal';
          content = `
            <h2>New Governance Proposal</h2>
            <p>Hello ${firstName},</p>
            <p>A new governance proposal has been created for a property you own tokens in:</p>
            
            <div class="alert alert-info">
              <strong>Property:</strong> ${data.propertyTitle}<br>
              <strong>Proposal:</strong> ${data.title}<br>
              <strong>Voting Ends:</strong> ${data.votingEndAt.toLocaleDateString()} at ${data.votingEndAt.toLocaleTimeString()}
            </div>

            <p>Your participation in governance helps shape the future of your investment.</p>
            
            <a href="${FRONTEND_URL}/governance/proposals/${data.proposalId}" class="button">
              Vote Now
            </a>

            <div class="alert alert-warning">
              <strong>Reminder:</strong> Voting power is proportional to your token holdings.
            </div>
          `;
          break;

        case 'voting_reminder':
          subject = '⏰ Governance Voting Reminder';
          content = `
            <h2>Don't Forget to Vote!</h2>
            <p>Hello ${firstName},</p>
            <p>Voting is ending soon for this governance proposal:</p>
            
            <div class="alert alert-warning">
              <strong>Property:</strong> ${data.propertyTitle}<br>
              <strong>Proposal:</strong> ${data.title}<br>
              <strong>Voting Ends:</strong> ${data.votingEndAt.toLocaleDateString()} at ${data.votingEndAt.toLocaleTimeString()}
            </div>

            <a href="${FRONTEND_URL}/governance/proposals/${data.proposalId}" class="button">
              Cast Your Vote
            </a>
          `;
          break;

        case 'proposal_passed':
          subject = '✅ Governance Proposal Passed';
          content = `
            <h2>Proposal Approved by Token Holders</h2>
            <p>Hello ${firstName},</p>
            <p>A governance proposal you voted on has passed:</p>
            
            <div class="alert alert-success">
              <strong>Property:</strong> ${data.propertyTitle}<br>
              <strong>Proposal:</strong> ${data.title}<br>
              <strong>Status:</strong> Approved for execution
            </div>

            <p>Implementation will begin according to the proposal timeline.</p>
          `;
          break;

        case 'proposal_rejected':
          subject = '❌ Governance Proposal Rejected';
          content = `
            <h2>Proposal Not Approved</h2>
            <p>Hello ${firstName},</p>
            <p>A governance proposal did not receive enough support:</p>
            
            <div class="alert alert-warning">
              <strong>Property:</strong> ${data.propertyTitle}<br>
              <strong>Proposal:</strong> ${data.title}<br>
              <strong>Status:</strong> Rejected
            </div>

            <p>The proposal will not be implemented. Thank you for participating in governance.</p>
          `;
          break;
      }

      const html = this.getBaseTemplate(content);
      
      await this.resend.emails.send({
        from: FROM_EMAIL as string,
        to: [email],
        subject,
        html,
      });

      logger.info(`Governance notification email sent to ${email}: ${notificationType}`);
    } catch (error) {
      logger.error('Error sending governance notification email:', error);
      throw error;
    }
  }

  // ===========================================
  // REVENUE DISTRIBUTION NOTIFICATIONS
  // ===========================================

  async sendRevenueDistributionNotification(
    email: string,
    firstName: string,
    data: RevenueDistributionData
  ): Promise<void> {
    try {
      const subject = '💰 Revenue Distribution Notification';
      const content = `
        <h2>Revenue Distribution</h2>
        <p>Hello ${firstName},</p>
        <p>Great news! A revenue distribution has been processed for one of your property investments.</p>
        
        <div class="alert alert-success">
          <strong>Property ID:</strong> ${data.propertyId}<br>
          <strong>Total Revenue:</strong> ₦${data.totalRevenue.toLocaleString()}<br>
          <strong>Your Share:</strong> ₦${data.userShare.toLocaleString()}<br>
          <strong>Distribution Period:</strong> ${data.distributionPeriod}
        </div>

        <p>The distribution will be processed to your Stellar wallet within 24 hours.</p>

        <a href="${FRONTEND_URL}/portfolio" class="button">
          View Portfolio
        </a>

        <div class="alert alert-info">
          <strong>Note:</strong> This distribution is based on your token holdings at the time of the snapshot.
        </div>
      `;

      const html = this.getBaseTemplate(content);
      
      await this.resend.emails.send({
        from: FROM_EMAIL as string,
        to: [email],
        subject,
        html,
      });

      logger.info(`Revenue distribution notification email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending revenue distribution notification email:', error);
      throw error;
    }
  }

  // ===========================================
  // EXISTING TEMPLATE METHODS
  // ===========================================

  private getWelcomeEmailTemplate(firstName: string): string {
    return `
  <!DOCTYPE html>
    <html>
    <head>
    <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
    </style>
  </head>
  <body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Beeeyond!</h1>
        </div>
        <div class="content">
          <h2>Hello ${firstName},</h2>
            <p>Thank you for joining Beeeyond, Nigeria's premier real estate tokenization platform.</p>
              <p>With Beeeyond, you can:</p>
                <ul>
                <li>Invest in premium real estate from just ₦10,000</li>
                  <li>Earn passive income through rental yields</li>
                    <li>Trade property tokens on our marketplace</li>
                      <li>Build a diversified real estate portfolio</li>
                        </ul>
                        <p>To get started, complete your KYC verification to unlock all features.</p>
                          <a href="${FRONTEND_URL}/kyc" class="button">Complete KYC Verification</a>
                            <p>If you have any questions, our support team is here to help.</p>
                              <p>Best regards,<br>The Beeeyond Team</p>
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
                                <!DOCTYPE html>
                                  <html>
                                  <head>
                                  <style>
                                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${statusColor}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
    </style>
  </head>
  <body>
  <div class="container">
    <div class="header">
      <h1>KYC Verification ${statusText}</h1>
        </div>
        <div class="content">
          <h2>Hello ${firstName},</h2>
              ${isApproved
        ? `<p>Congratulations! Your KYC verification has been approved. You can now access all Beeeyond features including property investments and withdrawals.</p>
                   <a href="${FRONTEND_URL}/properties" class="button">Start Investing</a>`
        : `<p>Your KYC verification requires additional information. Please check your dashboard for details on what's needed.</p>
                   <a href="${FRONTEND_URL}/kyc" class="button">Update KYC Information</a>`
      }
<p>Best regards,<br>The Beeeyond Team</p>
  </div>
  </div>
  </body>
  </html>
    `;
  }

  private getTransactionEmailTemplate(firstName: string, transactionDetails: any): string {
    return `
  <!DOCTYPE html>
    <html>
    <head>
    <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .transaction-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
  </head>
  <body>
  <div class="container">
    <div class="header">
      <h1>Transaction Successful</h1>
        </div>
        <div class="content">
          <h2>Hello ${firstName},</h2>
            <p>Your transaction has been processed successfully.</p>
              <div class="transaction-details">
                <h3>Transaction Details:</h3>
                  <p><strong>Type:</strong> ${transactionDetails.type}</p>
                    <p><strong>Property:</strong> ${transactionDetails.propertyTitle}</p>
                      <p><strong>Quantity:</strong> ${transactionDetails.quantity} tokens</p>
                        <p><strong>Amount:</strong> ₦${transactionDetails.amount}</p>
                          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                            </div>
                            <p>You can view your complete portfolio and transaction history in your dashboard.</p>
                              <p>Best regards,<br>The Beeeyond Team</p>
                                </div>
                                </div>
                                </body>
                                </html>
                                  `;
  }

  private getOTPEmailTemplate(
    firstName: string | undefined,
    otp: string,
    purpose: 'verification' | 'password_reset' | 'login'
  ): string {
    const purposeText = {
      verification: 'verify your email address',
      password_reset: 'reset your password',
      login: 'complete your login'
    };

    const headerText = {
      verification: 'Email Verification',
      password_reset: 'Password Reset',
      login: 'Login Verification'
    };

    return `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .otp-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: center;
      border: 2px dashed #2563eb;
    }
    .otp-code {
      font-size: 32px;
      font-weight: bold;
      color: #2563eb;
      letter-spacing: 8px;
      margin: 10px 0;
    }
    .warning {
      background: #fef3cd;
      color: #856404;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
      border-left: 4px solid #ffc107;
    }
    .footer {
      font-size: 12px;
      color: #666;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    </style>
    </head>
    <body>
    <div class="container">
      <div class="header">
        <h1>${headerText[purpose]}</h1>
      </div>
      <div class="content">
        <h2>Hello ${firstName ?? "there"},</h2>
        <p>You requested to ${purposeText[purpose]} on Beeeyond. Please use the OTP code below:</p>

        <div class="otp-container">
          <p style="margin: 0; font-size: 16px; color: #666;">Your verification code is:</p>
          <div class="otp-code">${otp}</div>
          <p style="margin: 0; font-size: 14px; color: #666;">This code will expire in 10 minutes</p>
        </div>

        <div class="warning">
          <strong>Security Notice:</strong> Never share this code with anyone. Beeeyond will never ask for your OTP via phone or email.
        </div>

        <p>If you didn't request this code, please ignore this email or contact our support team if you have concerns about your account security.</p>

        <p>Best regards,<br>The Beeeyond Team</p>

        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>Need help? Contact us at support@beeeyond.com</p>
        </div>
      </div>
    </div>
    </body>
    </html>
    `;
  }


// src/templates/emails/recovery-rejected.hbs
/*
<!DOCTYPE html>
<html>
<head>
    <title>Recovery Request Rejected</title>
</head>
<body>
    <h2>❌ Your Wallet Recovery Request Has Been Rejected</h2>
    
    <p>Hello {{userName}},</p>
    
    <p>We regret to inform you that your wallet recovery request has been rejected by our admin team.</p>
    
    <div style="background: #f8d7da; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #dc3545;">
        <h3>Rejection Details:</h3>
        <p><strong>Reason:</strong> {{reason}}</p>
        <p><strong>Rejected By:</strong> {{rejectedBy}}</p>
        <p><strong>Rejected At:</strong> {{rejectedAt}}</p>
        <p><strong>Request ID:</strong> {{recoveryRequestId}}</p>
    </div>
    
    <p>If you believe this rejection was made in error or if you have additional information that might help, you may submit a new recovery request.</p>
    
    <p>
        <a href="{{newRequestUrl}}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Submit New Request
        </a>
    </p>
    
    <p>For questions about this decision, please contact our support team.</p>
    
    <p>Best regards,<br>Beeeyond Security Team</p>
</body>
</html>
*/

// src/templates/emails/recovery-force-executed.hbs
/*
<!DOCTYPE html>
<html>
<head>
    <title>ALERT: Force Recovery Execution</title>
</head>
<body>
    <h2>⚠️ SECURITY ALERT: Force Recovery Execution</h2>
    
    <p>Hello {{adminName}},</p>
    
    <p><strong>ALERT:</strong> A wallet recovery has been force executed, bypassing normal security protocols.</p>
    
    <div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #ffc107;">
        <h3>Force Execution Details:</h3>
        <p><strong>User:</strong> {{userName}} ({{userEmail}})</p>
        <p><strong>Executed By:</strong> {{executedBy}}</p>
        <p><strong>Reason:</strong> {{reason}}</p>
        <p><strong>Request ID:</strong> {{recoveryRequestId}}</p>
        <p><strong>Timestamp:</strong> {{executedAt}}</p>
    </div>
    
    <p><strong>WARNING:</strong> This action bypassed the normal approval and time-lock requirements. Please review this action immediately.</p>
    
    <p>
        <a href="{{dashboardUrl}}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Review Force Execution
        </a>
    </p>
    
    <p>If this action was not authorized, please escalate immediately.</p>
    
    <p>Security Team,<br>Beeeyond Platform</p>
</body>
</html>
*/
}

export const emailService = new EmailService();