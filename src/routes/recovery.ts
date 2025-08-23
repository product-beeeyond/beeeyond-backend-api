import express from 'express';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import {
  requestRecovery,
  getRecoveryStatus,
  listUserRecoveryRequests,
  cancelRecoveryRequest
} from '../controllers/recoveryController';
// src/routes/adminRecovery.ts
import {
  approveRecoveryRequest,
  rejectRecoveryRequest,
  listAllRecoveryRequests,
  retryFailedRecovery,
  getRecoveryAuditLog,
  forceExecuteRecovery
} from '../controllers/adminController';



const router = express.Router();

// User recovery routes
router.post('/request', authenticate, requestRecovery);
router.get('/:requestId', authenticate, getRecoveryStatus);
router.get('/', authenticate, listUserRecoveryRequests);
router.delete('/:requestId', authenticate, cancelRecoveryRequest); // New: Cancel request

// Admin recovery management routes
router.post('/:requestId/approve', authenticate, requireAdmin, approveRecoveryRequest);
router.post('/:requestId/reject', authenticate, requireAdmin, rejectRecoveryRequest);
router.post('/:requestId/retry', authenticate, requireAdmin, retryFailedRecovery);
router.get('/requests', authenticate, requireAdmin, listAllRecoveryRequests);
router.get('/:requestId/audit', authenticate, requireAdmin, getRecoveryAuditLog);
router.post('/:requestId/force-execute', authenticate, requireSuperAdmin, forceExecuteRecovery); // New: Force execute

export default router;