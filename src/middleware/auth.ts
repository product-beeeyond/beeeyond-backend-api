import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User from '../models/User';
import { redisClient } from '../config/redis';
import { JWT_SECRET } from '../config';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

interface CustomJwtPayload extends JwtPayload {
  id: string;
  email: string;
  role?: string;
}

export interface AuthRequest extends Request {
  user?: User;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // console.log("token------", req.headers);
    const token = req.header('authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No auth' });
    }

    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Auth has been invalidated' });
    }
    // console.log("token------", token);
    const decoded = jwt.verify(token, JWT_SECRET!) as CustomJwtPayload;
    // console.log("token------", decoded);
    // const user = await User.findByPk(decoded.id);
    const user = (await User.findOne({
      where: { email: decoded.email },
    })) as unknown as User;
    if (user.email) {
      // req.user = user;
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized access or user not found' });

  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has any of the required roles
    if (roles.length > 0 && !roles.includes(req.user.role as UserRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

// Specific middleware for admin access (admin or super_admin)
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const adminRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
  if (!adminRoles.includes(req.user.role as UserRole)) {
    return res.status(403).json({
      error: 'Admin access required',
      current: req.user.role
    });
  }

  next();
};

// Specific middleware for super admin access only
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({
      error: 'Super admin access required',
      current: req.user.role
    });
  }

  next();
};

export const requireKYC = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.kycStatus !== 'verified') {
    return res.status(403).json({
      error: 'KYC verification required',
      kycStatus: req.user.kycStatus
    });
  }

  next();
};

// Utility function to check if user has specific role
export const hasRole = (user: User, role: UserRole): boolean => {
  return user.role === role;
};

// Utility function to check if user is admin or super admin
export const isAdmin = (user: User): boolean => {
  return [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role as UserRole);
};

// Utility function to check if user is super admin
export const isSuperAdmin = (user: User): boolean => {
  return user.role === UserRole.SUPER_ADMIN;
};
