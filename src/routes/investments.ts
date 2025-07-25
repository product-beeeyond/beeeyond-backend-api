import { Router } from 'express';
import { authenticate, requireKYC } from '../middleware/auth';
import { validate, investmentSchema } from '../middleware/validation';
import { BuyPropertyToken, GetTransactionHistory, GetUserPortfolio, SellPropertyToken } from '../controllers/investmentController';

const router = Router();

// Buy property tokens
router.post('/buy', authenticate, requireKYC, validate(investmentSchema), BuyPropertyToken);

// Sell property tokens
router.post('/sell', authenticate, requireKYC, SellPropertyToken);

// Get user portfolio
router.get('/portfolio', authenticate, GetUserPortfolio);

// Get transaction history
router.get('/transactions', authenticate, GetTransactionHistory);

export default router;
