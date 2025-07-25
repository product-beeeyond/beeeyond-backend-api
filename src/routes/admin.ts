import express from 'express';
import {
  authenticate,
  authorize,
  requireAdmin,
  requireSuperAdmin,
  requireKYC,
  UserRole
} from '../middleware/auth';

const router = express.Router();

// Admin routes - accessible by admin and super_admin
router.get('/users', authenticate, requireAdmin, (req, res) => {
  res.json({ message: 'Admin endpoint - manage users' });
});

router.post('/properties', authenticate, requireAdmin, (req, res) => {
  res.json({ message: 'Admin endpoint - create properties' });
});

router.put('/properties/:id', authenticate, requireAdmin, (req, res) => {
  res.json({ message: 'Admin endpoint - update property' });
});

// Super admin only routes
router.delete('/users/:id', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: 'Super admin endpoint - delete users' });
});

router.post('/create-admin', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: 'Super admin endpoint - create admin users' });
});

router.get('/system-settings', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: 'Super admin endpoint - system settings' });
});

// Using the generic authorize middleware for specific role combinations
router.get('/analytics',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req, res) => {
    res.json({ message: 'Analytics endpoint - admin access required' });
  }
);

router.post('/approve-kyc/:userId',
  authenticate,
  requireAdmin,
  (req, res) => {
    res.json({ message: 'Approve KYC - admin access required' });
  }
);

export default router;
