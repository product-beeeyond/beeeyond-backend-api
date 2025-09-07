/* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
// import bcrypt from 'bcryptjs';
import { AuthRequest, UserRole } from '../middleware/auth';
import User from '../models/User';
import logger from '../utils/logger';
// import { smsService } from '../services/smsService';
import { emailService } from '../services/emailService';
import { Op } from 'sequelize';
// // import { generateToken } from '../utils/jwt';
// // import { sendWelcomeEmail } from '../utils/email';
// import { BCRYPT_ROUNDS } from '../config';
// import { emailService } from '../services/emailService';
// import logger from '../utils/logger';
// import RecoveryAuditLog from '../models/RecoveryAuditLog';
// import MultiSigWallet from '../models/MultiSigWallet';
// import RecoveryRequest from '../models/RecoveryRequest';
// import MultiSigSigner from '../models/MultiSigSigner';
// import { executeRecoveryProcess } from '../jobs/recoveryJobs';

// // Create admin user - Super Admin only

// export const createAdmin = async (req: AuthRequest, res: Response) => {
//   try {
//     const { email, firstName, lastName, password } = req.body;

//     // Validate required fields
//     if (!email || !firstName || !lastName || !password) {
//       return res.status(400).json({
//         error: 'Email, first name, last name, and password are required'
//       });
//     }

//     // Check if user with email already exists
//     const existingUser = await User.findOne({ where: { email } });
//     if (existingUser) {
//       return res.status(409).json({
//         error: 'User with this email already exists'
//       });
//     }

//     // Hash password
//     const saltRounds = Number(BCRYPT_ROUNDS);
//     const hashedPassword = await bcrypt.hash(password, saltRounds);

//     // Create admin user
//     const adminUser = await User.create({
//       email,
//       firstName,
//       lastName,
//       password: hashedPassword,
//       role: UserRole.ADMIN,
//       isActive: true,
//       kycStatus: 'verified' // Admins are automatically KYC verified
//       ,

//       nationality: '',
//       investmentExperience: '',
//       riskTolerance: '',
//       isVerified: false,
//       salt: '',
//       otp: 0,
//       otp_expiry: undefined
//     });

//     // Remove password from response
//     const { ...adminUserData } = adminUser.toJSON();

//     // Send welcome email with temporary password
//     try {
//       await emailService.sendWelcomeEmail(
//        adminUser.email as string,
//         adminUser.firstName as string,
//       );
//     } catch (emailError) {
//       console.error('Failed to send welcome email:', emailError);
//       // Don't fail the creation if email fails
//     }

//     res.status(201).json({
//       message: 'Admin user created successfully',
//       admin: adminUserData
//     });
//   } catch (error) {
//     console.error('Create admin error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Get all admin users - Super Admin only
// export const getAllAdmins = async (req: AuthRequest, res: Response) => {
//   try {
//     const admins = await User.findAll({
//       where: {
//         role: UserRole.ADMIN
//       },
//       attributes: { exclude: ['password'] },
//       order: [['createdAt', 'DESC']]
//     });

//     res.json({
//       message: 'Admins retrieved successfully',
//       count: admins.length,
//       admins
//     });
//   } catch (error) {
//     console.error('Get admins error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Update admin user - Super Admin only
// export const updateAdmin = async (req: AuthRequest, res: Response) => {
//   try {
//     const { adminId } = req.params;
//     const { firstName, lastName, isActive } = req.body;

//     const admin = await User.findOne({
//       where: {
//         id: adminId,
//         role: UserRole.ADMIN
//       }
//     });

//     if (!admin) {
//       return res.status(404).json({ error: 'Admin user not found' });
//     }

//     // Update admin details
//     await admin.update({
//       firstName: firstName || admin.firstName,
//       lastName: lastName || admin.lastName,
//       isActive: isActive !== undefined ? isActive : admin.isActive
//     });

//     const { ...updatedAdminData } = admin.toJSON();

//     res.json({
//       message: 'Admin user updated successfully',
//       admin: updatedAdminData
//     });
//   } catch (error) {
//     console.error('Update admin error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Deactivate admin user - Super Admin only
// export const deactivateAdmin = async (req: AuthRequest, res: Response) => {
//   try {
//     const { adminId } = req.params;

//     const admin = await User.findOne({
//       where: {
//         id: adminId,
//         role: UserRole.ADMIN
//       }
//     });

//     if (!admin) {
//       return res.status(404).json({ error: 'Admin user not found' });
//     }

//     // Deactivate instead of deleting
//     await admin.update({ isActive: false });

//     res.json({
//       message: 'Admin user deactivated successfully',
//       adminId: admin.id
//     });
//   } catch (error) {
//     console.error('Deactivate admin error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Promote regular user to admin - Super Admin only


export const promoteToAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        id: userId,
        role: UserRole.USER
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or already an admin' });
    }

    // Promote user to admin
    await user.update({
      role: UserRole.ADMIN,
      kycStatus: 'verified' // Admins should be KYC verified
    });

    const { ...promotedUserData } = user.toJSON();

    // Send promotion notification email
    // try {
    //   await sendPromotionEmail({
    //     email: user.email,
    //     firstName: user.firstName!,
    //     newRole: 'Admin'
    //   });
    // } catch (emailError) {
    //   console.error('Failed to send promotion email:', emailError);
    // }

    res.json({
      message: 'User promoted to admin successfully',
      admin: promotedUserData
    });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// // Demote admin to regular user - Super Admin only
// export const demoteAdmin = async (req: AuthRequest, res: Response) => {
//   try {
//     const { adminId } = req.params;

//     const admin = await User.findOne({
//       where: {
//         id: adminId,
//         role: UserRole.ADMIN
//       }
//     });

//     if (!admin) {
//       return res.status(404).json({ error: 'Admin user not found' });
//     }

//     // Demote admin to regular user
//     await admin.update({ role: UserRole.USER });

//     const { ...demotedUserData } = admin.toJSON();

//     res.json({
//       message: 'Admin demoted to regular user successfully',
//       user: demotedUserData
//     });
//   } catch (error) {
//     console.error('Demote admin error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Reset admin password - Super Admin only
// export const resetAdminPassword = async (req: AuthRequest, res: Response) => {
//   try {
//     const { adminId } = req.params;
//     const { newPassword } = req.body;

//     if (!newPassword || newPassword.length < 8) {
//       return res.status(400).json({
//         error: 'New password must be at least 8 characters long'
//       });
//     }

//     const admin = await User.findOne({
//       where: {
//         id: adminId,
//         role: UserRole.ADMIN
//       }
//     });

//     if (!admin) {
//       return res.status(404).json({ error: 'Admin user not found' });
//     }

//     // Hash new password
//     const saltRounds = 12;
//     const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

//     // Update password
//     await admin.update({ password: hashedPassword });

//     // Send password reset notification
//     try {
//       await sendPasswordResetNotification({
//         email: admin.email,
//         firstName: admin.firstName!
//       });
//     } catch (emailError) {
//       console.error('Failed to send password reset notification:', emailError);
//     }

//     res.json({
//       message: 'Admin password reset successfully',
//       adminId: admin.id
//     });
//   } catch (error) {
//     console.error('Reset admin password error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// const sendPromotionEmail = async (data: {
//   email: string;
//   firstName: string;
//   newRole: string;
// }) => {
//   // Implement your email service here
//   console.log(`Sending promotion email to ${data.email} for ${data.newRole} role`);
// };

// const sendPasswordResetNotification = async (data: {
//   email: string;
//   firstName: string;
// }) => {
//   // Implement your email service here
//   console.log(`Sending password reset notification to ${data.email}`);
// };


/**
 * Approve or reject KYC for a user
 * POST /api/admin/approve-kyc/:userId
 * Body: { action: 'approve' | 'reject', reason?: string }
 */
