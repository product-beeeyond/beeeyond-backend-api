import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { AuthRequest, UserRole } from "../middleware/auth";
import logger from "../utils/logger";
import { redisClient } from "../config/redis";
import { emailService } from "../services/emailService";
import { JWT_REFRESH_SECRET } from "../config";
import { v4 as uuidv4 } from "uuid";
import { GenerateOTP, GenerateRefreshToken, GenerateSignature } from "../utils";
// import { smsService } from "../services/smsService";

export const SignUp = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      referralCode,
      nationality,
      address,
      investmentExperience,
      riskTolerance,
    } = req.body;
    const uuiduser = uuidv4();
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User already exists with this email" });
    }

    // Check phone uniqueness if provided
    if (phone) {
      const existingPhone = await User.findOne({ where: { phone } });
      if (existingPhone) {
        return res.status(400).json({ error: "Phone number already in use" });
      }
    }

    // Validate referral code if provided
    let referredBy;
    if (referralCode) {
      const referrer = await User.findOne({ where: { referralCode } });
      if (!referrer) {
        return res.status(400).json({ error: "Invalid referral code" });
      }
      referredBy = referrer?.id;
    }
    const { otp, expiry } = GenerateOTP();
    // Create user
    const user = await User.create({
      id: uuiduser,
      email,
      password,
      firstName,
      lastName,
      phone,
      otp,
      otp_expiry: expiry,
      referredBy,
      address,
      nationality,
      investmentExperience,
      riskTolerance,
      kycStatus: "pending",
      isVerified: false,
      isActive: true,
      role: UserRole.USER,
      salt: "",
    });

    const retrievedUser = await User.findOne({
      where: { email: email },
    });

    // Generate JWT tokens
    const accessToken = await GenerateSignature({
      id: user.id,
      email: user.email,
      verified: user.isVerified,
    });

    const refreshToken = await GenerateRefreshToken({
      id: user.id,
      email: user.email,
      verified: user.isVerified,
    });

    // Store refresh token in Redis
    await redisClient.setEx(
      `refresh:${user.id}`,
      7 * 24 * 60 * 60,
      refreshToken
    );

    // Send welcome email
    try {
      await emailService.sendOTP(
        user.email,
        user.firstName,
        String(otp),
        "verification"
      );
    } catch (emailError) {
      logger.error("Failed to send otp via mail:", emailError);
    }

    // try {
    //   await smsService.sendOTP(user.phone!, String(otp))
    // } catch (smsError) {
    //   logger.error('Failed to send otp via sms:', smsError);
    // }

    res.status(200).json({
      message: "User registered successfully, verify otp",
      // user: retrievedUser?.toJSON(),
      verified: retrievedUser?.isVerified,
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
};

export const VerifyOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({ error: "User is already verified" });
    }

    // Check if OTP is valid and not expired
    if (!user.otp || user.otp !== parseInt(otp)) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Check if OTP is expired
    if (!user.otp_expiry || new Date() > user.otp_expiry) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Update user verification status
    await user.update({
      isVerified: true,
      otp: 0,
      otp_expiry: new Date(),
    });

    // Generate new JWT tokens with updated verification status
    const accessToken = await GenerateSignature({
      id: user.id,
      email: user.email,
      verified: true,
    });

    const refreshToken = await GenerateRefreshToken({
      id: user.id,
      email: user.email,
      verified: true,
    });

    // Update refresh token in Redis
    await redisClient.setEx(
      `refresh:${user.id}`,
      7 * 24 * 60 * 60,
      refreshToken
    );

    res.json({
      message: "OTP verified successfully",
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("OTP verification error:", error);
    res.status(500).json({ error: "OTP verification failed" });
  }
};

export const ResendOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({ error: "User is already verified" });
    }

    // Generate new OTP
    const { otp, expiry } = GenerateOTP();

    // Update user with new OTP
    await user.update({
      otp,
      otp_expiry: expiry,
    });

    // Send OTP via email
    try {
      await emailService.sendOTP(
        user.email,
        user.firstName,
        String(otp),
        "verification"
      );
    } catch (emailError) {
      logger.error("Failed to send OTP via email:", emailError);
    }

    // Send OTP via SMS if phone number exists
    // if (user.phone) {
    //   try {
    //     await smsService.sendOTP(user.phone, String(otp));
    //   } catch (smsError) {
    //     logger.error('Failed to send OTP via SMS:', smsError);
    //   }
    // }

    res.json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    logger.error("Resend OTP error:", error);
    res.status(500).json({ error: "Failed to resend OTP" });
  }
};

