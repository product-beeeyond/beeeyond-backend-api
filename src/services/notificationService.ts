import User from '../models/User';
import logger from '../utils/logger';
import { emailService } from './emailService';

export class NotificationService {
  // ... existing methods ...

  async notifyUserRecoveryRejected(recoveryRequest: RecoveryRequest, additionalData: any) {
    try {
      const user = await User.findByPk(recoveryRequest.userId);
      if (!user) throw new Error('User not found');

      await emailService.sendEmail({
        to: user.email,
        subject: '❌ Wallet Recovery Request Rejected',
        template: 'recovery-rejected',
        data: {
          userName: user.firstName,
          reason: additionalData.reason,
          rejectedBy: additionalData.rejectedBy,
          rejectedAt: new Date().toISOString(),
          recoveryRequestId: recoveryRequest.id,
          newRequestUrl: `${process.env.FRONTEND_URL}/recovery/request`
        }
      });

      logger.info(`Recovery rejected notification sent to user ${user.email}`);
    } catch (error) {
      logger.error('Error sending recovery rejected notification:', error);
      throw error;
    }
  }

  async notifyAdminsForceExecution(recoveryRequest: RecoveryRequest, additionalData: any) {
    try {
      const admins = await User.findAll({
        where: {
          role: ['admin', 'super_admin'],
          // status: 'active'
        },
        attributes: ['id', 'email', 'firstName', 'lastName']
      });

      const user = await User.findByPk(recoveryRequest.userId);
      
      for (const admin of admins) {
        await emailService.sendEmail({
          to: admin.email,
          subject: '⚠️ ALERT: Force Recovery Execution',
          template: 'recovery-force-executed',
          data: {
            adminName: admin.firstName,
            userName: user?.firstName + ' ' + user?.lastName,
            userEmail: user?.email,
            reason: additionalData.reason,
            executedBy: additionalData.executedBy,
            recoveryRequestId: recoveryRequest.id,
            dashboardUrl: `${process.env.FRONTEND_URL}/admin/recovery/${recoveryRequest.id}`
          }
        });
      }

      logger.info(`Force execution notifications sent to ${admins.length} admins`);
    } catch (error) {
      logger.error('Error sending force execution notifications:', error);
      throw error;
    }
  }
}