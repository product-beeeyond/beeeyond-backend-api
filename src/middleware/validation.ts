/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { validationResult } from 'express-validator';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : 'unknown',
        message: error.msg
      }))
    });
  }

  next();
};

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

// ===========================================
// EXISTING VALIDATION SCHEMAS
// ===========================================

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  confirmPassword: Joi.any()
    .equal(Joi.ref("password"))
    .required()
    .label("confirm_password")
    .messages({ "any.only": "{{#label}} does not match" }),
  // These will only be validated if present in the payload
  dateOfBirth: Joi.string(),
  referralCode: Joi.string().min(1).max(20), // validates only if supplied
  nationality: Joi.string().min(2).max(50),
  address: Joi.string().min(5).max(250),
  investmentExperience: Joi.string().valid('beginner', 'intermediate', 'advanced'),
  riskTolerance: Joi.string().valid('low', 'medium', 'high'),
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

// ===========================================
// MULTISIG VALIDATION SCHEMAS
// ===========================================

// Stellar public key validation pattern
const stellarPublicKeyPattern = /^[GC][A-Z2-7]{55}$/;

export const multisigWalletSchema = Joi.object({
  propertyId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid property ID format'
  }),
  propertyManagerPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required().messages({
    'string.pattern.base': 'Invalid Stellar public key format'
  }),
  adminPublicKeys: Joi.array()
    .items(Joi.string().pattern(stellarPublicKeyPattern).messages({
      'string.pattern.base': 'Invalid Stellar public key format'
    }))
    .min(2).max(5).required().messages({
      'array.min': 'At least 2 admin public keys required',
      'array.max': 'Maximum 5 admin public keys allowed'
    }),
  platformPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required().messages({
    'string.pattern.base': 'Invalid Stellar public key format'
  }),
});

export const multisigWalletCreationSchema = Joi.object({
  propertyId: Joi.string().uuid().required(),
  propertyManagerPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required(),
  adminPublicKeys: Joi.array()
    .items(Joi.string().pattern(stellarPublicKeyPattern))
    .min(2).max(5).required(),
  platformPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required(),
}).custom((value, helpers) => {
  // Ensure all public keys are unique
  const allKeys = [
    value.propertyManagerPublicKey,
    ...value.adminPublicKeys,
    value.platformPublicKey
  ];
  const uniqueKeys = new Set(allKeys);
  
  if (uniqueKeys.size !== allKeys.length) {
    return helpers.error('custom.uniqueKeys');
  }
  
  return value;
}).messages({
  'custom.uniqueKeys': 'All public keys must be unique'
});

export const multisigTransactionSchema = Joi.object({
  walletPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required().messages({
    'string.pattern.base': 'Invalid wallet public key'
  }),
  transactionXDR: Joi.string().min(1).required().messages({
    'string.empty': 'Transaction XDR is required'
  }),
  description: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Description must be at least 10 characters',
    'string.max': 'Description too long'
  }),
  category: Joi.string().valid('fund_management', 'governance', 'revenue_distribution', 'emergency').required(),
  expirationHours: Joi.number().integer().min(1).max(720).optional(), // 1 hour to 30 days
});

export const multisigSignatureSchema = Joi.object({
  userPassword: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters'
  }),
});

export const addSignerSchema = Joi.object({
  walletPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required().messages({
    'string.pattern.base': 'Invalid wallet public key'
  }),
  signerPublicKey: Joi.string().pattern(stellarPublicKeyPattern).required().messages({
    'string.pattern.base': 'Invalid signer public key'
  }),
  weight: Joi.number().integer().min(1).max(255).required(),
  role: Joi.string().valid(
    'property_manager',
    'admin',
    'platform',
    'platform_automated',
    'admin_oversight',
    'investor_representative'
  ).required(),
  userId: Joi.string().uuid().optional(),
});

// ===========================================
// GOVERNANCE VALIDATION SCHEMAS
// ===========================================

export const governanceProposalSchema = Joi.object({
  propertyId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid property ID format'
  }),
  proposalType: Joi.string().valid(
    'property_sale',
    'major_renovation',
    'management_change',
    'rent_adjustment',
    'dividend_distribution'
  ).required(),
  title: Joi.string().min(5).max(100).required().messages({
    'string.min': 'Title must be at least 5 characters',
    'string.max': 'Title too long'
  }),
  description: Joi.string().min(20).max(2000).required().messages({
    'string.min': 'Description must be at least 20 characters',
    'string.max': 'Description too long'
  }),
  proposalData: Joi.object().unknown(true), // Allow additional properties
  votingPeriodHours: Joi.number().integer().min(24).max(720).optional(), // 1 day to 30 days
  executionDelayHours: Joi.number().integer().min(1).max(168).optional(), // 1 hour to 7 days
});

