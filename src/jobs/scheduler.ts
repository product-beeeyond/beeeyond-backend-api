// import cron from 'node-cron';
// import { 
//   processExecutableRecoveries, 
//   expireOldRecoveries, 
//   cleanupOldAuditLogs 
// } from './jobs/recoveryJobs';
// import MultiSigWallet from '../models/MultiSigWallet';
// import MultiSigSigner from '../models/MultiSigSigner';
// import RecoveryRequest from '../models/RecoveryRequest';
// import RecoveryAuditLog from '../models/RecoveryAuditLog';
// import logger from '../utils/logger';

// // Run every 5 minutes to check for executable recoveries
// cron.schedule('*/5 * * * *', processExecutableRecoveries);

// // Run every hour to expire old requests
// cron.schedule('0 * * * *', expireOldRecoveries);

// // Run daily to cleanup old audit logs (if desired)
// cron.schedule('0 2 * * *', () => cleanupOldAuditLogs(365));walletId || !reason) {
//       return res.status(400).json({ 
//         error: 'Wallet ID and reason are required' 
//       });
//     }

//     if (reason.trim().length < 10) {
//       return res.status(400).json({ 
//         error: 'Recovery reason must be at least 10 characters' 
//       });
//     }

    
//     // Check if user owns the wallet
//     const wallet = await MultiSigWallet.findOne({
//       where: { 
//         id: walletId, 
//         userId: userId,
//         walletType: 'user_recovery',
//         status: 'active'
//       },
//       include: [{
//         model: MultiSigSigner,
//         as: 'signers',
//         where: { role: 'user', status: 'active' }
//       }]
//     });

//     if (!wallet) {
//       return res.status(404).json({ 
//         error: 'User recovery wallet not found' 
//       });
//     }

//     // Check for existing pending recovery request
//     const existingRequest = await RecoveryRequest.findOne({
//       where: {
//         userId,
//         walletId,
//         status: ['pending', 'approved']
//       }
//     });

//     if (existingRequest) {
//       return res.status(409).json({ 
//         error: 'A recovery request is already pending for this wallet',
//         existingRequestId: existingRequest.id
//       });
//     }

//     // Generate new keypair for user
//     const newKeypair = Keypair.random();
//     const encryptedNewPrivateKey = encrypt(newKeypair.secret());

//     // Create recovery request
//     const recoveryRequest = await RecoveryRequest.create({
//       userId,
//       walletId,
//       requestReason: reason.trim(),
//       waitingPeriodHours: 24, // Default 24 hours
//       requiredApprovals: 2,
//       newUserPublicKey: newKeypair.publicKey(),
//       encryptedNewPrivateKey,
//       requestedBy: userId,
//       metadata: {
//         walletPublicKey: wallet.stellarPublicKey,
//         oldUserPublicKey: wallet.signers![0].publicKey
//       }
//     });

//     // Log the request creation
//     await RecoveryAuditLog.create({
//       recoveryRequestId: recoveryRequest.id,
//       actionType: 'created',
//       performedBy: userId,
//       performedAt: new Date(),
//       details: {
//         reason: reason.trim(),
//         walletId,
//         waitingPeriodHours: 24
//       },
//       ipAddress: req.ip,
//       userAgent: req.get('User-Agent')
//     });

//     logger.info(`Recovery request created: ${recoveryRequest.id} for user: ${userId}`);

//     res.status(201).json({
//       message: 'Recovery request submitted successfully',
//       recoveryRequest: {
//         id: recoveryRequest.id,
//         status: recoveryRequest.status,
//         executableAfter: recoveryRequest.executableAfter,
//         expiresAt: recoveryRequest.expiresAt,
//         requiredApprovals: recoveryRequest.requiredApprovals,
//         currentApprovals: recoveryRequest.currentApprovals
//       }
//     });

//   } catch (error) {
//     logger.error('Recovery request error:', error);
//     res.status(500).json({ 
//       error: 'Failed to submit recovery request',
//       details: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// };