export const approveKYC = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { action, reason } = req.body;
    const adminId = req.user?.id;
    const adminEmail = req.user?.email;

    // Validate input
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be "approve" or "reject"' 
      });
    }

    if (action === 'reject' && !reason) {
      return res.status(400).json({ 
        error: 'Rejection reason is required when rejecting KYC' 
      });
    }

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user's KYC status allows for approval/rejection
    // if (!['pending', 'under_review'].includes(user.kycStatus)) {
    //   return res.status(400).json({ 
    //     error: `Cannot ${action} KYC. Current status: ${user.kycStatus}`,
    //     currentStatus: user.kycStatus
    //   });
    // }

    // Store previous status for logging
    const previousStatus = user.kycStatus;

    // Determine new KYC status
    const newKycStatus = action === 'approve' ? 'verified' : 'rejected';

    // Update user's KYC status
    await user.update({
      kycStatus: newKycStatus,
      // isVerified: action === 'approve'
    });

    // Log the KYC action for audit purposes
    logger.info(`KYC ${action}d for user ${userId}`, {
      userId,
      adminId,
      adminEmail,
      action,
      reason: reason || `KYC ${action}d by admin`,
      previousStatus,
      newStatus: newKycStatus,
      timestamp: new Date().toISOString()
    });

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        // Send email notification
        if (user.email && user.firstName) {
          await emailService.sendKYCStatusEmail(
            user.email,
            user.firstName,
            newKycStatus
          );
          logger.info(`KYC ${action} email sent to ${user.email}`);
        }

        // Send SMS notification if phone number exists
        // if (user.phone) {
        //   await smsService.sendKYCUpdate(user.phone, newKycStatus);
        //   logger.info(`KYC ${action} SMS sent to ${user.phone}`);
        // }
      } catch (notificationError) {
        // Log notification errors but don't fail the main operation
        logger.error(`Failed to send KYC ${action} notifications:`, notificationError);
      }
    });

    // Prepare response data (exclude sensitive information)
    const responseData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      kycStatus: newKycStatus,
      isVerified: user.isVerified,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      message: `KYC ${action}d successfully`,
      user: responseData,
      action,
      processedBy: {
        adminId,
        adminEmail,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('KYC approval error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process KYC approval'
    });
  }
};

