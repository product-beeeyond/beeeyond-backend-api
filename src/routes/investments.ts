import { Router } from 'express';
import { authenticate, requireKYC } from '../middleware/auth';
import { validate, investmentSchema } from '../middleware/validation';
import { BuyPropertyToken, GetTransactionHistory, GetUserPortfolio, SellPropertyToken } from '../controllers/investmentController';

const router = Router();

router.post('/buy', authenticate, requireKYC, validate(investmentSchema), BuyPropertyToken);
router.post('/sell', authenticate, requireKYC, SellPropertyToken);
router.get('/portfolio', authenticate, GetUserPortfolio);
router.get('/transactions', authenticate, GetTransactionHistory);

export default router;
