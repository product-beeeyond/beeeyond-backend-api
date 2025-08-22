import { Response } from 'express';
import { Op } from 'sequelize';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthRequest } from '../middleware/auth';
import RecoveryRequest from '../models/RecoveryRequest';
import RecoveryAuditLog from '../models/RecoveryAuditLog';
import MultiSigWallet from '../models/MultiSigWallet';
import MultiSigSigner from '../models/MultiSigSigner';
import User from '../models/User';
import { stellarService } from '../services/stellarService';
import { encrypt } from '../utils/cypher';
import logger from '../utils/logger';

/**
 * User requests wallet recovery
 * POST /api/recovery/request
 */
export const requestRecovery = async (req: AuthRequest, res: Response) => {
  try {
    const { walletId, reason } = req.body;
    const userId = req.user!.id;

    if (!recoveryRequest) {
      return res.status(404).json({ error: 'Recovery request not found' });
    }

    if (recoveryRequest.status !== 'failed') {
      return res.status(400).json({ 
        error: `Can only retry failed recovery requests. Current status: ${recoveryRequest.status}` 
      });
    }

    // Check if sufficient approvals and time-lock
    if (recoveryRequest.currentApprovals < recoveryRequest.requiredApprovals) {
      return res.status(400).json({ 
        error: 'Insufficient approvals for retry' 
      });
    }

    const now = new Date();
    if (now < recoveryRequest.executableAfter) {
      return res.status(400).json({ 
        error: 'Time-lock period has not yet passed' 
      });
    }

    if (now > recoveryRequest.expiresAt) {
      await recoveryRequest.update({ status: 'expired' });
      return res.status(400).json({ 
        error: 'Recovery request has expired' 
      });
    }

    // Execute recovery with retry
    const result = await executeRecoveryProcess(recoveryRequest, adminId);

    res.json({
      message: result.success ? 'Recovery executed successfully' : 'Recovery execution failed',
      success: result.success,
      transactionHash: result.transactionHash,
      error: result.error,
      retryCount: recoveryRequest.retryCount + 1
    });

  } catch (error) {
    logger.error('Retry recovery error:', error);
    res.status(500).json({ 
      error: 'Failed to retry recovery',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get recovery request status
 * GET /api/recovery/:requestId
 */
export const getRecoveryStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    const recoveryRequest = await RecoveryRequest.findOne({
      where: { 
        id: requestId,
        userId: userId // Users can only view their own requests
      },
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          attributes: ['stellarPublicKey', 'walletType']
        }
      ]
    });

    if (!recoveryRequest) {
      return res.status(404).json({ error: 'Recovery request not found' });
    }

    res.json({
      recoveryRequest: {
        id: recoveryRequest.id,
        status: recoveryRequest.status,
        requestReason: recoveryRequest.requestReason,
        executableAfter: recoveryRequest.executableAfter,
        expiresAt: recoveryRequest.expiresAt,
        requiredApprovals: recoveryRequest.requiredApprovals,
        currentApprovals: recoveryRequest.currentApprovals,
        approvedBy: recoveryRequest.approvedBy,
        executedAt: recoveryRequest.executedAt,
        failureReason: recoveryRequest.failureReason,
        retryCount: recoveryRequest.retryCount,
        createdAt: recoveryRequest.createdAt,
        wallet: recoveryRequest.wallet
      }
    });

  } catch (error) {
    logger.error('Get recovery status error:', error);
    res.status(500).json({ 
      error: 'Failed to get recovery status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


/**
 * Cancel pending recovery request (new function)
 * DELETE /api/recovery/:requestId
 */
export const cancelRecoveryRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    const recoveryRequest = await RecoveryRequest.findOne({
      where: { 
        id: requestId,
        userId: userId,
        status: 'pending' // Can only cancel pending requests
      }
    });

    if (!recoveryRequest) {
      return res.status(404).json({ 
        error: 'Pending recovery request not found' 
      });
    }

    // Update status to rejected
    await recoveryRequest.update({
      status: 'rejected',
      metadata: {
        ...recoveryRequest.metadata,
        cancellationReason: 'User cancelled request',
        cancelledBy: userId,
        cancelledAt: new Date().toISOString()
      }
    });

    // Log the cancellation
    await RecoveryAuditLog.create({
      recoveryRequestId: requestId,
      actionType: 'rejected',
      performedBy: userId,
      performedAt: new Date(),
      details: {
        reason: 'User cancelled request',
        cancelledByUser: true
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    logger.info(`Recovery request ${requestId} cancelled by user ${userId}`);

    res.json({
      message: 'Recovery request cancelled successfully',
      status: 'rejected'
    });

  } catch (error) {
    logger.error('Cancel recovery request error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel recovery request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
/**
 * List user's recovery requests
 * GET /api/recovery/requests
 */
export const listUserRecoveryRequests = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const whereClause: any = { userId };
    if (status) {
      whereClause.status = status;
    }

    const { count, rows: requests } = await RecoveryRequest.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: MultiSigWallet,
          as: 'wallet',
          attributes: ['stellarPublicKey', 'walletType']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({
      recoveryRequests: requests,
      pagination: {
        total: count,
        page: pageNum,
        pages: Math.ceil(count / limitNum),
        limit: limitNum
      }
    });

  } catch (error) {
    logger.error('List recovery requests error:', error);
    res.status(500).json({ 
      error: 'Failed to list recovery requests',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