/**
 * Get KYC pending approvals
 * GET /api/admin/kyc/pending
 */
export const getPendingKYCApprovals = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Build where clause
    const whereClause: any = {
      kycStatus: ['pending', 'under_review']
    };

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { rows: users, count } = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'email', 'firstName', 'lastName', 'phone',
        'kycStatus', 'isVerified', 'createdAt', 'updatedAt'
      ],
      order: [['createdAt', 'ASC']], // Oldest first for FIFO processing
      limit: Number(limit),
      offset
    });

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(count / Number(limit)),
        totalItems: count,
        itemsPerPage: Number(limit)
      }
    });

  } catch (error) {
    logger.error('Get pending KYC approvals error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch pending KYC approvals'
    });
  }
};

/**
 * Get KYC statistics for admin dashboard
 * GET /api/admin/kyc/stats
 */
export const getKYCStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      pendingKYC,
      verifiedKYC,
      rejectedKYC,
      underReviewKYC
    ] = await Promise.all([
      User.count(),
      User.count({ where: { kycStatus: 'pending' } }),
      User.count({ where: { kycStatus: 'verified' } }),
      User.count({ where: { kycStatus: 'rejected' } }),
      User.count({ where: { kycStatus: 'under_review' } })
    ]);

    // Calculate KYC completion rate
    const kycCompletionRate = totalUsers > 0 
      ? Math.round((verifiedKYC / totalUsers) * 100) 
      : 0;

    // Get recent KYC activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await User.count({
      where: {
        updatedAt: { [Op.gte]: sevenDaysAgo },
        kycStatus: ['verified', 'rejected']
      }
    });

    res.json({
      success: true,
      stats: {
        total: {
          users: totalUsers,
          verified: verifiedKYC,
          pending: pendingKYC,
          rejected: rejectedKYC,
          underReview: underReviewKYC
        },
        percentages: {
          verified: totalUsers > 0 ? Math.round((verifiedKYC / totalUsers) * 100) : 0,
          pending: totalUsers > 0 ? Math.round((pendingKYC / totalUsers) * 100) : 0,
          rejected: totalUsers > 0 ? Math.round((rejectedKYC / totalUsers) * 100) : 0,
          underReview: totalUsers > 0 ? Math.round((underReviewKYC / totalUsers) * 100) : 0
        },
        completionRate: kycCompletionRate,
        recentActivity: recentActivity
      }
    });

  } catch (error) {
    logger.error('Get KYC stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch KYC statistics'
    });
  }
};

