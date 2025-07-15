import express, { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import User from '../models/User';

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
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ where: { referralCode } });
      if (!referrer) {
        return res.status(400).json({ error: 'Invalid referral code' });
      }
      referredBy = referrer.id;
    }

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      referredBy,
    });

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
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
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
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
