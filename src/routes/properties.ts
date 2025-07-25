import { Router } from 'express';
// import { Op } from 'sequelize';
// import Property from '../models/Property';
// import PropertyHolding from '../models/PropertyHolding';
// import Transaction from '../models/Transaction';
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { authenticate, AuthRequest } from '../middleware/auth';
// import logger from '../utils/logger';
import { GetAllProperties, GetPropertyAnalytics, GetSingleProperty } from '../controllers/propertyController';

const router = Router();

// Get all properties with filters
router.get('/', GetAllProperties);

// Get single property details
router.get('/:id', GetSingleProperty);

// Get property analytics (authenticated users only)
router.get('/:id/analytics', authenticate, GetPropertyAnalytics);

export default router;
