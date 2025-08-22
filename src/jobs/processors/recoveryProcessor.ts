import RecoveryRequest from '../../models/RecoveryRequest';
import User from '../../models/User';
import logger from '../../utils/logger';

export const sendRecoveryNotification = async (job: Job<SendRecoveryNotificationJobData>) => {
  const { 
    recoveryRequestId, 
    notificationType, 
    recipientType, 
    additionalData = {} 
  } = job.data;
  
  try {
    logger.info(`Sending recovery notification: ${notificationType} for ${recoveryRequestId}`);

    const recoveryRequest = await RecoveryRequest.findByPk(recoveryRequestId, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName']
        }
      ]
    });

    if (!recoveryRequest) {
      throw new Error(`Recovery request ${recoveryRequestId} not found`);
    }

    // Import notification service
    const { notificationService } = await import('../../services/notificationService');
    
    switch (notificationType) {
      case 'approval_needed':
        if (recipientType === 'all_admins') {
          await notificationService.notifyAdminsApprovalNeeded(recoveryRequest, additionalData);
        }
        break;

      case 'approved':
        if (recipientType === 'user') {
          await notificationService.notifyUserRecoveryApproved(recoveryRequest, additionalData);
        }
        break;

      case 'executed':
        if (recipientType === 'user') {
          await notificationService.notifyUserRecoveryExecuted(recoveryRequest, additionalData);
        }
        break;

      case 'failed':
        if (recipientType === 'all_admins') {
          await notificationService.notifyAdminsRecoveryFailed(recoveryRequest, additionalData);
        }
        break;

      case 'expired':
        if (recipientType === 'user') {
          await notificationService.notifyUserRecoveryExpired(recoveryRequest, additionalData);
        }
        break;

      case 'rejected': // New notification type
        if (recipientType === 'user') {
          await notificationService.notifyUserRecoveryRejected(recoveryRequest, additionalData);
        }
        break;

      default:
        throw new Error(`Unknown notification type: ${notificationType}`);
    }

    logger.info(`Recovery notification sent successfully: ${notificationType}`);
    return {
      recoveryRequestId,
      notificationType,
      recipientType,
      sentAt: new Date().toISOString()
    };  

  } catch (error) {
    logger.error(`Error sending recovery notification:`, error);
    throw error;
  }
};