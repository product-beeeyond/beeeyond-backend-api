import express from 'express';
// import {
//   authenticate,
//   requireSuperAdmin
// } from '../middleware/auth';
import {
//   createAdmin,
//   getAllAdmins,
//   updateAdmin,
//   deactivateAdmin,
  promoteToAdmin,
//   demoteAdmin,
//   // resetAdminPassword
} from '../controllers/adminController';
import {  param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation';

const router = express.Router();

// // Validation middleware
// const validateCreateAdmin = [
//   body('email').isEmail().withMessage('Valid email is required'),
//   body('firstName').notEmpty().withMessage('First name is required'),
//   body('lastName').notEmpty().withMessage('Last name is required'),
//   body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
//   handleValidationErrors
// ];

// const validateUpdateAdmin = [
//   body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
//   body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
//   body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
//   handleValidationErrors
// ];

// // const validateResetPassword = [
// //   body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
// //   handleValidationErrors
// // ];

const validateUserId = [
  param('userId').isUUID().withMessage('Valid user ID is required'),
  handleValidationErrors
];

// const validateAdminId = [
//   param('adminId').isUUID().withMessage('Valid admin ID is required'),
//   handleValidationErrors
// ];

// // All routes require super admin access
// router.use(authenticate, requireSuperAdmin);

// // Create new admin user
// router.post('/create', validateCreateAdmin, createAdmin);

// router.get('/list', getAllAdmins);
// router.put('/:adminId', validateAdminId, validateUpdateAdmin, updateAdmin);
// router.patch('/:adminId/deactivate', validateAdminId, deactivateAdmin);
router.patch('/promote/:userId', validateUserId, promoteToAdmin);
// router.patch('/:adminId/demote', validateAdminId, demoteAdmin);

// // Reset admin password
// // router.patch('/:adminId/reset-password', validateAdminId, validateResetPassword, resetAdminPassword);

export default router;