/**
 * Get user KYC details for admin review
 * GET /api/admin/kyc/:userId/details
 */
export const getKYCDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: [
        'id', 'email', 'firstName', 'lastName', 'phone', 'dateOfBirth',
        'nationality', 'address', 'kycStatus', 'isVerified', 
        'investmentExperience', 'riskTolerance', 'createdAt', 'updatedAt'
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user profile information for KYC review
    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    logger.error('Get KYC details error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch KYC details'
    });
  }
};
/**
 * Bulk approve/reject KYC applications
 * POST /api/admin/kyc/bulk-action
 * Body: { userIds: string[], action: 'approve' | 'reject', reason?: string }
 */
export const bulkKYCAction = async (req: AuthRequest, res: Response) => {
  try {
    const { userIds, action, reason } = req.body;
    const adminId = req.user?.id;
    const adminEmail = req.user?.email;

    // Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        error: 'userIds must be a non-empty array' 
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be "approve" or "reject"' 
      });
    }

    if (action === 'reject' && !reason) {
      return res.status(400).json({ 
        error: 'Rejection reason is required when rejecting KYC' 
      });
    }

    // Find users
    const users = await User.findAll({
      where: {
        id: userIds,
        kycStatus: ['pending', 'under_review']
      }
    });

    if (users.length === 0) {
      return res.status(404).json({ 
        error: 'No eligible users found for bulk action' 
      });
    }

    // Determine new KYC status
    const newKycStatus = action === 'approve' ? 'verified' : 'rejected';

    // Update all users
    const updatePromises = users.map(user => 
      user.update({
        kycStatus: newKycStatus,
        isVerified: action === 'approve'
      })
    );

    await Promise.all(updatePromises);

    // Log bulk action
    logger.info(`Bulk KYC ${action} completed`, {
      adminId,
      adminEmail,
      action,
      reason,
      userCount: users.length,
      userIds: users.map(u => u.id),
      timestamp: new Date().toISOString()
    });

    // Send notifications (fire and forget)
    setImmediate(async () => {
      for (const user of users) {
        try {
          if (user.email && user.firstName) {
            await emailService.sendKYCStatusEmail(
              user.email,
              user.firstName,
              newKycStatus
            );
          }
          // if (user.phone) {
          //   await smsService.sendKYCUpdate(user.phone, newKycStatus);
          // }
        } catch (notificationError) {
          logger.error(`Failed to send bulk notification to user ${user.id}:`, notificationError);
        }
      }
    });

    res.json({
      success: true,
      message: `Bulk KYC ${action} completed successfully`,
      processedCount: users.length,
      action,
      processedBy: {
        adminId,
        adminEmail,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Bulk KYC action error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process bulk KYC action'
    });
  }
};

//----wallet recovery-------\\
// /**
//  * Get recovery audit log
//  * GET /api/admin/recovery/:requestId/audit
//  */
// export const getRecoveryAuditLog = async (req: AuthRequest, res: Response) => {
//   try {
//     const { requestId } = req.params;

//     // Verify admin role
//     if (!['admin', 'super_admin'].includes(req.user!.role)) {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     const auditLogs = await RecoveryAuditLog.findAll({
//       where: { recoveryRequestId: requestId },
//       include: [
//         {
//           model: User,
//           as: 'performer',
//           attributes: ['id', 'email', 'firstName', 'lastName', 'role']
//         }
//       ],
//       order: [['performedAt', 'ASC']]
//     });

