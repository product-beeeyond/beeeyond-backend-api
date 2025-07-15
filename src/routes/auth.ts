import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { validate, registerSchema, loginSchema } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { redisClient } from '../config/redis';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';
import {SignUp, Login} from "../controllers/signUpController"

const router = Router();

router.post('/register', validate(registerSchema), SignUp);
router.post('/login', validate(loginSchema), Login);
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { id: string };

    // Check if refresh token exists in Redis
    const storedToken = await redisClient.get(`refresh:${decoded.id}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Find user
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      // Add token to blacklist
      await redisClient.setEx(`blacklist:${token}`, 24 * 60 * 60, 'true');
    }

    // Remove refresh token
    if (req.user) {
      await redisClient.del(`refresh:${req.user.id}`);
    }

    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    res.json({
      user: req.user!.toJSON(),
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, phone, dateOfBirth, address, investmentExperience, riskTolerance } = req.body;

    // Validate phone uniqueness if provided
    if (phone && phone !== req.user!.phone) {
      const existingPhone = await User.findOne({
        where: { phone },
        // Exclude current user
        // @ts-ignore
        raw: false
      });
      if (existingPhone && existingPhone.id !== req.user!.id) {
        return res.status(400).json({ error: 'Phone number already in use' });
      }
    }

    await req.user!.update({
      firstName,
      lastName,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      address,
      investmentExperience,
      riskTolerance,
    });

    res.json({
      message: 'Profile updated successfully',
      user: req.user!.toJSON(),
    });
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

export default router;