export const governanceVoteSchema = Joi.object({
  vote: Joi.string().valid('for', 'against', 'abstain').required(),
});

// ===========================================
// PROPOSAL-SPECIFIC VALIDATION SCHEMAS
// ===========================================

export const propertySaleProposalSchema = Joi.object({
  salePrice: Joi.number().positive().required().messages({
    'number.positive': 'Sale price must be positive'
  }),
  buyerInfo: Joi.object({
    name: Joi.string().min(1).required(),
    contact: Joi.string().min(1).required(),
  }).required(),
  saleConditions: Joi.string().max(1000).optional(),
  expectedClosingDate: Joi.date().iso().greater('now').optional(),
});

export const majorRenovationProposalSchema = Joi.object({
  renovationBudget: Joi.number().positive().required(),
  renovationScope: Joi.string().min(20).max(1000).required(),
  contractor: Joi.object({
    name: Joi.string().min(1).required(),
    contact: Joi.string().min(1).required(),
    license: Joi.string().optional(),
  }).required(),
  expectedDuration: Joi.number().integer().positive().required(), // in days
  expectedROI: Joi.number().min(0).max(100).optional(),
});

export const managementChangeProposalSchema = Joi.object({
  currentManager: Joi.string().min(1).required(),
  newManager: Joi.object({
    name: Joi.string().min(1).required(),
    contact: Joi.string().min(1).required(),
    experience: Joi.string().min(10).max(500).required(),
    managementFee: Joi.number().min(0).max(20).required(), // percentage
  }).required(),
  reasonForChange: Joi.string().min(20).max(500).required(),
});

export const rentAdjustmentProposalSchema = Joi.object({
  currentRent: Joi.number().positive().required(),
  proposedRent: Joi.number().positive().required(),
  adjustmentReason: Joi.string().min(20).max(500).required(),
  marketAnalysis: Joi.string().min(50).max(1000).optional(),
  effectiveDate: Joi.date().iso().greater('now').required(),
});

export const dividendDistributionProposalSchema = Joi.object({
  totalDistributionAmount: Joi.number().positive().required(),
  distributionPeriod: Joi.string().valid('monthly', 'quarterly', 'annual').required(),
  sourceOfFunds: Joi.string().min(20).max(500).required(),
  distributionDate: Joi.date().iso().greater('now').required(),
});

// ===========================================
// REVENUE DISTRIBUTION SCHEMAS
// ===========================================

export const revenueDistributionSchema = Joi.object({
  propertyId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid property ID format'
  }),
  totalRevenue: Joi.number().positive().required().messages({
    'number.positive': 'Revenue must be positive'
  }),
  distributionPeriod: Joi.string().valid('monthly', 'quarterly', 'annual').required(),
  platformFeePercentage: Joi.number().min(0).max(10).optional(), // 0-10%
  revenueSource: Joi.string().valid('rental', 'sale', 'appreciation', 'other').required(),
  distributionDate: Joi.date().iso().optional(),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

export const validateProposalData = (proposalType: string, proposalData: any) => {
  const schemas: { [key: string]: Joi.ObjectSchema } = {
    property_sale: propertySaleProposalSchema,
    major_renovation: majorRenovationProposalSchema,
    management_change: managementChangeProposalSchema,
    rent_adjustment: rentAdjustmentProposalSchema,
    dividend_distribution: dividendDistributionProposalSchema,
  };

  const schema = schemas[proposalType];
  if (!schema) {
    throw new Error(`Unknown proposal type: ${proposalType}`);
  }

  const { error, value } = schema.validate(proposalData, { abortEarly: false });
  if (error) {
    throw error;
  }

  return value;
};

// Middleware for validating proposal data based on type
export const validateDynamicProposalData = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { proposalType, proposalData } = req.body;
    
    if (proposalType && proposalData) {
      const validatedData = validateProposalData(proposalType, proposalData);
      req.body.proposalData = validatedData;
    }
    
    next();
  } catch (error: any) {
    const errors = error.details?.map((detail: any) => ({
      field: `proposalData.${detail.path.join('.')}`,
      message: detail.message,
    })) || [{ field: 'proposalData', message: error.message }];

    return res.status(400).json({
      error: 'Proposal data validation failed',
      details: errors,
    });
  }
};