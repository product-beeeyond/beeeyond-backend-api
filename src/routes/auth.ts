import { Router } from 'express';
// import jwt from 'jsonwebtoken';
// import User from '../models/User';
import { validate, registerSchema, loginSchema } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
// import { redisClient } from '../config/redis';
// import { emailService } from '../services/emailService';
// import logger from '../utils/logger';
import { SignUp, Login, RefreshToken, Logout, VerifyOTP, ResendOTP} from "../controllers/authController"

const router = Router();

router.post('/register', validate(registerSchema), SignUp);
router.post('/verify-otp', VerifyOTP);
router.post('/resend-otp', ResendOTP);
router.post('/login', validate(loginSchema), Login);
router.post('/refresh', RefreshToken);
router.post('/logout', authenticate, Logout);

export default router;
