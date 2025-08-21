import { Op } from 'sequelize';
import RecoveryRequest from '../models/RecoveryRequest';
import RecoveryAuditLog from '../models/RecoveryAuditLog';
import logger from '../utils/logger';
import MultiSigWallet from '../models/MultiSigWallet';
import MultiSigSigner from '../models/MultiSigSigner';
import { stellarService } from '../services/stellarService';

/**
 * Process approved recovery requests that are ready for execution
 */
export const processExecutableRecoveries = async (): Promise<void> => {
  try {
    const now = new Date();

    // Find approved requests that are past their time-lock
    const executableRequests = await RecoveryRequest.findAll({
      where: {
        status: 'approved',
        executableAfter: { [Op.lte]: now },
        expiresAt: { [Op.gt]: now }
      },
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          include: [{
            model: MultiSigSigner,
            as: 'signers',
            where: { role: 'user', status: 'active' }
          }]
        }
      ]
    });

    logger.info(`Found ${executableRequests.length} recovery requests ready for execution`);

    for (const request of executableRequests) {
      try {
        await executeRecoveryProcess(request, 'system');
      } catch (error) {
        logger.error(`Failed to execute recovery ${request.id}:`, error);
      }
    }

  } catch (error) {
    logger.error('Error processing executable recoveries:', error);
  }
};

/**
 * Expire old recovery requests
 */
export const expireOldRecoveries = async (): Promise<void> => {
  try {
    const now = new Date();

    // Find requests that have expired
    const expiredRequests = await RecoveryRequest.findAll({
      where: {
        status: ['pending', 'approved'],
        expiresAt: { [Op.lt]: now }
      }
    });

    logger.info(`Found ${expiredRequests.length} expired recovery requests`);

    for (const request of expiredRequests) {
      await request.update({ status: 'expired' });

      await RecoveryAuditLog.create({
        recoveryRequestId: request.id,
        actionType: 'expired',
        performedBy: 'system',
        performedAt: now,
        details: { reason: 'Automatic expiration due to timeout' }
      });

      logger.info(`Expired recovery request: ${request.id}`);
    }

  } catch (error) {
    logger.error('Error expiring old recoveries:', error);
  }
};

/**
 * Cleanup old audit logs (optional - keep for compliance)
 */
export const cleanupOldAuditLogs = async (retentionDays: number = 365): Promise<void> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedCount = await RecoveryAuditLog.destroy({
      where: {
        performedAt: { [Op.lt]: cutoffDate }
      }
    });

    logger.info(`Cleaned up ${deletedCount} old recovery audit logs`);

  } catch (error) {
    logger.error('Error cleaning up audit logs:', error);
  }
};


/**
 * Automatically execute recovery when conditions are met
 */
// async function executeRecoveryAutomatically(recoveryRequest: RecoveryRequest) {
//   try {
//     const now = new Date();
    
//     // Double-check conditions
//     if (recoveryRequest.currentApprovals < recoveryRequest.requiredApprovals) {
//       logger.warn(`Recovery ${recoveryRequest.id}: Insufficient approvals`);
//       return;
//     }

//     if (now < recoveryRequest.executableAfter) {
//       logger.warn(`Recovery ${recoveryRequest.id}: Time-lock not yet passed`);
//       return;
//     }

//     if (now > recoveryRequest.expiresAt) {
//       await recoveryRequest.update({ status: 'expired' });
//       await RecoveryAuditLog.create({
//         recoveryRequestId: recoveryRequest.id,
//         actionType: 'expired',
//         performedBy: 'system',
//         performedAt: now,
//         details: { reason: 'Automatic expiration due to timeout' }
//       });
//       logger.info(`Recovery ${recoveryRequest.id}: Expired automatically`);
//       return;
//     }

//     await executeRecoveryProcess(recoveryRequest, 'system');

//   } catch (error) {
//     logger.error(`Automatic recovery execution failed for ${recoveryRequest.id}:`, error);
//   }
// }

/**
 * Core recovery execution process
 */
async function executeRecoveryProcess(
  recoveryRequest: RecoveryRequest, 
  executedBy: string
): Promise<{success: boolean, transactionHash?: string, error?: string}> {
  
  try {
    // Get wallet and signer info
    const wallet = await MultiSigWallet.findByPk(recoveryRequest.walletId, {
      include: [{
        model: MultiSigSigner,
        as: 'signers',
        where: { role: 'user', status: 'active' }
      }]
    });

    if (!wallet || !wallet.signers || wallet.signers.length === 0) {
      throw new Error('Wallet or user signer not found');
    }

    const oldUserPublicKey = wallet.signers[0].publicKey;

    // Execute stellar transaction
    const result = await stellarService.executeRecoveryTransaction({
      walletPublicKey: wallet.stellarPublicKey,
      oldUserPublicKey,
      newUserPublicKey: recoveryRequest.newUserPublicKey,
      recoveryRequestId: recoveryRequest.id,
      retryCount: recoveryRequest.retryCount
    });

    if (result.success) {
      // Update recovery request
      await recoveryRequest.update({
        status: 'executed',
        executedBy: executedBy === 'system' ? undefined : executedBy,
        executedAt: new Date()
      });

      // Update wallet signer
      await wallet.signers[0].update({
        publicKey: recoveryRequest.newUserPublicKey,
        status: 'recovered',
        metadata: {
          ...wallet.signers[0].metadata,
          oldPublicKey: oldUserPublicKey,
          recoveryRequestId: recoveryRequest.id,
          recoveredAt: new Date().toISOString()
        }
      });

      // Log successful execution
      await RecoveryAuditLog.create({
        recoveryRequestId: recoveryRequest.id,
        actionType: 'executed',
        performedBy: executedBy,
        performedAt: new Date(),
        details: {
          transactionHash: result.transactionHash,
          oldUserPublicKey,
          newUserPublicKey: recoveryRequest.newUserPublicKey,
          retryCount: recoveryRequest.retryCount
        }
      });

      logger.info(`Recovery ${recoveryRequest.id} executed successfully: ${result.transactionHash}`);

      return {
        success: true,
        transactionHash: result.transactionHash
      };

    } else {
      // Update retry count and failure reason
      await recoveryRequest.update({
        status: 'failed',
        retryCount: recoveryRequest.retryCount + 1,
        lastRetryAt: new Date(),
        failureReason: result.error
      });

      // Log failure
      await RecoveryAuditLog.create({
        recoveryRequestId: recoveryRequest.id,
        actionType: 'failed',
        performedBy: executedBy,
        performedAt: new Date(),
        details: {
          error: result.error,
          retryCount: recoveryRequest.retryCount + 1
        }
      });

      logger.error(`Recovery ${recoveryRequest.id} failed: ${result.error}`);

      return {
        success: false,
        error: result.error
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Update failure
    await recoveryRequest.update({
      status: 'failed',
      retryCount: recoveryRequest.retryCount + 1,
      lastRetryAt: new Date(),
      failureReason: errorMessage
    });

    // Log failure
    await RecoveryAuditLog.create({
      recoveryRequestId: recoveryRequest.id,
      actionType: 'failed',
      performedBy: executedBy,
      performedAt: new Date(),
      details: {
        error: errorMessage,
        retryCount: recoveryRequest.retryCount + 1
      }
    });

    logger.error(`Recovery execution error for ${recoveryRequest.id}:`, error);

    return {
      success: false,
      error: errorMessage
    };
  }
}
