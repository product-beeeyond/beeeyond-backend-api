/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
export const createPropertySchema = Joi.object({
  title: Joi.string().min(3).max(200).required().messages({
    'string.min': 'Property title must be at least 3 characters',
    'string.max': 'Property title too long (max 200 characters)',
    'any.required': 'Property title is required'
  }),
  
  description: Joi.string().max(5000).optional().messages({
    'string.max': 'Description too long (max 5000 characters)'
  }),
  
  location: Joi.string().min(3).max(200).required().messages({
    'string.min': 'Location must be at least 3 characters',
    'string.max': 'Location too long (max 200 characters)',
    'any.required': 'Location is required'
  }),
  
  propertyType: Joi.string()
    .valid('residential', 'commercial', 'mixed_use', 'industrial')
    .required()
    .messages({
      'any.only': 'Property type must be one of: residential, commercial, mixed_use, industrial',
      'any.required': 'Property type is required'
    }),
  
  totalTokens: Joi.number().integer().min(100).max(10000000).required().messages({
    'number.base': 'Total tokens must be a number',
    'number.integer': 'Total tokens must be an integer',
    'number.min': 'Total tokens must be at least 100',
    'number.max': 'Total tokens cannot exceed 10,000,000',
    'any.required': 'Total tokens is required'
  }),
  
  tokenPrice: Joi.number().positive().min(100).max(1000000).required().messages({
    'number.base': 'Token price must be a number',
    'number.positive': 'Token price must be positive',
    'number.min': 'Token price must be at least ₦100',
    'number.max': 'Token price cannot exceed ₦1,000,000',
    'any.required': 'Token price is required'
  }),
  
  totalValue: Joi.number().positive().optional().messages({
    'number.base': 'Total value must be a number',
    'number.positive': 'Total value must be positive'
  }),
  
  expectedAnnualReturn: Joi.number().min(0).max(100).optional().messages({
    'number.base': 'Expected annual return must be a number',
    'number.min': 'Expected annual return cannot be negative',
    'number.max': 'Expected annual return cannot exceed 100%'
  }),
  
  minimumInvestment: Joi.number().positive().default(10000).messages({
    'number.base': 'Minimum investment must be a number',
    'number.positive': 'Minimum investment must be positive'
  }),
  
  images: Joi.array().items(Joi.string().uri()).optional().messages({
    'array.base': 'Images must be an array',
    'string.uri': 'Each image must be a valid URL'
  }),
  
  amenities: Joi.array().items(Joi.string().max(100)).optional().messages({
    'array.base': 'Amenities must be an array',
    'string.max': 'Each amenity must be less than 100 characters'
  }),
  
  documents: Joi.object().optional(),
  
  locationDetails: Joi.object({
    address: Joi.string().max(500).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(20).optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional()
  }).optional(),
  
  rentalIncomeMonthly: Joi.number().positive().optional().messages({
    'number.base': 'Monthly rental income must be a number',
    'number.positive': 'Monthly rental income must be positive'
  }),
  
  propertyManager: Joi.string().max(200).optional().messages({
    'string.max': 'Property manager name too long (max 200 characters)'
  }),
  
  featured: Joi.boolean().default(false).messages({
    'boolean.base': 'Featured must be true or false'
  })
});

