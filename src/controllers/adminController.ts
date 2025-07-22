import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest, UserRole } from '../middleware/auth';
import User from '../models/User';
import { generateToken } from '../utils/jwt';
import { sendWelcomeEmail } from '../utils/email';

// Create admin user - Super Admin only
export const createAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { email, firstName, lastName, password } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({
        error: 'Email, first name, last name, and password are required'
      });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const adminUser = await User.create({
      email,
      firstName,
      lastName,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
      kycStatus: 'verified' // Admins are automatically KYC verified
      ,
      nationality: '',
      investmentExperience: '',
      riskTolerance: '',
      isVerified: false
    });

    // Remove password from response
    const { password: _, ...adminUserData } = adminUser.toJSON();

    // Send welcome email with temporary password
    try {
      await sendWelcomeEmail({
        email: adminUser.email,
        firstName: adminUser.firstName!,
        role: 'Admin',
        temporaryPassword: password // In production, generate a temporary password
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the creation if email fails
    }

    res.status(201).json({
      message: 'Admin user created successfully',
      admin: adminUserData
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all admin users - Super Admin only
export const getAllAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const admins = await User.findAll({
      where: {
        role: UserRole.ADMIN
      },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      message: 'Admins retrieved successfully',
      count: admins.length,
      admins
    });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update admin user - Super Admin only
export const updateAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { adminId } = req.params;
    const { firstName, lastName, isActive } = req.body;

    const admin = await User.findOne({
      where: {
        id: adminId,
        role: UserRole.ADMIN
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Update admin details
    await admin.update({
      firstName: firstName || admin.firstName,
      lastName: lastName || admin.lastName,
      isActive: isActive !== undefined ? isActive : admin.isActive
    });

    const { password: _, ...updatedAdminData } = admin.toJSON();

    res.json({
      message: 'Admin user updated successfully',
      admin: updatedAdminData
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Deactivate admin user - Super Admin only
export const deactivateAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({
      where: {
        id: adminId,
        role: UserRole.ADMIN
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Deactivate instead of deleting
    await admin.update({ isActive: false });

    res.json({
      message: 'Admin user deactivated successfully',
      adminId: admin.id
    });
  } catch (error) {
    console.error('Deactivate admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Promote regular user to admin - Super Admin only
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

    const { password: _, ...promotedUserData } = user.toJSON();

    // Send promotion notification email
    try {
      await sendPromotionEmail({
        email: user.email,
        firstName: user.firstName!,
        newRole: 'Admin'
      });
    } catch (emailError) {
      console.error('Failed to send promotion email:', emailError);
    }

    res.json({
      message: 'User promoted to admin successfully',
      admin: promotedUserData
    });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Demote admin to regular user - Super Admin only
export const demoteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({
      where: {
        id: adminId,
        role: UserRole.ADMIN
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Demote admin to regular user
    await admin.update({ role: UserRole.USER });

    const { password: _, ...demotedUserData } = admin.toJSON();

    res.json({
      message: 'Admin demoted to regular user successfully',
      user: demotedUserData
    });
  } catch (error) {
    console.error('Demote admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset admin password - Super Admin only
export const resetAdminPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { adminId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long'
      });
    }

    const admin = await User.findOne({
      where: {
        id: adminId,
        role: UserRole.ADMIN
      }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await admin.update({ password: hashedPassword });

    // Send password reset notification
    try {
      await sendPasswordResetNotification({
        email: admin.email,
        firstName: admin.firstName!
      });
    } catch (emailError) {
      console.error('Failed to send password reset notification:', emailError);
    }

    res.json({
      message: 'Admin password reset successfully',
      adminId: admin.id
    });
  } catch (error) {
    console.error('Reset admin password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper functions for email notifications
const sendWelcomeEmail = async (data: {
  email: string;
  firstName: string;
  role: string;
  temporaryPassword: string;
}) => {
  // Implement your email service here
  console.log(`Sending welcome email to ${data.email} for ${data.role} role`);
};

const sendPromotionEmail = async (data: {
  email: string;
  firstName: string;
  newRole: string;
}) => {
  // Implement your email service here
  console.log(`Sending promotion email to ${data.email} for ${data.newRole} role`);
};

const sendPasswordResetNotification = async (data: {
  email: string;
  firstName: string;
}) => {
  // Implement your email service here
  console.log(`Sending password reset notification to ${data.email}`);
};
