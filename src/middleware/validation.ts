import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  };
};

// Validation schemas
export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  referralCode: Joi.string().optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const propertySchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().max(2000).optional(),
  location: Joi.string().min(3).max(100).required(),
  propertyType: Joi.string().valid('residential', 'commercial', 'mixed_use', 'industrial').required(),
  totalTokens: Joi.number().integer().min(1).required(),
  tokenPrice: Joi.number().positive().required(),
  expectedAnnualReturn: Joi.number().min(0).max(100).optional(),
  minimumInvestment: Joi.number().positive().default(10000),
  amenities: Joi.array().items(Joi.string()).optional(),
  propertyManager: Joi.string().optional(),
});

export const investmentSchema = Joi.object({
  propertyId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().min(1).required(),
  transactionType: Joi.string().valid('buy', 'sell').required(),
  paymentMethod: Joi.string().valid('wallet', 'stellar', 'p2p').required(),
});
