import { Router } from 'express';
import { GetCurrentUser, UpdateUser } from "../controllers/authController";
import { authenticate, authorize, UserRole } from "../middleware/auth";

const router = Router();

router.post('/feedback',
  authenticate,
  authorize(UserRole.USER),
  (req, res) => {
    res.json({ message: 'User feedback endpoint' });
  }
);

router.post('/submit-kyc', authenticate, authorize(UserRole.USER), (req, res) => {
  res.json({ message: 'User kyc endpoint' });
})


router.get('/me', authenticate, GetCurrentUser);
router.put('/profile', authenticate, UpdateUser);

export default router;