export const updatePropertySchema = Joi.object({
  title: Joi.string().min(3).max(200).optional().messages({
    'string.min': 'Property title must be at least 3 characters',
    'string.max': 'Property title too long (max 200 characters)'
  }),
  
  description: Joi.string().max(5000).optional().messages({
    'string.max': 'Description too long (max 5000 characters)'
  }),
  
  location: Joi.string().min(3).max(200).optional().messages({
    'string.min': 'Location must be at least 3 characters',
    'string.max': 'Location too long (max 200 characters)'
  }),
  
  expectedAnnualReturn: Joi.number().min(0).max(100).optional().messages({
    'number.base': 'Expected annual return must be a number',
    'number.min': 'Expected annual return cannot be negative',
    'number.max': 'Expected annual return cannot exceed 100%'
  }),
  
  minimumInvestment: Joi.number().positive().optional().messages({
    'number.base': 'Minimum investment must be a number',
    'number.positive': 'Minimum investment must be positive'
  }),
  
  images: Joi.array().items(Joi.string().uri()).optional().messages({
    'array.base': 'Images must be an array',
    'string.uri': 'Each image must be a valid URL'
  }),
  
  amenities: Joi.array().items(Joi.string().max(100)).optional().messages({
    'array.base': 'Amenities must be an array',
    'string.max': 'Each amenity must be less than 100 characters'
  }),
  
  documents: Joi.object().optional(),
  
  locationDetails: Joi.object({
    address: Joi.string().max(500).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(20).optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional()
  }).optional(),
  
  rentalIncomeMonthly: Joi.number().positive().optional().messages({
    'number.base': 'Monthly rental income must be a number',
    'number.positive': 'Monthly rental income must be positive'
  }),
  
  propertyManager: Joi.string().max(200).optional().messages({
    'string.max': 'Property manager name too long (max 200 characters)'
  }),
  
  status: Joi.string()
    .valid('active', 'coming_soon', 'sold_out', 'maintenance', 'inactive')
    .optional()
    .messages({
      'any.only': 'Status must be one of: active, coming_soon, sold_out, maintenance, inactive'
    }),
  
  featured: Joi.boolean().optional().messages({
    'boolean.base': 'Featured must be true or false'
  })
});

export const tokenizePropertySchema = Joi.object({
  totalTokens: Joi.number().integer().min(100).max(10000000).required().messages({
    'number.base': 'Total tokens must be a number',
    'number.integer': 'Total tokens must be an integer',
    'number.min': 'Total tokens must be at least 100',
    'number.max': 'Total tokens cannot exceed 10,000,000',
    'any.required': 'Total tokens is required'
  }),
  
  tokenPrice: Joi.number().positive().min(100).max(1000000).required().messages({
    'number.base': 'Token price must be a number',
    'number.positive': 'Token price must be positive',
    'number.min': 'Token price must be at least ₦100',
    'number.max': 'Token price cannot exceed ₦1,000,000',
    'any.required': 'Token price is required'
  })
});

export const deactivatePropertySchema = Joi.object({
  reason: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Deactivation reason must be at least 10 characters',
    'string.max': 'Deactivation reason too long (max 500 characters)',
    'any.required': 'Deactivation reason is required'
  })
});

export const forceDeletePropertySchema = Joi.object({
  confirmDelete: Joi.string()
    .valid('CONFIRM_DELETE_PROPERTY')
    .required()
    .messages({
      'any.only': 'Must provide exact confirmation string',
      'any.required': 'Deletion confirmation is required'
    })
});

export const propertySearchSchema = Joi.object({
  query: Joi.string().max(200).optional().messages({
    'string.max': 'Search query too long (max 200 characters)'
  }),
  
  filters: Joi.object({
    location: Joi.string().max(200).optional(),
    propertyType: Joi.string()
      .valid('residential', 'commercial', 'mixed_use', 'industrial')
      .optional(),
    minPrice: Joi.number().positive().optional(),
    maxPrice: Joi.number().positive().optional(),
    minReturn: Joi.number().min(0).max(100).optional(),
    featured: Joi.boolean().optional()
  }).optional(),
  
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'title', 'location', 'tokenPrice', 
           'totalValue', 'expectedAnnualReturn', 'totalTokens', 'availableTokens')
    .default('createdAt')
    .messages({
      'any.only': 'Invalid sort field'
    }),
  
  sortOrder: Joi.string()
    .valid('ASC', 'DESC')
    .default('DESC')
    .messages({
      'any.only': 'Sort order must be ASC or DESC'
    }),
  
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Page must be a number',
    'number.integer': 'Page must be an integer',
    'number.min': 'Page must be at least 1'
  }),
  
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    'number.base': 'Limit must be a number',
    'number.integer': 'Limit must be an integer',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100'
  })
});