//     res.json({
//       auditLogs: auditLogs.map(log => ({
//         id: log.id,
//         actionType: log.actionType,
//         performedBy: log.performedBy,
//         performedAt: log.performedAt,
//         details: log.details,
//         ipAddress: log.ipAddress,
//         userAgent: log.userAgent
//       }))
//     });

//   } catch (error) {
//     logger.error('Get audit log error:', error);
//     res.status(500).json({ 
//       error: 'Failed to get audit log',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };
// /**
//  * Admin approves recovery request
//  * POST /api/admin/recovery/:requestId/approve
//  */
// export const approveRecoveryRequest = async (req: AuthRequest, res: Response) => {
//   try {
//     const { requestId } = req.params;
//     const adminId = req.user!.id;
//     const adminEmail = req.user!.email;

//     // Verify admin role
//     if (!['admin', 'super_admin'].includes(req.user!.role)) {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     const recoveryRequest = await RecoveryRequest.findByPk(requestId, {
//       include: [
//         {
//           model: MultiSigWallet,
//           as: 'wallet',
//           include: [{
//             model: MultiSigSigner,
//             as: 'signers',
//             where: { role: 'user', status: 'active' }
//           }]
//         }
//       ]
//     });

//     if (!recoveryRequest) {
//       return res.status(404).json({ error: 'Recovery request not found' });
//     }

//     if (recoveryRequest.status !== 'pending') {
//       return res.status(400).json({ 
//         error: `Cannot approve request with status: ${recoveryRequest.status}` 
//       });
//     }

//     // Check if admin already approved
//     const alreadyApproved = recoveryRequest.approvedBy.some(
//       approval => approval.adminId === adminId
//     );

//     if (alreadyApproved) {
//       return res.status(409).json({ error: 'You have already approved this request' });
//     }

//     // Add approval
//     const updatedApprovals = [
//       ...recoveryRequest.approvedBy,
//       {
//         adminId,
//         adminEmail,
//         approvedAt: new Date().toISOString()
//       }
//     ];

//     const newApprovalCount = updatedApprovals.length;

//     await recoveryRequest.update({
//       approvedBy: updatedApprovals,
//       currentApprovals: newApprovalCount,
//       status: newApprovalCount >= recoveryRequest.requiredApprovals ? 'approved' : 'pending'
//     });

//     // Log the approval
//     await RecoveryAuditLog.create({
//       recoveryRequestId: requestId,
//       actionType: 'approved',
//       performedBy: adminId,
//       performedAt: new Date(),
//       details: {
//         approvalCount: newApprovalCount,
//         requiredApprovals: recoveryRequest.requiredApprovals,
//         fullyApproved: newApprovalCount >= recoveryRequest.requiredApprovals
//       },
//       ipAddress: req.ip,
//       userAgent: req.get('User-Agent')
//     });

// // If fully approved, schedule execution and notifications using BullMQ
//     if (newApprovalCount >= recoveryRequest.requiredApprovals) {
//       try {
//         const now = new Date();
        
//         if (now >= recoveryRequest.executableAfter) {
//           // Schedule immediate execution
//           const executionJob = await recoveryScheduler.scheduleSpecificRecovery(requestId, 1000); // 1 second delay
//           logger.info(`Recovery ${requestId} scheduled for immediate execution. Job ID: ${executionJob.id}`);
//         } else {
//           // Schedule execution after time-lock
//           const delay = recoveryRequest.executableAfter.getTime() - now.getTime();
//           const executionJob = await recoveryScheduler.scheduleSpecificRecovery(requestId, delay);
//           logger.info(`Recovery ${requestId} scheduled for execution at ${recoveryRequest.executableAfter}. Job ID: ${executionJob.id}`);
//         }

