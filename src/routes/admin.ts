import express from "express";
import {
  authenticate,
  authorize,
  requireAdmin,
  requireSuperAdmin,
  // requireKYC,
  UserRole,
} from "../middleware/auth";
import { approveKYC, bulkKYCAction, getKYCDetails, getKYCStats, getPendingKYCApprovals } from '../controllers/adminController';

const router = express.Router();

// Admin routes - accessible by admin and super_admin
router.get("/users", authenticate, requireAdmin, (req, res) => {
  res.json({ message: "Admin endpoint - manage users" });
});

router.post("/properties", authenticate, requireAdmin, (req, res) => {
  res.json({ message: "Admin endpoint - create properties" });
});

router.put("/properties/:id", authenticate, requireAdmin, (req, res) => {
  res.json({ message: "Admin endpoint - update property" });
});

// Super admin only routes
router.delete("/users/:id", authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: "Super admin endpoint - delete users" });
});

router.post("/create-admin", authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: "Super admin endpoint - create admin users" });
});

router.get("/system-settings", authenticate, requireSuperAdmin, (req, res) => {
  res.json({ message: "Super admin endpoint - system settings" });
});

// Using the generic authorize middleware for specific role combinations
router.get(
  "/analytics",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req, res) => {
    res.json({ message: "Analytics endpoint - admin access required" });
  }
);

// ===========================================
// KYC MANAGEMENT ROUTES
// ===========================================

/**
 * Approve or reject individual KYC application
 * POST /api/admin/approve-kyc/:userId
 * Body: { action: 'approve' | 'reject', reason?: string }
 */
router.post('/approve-kyc/:userId',
  authenticate,
  requireAdmin,
  approveKYC
);

/**
 * Get all pending KYC applications for review
 * GET /api/admin/kyc/pending?page=1&limit=20&search=query
 */
router.get('/kyc/pending',
  authenticate,
  requireAdmin,
  getPendingKYCApprovals
);

/**
 * Get KYC statistics for admin dashboard
 * GET /api/admin/kyc/stats
 */
router.get('/kyc/stats',
  authenticate,
  requireAdmin,
  getKYCStats
);

/**
 * Get detailed KYC information for a specific user
 * GET /api/admin/kyc/:userId/details
 */
router.get('/kyc/:userId/details',
  authenticate,
  requireAdmin,
  getKYCDetails
);

/**
 * Bulk approve/reject multiple KYC applications
 * POST /api/admin/kyc/bulk-action
 * Body: { userIds: string[], action: 'approve' | 'reject', reason?: string }
 */
router.post('/kyc/bulk-action',
  authenticate,
  requireAdmin,
  bulkKYCAction
);

// POST   /admin/approve-kyc/:userId          // Approve/reject individual KYC
// GET    /admin/kyc/pending                  // Get pending applications
// GET    /admin/kyc/stats                    // KYC statistics
// GET    /admin/kyc/:userId/details          // User KYC details
// POST   /admin/kyc/bulk-action              // Bulk approve/reject
// GET    /admin/users/kyc-overview           // Users overview
// PUT    /admin/kyc/:userId/review           // Set under review
export default router;