// ===========================================
// WALLET CREATION SCHEMA
// ===========================================

export const createPropertyWalletsSchema = Joi.object({
  propertyManagerPublicKey: Joi.string()
    .pattern(/^[GC][A-Z2-7]{55}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid Stellar public key format'
    }),
  
  enableGovernance: Joi.boolean().default(true).messages({
    'boolean.base': 'Enable governance must be true or false'
  }),
  
  initialFunding: Joi.number().positive().min(2).max(100).default(2).messages({
    'number.base': 'Initial funding must be a number',
    'number.positive': 'Initial funding must be positive',
    'number.min': 'Initial funding must be at least 2 XLM',
    'number.max': 'Initial funding cannot exceed 100 XLM'
  })
});

// ===========================================
// QUERY PARAMETER SCHEMAS
// ===========================================

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

export const propertyFiltersSchema = Joi.object({
  location: Joi.string().max(200).optional(),
  propertyType: Joi.string()
    .valid('residential', 'commercial', 'mixed_use', 'industrial')
    .optional(),
  status: Joi.string()
    .valid('active', 'coming_soon', 'sold_out', 'maintenance', 'inactive')
    .optional(),
  featured: Joi.boolean().optional(),
  minPrice: Joi.number().positive().optional(),
  maxPrice: Joi.number().positive().optional(),
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'title', 'location', 'tokenPrice', 
           'totalValue', 'expectedAnnualReturn', 'totalTokens', 'availableTokens')
    .default('createdAt'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

export const analyticsSchema = Joi.object({
  period: Joi.string()
    .valid('7d', '30d', '90d', '1y')
    .default('30d')
    .messages({
      'any.only': 'Period must be one of: 7d, 30d, 90d, 1y'
    })
});

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

/**
 * Validate property creation data with business rules
 */
export const validatePropertyCreation = (data: any) => {
  const { error, value } = createPropertySchema.validate(data, { 
    abortEarly: false,
    allowUnknown: false 
  });
  
  if (error) {
    return { isValid: false, errors: error.details };
  }
  
  // Additional business rule validations
  const businessRuleErrors = [];
  
  // Total value should match tokens * price if provided
  if (value.totalValue && value.totalTokens && value.tokenPrice) {
    const calculatedValue = value.totalTokens * value.tokenPrice;
    const tolerance = calculatedValue * 0.01; // 1% tolerance
    
    if (Math.abs(value.totalValue - calculatedValue) > tolerance) {
      businessRuleErrors.push({
        field: 'totalValue',
        message: 'Total value should equal totalTokens × tokenPrice'
      });
    }
  }
  
  // Minimum investment should not exceed token price
  if (value.minimumInvestment > value.tokenPrice) {
    businessRuleErrors.push({
      field: 'minimumInvestment',
      message: 'Minimum investment cannot exceed token price'
    });
  }
  
  if (businessRuleErrors.length > 0) {
    return { isValid: false, errors: businessRuleErrors };
  }
  
  return { isValid: true, data: value };
};

/**
 * Validate property update with restricted fields check
 */
export const validatePropertyUpdate = (data: any, existingProperty?: any) => {
  const { error, value } = updatePropertySchema.validate(data, { 
    abortEarly: false,
    allowUnknown: false 
  });
  
  if (error) {
    return { isValid: false, errors: error.details };
  }
  
  // Check for restricted field updates
  const restrictedFields = [
    'totalTokens', 'stellarAssetCode', 'stellarAssetIssuer', 
    'tokenPrice', 'availableTokens'
  ];
  
  const restrictedUpdates = restrictedFields.filter(field => field in data);
  
  if (restrictedUpdates.length > 0) {
    return { 
      isValid: false, 
      errors: [{
        field: 'restricted',
        message: `Cannot update restricted fields: ${restrictedUpdates.join(', ')}`
      }]
    };
  }
  
  return { isValid: true, data: value };
};

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