//         // Notify user that recovery is approved
//         await recoveryScheduler.scheduleRecoveryNotification(
//           requestId,
//           'approved',
//           'user',
//           {
//             approvalCount: newApprovalCount,
//             executableAfter: recoveryRequest.executableAfter,
//             adminEmail: adminEmail
//           },
//           2000 // 2 second delay
//         );

//         logger.info(`Recovery approval notifications scheduled for request ${requestId}`);

//       } catch (schedulingError) {
//         logger.error(`Failed to schedule execution/notifications for recovery ${requestId}:`, schedulingError);
//         // Don't fail the approval, just log the error
//       }
//     }

//     logger.info(`Recovery request ${requestId} approved by admin ${adminEmail} (${newApprovalCount}/${recoveryRequest.requiredApprovals})`);

//     res.json({
//       message: 'Recovery request approved successfully',
//       approvalCount: newApprovalCount,
//       requiredApprovals: recoveryRequest.requiredApprovals,
//       fullyApproved: newApprovalCount >= recoveryRequest.requiredApprovals,
//       status: recoveryRequest.status
//     });

//   } catch (error) {
//     logger.error('Approve recovery error:', error);
//     res.status(500).json({ 
//       error: 'Failed to approve recovery request',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };

// /**
//  * Admin rejects recovery request
//  * POST /api/admin/recovery/:requestId/reject
//  */
// export const rejectRecoveryRequest = async (req: AuthRequest, res: Response) => {
//   try {
//     const { requestId } = req.params;
//     const { reason } = req.body;
//     const adminId = req.user!.id;

//     // Verify admin role
//     if (!['admin', 'super_admin'].includes(req.user!.role)) {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     if (!reason || reason.trim().length < 5) {
//       return res.status(400).json({ error: 'Rejection reason is required (min 5 characters)' });
//     }

//     const recoveryRequest = await RecoveryRequest.findByPk(requestId);

//     if (!recoveryRequest) {
//       return res.status(404).json({ error: 'Recovery request not found' });
//     }

//     if (recoveryRequest.status !== 'pending') {
//       return res.status(400).json({ 
//         error: `Cannot reject request with status: ${recoveryRequest.status}` 
//       });
//     }

//     await recoveryRequest.update({
//       status: 'rejected',
//       metadata: {
//         ...recoveryRequest.metadata,
//         rejectionReason: reason.trim(),
//         rejectedBy: adminId,
//         rejectedAt: new Date().toISOString()
//       }
//     });

//     // Log the rejection
//     await RecoveryAuditLog.create({
//       recoveryRequestId: requestId,
//       actionType: 'rejected',
//       performedBy: adminId,
//       performedAt: new Date(),
//       details: {
//         reason: reason.trim()
//       },
//       ipAddress: req.ip,
//       userAgent: req.get('User-Agent')
//     });

//     // Schedule notification to user about rejection
//     try {
//       await recoveryScheduler.scheduleRecoveryNotification(
//         requestId,
//         'rejected',
//         'user',
//         {
//           reason: reason.trim(),
//           rejectedBy: req.user!.email
//         },
//         1000 // 1 second delay
//       );
//     } catch (notificationError) {
//       logger.error(`Failed to schedule rejection notification for recovery ${requestId}:`, notificationError);
//     }
//     logger.info(`Recovery request ${requestId} rejected by admin ${req.user!.email}`);

//     res.json({
//       message: 'Recovery request rejected successfully',
//       status: 'rejected'
//     });

//   } catch (error) {
//     logger.error('Reject recovery error:', error);
//     res.status(500).json({ 
//       error: 'Failed to reject recovery request',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };

// /**
//  * Admin lists all recovery requests
//  * GET /api/admin/recovery/requests
//  */
// export const listAllRecoveryRequests = async (req: AuthRequest, res: Response) => {
//   try {
//     // Verify admin role
//     if (!['admin', 'super_admin'].includes(req.user!.role)) {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     const { status, userId, page = '1', limit = '20' } = req.query;

//     const pageNum = parseInt(page as string);
//     const limitNum = parseInt(limit as string);
//     const offset = (pageNum - 1) * limitNum;

