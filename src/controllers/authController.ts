import express, { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest, UserRole } from "../middleware/auth";
import logger from '../utils/logger';
import { redisClient } from "../config/redis";
import { emailService } from "../services/emailService";
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } from "../config";

export const SignUp = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Check phone uniqueness if provided
    if (phone) {
      const existingPhone = await User.findOne({ where: { phone } });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already in use' });
      }
    }

    // Validate referral code if provided
    let referredBy;
    if (referralCode) {
      const referrer = await User.findOne({ where: { referralCode } });
      if (!referrer) {
        return res.status(400).json({ error: 'Invalid referral code' });
      }
      referredBy = referrer?.id;
    }

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      referredBy,
      nationality: "",
      investmentExperience: "",
      riskTolerance: "",
      kycStatus: "",
      isVerified: false,
      isActive: false,
      role: UserRole.USER
    });

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET!,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    // Store refresh token in Redis
    await redisClient.setEx(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user.email, user.firstName || 'User');
    } catch (emailError) {
      logger.error('Failed to send welcome email:', emailError);
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

export const Login =  async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET!,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    // Store refresh token in Redis
    await redisClient.setEx(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}


export const RefreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET!) as { id: string };

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
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}


export const Logout = async (req: AuthRequest, res: Response) => {
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
}


export const GetCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      user: req.user!.toJSON(),
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
}

export const UpdateUser = async (req: AuthRequest, res: Response) => {
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
}