//request otp to reset password
export const ForgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        message:
          "If an account with this email exists, a password reset OTP has been sent",
      });
    }

    // Generate password reset OTP
    const { otp, expiry } = GenerateOTP();

    // Store password reset OTP in Redis with email as key
    const resetKey = `password_reset:${email}`;
    await redisClient.setEx(
      resetKey,
      15 * 60,
      JSON.stringify({ otp, expiry: expiry.getTime() })
    ); // 15 minutes

    // Send password reset OTP via email
    try {
      await emailService.sendOTP(
        user.email,
        user.firstName,
        String(otp),
        "password_reset"
      );
    } catch (emailError) {
      logger.error("Failed to send password reset OTP via email:", emailError);
      return res
        .status(500)
        .json({ error: "Failed to send password reset OTP" });
    }

    // Send OTP via SMS if phone number exists
    // if (user.phone) {
    //   try {
    //     await smsService.sendOTP(user.phone, String(otp));
    //   } catch (smsError) {
    //     logger.error('Failed to send password reset OTP via SMS:', smsError);
    //   }
    // }

    res.json({
      message:
        "If an account with this email exists, a password reset OTP has been sent",
    });
  } catch (error) {
    logger.error("Forgot password error:", error);
    res
      .status(500)
      .json({ error: "Failed to process forgot password request" });
  }
};

export const ResetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ error: "Email, OTP, and new password are required" });
    }

    // Retrieve password reset OTP from Redis
    const resetKey = `password_reset:${email}`;
    const storedData = await redisClient.get(resetKey);

    if (!storedData) {
      return res
        .status(400)
        .json({ error: "Invalid or expired password reset OTP" });
    }

    const { otp: storedOtp, expiry } = JSON.parse(storedData);

    // Check if OTP matches
    if (parseInt(otp) !== storedOtp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Check if OTP is expired
    if (new Date().getTime() > expiry) {
      // Remove expired OTP from Redis
      await redisClient.del(resetKey);
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user password
    await user.update({ password: newPassword });

    // Remove password reset OTP from Redis
    await redisClient.del(resetKey);

    // Invalidate all existing refresh tokens by removing them from Redis
    await redisClient.del(`refresh:${user.id}`);

    // Send password change confirmation email
    try {
      // await emailService.sendPasswordChangeConfirmation(user.email, user.firstName);
    } catch (emailError) {
      logger.error(
        "Failed to send password change confirmation email:",
        emailError
      );
    }

    res.json({
      message: "Password reset successfully",
    });
  } catch (error) {
    logger.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

export const Login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        statusCode: "01",
        error: "User not found",
      });
    }
    if (!user.isVerified) {
      return res.status(401).json({
        statusCode: "02",
        error: "Unverified User, please verify email",
      });
    }
    if (!user.isActive) {
      return res.status(401).json({
        statusCode: "03",
        error: "User not found",
      });
    }
    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        statusCode: "04",
        error: "Invalid credentials",
      });
    }
    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate JWT tokens
    const accessToken = await GenerateSignature({
      id: user.id,
      email: user.email,
      verified: user.isVerified,
    });

    const refreshToken = await GenerateRefreshToken({
      id: user.id,
      email: user.email,
      verified: user.isVerified,
    });

    // Store refresh token in Redis
    await redisClient.setEx(
      `refresh:${user.id}`,
      7 * 24 * 60 * 60,
      refreshToken
    );

    res.json({
      message: "Login successful",
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

export const RefreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET!) as {
      id: string;
    };

    // Check if refresh token exists in Redis
    const storedToken = await redisClient.get(`refresh:${decoded.id}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Find user
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found" });
    }

    // Generate new access token
    const newAccessToken = await GenerateSignature({
      id: user.id,
      email: user.email,
      verified: user.isVerified,
    });

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error("Token refresh error:", error);
    res.status(401).json({ error: "Invalid refresh token" });
  }
};

export const Logout = async (req: AuthRequest, res: Response) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (token) {
      // Add token to blacklist
      await redisClient.setEx(`blacklist:${token}`, 24 * 60 * 60, "true");
    }

    // Remove refresh token
    if (req.user) {
      await redisClient.del(`refresh:${req.user.id}`);
    }

    res.json({ message: "Logout successful" });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
};

export const GetCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      user: req.user!.toJSON(),
    });
  } catch (error) {
    logger.error("Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};

export const UpdateUser = async (req: AuthRequest, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      address,
      investmentExperience,
      riskTolerance,
    } = req.body;

    // Validate phone uniqueness if provided
    if (phone && phone !== req.user!.phone) {
      const existingPhone = await User.findOne({
        where: { phone },
        // Exclude current user
        raw: false,
      });
      if (existingPhone && existingPhone.id !== req.user!.id) {
        return res.status(400).json({ error: "Phone number already in use" });
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
      message: "Profile updated successfully",
      user: req.user!.toJSON(),
    });
  } catch (error) {
    logger.error("Profile update error:", error);
    res.status(500).json({ error: "Profile update failed" });
  }
};