//     const whereClause: any = {};
//     if (status) {
//       whereClause.status = status;
//     }
//     if (userId) {
//       whereClause.userId = userId;
//     }

//     const { count, rows: requests } = await RecoveryRequest.findAndCountAll({
//       where: whereClause,
//       include: [
//         {
//           model: User,
//           as: 'user',
//           attributes: ['id', 'email', 'firstName', 'lastName']
//         },
//         {
//           model: MultiSigWallet,
//           as: 'wallet',
//           attributes: ['stellarPublicKey', 'walletType', 'status']
//         }
//       ],
//       order: [['createdAt', 'DESC']],
//       limit: limitNum,
//       offset
//     });

//     res.json({
//       recoveryRequests: requests,
//       pagination: {
//         total: count,
//         page: pageNum,
//         pages: Math.ceil(count / limitNum),
//         limit: limitNum
//       }
//     });

//   } catch (error) {
//     logger.error('List all recovery requests error:', error);
//     res.status(500).json({ 
//       error: 'Failed to list recovery requests',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };

// /**
//  * Admin retries failed recovery
//  * POST /api/admin/recovery/:requestId/retry
//  */
// export const retryFailedRecovery = async (req: AuthRequest, res: Response) => {
//   try {
//     const { requestId } = req.params;
//     const adminId = req.user!.id;

//     // Verify admin role
//     if (!['admin', 'super_admin'].includes(req.user!.role)) {
//       return res.status(403).json({ error: 'Admin access required' });
//     }

//     const recoveryRequest = await RecoveryRequest.findByPk(requestId, {
//       include: [
//         {
//           model: MultiSigWallet,
//           as: 'wallet',
//           include: [{
//             model: MultiSigSigner,
//             as: 'signers',
//             where: { role: 'user', status: 'active' }
//           }]
//         }
//       ]
//     });

//     if (!recoveryRequest) {
//       return res.status(404).json({ error: 'Recovery request not found' });
//     }

//     if (recoveryRequest.status !== 'failed') {
//       return res.status(400).json({ 
//         error: `Can only retry failed recovery requests. Current status: ${recoveryRequest.status}` 
//       });
//     }

//     // Check if sufficient approvals and time-lock
//     if (recoveryRequest.currentApprovals < recoveryRequest.requiredApprovals) {
//       return res.status(400).json({ 
//         error: 'Insufficient approvals for retry' 
//       });
//     }

//     const now = new Date();
//     if (now < recoveryRequest.executableAfter) {
//       return res.status(400).json({ 
//         error: 'Time-lock period has not yet passed' 
//       });
//     }

//     if (now > recoveryRequest.expiresAt) {
//       await recoveryRequest.update({ status: 'expired' });
      
//       // Log expiration
//       await RecoveryAuditLog.create({
//         recoveryRequestId: requestId,
//         actionType: 'expired',
//         performedBy: adminId,
//         performedAt: now,
//         details: { 
//           reason: 'Expired during retry attempt',
//           expiredBy: 'admin'
//         },
//         ipAddress: req.ip,
//         userAgent: req.get('User-Agent')
//       });

//       return res.status(400).json({ 
//         error: 'Recovery request has expired' 
//       });
//     }

//     // Check retry limits (optional - prevent infinite retries)
//     const MAX_RETRIES = 5;
//     if (recoveryRequest.retryCount >= MAX_RETRIES) {
//       return res.status(400).json({ 
//         error: `Maximum retry attempts (${MAX_RETRIES}) reached` 
//       });
//     }

//     // Log retry attempt
//     await RecoveryAuditLog.create({
//       recoveryRequestId: requestId,
//       actionType: 'retry_attempted',
//       performedBy: adminId,
//       performedAt: now,
//       details: {
//         retryCount: recoveryRequest.retryCount + 1,
//         previousFailureReason: recoveryRequest.failureReason,
//         initiatedByAdmin: req.user!.email
//       },
//       ipAddress: req.ip,
//       userAgent: req.get('User-Agent')
//     });

