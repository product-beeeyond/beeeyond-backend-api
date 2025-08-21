import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  requestRecovery,
  getRecoveryStatus,
  listUserRecoveryRequests
} from '../controllers/recoveryController';
// src/routes/adminRecovery.ts
import {
  approveRecoveryRequest,
  rejectRecoveryRequest,
  listAllRecoveryRequests,
  retryFailedRecovery,
  getRecoveryAuditLog
} from '../controllers/adminController';



const router = express.Router();

// User recovery routes
router.post('/request', authenticate, requestRecovery);
router.get('/:requestId', authenticate, getRecoveryStatus);
router.get('/', authenticate, listUserRecoveryRequests);

// Admin recovery management routes
router.post('/:requestId/approve', authenticate, requireAdmin, approveRecoveryRequest);
router.post('/:requestId/reject', authenticate, requireAdmin, rejectRecoveryRequest);
router.post('/:requestId/retry', authenticate, requireAdmin, retryFailedRecovery);
router.get('/requests', authenticate, requireAdmin, listAllRecoveryRequests);
router.get('/:requestId/audit', authenticate, requireAdmin, getRecoveryAuditLog);

export default router;