import { Op } from "sequelize";
import RecoveryRequest from "../models/RecoveryRequest";
import RecoveryAuditLog from "../models/RecoveryAuditLog";
import logger from "../utils/logger";
import MultiSigWallet from "../models/MultiSigWallet";
import MultiSigSigner from "../models/MultiSigSigner";
import { stellarService } from "../services/stellarService";

/**
 * Process approved recovery requests that are ready for execution
 */
export const processExecutableRecoveries = async (): Promise<void> => {
  try {
    const now = new Date();

    // Find approved requests that are past their time-lock
    const executableRequests = await RecoveryRequest.findAll({
      where: {
        status: "approved",
        executableAfter: { [Op.lte]: now },
        expiresAt: { [Op.gt]: now },
      },
      include: [
        {
          model: MultiSigWallet,
          as: "wallet",
          include: [
            {
              model: MultiSigSigner,
              as: "signers",
              where: { role: "user", status: "active" },
            },
          ],
        },
      ],
    });

    logger.info(
      `Found ${executableRequests.length} recovery requests ready for execution`
    );

    for (const request of executableRequests) {
      try {
        await executeRecoveryProcess(request, "system");
      } catch (error) {
        logger.error(`Failed to execute recovery ${request.id}:`, error);
      }
    }
  } catch (error) {
    logger.error("Error processing executable recoveries:", error);
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
        status: ["pending", "approved"],
        expiresAt: { [Op.lt]: now },
      },
    });

    logger.info(`Found ${expiredRequests.length} expired recovery requests`);

    for (const request of expiredRequests) {
      await request.update({ status: "expired" });

      await RecoveryAuditLog.create({
        recoveryRequestId: request.id,
        actionType: "expired",
        performedBy: "system",
        performedAt: now,
        details: { reason: "Automatic expiration due to timeout" },
      });

      logger.info(`Expired recovery request: ${request.id}`);
    }
  } catch (error) {
    logger.error("Error expiring old recoveries:", error);
  }
};

/**
 * Cleanup old audit logs (optional - keep for compliance)
 */
export const cleanupOldAuditLogs = async (
  retentionDays: number = 365
): Promise<void> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedCount = await RecoveryAuditLog.destroy({
      where: {
        performedAt: { [Op.lt]: cutoffDate },
      },
    });

    logger.info(`Cleaned up ${deletedCount} old recovery audit logs`);
  } catch (error) {
    logger.error("Error cleaning up audit logs:", error);
  }
};

/**
 * Core recovery execution process
 */
export const executeRecoveryProcess = async (
  recoveryRequest: RecoveryRequest,
  executedBy: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
  try {
    // Validation - skip some checks for force execution
    if (!forceExecution) {
      // Normal validation
      if (
        recoveryRequest.currentApprovals < recoveryRequest.requiredApprovals
      ) {
        throw new Error("Insufficient approvals");
      }

      const now = new Date();
      if (now < recoveryRequest.executableAfter) {
        throw new Error("Time-lock period has not yet passed");
      }

      if (now > recoveryRequest.expiresAt) {
        throw new Error("Recovery request has expired");
      }
    }

    // Get wallet and signer info
    const wallet = await MultiSigWallet.findByPk(recoveryRequest.walletId, {
      include: [
        {
          model: MultiSigSigner,
          as: "signers",
          where: { role: "user", status: "active" },
        },
      ],
    });

    if (!wallet || !wallet.signers || wallet.signers.length === 0) {
      throw new Error("Wallet or user signer not found");
    }

    const oldUserPublicKey = wallet.signers[0].publicKey;

    // Execute stellar transaction
    const result = await stellarService.executeRecoveryTransaction({
      walletPublicKey: wallet.stellarPublicKey,
      oldUserPublicKey,
      newUserPublicKey: recoveryRequest.newUserPublicKey,
      recoveryRequestId: recoveryRequest.id,
      retryCount: recoveryRequest.retryCount,
    });

    if (result.success) {
      // Update recovery request
      await recoveryRequest.update({
        status: "executed",
        executedBy: executedBy === "system" ? undefined : executedBy,
        executedAt: new Date(),
        metadata: {
          ...recoveryRequest.metadata,
          forceExecution,
          transactionHash: result.transactionHash,
        },
      });

      // Update wallet signer
      await wallet.signers[0].update({
        publicKey: recoveryRequest.newUserPublicKey,
        status: "recovered",
        metadata: {
          ...wallet.signers[0].metadata,
          oldPublicKey: oldUserPublicKey,
          recoveryRequestId: recoveryRequest.id,
          recoveredAt: new Date().toISOString(),
        },
      });

      // Log successful execution
      await RecoveryAuditLog.create({
        recoveryRequestId: recoveryRequest.id,
        actionType: "executed",
        performedBy: executedBy,
        performedAt: new Date(),
        details: {
          transactionHash: result.transactionHash,
          oldUserPublicKey,
          newUserPublicKey: recoveryRequest.newUserPublicKey,
          retryCount: recoveryRequest.retryCount,
        },
      });

      // Schedule success notification
      if (forceExecution) {
        // Notify all admins about force execution
        await recoveryNotificationQueue.add(
          "send-recovery-notification",
          {
            recoveryRequestId: recoveryRequest.id,
            notificationType: "force_executed",
            recipientType: "all_admins",
            additionalData: {
              transactionHash: result.transactionHash,
              executedBy,
            },
          },
          { delay: 2000 }
        );
      }

      // Always notify user of successful execution
      await recoveryNotificationQueue.add(
        "send-recovery-notification",
        {
          recoveryRequestId: recoveryRequest.id,
          notificationType: "executed",
          recipientType: "user",
          additionalData: {
            transactionHash: result.transactionHash,
            forceExecution,
          },
        },
        { delay: 3000 }
      );
      logger.info(
        `Recovery ${recoveryRequest.id} executed successfully: ${result.transactionHash}`
      );

      return {
        success: true,
        transactionHash: result.transactionHash,
      };
    } else {
      // Update retry count and failure reason
      await recoveryRequest.update({
        status: "failed",
        retryCount: recoveryRequest.retryCount + 1,
        lastRetryAt: new Date(),
        failureReason: result.error,
      });

      // Log failure
      await RecoveryAuditLog.create({
        recoveryRequestId: recoveryRequest.id,
        actionType: "failed",
        performedBy: executedBy,
        performedAt: new Date(),
        details: {
          error: result.error,
          retryCount: recoveryRequest.retryCount + 1,
          forceExecution,
        },
      });

      // Notify admins of failure
      await recoveryNotificationQueue.add(
        "send-recovery-notification",
        {
          recoveryRequestId: recoveryRequest.id,
          notificationType: "failed",
          recipientType: "all_admins",
          additionalData: {
            error: result.error,
            retryCount: recoveryRequest.retryCount + 1,
            forceExecution,
          },
        },
        { delay: 1000 }
      );
      logger.error(`Recovery ${recoveryRequest.id} failed: ${result.error}`);

      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Update failure
    await recoveryRequest.update({
      status: "failed",
      retryCount: recoveryRequest.retryCount + 1,
      lastRetryAt: new Date(),
      failureReason: errorMessage,
    });

    // Log failure
    await RecoveryAuditLog.create({
      recoveryRequestId: recoveryRequest.id,
      actionType: "failed",
      performedBy: executedBy,
      performedAt: new Date(),
      details: {
        error: errorMessage,
        retryCount: recoveryRequest.retryCount + 1,
        forceExecution,
      },
    });

    logger.error(`Recovery execution error for ${recoveryRequest.id}:`, error);

    return {
      success: false,
      error: errorMessage,
    };
  }
};