//     // Execute recovery with retry
//     const result = await executeRecoveryProcess(recoveryRequest, adminId);

//     logger.info(`Recovery retry ${recoveryRequest.retryCount + 1} for request ${requestId} by admin ${req.user!.email}: ${result.success ? 'SUCCESS' : 'FAILED'}`);

//     res.json({
//       message: result.success ? 'Recovery executed successfully' : 'Recovery execution failed',
//       success: result.success,
//       transactionHash: result.transactionHash,
//       error: result.error,
//       retryCount: recoveryRequest.retryCount + 1,
//       maxRetries: MAX_RETRIES,
//       canRetryAgain: result.success ? false : (recoveryRequest.retryCount + 1) < MAX_RETRIES
//     });

//   } catch (error) {
//     logger.error('Retry recovery error:', error);
//     res.status(500).json({ 
//       error: 'Failed to retry recovery',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };

// /**
//  * Force execute recovery (emergency admin function)
//  * POST /api/admin/recovery/:requestId/force-execute
//  */
// export const forceExecuteRecovery = async (req: AuthRequest, res: Response) => {
//   try {
//     const { requestId } = req.params;
//     const { reason } = req.body;
//     const adminId = req.user!.id;

//     // Verify super admin role for force execution
//     if (req.user!.role !== 'super_admin') {
//       return res.status(403).json({ error: 'Super admin access required for force execution' });
//     }

//     if (!reason || reason.trim().length < 10) {
//       return res.status(400).json({ error: 'Force execution reason is required (min 10 characters)' });
//     }

//     const recoveryRequest = await RecoveryRequest.findByPk(requestId);

//     if (!recoveryRequest) {
//       return res.status(404).json({ error: 'Recovery request not found' });
//     }

//     if (!['pending', 'approved', 'failed'].includes(recoveryRequest.status)) {
//       return res.status(400).json({ 
//         error: `Cannot force execute request with status: ${recoveryRequest.status}` 
//       });
//     }

//     // Check if expired
//     const now = new Date();
//     if (now > recoveryRequest.expiresAt) {
//       return res.status(400).json({ 
//         error: 'Cannot force execute expired recovery request' 
//       });
//     }

//     try {
//       // Schedule immediate execution with high priority
//       const forceJob = await recoveryScheduler.scheduleSpecificRecovery(requestId, 500); // 0.5 second delay

//       // Log force execution attempt
//       await RecoveryAuditLog.create({
//         recoveryRequestId: requestId,
//         actionType: 'retry_attempted',
//         performedBy: adminId,
//         performedAt: now,
//         details: {
//           jobId: forceJob.id,
//           forceExecution: true,
//           reason: reason.trim(),
//           bypassedTimelock: now < recoveryRequest.executableAfter,
//           bypassedApprovals: recoveryRequest.currentApprovals < recoveryRequest.requiredApprovals,
//           initiatedByAdmin: req.user!.email
//         },
//         ipAddress: req.ip,
//         userAgent: req.get('User-Agent')
//       });

//       logger.warn(`Force execution scheduled for recovery ${requestId} by super admin ${req.user!.email}. Reason: ${reason}`);

//       res.json({
//         message: 'Recovery force execution scheduled successfully',
//         jobId: forceJob.id,
//         recoveryRequestId: requestId,
//         scheduledAt: new Date().toISOString(),
//         reason: reason.trim(),
//         warning: 'This bypassed normal approval and time-lock requirements'
//       });

//     } catch (schedulingError) {
//       logger.error(`Failed to schedule force execution for recovery ${requestId}:`, schedulingError);
//       res.status(500).json({ 
//         error: 'Failed to schedule force execution',
//         details: schedulingError instanceof Error ? schedulingError.message : 'Unknown error'
//       });
//     }

//   } catch (error) {
//     logger.error('Force execute recovery error:', error);
//     res.status(500).json({ 
//       error: 'Failed to force execute recovery',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };