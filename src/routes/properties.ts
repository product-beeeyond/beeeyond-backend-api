import { Router } from 'express';
// import { Op } from 'sequelize';
// import Property from '../models/Property';
// import PropertyHolding from '../models/PropertyHolding';
// import Transaction from '../models/Transaction';
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { authenticate, AuthRequest } from '../middleware/auth';
import { GetAllProperties, GetPropertyAnalytics, GetSingleProperty } from '../controllers/propertyController';

const router = Router();
router.get('/', GetAllProperties);
router.get('/:id', GetSingleProperty);
router.get('/:id/analytics', authenticate, GetPropertyAnalytics);

export default router;
